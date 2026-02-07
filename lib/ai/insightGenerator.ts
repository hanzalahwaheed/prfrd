import "server-only";

import { generateTextOnce } from "@/lib/ai/generate-text";
import { DEFAULT_OPENAI_MODEL } from "@/lib/ai/openai";

export type Dimension = "Execution" | "Engagement" | "Collaboration" | "Growth";
export type ConfidenceLevel = "low" | "medium" | "high";
export type PeriodType = "month" | "quarter";

export type SignalEvidence = {
  source: "github_weekly_activity" | "slack_weekly_activity";
  weekStart: string;
  fields: string[];
  summary: string;
};

export type Signal = {
  id: string;
  dimension: Dimension;
  statement: string;
  evidence: SignalEvidence[];
};

export type DataSufficiency = {
  level: "sufficient" | "partial" | "insufficient";
  notes: string;
  weeks: number;
  months: number;
  sources: {
    github: boolean;
    slack: boolean;
  };
};

export type ExtractSignalsInput = {
  periodKey: string;
  periodType: PeriodType;
  githubWeekly: WeeklyGithubActivity[];
  slackWeekly: WeeklySlackActivity[];
};

export type ExtractSignalsOutput = {
  periodKey: string;
  periodType: PeriodType;
  signalsByDimension: Record<Dimension, Signal[]>;
  allSignals: Signal[];
  dataSufficiency: DataSufficiency;
  model: string;
  modelVersion: string;
};

export type DimensionInsight = {
  insight: string;
  supportingSignalIds: string[];
  confidence: ConfidenceLevel;
};

export type ReasonByDimensionOutput = {
  periodKey: string;
  periodType: PeriodType;
  dimensions: Record<Dimension, DimensionInsight>;
  model: string;
  modelVersion: string;
};

export type MonthlySynthesisOutput = {
  overallSummary: string;
  identifiedRisks: string[];
  identifiedOpportunities: string[];
  confidence: ConfidenceLevel;
  model: string;
  modelVersion: string;
};

export type QuarterlySynthesisOutput = {
  trajectorySummary: string;
  keyStrengths: string[];
  keyConcerns: string[];
  burnoutAssessment: string;
  growthAssessment: string;
  retentionAssessment: string;
  recommendedActions: string[];
  evidenceSnapshots: Array<{
    signalId: string;
    dimension: Dimension;
    evidence: SignalEvidence[];
  }>;
  confidence: ConfidenceLevel;
  model: string;
  modelVersion: string;
};

export type MonthlySinglePassOutput = {
  periodKey: string;
  signalsByDimension: Record<Dimension, Signal[]>;
  allSignals: Signal[];
  dimensionInsights: Record<Dimension, DimensionInsight>;
  synthesis: MonthlySynthesisOutput;
  dataSufficiency: DataSufficiency;
  model: string;
  modelVersion: string;
};

export type QuarterlySinglePassOutput = {
  periodKey: string;
  signalsByDimension: Record<Dimension, Signal[]>;
  allSignals: Signal[];
  dimensionInsights: Record<Dimension, DimensionInsight>;
  synthesis: QuarterlySynthesisOutput;
  dataSufficiency: DataSufficiency;
  model: string;
  modelVersion: string;
};

export type WeeklyGithubActivity = {
  weekStart: string | Date;
  pullRequestSummaries: unknown;
  issueSummaries: unknown;
  prsMerged: number;
  prReviewsGiven: number;
  afterHoursRatio: number;
  weekendRatio: number;
};

export type WeeklySlackActivity = {
  weekStart: string | Date;
  messageSummaries: unknown;
  messageCount: number;
  replyCount: number;
  reactionsReceived: number;
  afterHoursRatio: number;
  weekendRatio: number;
};

export const INSIGHT_SYSTEM_PROMPT = `You are an insight generation engine for HR-facing performance intelligence. Use only the provided data. Do not invent facts. If data is insufficient, state uncertainty and set confidence to low. Output JSON only with the requested schema.`;

export const EXTRACT_SIGNALS_PROMPT_TEMPLATE = `Task: Extract atomic signals with evidence from weekly activity data. Signals must be grouped into the dimensions: Execution, Engagement, Collaboration, Growth.

Rules:
- Use only the provided data.
- Each signal is a single, observable statement grounded in the data.
- Each signal must include evidence that cites weekStart, source, and relevant fields.
- If data is insufficient, return empty arrays for all dimensions.
- Do NOT include numeric scores or rankings.

Return JSON only with this exact shape:
{
  "dimensions": {
    "Execution": [
      {
        "statement": "string",
        "evidence": [
          {
            "source": "github_weekly_activity | slack_weekly_activity",
            "weekStart": "YYYY-MM-DD",
            "fields": ["string"],
            "summary": "string"
          }
        ]
      }
    ],
    "Engagement": [ ... ],
    "Collaboration": [ ... ],
    "Growth": [ ... ]
  }
}

Input JSON:
{{INPUT_JSON}}`;

export const REASON_DIMENSION_PROMPT_TEMPLATE = `Task: For each dimension, write a 2-3 sentence insight using only the signals provided. Provide supporting signal IDs and a confidence level.

Rules:
- Use only the provided signals for that dimension.
- If no signals exist for a dimension, say so explicitly and set confidence to low.
- If dataSufficiency is partial or insufficient, bias confidence toward low.
- Do NOT add facts that are not present in the signals.
- Do NOT include numeric scores.

Return JSON only with this exact shape:
{
  "dimensions": {
    "Execution": {
      "insight": "string",
      "supportingSignalIds": ["S1"],
      "confidence": "low | medium | high"
    },
    "Engagement": { ... },
    "Collaboration": { ... },
    "Growth": { ... }
  }
}

Input JSON:
{{INPUT_JSON}}`;

export const SYNTHESIZE_MONTHLY_PROMPT_TEMPLATE = `Task: Synthesize monthly insights into an overall summary, risks, and opportunities. Explicitly reconcile conflicting signals if present.

Rules:
- Use only the provided dimension insights and signals.
- If data is insufficient, state uncertainty explicitly and set confidence to low.
- Risks and opportunities must be grounded in the signals.
- Do NOT include numeric scores.

Return JSON only with this exact shape:
{
  "overallSummary": "string",
  "identifiedRisks": ["string"],
  "identifiedOpportunities": ["string"],
  "confidence": "low | medium | high"
}

Input JSON:
{{INPUT_JSON}}`;

export const SYNTHESIZE_QUARTERLY_PROMPT_TEMPLATE = `Task: Synthesize quarterly insights into trajectory, strengths, concerns, and assessments. Explicitly reconcile conflicting signals if present.

Rules:
- Use only the provided dimension insights and signals.
- If data is insufficient, state uncertainty explicitly and set confidence to low.
- Evidence snapshots must reference signal IDs and include their evidence.
- Do NOT include numeric scores.

Return JSON only with this exact shape:
{
  "trajectorySummary": "string",
  "keyStrengths": ["string"],
  "keyConcerns": ["string"],
  "burnoutAssessment": "string",
  "growthAssessment": "string",
  "retentionAssessment": "string",
  "recommendedActions": ["string"],
  "evidenceSnapshots": [
    {
      "signalId": "S1",
      "dimension": "Execution | Engagement | Collaboration | Growth",
      "evidence": [
        {
          "source": "github_weekly_activity | slack_weekly_activity",
          "weekStart": "YYYY-MM-DD",
          "fields": ["string"],
          "summary": "string"
        }
      ]
    }
  ],
  "confidence": "low | medium | high"
}

Input JSON:
{{INPUT_JSON}}`;

export const MONTHLY_SINGLE_PASS_PROMPT_TEMPLATE = `Task: Execute this full workflow in one pass for the given month:
1) Signal Extraction
- Extract atomic signals with evidence from weekly GitHub + Slack data
- Group signals into Execution, Engagement, Collaboration, Growth
2) Dimension Reasoning
- For each dimension, write a short 2-3 sentence insight
- Include supporting signal IDs and dimension confidence
3) Insight Synthesis
- Produce overall summary, identified risks, identified opportunities, and overall confidence
- Explicitly reconcile conflicting signals if present

Rules:
- Use only provided data. Do not invent facts.
- Do not generate numeric scores.
- Every claim must be grounded in observed signals.
- If data is insufficient, keep confidence low and state uncertainty.

Return JSON only with this exact shape:
{
  "signalsByDimension": {
    "Execution": [
      {
        "signalId": "S1",
        "statement": "string",
        "evidence": [
          {
            "source": "github_weekly_activity | slack_weekly_activity",
            "weekStart": "YYYY-MM-DD",
            "fields": ["string"],
            "summary": "string"
          }
        ]
      }
    ],
    "Engagement": [],
    "Collaboration": [],
    "Growth": []
  },
  "dimensionInsights": {
    "Execution": {
      "insight": "string",
      "supportingSignalIds": ["S1"],
      "confidence": "low | medium | high"
    },
    "Engagement": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    },
    "Collaboration": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    },
    "Growth": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    }
  },
  "overallSummary": "string",
  "identifiedRisks": ["string"],
  "identifiedOpportunities": ["string"],
  "confidence": "low | medium | high"
}

Input JSON:
{{INPUT_JSON}}`;

export const QUARTERLY_SINGLE_PASS_PROMPT_TEMPLATE = `Task: Execute this full workflow in one pass for the given quarter:
1) Signal Extraction
- Extract atomic signals with evidence from weekly GitHub + Slack data
- Group signals into Execution, Engagement, Collaboration, Growth
2) Dimension Reasoning
- For each dimension, write a short 2-3 sentence insight
- Include supporting signal IDs and dimension confidence
3) Insight Synthesis
- Produce trajectory summary, strengths, concerns, burnout/growth/retention assessments, and recommended actions
- Include evidence snapshots
- Explicitly reconcile conflicting signals if present

Rules:
- Use only provided data. Do not invent facts.
- Do not generate numeric scores.
- Every claim must be grounded in observed signals.
- If data is insufficient, keep confidence low and state uncertainty.

Return JSON only with this exact shape:
{
  "signalsByDimension": {
    "Execution": [
      {
        "signalId": "S1",
        "statement": "string",
        "evidence": [
          {
            "source": "github_weekly_activity | slack_weekly_activity",
            "weekStart": "YYYY-MM-DD",
            "fields": ["string"],
            "summary": "string"
          }
        ]
      }
    ],
    "Engagement": [],
    "Collaboration": [],
    "Growth": []
  },
  "dimensionInsights": {
    "Execution": {
      "insight": "string",
      "supportingSignalIds": ["S1"],
      "confidence": "low | medium | high"
    },
    "Engagement": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    },
    "Collaboration": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    },
    "Growth": {
      "insight": "string",
      "supportingSignalIds": [],
      "confidence": "low | medium | high"
    }
  },
  "trajectorySummary": "string",
  "keyStrengths": ["string"],
  "keyConcerns": ["string"],
  "burnoutAssessment": "string",
  "growthAssessment": "string",
  "retentionAssessment": "string",
  "recommendedActions": ["string"],
  "evidenceSnapshots": [
    {
      "signalId": "S1",
      "dimension": "Execution | Engagement | Collaboration | Growth",
      "evidence": [
        {
          "source": "github_weekly_activity | slack_weekly_activity",
          "weekStart": "YYYY-MM-DD",
          "fields": ["string"],
          "summary": "string"
        }
      ]
    }
  ],
  "confidence": "low | medium | high"
}

Input JSON:
{{INPUT_JSON}}`;

const DIMENSIONS: Dimension[] = [
  "Execution",
  "Engagement",
  "Collaboration",
  "Growth",
];

const MODEL_NAME = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
const MODEL_VERSION = process.env.OPENAI_MODEL_VERSION ?? "unspecified";
const MIN_LLM_CALL_INTERVAL_MS = Number(
  process.env.INSIGHT_LLM_MIN_INTERVAL_MS ?? "30000"
);

let llmQueue: Promise<void> = Promise.resolve();
let lastLlmCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asDimension(value: unknown): Dimension | null {
  if (
    value === "Execution" ||
    value === "Engagement" ||
    value === "Collaboration" ||
    value === "Growth"
  ) {
    return value;
  }
  return null;
}

async function runWithLlmRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const previous = llmQueue;
  let releaseQueue: () => void = () => {};
  llmQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;

  const elapsed = Date.now() - lastLlmCallAt;
  const waitMs = Math.max(0, MIN_LLM_CALL_INTERVAL_MS - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  try {
    return await fn();
  } finally {
    lastLlmCallAt = Date.now();
    releaseQueue();
  }
}

async function generateInsightText(prompt: string) {
  return runWithLlmRateLimit(() =>
    generateTextOnce({
      prompt,
      system: INSIGHT_SYSTEM_PROMPT,
      model: MODEL_NAME,
    })
  );
}

function toISODate(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  return `${year}-${month}`;
}

function assessDataSufficiency(
  periodType: PeriodType,
  githubWeekly: WeeklyGithubActivity[],
  slackWeekly: WeeklySlackActivity[]
): DataSufficiency {
  const weekSet = new Set<string>();
  githubWeekly.forEach((week) => weekSet.add(toISODate(week.weekStart)));
  slackWeekly.forEach((week) => weekSet.add(toISODate(week.weekStart)));
  const weeks = weekSet.size;
  const months = new Set([...weekSet].map((week) => monthKey(week))).size;
  const sources = {
    github: githubWeekly.length > 0,
    slack: slackWeekly.length > 0,
  };

  if (weeks === 0) {
    return {
      level: "insufficient",
      notes: "No weekly data available for this period.",
      weeks,
      months,
      sources,
    };
  }

  if (periodType === "month") {
    if (weeks < 4) {
      return {
        level: "insufficient",
        notes: "Fewer than four weekly snapshots for this month.",
        weeks,
        months,
        sources,
      };
    }

    if (!sources.github || !sources.slack || weeks < 5) {
      return {
        level: "partial",
        notes:
          "Monthly coverage is partial or missing one of the data sources.",
        weeks,
        months,
        sources,
      };
    }

    return {
      level: "sufficient",
      notes: "Monthly coverage includes both sources with at least four weeks.",
      weeks,
      months,
      sources,
    };
  }

  if (months < 3 || weeks < 10) {
    return {
      level: "insufficient",
      notes: "Quarterly coverage is incomplete or missing enough weekly data.",
      weeks,
      months,
      sources,
    };
  }

  if (!sources.github || !sources.slack || weeks < 12) {
    return {
      level: "partial",
      notes:
        "Quarterly coverage is partial or missing one of the data sources.",
      weeks,
      months,
      sources,
    };
  }

  return {
    level: "sufficient",
    notes: "Quarterly coverage includes both sources with full weekly coverage.",
    weeks,
    months,
    sources,
  };
}

function sanitizeEvidence(evidence: unknown): SignalEvidence[] {
  if (!Array.isArray(evidence)) return [];

  return evidence
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const source =
        record.source === "github_weekly_activity" ||
        record.source === "slack_weekly_activity"
          ? record.source
          : null;
      const weekStartRaw =
        typeof record.weekStart === "string" ? record.weekStart : "";
      const fields = Array.isArray(record.fields)
        ? record.fields.map((field) => String(field))
        : [];
      const summary =
        typeof record.summary === "string" ? record.summary : "";

      if (!source || !weekStartRaw || !summary) return null;

      return {
        source,
        weekStart: weekStartRaw.slice(0, 10),
        fields,
        summary,
      } as SignalEvidence;
    })
    .filter((entry): entry is SignalEvidence => Boolean(entry));
}

function normalizeConfidence(
  value: unknown,
  dataSufficiency: DataSufficiency,
  hasSignals: boolean
): ConfidenceLevel {
  if (value === "low" || value === "medium" || value === "high") {
    if (dataSufficiency.level === "insufficient" && value !== "low") {
      return "low";
    }
    if (!hasSignals && value !== "low") {
      return "low";
    }
    if (dataSufficiency.level === "partial" && value === "high") {
      return "medium";
    }
    return value;
  }

  if (!hasSignals || dataSufficiency.level === "insufficient") {
    return "low";
  }

  if (dataSufficiency.level === "partial") {
    return "medium";
  }

  return "medium";
}

function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Failed to parse JSON for ${context}.`);
    }
    return JSON.parse(match[0]) as T;
  }
}

function sanitizeSignalStatement(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "Insufficient data to derive a specific signal.";
}

function buildInsufficientInsight(dimension: Dimension): string {
  return `Insufficient data to generate a reliable ${dimension.toLowerCase()} insight for this period.`;
}

function ensureUncertaintyNote(
  text: string,
  dataSufficiency: DataSufficiency
): string {
  if (dataSufficiency.level !== "insufficient") {
    return text;
  }

  const lower = text.toLowerCase();
  if (
    lower.includes("insufficient") ||
    lower.includes("limited") ||
    lower.includes("uncertain")
  ) {
    return text;
  }

  return `${text} Data coverage is insufficient, so this insight is uncertain.`;
}

function normalizeWeeklyGithub(
  weekly: WeeklyGithubActivity[]
): Array<Record<string, unknown>> {
  return weekly.map((week) => ({
    weekStart: toISODate(week.weekStart),
    pullRequestSummaries: week.pullRequestSummaries ?? [],
    issueSummaries: week.issueSummaries ?? [],
    prsMerged: week.prsMerged ?? 0,
    prReviewsGiven: week.prReviewsGiven ?? 0,
    afterHoursRatio: week.afterHoursRatio ?? 0,
    weekendRatio: week.weekendRatio ?? 0,
  }));
}

function normalizeWeeklySlack(
  weekly: WeeklySlackActivity[]
): Array<Record<string, unknown>> {
  return weekly.map((week) => ({
    weekStart: toISODate(week.weekStart),
    messageSummaries: week.messageSummaries ?? [],
    messageCount: week.messageCount ?? 0,
    replyCount: week.replyCount ?? 0,
    reactionsReceived: week.reactionsReceived ?? 0,
    afterHoursRatio: week.afterHoursRatio ?? 0,
    weekendRatio: week.weekendRatio ?? 0,
  }));
}

function normalizeSignalsByDimension(raw: unknown): {
  signalsByDimension: Record<Dimension, Signal[]>;
  allSignals: Signal[];
} {
  const signalsByDimension = DIMENSIONS.reduce((acc, dimension) => {
    acc[dimension] = [] as Signal[];
    return acc;
  }, {} as Record<Dimension, Signal[]>);

  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const seenIds = new Set<string>();
  let counter = 1;

  for (const dimension of DIMENSIONS) {
    const rawSignals = record[dimension];
    if (!Array.isArray(rawSignals)) {
      continue;
    }

    for (const rawSignal of rawSignals) {
      if (!rawSignal || typeof rawSignal !== "object") {
        continue;
      }

      const signalRecord = rawSignal as Record<string, unknown>;
      const statement = sanitizeSignalStatement(signalRecord.statement);
      const evidence = sanitizeEvidence(signalRecord.evidence);
      if (evidence.length === 0) {
        continue;
      }

      let candidateId =
        typeof signalRecord.signalId === "string"
          ? signalRecord.signalId.trim()
          : "";
      if (!candidateId || seenIds.has(candidateId)) {
        do {
          candidateId = `S${counter}`;
          counter += 1;
        } while (seenIds.has(candidateId));
      }

      seenIds.add(candidateId);
      signalsByDimension[dimension].push({
        id: candidateId,
        dimension,
        statement,
        evidence,
      });
    }
  }

  const allSignals = DIMENSIONS.flatMap((dimension) => signalsByDimension[dimension]);
  return { signalsByDimension, allSignals };
}

function normalizeDimensionInsightsFromRaw(input: {
  rawDimensionInsights: unknown;
  signalsByDimension: Record<Dimension, Signal[]>;
  dataSufficiency: DataSufficiency;
}): Record<Dimension, DimensionInsight> {
  const record =
    input.rawDimensionInsights && typeof input.rawDimensionInsights === "object"
      ? (input.rawDimensionInsights as Record<string, unknown>)
      : {};

  return DIMENSIONS.reduce((acc, dimension) => {
    const signals = input.signalsByDimension[dimension] ?? [];
    const validIds = new Set(signals.map((signal) => signal.id));
    const raw =
      record[dimension] && typeof record[dimension] === "object"
        ? (record[dimension] as Record<string, unknown>)
        : {};

    const supportingSignalIds = Array.isArray(raw.supportingSignalIds)
      ? raw.supportingSignalIds
          .map((id) => String(id))
          .filter((id) => validIds.has(id))
      : [];

    const hasSignals = signals.length > 0;
    const insightText =
      typeof raw.insight === "string" && raw.insight.trim().length > 0
        ? raw.insight.trim()
        : hasSignals
        ? `${dimension} signals were observed but require manual review for narrative synthesis.`
        : buildInsufficientInsight(dimension);

    const confidence = normalizeConfidence(
      raw.confidence,
      input.dataSufficiency,
      hasSignals
    );

    acc[dimension] = {
      insight: hasSignals
        ? ensureUncertaintyNote(insightText, input.dataSufficiency)
        : buildInsufficientInsight(dimension),
      supportingSignalIds:
        supportingSignalIds.length > 0
          ? supportingSignalIds
          : hasSignals
          ? signals.map((signal) => signal.id)
          : [],
      confidence,
    };

    return acc;
  }, {} as Record<Dimension, DimensionInsight>);
}

function normalizeMonthlySynthesisFromRaw(input: {
  raw: Record<string, unknown>;
  dataSufficiency: DataSufficiency;
  allSignals: Signal[];
}): MonthlySynthesisOutput {
  if (input.allSignals.length === 0) {
    return {
      overallSummary:
        "Insufficient data to generate a reliable monthly summary for this period.",
      identifiedRisks: [],
      identifiedOpportunities: [],
      confidence: "low",
      model: MODEL_NAME,
      modelVersion: MODEL_VERSION,
    };
  }

  const identifiedRisks = Array.isArray(input.raw.identifiedRisks)
    ? input.raw.identifiedRisks.map((item) => String(item)).filter(Boolean)
    : [];

  const identifiedOpportunities = Array.isArray(input.raw.identifiedOpportunities)
    ? input.raw.identifiedOpportunities.map((item) => String(item)).filter(Boolean)
    : [];

  const overallSummary =
    typeof input.raw.overallSummary === "string" &&
    input.raw.overallSummary.trim().length > 0
      ? input.raw.overallSummary.trim()
      : "Summary unavailable due to insufficient or unclear signals.";

  const confidence = normalizeConfidence(
    input.raw.confidence,
    input.dataSufficiency,
    input.allSignals.length > 0
  );

  return {
    overallSummary: ensureUncertaintyNote(overallSummary, input.dataSufficiency),
    identifiedRisks,
    identifiedOpportunities,
    confidence,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

function normalizeQuarterlySynthesisFromRaw(input: {
  raw: Record<string, unknown>;
  dataSufficiency: DataSufficiency;
  allSignals: Signal[];
}): QuarterlySynthesisOutput {
  if (input.allSignals.length === 0) {
    return {
      trajectorySummary:
        "Insufficient data to generate a reliable quarterly trajectory summary for this period.",
      keyStrengths: [],
      keyConcerns: [],
      burnoutAssessment:
        "Insufficient data to assess burnout risk for this period.",
      growthAssessment:
        "Insufficient data to assess growth trends for this period.",
      retentionAssessment:
        "Insufficient data to assess retention risk for this period.",
      recommendedActions: [],
      evidenceSnapshots: [],
      confidence: "low",
      model: MODEL_NAME,
      modelVersion: MODEL_VERSION,
    };
  }

  const keyStrengths = Array.isArray(input.raw.keyStrengths)
    ? input.raw.keyStrengths.map((item) => String(item)).filter(Boolean)
    : [];
  const keyConcerns = Array.isArray(input.raw.keyConcerns)
    ? input.raw.keyConcerns.map((item) => String(item)).filter(Boolean)
    : [];
  const recommendedActions = Array.isArray(input.raw.recommendedActions)
    ? input.raw.recommendedActions.map((item) => String(item)).filter(Boolean)
    : [];

  const evidenceSnapshots = Array.isArray(input.raw.evidenceSnapshots)
    ? input.raw.evidenceSnapshots
        .map((snapshot) => {
          if (!snapshot || typeof snapshot !== "object") return null;
          const record = snapshot as Record<string, unknown>;
          const signalId =
            typeof record.signalId === "string" ? record.signalId : "";
          const dimension = asDimension(record.dimension);
          const evidence = sanitizeEvidence(record.evidence);

          if (!signalId || !dimension) return null;

          return {
            signalId,
            dimension,
            evidence,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  const trajectorySummary =
    typeof input.raw.trajectorySummary === "string" &&
    input.raw.trajectorySummary.trim().length > 0
      ? input.raw.trajectorySummary.trim()
      : "Trajectory summary unavailable due to insufficient or unclear signals.";

  const burnoutAssessment =
    typeof input.raw.burnoutAssessment === "string" &&
    input.raw.burnoutAssessment.trim().length > 0
      ? input.raw.burnoutAssessment.trim()
      : "Burnout assessment unavailable due to insufficient or unclear signals.";

  const growthAssessment =
    typeof input.raw.growthAssessment === "string" &&
    input.raw.growthAssessment.trim().length > 0
      ? input.raw.growthAssessment.trim()
      : "Growth assessment unavailable due to insufficient or unclear signals.";

  const retentionAssessment =
    typeof input.raw.retentionAssessment === "string" &&
    input.raw.retentionAssessment.trim().length > 0
      ? input.raw.retentionAssessment.trim()
      : "Retention assessment unavailable due to insufficient or unclear signals.";

  const confidence = normalizeConfidence(
    input.raw.confidence,
    input.dataSufficiency,
    input.allSignals.length > 0
  );

  return {
    trajectorySummary: ensureUncertaintyNote(
      trajectorySummary,
      input.dataSufficiency
    ),
    keyStrengths,
    keyConcerns,
    burnoutAssessment: ensureUncertaintyNote(
      burnoutAssessment,
      input.dataSufficiency
    ),
    growthAssessment: ensureUncertaintyNote(
      growthAssessment,
      input.dataSufficiency
    ),
    retentionAssessment: ensureUncertaintyNote(
      retentionAssessment,
      input.dataSufficiency
    ),
    recommendedActions,
    evidenceSnapshots,
    confidence,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function generateMonthlyInsightsSinglePass(input: {
  periodKey: string;
  githubWeekly: WeeklyGithubActivity[];
  slackWeekly: WeeklySlackActivity[];
}): Promise<MonthlySinglePassOutput> {
  const dataSufficiency = assessDataSufficiency(
    "month",
    input.githubWeekly,
    input.slackWeekly
  );

  const payload = {
    periodKey: input.periodKey,
    periodType: "month",
    dataSufficiency,
    githubWeekly: normalizeWeeklyGithub(input.githubWeekly),
    slackWeekly: normalizeWeeklySlack(input.slackWeekly),
  };

  const prompt = MONTHLY_SINGLE_PASS_PROMPT_TEMPLATE.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(payload, null, 2)
  );

  const result = await generateInsightText(prompt);
  const parsed = parseJson<Record<string, unknown>>(
    result.text,
    "generateMonthlyInsightsSinglePass"
  );

  const { signalsByDimension, allSignals } = normalizeSignalsByDimension(
    parsed.signalsByDimension
  );

  const dimensionInsights = normalizeDimensionInsightsFromRaw({
    rawDimensionInsights: parsed.dimensionInsights,
    signalsByDimension,
    dataSufficiency,
  });

  const synthesis = normalizeMonthlySynthesisFromRaw({
    raw: parsed,
    dataSufficiency,
    allSignals,
  });

  return {
    periodKey: input.periodKey,
    signalsByDimension,
    allSignals,
    dimensionInsights,
    synthesis,
    dataSufficiency,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function generateQuarterlyInsightsSinglePass(input: {
  periodKey: string;
  githubWeekly: WeeklyGithubActivity[];
  slackWeekly: WeeklySlackActivity[];
}): Promise<QuarterlySinglePassOutput> {
  const dataSufficiency = assessDataSufficiency(
    "quarter",
    input.githubWeekly,
    input.slackWeekly
  );

  const payload = {
    periodKey: input.periodKey,
    periodType: "quarter",
    dataSufficiency,
    githubWeekly: normalizeWeeklyGithub(input.githubWeekly),
    slackWeekly: normalizeWeeklySlack(input.slackWeekly),
  };

  const prompt = QUARTERLY_SINGLE_PASS_PROMPT_TEMPLATE.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(payload, null, 2)
  );

  const result = await generateInsightText(prompt);
  const parsed = parseJson<Record<string, unknown>>(
    result.text,
    "generateQuarterlyInsightsSinglePass"
  );

  const { signalsByDimension, allSignals } = normalizeSignalsByDimension(
    parsed.signalsByDimension
  );

  const dimensionInsights = normalizeDimensionInsightsFromRaw({
    rawDimensionInsights: parsed.dimensionInsights,
    signalsByDimension,
    dataSufficiency,
  });

  const synthesis = normalizeQuarterlySynthesisFromRaw({
    raw: parsed,
    dataSufficiency,
    allSignals,
  });

  return {
    periodKey: input.periodKey,
    signalsByDimension,
    allSignals,
    dimensionInsights,
    synthesis,
    dataSufficiency,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function extractSignals(
  input: ExtractSignalsInput
): Promise<ExtractSignalsOutput> {
  const dataSufficiency = assessDataSufficiency(
    input.periodType,
    input.githubWeekly,
    input.slackWeekly
  );

  const payload = {
    periodKey: input.periodKey,
    periodType: input.periodType,
    dataSufficiency,
    githubWeekly: normalizeWeeklyGithub(input.githubWeekly),
    slackWeekly: normalizeWeeklySlack(input.slackWeekly),
  };

  const prompt = EXTRACT_SIGNALS_PROMPT_TEMPLATE.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(payload, null, 2)
  );

  // LLM step: extract atomic signals with evidence from weekly summaries.
  const result = await generateInsightText(prompt);

  const parsed = parseJson<{
    dimensions?: Record<string, Array<{ statement?: unknown; evidence?: unknown }>>;
  }>(result.text, "extractSignals");

  const signalsByDimension = DIMENSIONS.reduce((acc, dimension) => {
    acc[dimension] = [] as Signal[];
    return acc;
  }, {} as Record<Dimension, Signal[]>);

  let counter = 1;

  for (const dimension of DIMENSIONS) {
    const rawSignals = parsed.dimensions?.[dimension] ?? [];
    if (!Array.isArray(rawSignals)) continue;

    for (const rawSignal of rawSignals) {
      const statement = sanitizeSignalStatement(rawSignal?.statement);
      const evidence = sanitizeEvidence(rawSignal?.evidence);
      if (evidence.length === 0) {
        continue;
      }
      const signal: Signal = {
        id: `S${counter}`,
        dimension,
        statement,
        evidence,
      };
      signalsByDimension[dimension].push(signal);
      counter += 1;
    }
  }

  const allSignals = DIMENSIONS.flatMap((dimension) =>
    signalsByDimension[dimension]
  );

  return {
    periodKey: input.periodKey,
    periodType: input.periodType,
    signalsByDimension,
    allSignals,
    dataSufficiency,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function reasonByDimension(input: {
  periodKey: string;
  periodType: PeriodType;
  signalsByDimension: Record<Dimension, Signal[]>;
  dataSufficiency: DataSufficiency;
}): Promise<ReasonByDimensionOutput> {
  const payload = {
    periodKey: input.periodKey,
    periodType: input.periodType,
    dataSufficiency: input.dataSufficiency,
    signalsByDimension: input.signalsByDimension,
  };

  const prompt = REASON_DIMENSION_PROMPT_TEMPLATE.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(payload, null, 2)
  );

  // LLM step: turn signals into dimension-level narrative insights.
  const result = await generateInsightText(prompt);

  const parsed = parseJson<{
    dimensions?: Record<
      string,
      { insight?: unknown; supportingSignalIds?: unknown; confidence?: unknown }
    >;
  }>(result.text, "reasonByDimension");

  const dimensions = DIMENSIONS.reduce((acc, dimension) => {
    const signals = input.signalsByDimension[dimension] ?? [];
    const validIds = new Set(signals.map((signal) => signal.id));
    const raw = parsed.dimensions?.[dimension];

    const supportingSignalIds = Array.isArray(raw?.supportingSignalIds)
      ? raw?.supportingSignalIds
          .map((id) => String(id))
          .filter((id) => validIds.has(id))
      : [];

    const hasSignals = signals.length > 0;
    const insightText =
      typeof raw?.insight === "string" && raw.insight.trim().length > 0
        ? raw.insight.trim()
        : hasSignals
        ? `${dimension} signals were observed but require manual review for narrative synthesis.`
        : buildInsufficientInsight(dimension);

    const confidence = normalizeConfidence(
      raw?.confidence,
      input.dataSufficiency,
      hasSignals
    );

    acc[dimension] = {
      insight: hasSignals
        ? ensureUncertaintyNote(insightText, input.dataSufficiency)
        : buildInsufficientInsight(dimension),
      supportingSignalIds:
        supportingSignalIds.length > 0
          ? supportingSignalIds
          : hasSignals
          ? signals.map((signal) => signal.id)
          : [],
      confidence,
    };

    return acc;
  }, {} as Record<Dimension, DimensionInsight>);

  return {
    periodKey: input.periodKey,
    periodType: input.periodType,
    dimensions,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function synthesizeInsights(input: {
  periodKey: string;
  periodType: PeriodType;
  dimensionInsights: Record<Dimension, DimensionInsight>;
  signalsByDimension: Record<Dimension, Signal[]>;
  dataSufficiency: DataSufficiency;
}): Promise<MonthlySynthesisOutput | QuarterlySynthesisOutput> {
  const allSignals = DIMENSIONS.flatMap((dimension) =>
    input.signalsByDimension[dimension]
  );

  const payload = {
    periodKey: input.periodKey,
    periodType: input.periodType,
    dataSufficiency: input.dataSufficiency,
    dimensionInsights: input.dimensionInsights,
    signals: allSignals,
  };

  const template =
    input.periodType === "month"
      ? SYNTHESIZE_MONTHLY_PROMPT_TEMPLATE
      : SYNTHESIZE_QUARTERLY_PROMPT_TEMPLATE;

  const prompt = template.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(payload, null, 2)
  );

  // LLM step: synthesize dimension insights into period-level conclusions.
  const result = await generateInsightText(prompt);

  if (input.periodType === "month") {
    const parsed = parseJson<{
      overallSummary?: unknown;
      identifiedRisks?: unknown;
      identifiedOpportunities?: unknown;
      confidence?: unknown;
    }>(result.text, "synthesizeMonthlyInsights");

    if (allSignals.length === 0) {
      return {
        overallSummary:
          "Insufficient data to generate a reliable monthly summary for this period.",
        identifiedRisks: [],
        identifiedOpportunities: [],
        confidence: "low",
        model: MODEL_NAME,
        modelVersion: MODEL_VERSION,
      };
    }

    const identifiedRisks = Array.isArray(parsed.identifiedRisks)
      ? parsed.identifiedRisks.map((item) => String(item)).filter(Boolean)
      : [];

    const identifiedOpportunities = Array.isArray(parsed.identifiedOpportunities)
      ? parsed.identifiedOpportunities
          .map((item) => String(item))
          .filter(Boolean)
      : [];

    const overallSummary =
      typeof parsed.overallSummary === "string" &&
      parsed.overallSummary.trim().length > 0
        ? parsed.overallSummary.trim()
        : "Summary unavailable due to insufficient or unclear signals.";

    const confidence = normalizeConfidence(
      parsed.confidence,
      input.dataSufficiency,
      allSignals.length > 0
    );

    return {
      overallSummary: ensureUncertaintyNote(
        overallSummary,
        input.dataSufficiency
      ),
      identifiedRisks,
      identifiedOpportunities,
      confidence,
      model: MODEL_NAME,
      modelVersion: MODEL_VERSION,
    };
  }

  const parsed = parseJson<{
    trajectorySummary?: unknown;
    keyStrengths?: unknown;
    keyConcerns?: unknown;
    burnoutAssessment?: unknown;
    growthAssessment?: unknown;
    retentionAssessment?: unknown;
    recommendedActions?: unknown;
    evidenceSnapshots?: unknown;
    confidence?: unknown;
  }>(result.text, "synthesizeQuarterlyInsights");

  if (allSignals.length === 0) {
    return {
      trajectorySummary:
        "Insufficient data to generate a reliable quarterly trajectory summary for this period.",
      keyStrengths: [],
      keyConcerns: [],
      burnoutAssessment:
        "Insufficient data to assess burnout risk for this period.",
      growthAssessment:
        "Insufficient data to assess growth trends for this period.",
      retentionAssessment:
        "Insufficient data to assess retention risk for this period.",
      recommendedActions: [],
      evidenceSnapshots: [],
      confidence: "low",
      model: MODEL_NAME,
      modelVersion: MODEL_VERSION,
    };
  }

  const keyStrengths = Array.isArray(parsed.keyStrengths)
    ? parsed.keyStrengths.map((item) => String(item)).filter(Boolean)
    : [];
  const keyConcerns = Array.isArray(parsed.keyConcerns)
    ? parsed.keyConcerns.map((item) => String(item)).filter(Boolean)
    : [];
  const recommendedActions = Array.isArray(parsed.recommendedActions)
    ? parsed.recommendedActions.map((item) => String(item)).filter(Boolean)
    : [];

  const evidenceSnapshots = Array.isArray(parsed.evidenceSnapshots)
    ? parsed.evidenceSnapshots
        .map((snapshot) => {
          if (!snapshot || typeof snapshot !== "object") return null;
          const record = snapshot as Record<string, unknown>;
          const signalId =
            typeof record.signalId === "string" ? record.signalId : "";
          const dimension =
            record.dimension === "Execution" ||
            record.dimension === "Engagement" ||
            record.dimension === "Collaboration" ||
            record.dimension === "Growth"
              ? record.dimension
              : null;
          const evidence = sanitizeEvidence(record.evidence);

          if (!signalId || !dimension) return null;

          return {
            signalId,
            dimension,
            evidence,
          };
        })
        .filter(Boolean)
    : [];

  const trajectorySummary =
    typeof parsed.trajectorySummary === "string" &&
    parsed.trajectorySummary.trim().length > 0
      ? parsed.trajectorySummary.trim()
      : "Trajectory summary unavailable due to insufficient or unclear signals.";

  const burnoutAssessment =
    typeof parsed.burnoutAssessment === "string" &&
    parsed.burnoutAssessment.trim().length > 0
      ? parsed.burnoutAssessment.trim()
      : "Burnout assessment unavailable due to insufficient or unclear signals.";

  const growthAssessment =
    typeof parsed.growthAssessment === "string" &&
    parsed.growthAssessment.trim().length > 0
      ? parsed.growthAssessment.trim()
      : "Growth assessment unavailable due to insufficient or unclear signals.";

  const retentionAssessment =
    typeof parsed.retentionAssessment === "string" &&
    parsed.retentionAssessment.trim().length > 0
      ? parsed.retentionAssessment.trim()
      : "Retention assessment unavailable due to insufficient or unclear signals.";

  const confidence = normalizeConfidence(
    parsed.confidence,
    input.dataSufficiency,
    allSignals.length > 0
  );

  return {
    trajectorySummary: ensureUncertaintyNote(
      trajectorySummary,
      input.dataSufficiency
    ),
    keyStrengths,
    keyConcerns,
    burnoutAssessment: ensureUncertaintyNote(
      burnoutAssessment,
      input.dataSufficiency
    ),
    growthAssessment: ensureUncertaintyNote(
      growthAssessment,
      input.dataSufficiency
    ),
    retentionAssessment: ensureUncertaintyNote(
      retentionAssessment,
      input.dataSufficiency
    ),
    recommendedActions,
    evidenceSnapshots: evidenceSnapshots as QuarterlySynthesisOutput["evidenceSnapshots"],
    confidence,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}
