import "server-only";

import { z } from "zod";

import { generateTextOnce, type GenerateTextOutput } from "@/lib/ai/generate-text";
import { runWithLlmRateLimit } from "@/lib/ai/llmRateLimiter";
import { DEFAULT_OPENAI_MODEL } from "@/lib/ai/openai";
import type {
  ConfidenceLevel,
  DataSufficiency,
  MonthlySynthesisOutput,
  QuarterlySynthesisOutput,
} from "@/lib/ai/insightGenerator";

const MODEL_NAME = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
const MODEL_VERSION = process.env.OPENAI_MODEL_VERSION ?? "unspecified";
const MIN_LLM_CALL_INTERVAL_MS = Number(
  process.env.MANAGER_ANALYSIS_LLM_MIN_INTERVAL_MS ??
    process.env.INSIGHT_LLM_MIN_INTERVAL_MS ??
    "30000"
);

const MANAGER_ANALYSIS_SYSTEM_PROMPT = `You are an analysis engine for manager guidance in an HR intelligence system.
Use only the provided evidence artifacts.
Do not invent facts.
Do not use numeric scoring.
Do not reference peer comparisons.
Do not make HR decisions.
If evidence is partial or insufficient, state uncertainty.
Return JSON only.`;

const PEER_COMPARISON_PATTERN =
  /\b(peer|peers|compared to|relative to|team average|other employees)\b/i;
const EMPLOYEE_COMPENSATION_PATTERN =
  /\b(bonus|promotion|promote|compensation|salary|raise)\b/i;

const confidenceSchema = z.enum(["low", "medium", "high"]);
const evidenceRefSchema = z.string().regex(/^E\d+$/);

const debateArgumentSchema = z
  .object({
    claim: z.string().min(1),
    evidenceRefs: z.array(evidenceRefSchema).min(1),
  })
  .strict();

const debateRecommendationSchema = z
  .object({
    bonus: z.enum(["yes", "no", "defer"]),
    promotion: z.enum(["yes", "no", "not_ready"]),
  })
  .strict();

const combinedDebateSchema = z
  .object({
    advocateAssessment: z
      .object({
        stance: z.literal("support_reward"),
        arguments: z.array(debateArgumentSchema).min(1),
        recommendation: debateRecommendationSchema,
        confidence: confidenceSchema,
      })
      .strict(),
    examinerAssessment: z
      .object({
        stance: z.literal("caution_reward"),
        arguments: z.array(debateArgumentSchema).min(1),
        risks: z.array(z.string().min(1)).min(1),
        recommendation: debateRecommendationSchema,
        confidence: confidenceSchema,
      })
      .strict(),
  })
  .strict();

const arbiterDecisionSchema = z
  .object({
    finalRecommendation: z
      .object({
        bonus: z.enum(["approve", "defer", "deny"]),
        promotion: z.enum(["approve", "defer", "deny"]),
      })
      .strict(),
    rationale: z.array(z.string().min(1)).min(1),
    unresolvedQuestions: z.array(z.string().min(1)).min(1),
    confidence: confidenceSchema,
    notesForHR: z.array(z.string().min(1)),
  })
  .strict();

const employeePingSchema = z
  .object({
    theme: z.enum(["workload", "growth", "collaboration", "focus"]),
    message: z.string().min(1),
    evidenceRefs: z.array(evidenceRefSchema).min(1),
    confidence: confidenceSchema,
  })
  .strict();

const combinedGuidanceSchema = z
  .object({
    employeePings: z.array(employeePingSchema).min(1),
    managerCoaching: z
      .object({
        focusAreas: z.array(z.string().min(1)).min(1),
        suggestedQuestions: z.array(z.string().min(1)).min(1),
        doNotAssume: z.array(z.string().min(1)).min(1),
        evidenceRefs: z.array(evidenceRefSchema).min(1),
        confidence: confidenceSchema,
      })
      .strict(),
  })
  .strict();

export type CombinedDebateOutput = z.infer<typeof combinedDebateSchema>;
export type ArbiterDecisionOutput = z.infer<typeof arbiterDecisionSchema>;
export type CombinedGuidanceOutput = z.infer<typeof combinedGuidanceSchema>;

export type EvidenceCatalogEntry = {
  id: string;
  sourceType: "quarterly_synthesis" | "monthly_synthesis";
  sourceKey: string;
  field: string;
  summary: string;
};

export type ManagerAnalysisCoreInput = {
  employeeId: string;
  managerId: string;
  role: string;
  quarterly: QuarterlySynthesisOutput;
  monthlyHistory: MonthlySynthesisOutput[];
  dataSufficiency: DataSufficiency;
  eligibility: {
    bonus: boolean;
    promotion: boolean;
  };
  evidenceCatalog: EvidenceCatalogEntry[];
};

type LlmStageResult<T> = {
  output: T;
  model: string;
  modelVersion: string;
  usage?: GenerateTextOutput["usage"];
};

export class ManagerAnalysisValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_json"
      | "invalid_schema"
      | "invalid_evidence_refs"
      | "invalid_citations"
      | "prohibited_content"
      | "invalid_peer_comparison"
  ) {
    super(message);
  }
}

function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new ManagerAnalysisValidationError(
        `Failed to parse JSON for ${context}.`,
        "invalid_json"
      );
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      throw new ManagerAnalysisValidationError(
        `Failed to parse fallback JSON for ${context}.`,
        "invalid_json"
      );
    }
  }
}

function normalizeConfidence(
  value: ConfidenceLevel,
  dataSufficiency: DataSufficiency
): ConfidenceLevel {
  if (dataSufficiency.level === "insufficient") return "low";
  if (dataSufficiency.level === "partial" && value === "high") return "medium";
  return value;
}

function sanitizePeerComparisonText(text: string, fallback: string): string {
  if (!PEER_COMPARISON_PATTERN.test(text)) {
    return text;
  }
  return fallback;
}

function ensureEvidenceRefsExist(
  refs: string[],
  validRefs: Set<string>,
  context: string
): void {
  for (const ref of refs) {
    if (!validRefs.has(ref)) {
      throw new ManagerAnalysisValidationError(
        `${context} references unknown evidence ref ${ref}.`,
        "invalid_evidence_refs"
      );
    }
  }
}

function parseCitationRefs(text: string): string[] {
  const refs: string[] = [];
  const citationPattern = /refs:\[([^\]]+)\]/g;
  let match: RegExpExecArray | null = citationPattern.exec(text);
  while (match) {
    const ids = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    refs.push(...ids);
    match = citationPattern.exec(text);
  }
  return refs;
}

function ensureCitationTokens(
  text: string,
  validRefs: Set<string>,
  context: string
): void {
  const refs = parseCitationRefs(text);
  if (refs.length === 0) {
    throw new ManagerAnalysisValidationError(
      `${context} must include citation tokens using refs:[E#].`,
      "invalid_citations"
    );
  }
  ensureEvidenceRefsExist(refs, validRefs, context);
}

async function generateManagerText(prompt: string): Promise<GenerateTextOutput> {
  return runWithLlmRateLimit({
    key: "manager-analysis",
    minIntervalMs: MIN_LLM_CALL_INTERVAL_MS,
    fn: () =>
      generateTextOnce({
        prompt,
        system: MANAGER_ANALYSIS_SYSTEM_PROMPT,
        model: MODEL_NAME,
      }),
  });
}

function buildConstraintsBlock(): string {
  return [
    "Global constraints:",
    "- Use only provided quarterly/monthly artifacts and evidenceCatalog.",
    "- Do not reprocess weekly data.",
    "- Do not invent facts.",
    "- Do not use numeric scoring.",
    "- Do not make HR decisions.",
    "- Do not use peer comparisons.",
    "- If data is partial or insufficient, lower confidence and state uncertainty.",
    "- Every claim must be evidence-backed.",
    "- Output JSON only.",
  ].join("\n");
}

type KpiBaseline = {
  kpi: string;
  expectation: string;
  managedDefinition: string;
  aboveDefinition: string;
  belowDefinition: string;
};

function getRoleKpiBaseline(role: string): KpiBaseline[] {
  if (role === "AI_ENGINEER") {
    return [
      {
        kpi: "Execution",
        expectation: "Delivers planned features/fixes with consistent closure across the period.",
        managedDefinition: "Delivery is reliable with normal guidance and predictable follow-through.",
        aboveDefinition: "Delivery is consistently high impact and expands scope without quality drop.",
        belowDefinition: "Delivery is inconsistent, blocked, or lacks sustained follow-through.",
      },
      {
        kpi: "Collaboration",
        expectation:
          "Provides effective cross-team communication and actionable review/support behavior.",
        managedDefinition: "Collaboration is clear and dependable in routine work.",
        aboveDefinition:
          "Acts as a force multiplier across teams and proactively unblocks others.",
        belowDefinition:
          "Coordination gaps or low responsiveness create repeated friction.",
      },
      {
        kpi: "QualityAndReliability",
        expectation:
          "Addresses defects/risk areas and maintains production-safe delivery habits.",
        managedDefinition:
          "Quality is generally sound with routine fixes and risk handling.",
        aboveDefinition:
          "Prevents recurrent issues and improves reliability patterns systemically.",
        belowDefinition:
          "Repeated avoidable defects or unresolved reliability concerns persist.",
      },
      {
        kpi: "GrowthAndOwnership",
        expectation:
          "Shows learning momentum and ownership progression in technical decision areas.",
        managedDefinition:
          "Owns expected scope and grows steadily with normal coaching support.",
        aboveDefinition:
          "Expands ownership into strategic/leadership space with durable influence.",
        belowDefinition:
          "Limited growth progression or unclear ownership across the period.",
      },
      {
        kpi: "SustainableWorkPattern",
        expectation:
          "Maintains sustainable working patterns while meeting expected outcomes.",
        managedDefinition:
          "Workload pattern appears stable for current scope over the period.",
        aboveDefinition:
          "Sustains higher scope while preserving healthy and stable work patterns.",
        belowDefinition:
          "Work pattern shows elevated sustainability risk or declining stability.",
      },
    ];
  }

  return [
    {
      kpi: "Execution",
      expectation: "Meets role outcomes with reliable delivery.",
      managedDefinition: "Delivery is stable for expected scope.",
      aboveDefinition: "Delivery consistently exceeds expected scope or impact.",
      belowDefinition: "Delivery falls short or is inconsistent for expected scope.",
    },
    {
      kpi: "Collaboration",
      expectation: "Collaborates effectively with relevant stakeholders.",
      managedDefinition: "Communication and coordination are dependable.",
      aboveDefinition: "Collaboration improves outcomes beyond normal expectations.",
      belowDefinition: "Coordination issues repeatedly hinder outcomes.",
    },
    {
      kpi: "Sustainability",
      expectation: "Maintains sustainable work habits for role scope.",
      managedDefinition: "Work pattern appears sustainable for current scope.",
      aboveDefinition: "Sustains elevated scope without destabilizing work patterns.",
      belowDefinition: "Work pattern indicates sustained risk or instability.",
    },
  ];
}

function buildKpiPromptBlock(role: string): string {
  return [
    "KPI baseline and expectation mapping (qualitative only):",
    '- Use exactly one label per KPI: "above", "managed", or "below".',
    '- "managed" means meeting expectations (on target).',
    "- Do not use numeric scores or percentages for KPI judgments.",
    "- Include one text graph line where possible in string fields using this format:",
    "  SkillVsExpectation: Execution[managed] -> Collaboration[above] -> QualityAndReliability[managed] -> GrowthAndOwnership[above] -> SustainableWorkPattern[managed]",
    `Role baseline: ${JSON.stringify(getRoleKpiBaseline(role), null, 2)}`,
  ].join("\n");
}

export async function generateCombinedDebate(
  input: ManagerAnalysisCoreInput
): Promise<LlmStageResult<CombinedDebateOutput>> {
  const prompt = `Task: Produce two independent assessments from the same evidence.

${buildConstraintsBlock()}
${buildKpiPromptBlock(input.role)}

Role A (Employee Advocate):
- Assume good faith and contextual constraints.
- Do not deny facts.
- Do not reference Role B.
- stance must be "support_reward".
- Include KPI expectation labels in arguments where relevant (above/managed/below).

Role B (Performance Examiner):
- Assume organizational expectations are reasonable.
- Sustained gaps matter.
- Do not deny facts.
- Do not reference Role A.
- stance must be "caution_reward".
- Include KPI expectation labels in arguments where relevant (above/managed/below).

Return exactly this JSON shape:
{
  "advocateAssessment": {
    "stance": "support_reward",
    "arguments": [{ "claim": "string", "evidenceRefs": ["E1"] }],
    "recommendation": { "bonus": "yes|no|defer", "promotion": "yes|no|not_ready" },
    "confidence": "low|medium|high"
  },
  "examinerAssessment": {
    "stance": "caution_reward",
    "arguments": [{ "claim": "string", "evidenceRefs": ["E1"] }],
    "risks": ["string"],
    "recommendation": { "bonus": "yes|no|defer", "promotion": "yes|no|not_ready" },
    "confidence": "low|medium|high"
  }
}

Input JSON:
${JSON.stringify(
    {
      ...input,
      kpiBaseline: getRoleKpiBaseline(input.role),
    },
    null,
    2
  )}`;

  const result = await generateManagerText(prompt);
  const parsed = parseJson<unknown>(result.text, "generateCombinedDebate");
  const validated = combinedDebateSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ManagerAnalysisValidationError(
      `Combined debate schema mismatch: ${validated.error.message}`,
      "invalid_schema"
    );
  }

  const evidenceRefSet = new Set(input.evidenceCatalog.map((entry) => entry.id));
  const advocateArguments = validated.data.advocateAssessment.arguments.map((argument) => {
    ensureEvidenceRefsExist(
      argument.evidenceRefs,
      evidenceRefSet,
      "advocateAssessment.arguments.evidenceRefs"
    );
    return {
      ...argument,
      claim: sanitizePeerComparisonText(
        argument.claim,
        "Evidence indicates stable positive impact against expected role outcomes."
      ),
    };
  });

  const examinerArguments = validated.data.examinerAssessment.arguments.map((argument) => {
    ensureEvidenceRefsExist(
      argument.evidenceRefs,
      evidenceRefSet,
      "examinerAssessment.arguments.evidenceRefs"
    );
    return {
      ...argument,
      claim: sanitizePeerComparisonText(
        argument.claim,
        "Evidence indicates potential risk that should be validated with manager context."
      ),
    };
  });

  const examinerRisks = validated.data.examinerAssessment.risks.map((risk) =>
    sanitizePeerComparisonText(
      risk,
      "Potential risk requires manager clarification using direct period evidence."
    )
  );

  const output: CombinedDebateOutput = {
    ...validated.data,
    advocateAssessment: {
      ...validated.data.advocateAssessment,
      arguments: advocateArguments,
      confidence: normalizeConfidence(
        validated.data.advocateAssessment.confidence,
        input.dataSufficiency
      ),
    },
    examinerAssessment: {
      ...validated.data.examinerAssessment,
      arguments: examinerArguments,
      risks: examinerRisks,
      confidence: normalizeConfidence(
        validated.data.examinerAssessment.confidence,
        input.dataSufficiency
      ),
    },
  };

  return {
    output,
    model: result.model,
    modelVersion: MODEL_VERSION,
    usage: result.usage,
  };
}

export async function generateArbiterDecision(input: {
  core: ManagerAnalysisCoreInput;
  debate: CombinedDebateOutput;
}): Promise<LlmStageResult<ArbiterDecisionOutput>> {
  const prompt = `Task: Arbitrate between advocate/examiner assessments and produce manager-safe recommendations.

${buildConstraintsBlock()}
${buildKpiPromptBlock(input.core.role)}

Rules:
- Explicitly compare both assessments and penalize weak/speculative arguments.
- Must reference unresolved ambiguity via unresolvedQuestions.
- rationale and notesForHR must contain citation tokens like refs:[E1,E2].
- Include at least one KPI summary string using above/managed/below labels.
- Include one SkillVsExpectation text graph line in rationale or notesForHR.
- Respect eligibility constraints:
  - If eligibility.bonus is false, finalRecommendation.bonus must not be "approve".
  - If eligibility.promotion is false, finalRecommendation.promotion must not be "approve".

Return exactly this JSON shape:
{
  "finalRecommendation": {
    "bonus": "approve|defer|deny",
    "promotion": "approve|defer|deny"
  },
  "rationale": ["string with refs:[E1]"],
  "unresolvedQuestions": ["string"],
  "confidence": "low|medium|high",
  "notesForHR": ["string with refs:[E1]"]
}

Input JSON:
${JSON.stringify(
    {
      quarterly: input.core.quarterly,
      monthlyHistory: input.core.monthlyHistory,
      dataSufficiency: input.core.dataSufficiency,
      eligibility: input.core.eligibility,
      role: input.core.role,
      kpiBaseline: getRoleKpiBaseline(input.core.role),
      evidenceCatalog: input.core.evidenceCatalog,
      advocateAssessment: input.debate.advocateAssessment,
      examinerAssessment: input.debate.examinerAssessment,
    },
    null,
    2
  )}`;

  const result = await generateManagerText(prompt);
  const parsed = parseJson<unknown>(result.text, "generateArbiterDecision");
  const validated = arbiterDecisionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ManagerAnalysisValidationError(
      `Arbiter schema mismatch: ${validated.error.message}`,
      "invalid_schema"
    );
  }

  const evidenceRefSet = new Set(input.core.evidenceCatalog.map((entry) => entry.id));
  const fallbackRef = input.core.evidenceCatalog[0]?.id;
  const rationale = validated.data.rationale.map((line) => {
    ensureCitationTokens(line, evidenceRefSet, "arbiter.rationale");
    const refs = parseCitationRefs(line);
    const safeRef = refs[0] ?? fallbackRef ?? "E1";
    return sanitizePeerComparisonText(
      line,
      `Evidence indicates uncertainty that needs manager clarification refs:[${safeRef}]`
    );
  });
  const notesForHR = validated.data.notesForHR.map((line) => {
    ensureCitationTokens(line, evidenceRefSet, "arbiter.notesForHR");
    const refs = parseCitationRefs(line);
    const safeRef = refs[0] ?? fallbackRef ?? "E1";
    return sanitizePeerComparisonText(
      line,
      `Document the observed evidence and open questions without comparative framing refs:[${safeRef}]`
    );
  });
  const unresolvedQuestions = validated.data.unresolvedQuestions.map((question) =>
    sanitizePeerComparisonText(
      question,
      "What additional context is needed to interpret this evidence reliably?"
    )
  );

  const output: ArbiterDecisionOutput = {
    ...validated.data,
    rationale,
    notesForHR,
    unresolvedQuestions,
    confidence: normalizeConfidence(
      validated.data.confidence,
      input.core.dataSufficiency
    ),
  };

  if (!input.core.eligibility.bonus && output.finalRecommendation.bonus === "approve") {
    output.finalRecommendation.bonus = "defer";
    if (fallbackRef) {
      output.notesForHR.push(
        `Bonus recommendation coerced to defer due to ineligibility refs:[${fallbackRef}]`
      );
    }
  }
  if (
    !input.core.eligibility.promotion &&
    output.finalRecommendation.promotion === "approve"
  ) {
    output.finalRecommendation.promotion = "defer";
    if (fallbackRef) {
      output.notesForHR.push(
        `Promotion recommendation coerced to defer due to ineligibility refs:[${fallbackRef}]`
      );
    }
  }

  return {
    output,
    model: result.model,
    modelVersion: MODEL_VERSION,
    usage: result.usage,
  };
}

export async function generateCombinedGuidance(input: {
  core: ManagerAnalysisCoreInput;
  debate: CombinedDebateOutput;
  arbiter: ArbiterDecisionOutput;
}): Promise<LlmStageResult<CombinedGuidanceOutput>> {
  const prompt = `Task: Generate employee-facing prompts and manager coaching in one response.

${buildConstraintsBlock()}
${buildKpiPromptBlock(input.core.role)}

Employee prompts rules:
- Never mention bonus or promotion.
- Supportive, non-judgmental tone.
- No peer comparisons.
- Every prompt must include evidenceRefs.
- At least one employee prompt should reflect KPI expectation framing in plain language.

Manager coaching rules:
- Focus on conversation framing.
- Include doNotAssume list.
- Cite evidence via evidenceRefs.
- Avoid definitive labels.
- Include KPI expectation checks (above/managed/below) in focusAreas.
- Include one SkillVsExpectation text graph line in managerCoaching.focusAreas.

Return exactly this JSON shape:
{
  "employeePings": [
    {
      "theme": "workload|growth|collaboration|focus",
      "message": "string",
      "evidenceRefs": ["E1"],
      "confidence": "low|medium|high"
    }
  ],
  "managerCoaching": {
    "focusAreas": ["string"],
    "suggestedQuestions": ["string"],
    "doNotAssume": ["string"],
    "evidenceRefs": ["E1"],
    "confidence": "low|medium|high"
  }
}

Input JSON:
${JSON.stringify(
    {
      quarterly: input.core.quarterly,
      monthlyHistory: input.core.monthlyHistory,
      dataSufficiency: input.core.dataSufficiency,
      role: input.core.role,
      kpiBaseline: getRoleKpiBaseline(input.core.role),
      evidenceCatalog: input.core.evidenceCatalog,
      debate: input.debate,
      arbiter: input.arbiter,
    },
    null,
    2
  )}`;

  const result = await generateManagerText(prompt);
  const parsed = parseJson<unknown>(result.text, "generateCombinedGuidance");
  const validated = combinedGuidanceSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ManagerAnalysisValidationError(
      `Guidance schema mismatch: ${validated.error.message}`,
      "invalid_schema"
    );
  }

  const evidenceRefSet = new Set(input.core.evidenceCatalog.map((entry) => entry.id));
  const output: CombinedGuidanceOutput = {
    employeePings: validated.data.employeePings.map((ping) => {
      const sanitizedMessage = sanitizePeerComparisonText(
        ping.message,
        `Let's focus on your recent evidence patterns and choose one concrete next step in ${ping.theme}.`
      );
      if (EMPLOYEE_COMPENSATION_PATTERN.test(ping.message)) {
        throw new ManagerAnalysisValidationError(
          "Employee ping includes compensation language.",
          "prohibited_content"
        );
      }
      ensureEvidenceRefsExist(
        ping.evidenceRefs,
        evidenceRefSet,
        "employeePings.evidenceRefs"
      );
      return {
        ...ping,
        message: sanitizedMessage,
        confidence: normalizeConfidence(ping.confidence, input.core.dataSufficiency),
      };
    }),
    managerCoaching: {
      ...validated.data.managerCoaching,
      focusAreas: validated.data.managerCoaching.focusAreas.map((line) =>
        sanitizePeerComparisonText(
          line,
          "Center the conversation on observed patterns and concrete support needs."
        )
      ),
      suggestedQuestions: validated.data.managerCoaching.suggestedQuestions.map((line) =>
        sanitizePeerComparisonText(
          line,
          "What does the current evidence suggest about support or clarity needed next?"
        )
      ),
      doNotAssume: validated.data.managerCoaching.doNotAssume.map((line) =>
        sanitizePeerComparisonText(
          line,
          "Do not assume performance based on comparisons; stay with direct evidence."
        )
      ),
      confidence: normalizeConfidence(
        validated.data.managerCoaching.confidence,
        input.core.dataSufficiency
      ),
    },
  };

  ensureEvidenceRefsExist(
    output.managerCoaching.evidenceRefs,
    evidenceRefSet,
    "managerCoaching.evidenceRefs"
  );

  return {
    output,
    model: result.model,
    modelVersion: MODEL_VERSION,
    usage: result.usage,
  };
}
