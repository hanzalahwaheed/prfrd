import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  type ArbiterDecisionOutput,
  type CombinedDebateOutput,
  type CombinedGuidanceOutput,
  type EvidenceCatalogEntry,
  type ManagerAnalysisCoreInput,
  generateArbiterDecision,
  generateCombinedDebate,
  generateCombinedGuidance,
} from "@/lib/ai/managerAnalysis";
import type {
  ConfidenceLevel,
  DataSufficiency,
  MonthlySynthesisOutput,
  QuarterlySynthesisOutput,
  SignalEvidence,
} from "@/lib/ai/insightGenerator";
import { db } from "@/lib/db/config";
import {
  analysisArbiterDecision,
  analysisDebateResponse,
  analysisRun,
  employeeAnalysisContext,
  employeeMonthlyInsights,
  employeePrompt,
  employeeQuarterlyInsights,
  employees,
  managerFeedback,
} from "@/lib/db/schema";

export type GenerateManagerAnalysisRequest = {
  employeeEmail: string;
  quarter: string;
  monthKeys: [string, string, string];
};

type FailedStage =
  | "input_validation"
  | "evidence_load"
  | "debate"
  | "arbiter"
  | "guidance"
  | "persistence";

type FailedResponse = {
  status: "failed";
  runId: number | null;
  failedStage: FailedStage;
  errorCode: string;
  message: string;
};

type SuccessResponse = {
  status: "success";
  runId: number;
  employeeEmail: string;
  quarter: string;
  outputs: {
    debate: CombinedDebateOutput;
    arbiter: ArbiterDecisionOutput;
    guidance: CombinedGuidanceOutput;
  };
};

export type GenerateManagerAnalysisResult =
  | {
      ok: true;
      httpStatus: number;
      body: SuccessResponse;
    }
  | {
      ok: false;
      httpStatus: number;
      body: FailedResponse;
    };

type StageUsage = Record<
  "debate" | "arbiter" | "guidance",
  {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null
>;

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseConfidenceLevel(raw: unknown): ConfidenceLevel {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "low";
}

function inferDataSufficiencyFromConfidence(
  confidence: ConfidenceLevel
): DataSufficiency {
  if (confidence === "high") {
    return {
      level: "sufficient",
      notes: "Inferred from legacy confidence level.",
      weeks: 0,
      months: 0,
      sources: {
        github: false,
        slack: false,
      },
    };
  }
  if (confidence === "medium") {
    return {
      level: "partial",
      notes: "Inferred from legacy confidence level.",
      weeks: 0,
      months: 0,
      sources: {
        github: false,
        slack: false,
      },
    };
  }
  return {
    level: "insufficient",
    notes: "Inferred from legacy confidence level.",
    weeks: 0,
    months: 0,
    sources: {
      github: false,
      slack: false,
    },
  };
}

function parseDataSufficiency(
  raw: unknown,
  confidence: ConfidenceLevel
): DataSufficiency {
  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    const level = candidate.level;
    const notes = candidate.notes;
    const weeks = candidate.weeks;
    const months = candidate.months;
    const sources =
      candidate.sources && typeof candidate.sources === "object"
        ? (candidate.sources as Record<string, unknown>)
        : null;

    const github = sources?.github;
    const slack = sources?.slack;

    if (
      (level === "sufficient" || level === "partial" || level === "insufficient") &&
      typeof notes === "string" &&
      typeof weeks === "number" &&
      typeof months === "number" &&
      typeof github === "boolean" &&
      typeof slack === "boolean"
    ) {
      return {
        level,
        notes,
        weeks,
        months,
        sources: {
          github,
          slack,
        },
      };
    }
  }
  return inferDataSufficiencyFromConfidence(confidence);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function asSignalEvidenceArray(value: unknown): SignalEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (
        (record.source !== "github_weekly_activity" &&
          record.source !== "slack_weekly_activity") ||
        typeof record.weekStart !== "string" ||
        !Array.isArray(record.fields) ||
        typeof record.summary !== "string"
      ) {
        return null;
      }

      return {
        source: record.source,
        weekStart: record.weekStart,
        fields: record.fields.map((field) => String(field)),
        summary: record.summary,
      } satisfies SignalEvidence;
    })
    .filter((entry): entry is SignalEvidence => Boolean(entry));
}

function asEvidenceSnapshots(
  value: unknown
): QuarterlySynthesisOutput["evidenceSnapshots"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (
        typeof record.signalId !== "string" ||
        (record.dimension !== "Execution" &&
          record.dimension !== "Engagement" &&
          record.dimension !== "Collaboration" &&
          record.dimension !== "Growth")
      ) {
        return null;
      }
      return {
        signalId: record.signalId,
        dimension: record.dimension,
        evidence: asSignalEvidenceArray(record.evidence),
      };
    })
    .filter(
      (
        entry
      ): entry is QuarterlySynthesisOutput["evidenceSnapshots"][number] =>
        Boolean(entry)
    );
}

function expectedMonthsForQuarter(quarter: string): string[] | null {
  const parsed = QUARTER_PATTERN.exec(quarter);
  if (!parsed) return null;
  const year = parsed[1];
  const q = Number(parsed[2]);
  const baseMonth = (q - 1) * 3 + 1;
  return [baseMonth, baseMonth + 1, baseMonth + 2].map((month) =>
    `${year}-${String(month).padStart(2, "0")}`
  );
}

function normalizeAndValidateMonthKeys(
  quarter: string,
  monthKeys: unknown
): { ok: true; months: [string, string, string] } | { ok: false; message: string } {
  if (!Array.isArray(monthKeys) || monthKeys.length !== 3) {
    return { ok: false, message: "monthKeys must be an array of three YYYY-MM values." };
  }

  const normalized = monthKeys
    .map((month) => String(month).trim())
    .sort() as [string, string, string];
  const unique = new Set(normalized);
  if (unique.size !== 3) {
    return { ok: false, message: "monthKeys must contain three unique months." };
  }

  for (const month of normalized) {
    if (!MONTH_PATTERN.test(month)) {
      return { ok: false, message: "monthKeys entries must match YYYY-MM." };
    }
  }

  const expected = expectedMonthsForQuarter(quarter);
  if (!expected) {
    return { ok: false, message: "quarter must match YYYY-Q1 to YYYY-Q4." };
  }
  const expectedSorted = [...expected].sort();
  if (
    normalized[0] !== expectedSorted[0] ||
    normalized[1] !== expectedSorted[1] ||
    normalized[2] !== expectedSorted[2]
  ) {
    return {
      ok: false,
      message: "monthKeys must match the exact months for the selected quarter.",
    };
  }

  return { ok: true, months: normalized };
}

function buildEvidenceCatalog(input: {
  quarter: string;
  quarterly: QuarterlySynthesisOutput;
  monthlyHistory: Array<{ month: string; synthesis: MonthlySynthesisOutput }>;
}): EvidenceCatalogEntry[] {
  const entries: EvidenceCatalogEntry[] = [];

  function pushEntry(
    sourceType: EvidenceCatalogEntry["sourceType"],
    sourceKey: string,
    field: string,
    summary: string
  ) {
    const trimmed = summary.trim();
    if (!trimmed) return;
    const id = `E${entries.length + 1}`;
    entries.push({ id, sourceType, sourceKey, field, summary: trimmed });
  }

  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "trajectorySummary",
    input.quarterly.trajectorySummary
  );
  for (const [index, strength] of input.quarterly.keyStrengths.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `keyStrengths[${index}]`,
      strength
    );
  }
  for (const [index, concern] of input.quarterly.keyConcerns.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `keyConcerns[${index}]`,
      concern
    );
  }
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "burnoutAssessment",
    input.quarterly.burnoutAssessment
  );
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "growthAssessment",
    input.quarterly.growthAssessment
  );
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "retentionAssessment",
    input.quarterly.retentionAssessment
  );
  for (const [index, action] of input.quarterly.recommendedActions.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `recommendedActions[${index}]`,
      action
    );
  }
  for (const snapshot of input.quarterly.evidenceSnapshots) {
    for (const [index, evidence] of snapshot.evidence.entries()) {
      pushEntry(
        "quarterly_synthesis",
        input.quarter,
        `evidenceSnapshots.${snapshot.signalId}.evidence[${index}]`,
        evidence.summary
      );
    }
  }

  for (const monthly of input.monthlyHistory) {
    pushEntry(
      "monthly_synthesis",
      monthly.month,
      "overallSummary",
      monthly.synthesis.overallSummary
    );
    for (const [index, risk] of monthly.synthesis.identifiedRisks.entries()) {
      pushEntry(
        "monthly_synthesis",
        monthly.month,
        `identifiedRisks[${index}]`,
        risk
      );
    }
    for (const [index, opportunity] of monthly.synthesis.identifiedOpportunities.entries()) {
      pushEntry(
        "monthly_synthesis",
        monthly.month,
        `identifiedOpportunities[${index}]`,
        opportunity
      );
    }
  }

  return entries;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function toUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | null | undefined): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | null {
  if (!usage) return null;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

async function markRunFailed(input: {
  runId: number;
  failedStage: FailedStage;
  message: string;
  stageUsage: StageUsage;
}): Promise<void> {
  await db
    .update(analysisRun)
    .set({
      status: "failed",
      failedStage: input.failedStage,
      failureReason: input.message,
      stageUsage: input.stageUsage,
      completedAt: new Date(),
    })
    .where(eq(analysisRun.id, input.runId));
}

async function updateRunUsage(runId: number, stageUsage: StageUsage): Promise<void> {
  await db
    .update(analysisRun)
    .set({
      stageUsage,
    })
    .where(eq(analysisRun.id, runId));
}

export async function generateManagerAnalysisOrchestration(
  request: GenerateManagerAnalysisRequest
): Promise<GenerateManagerAnalysisResult> {
  const employeeEmail = request.employeeEmail.trim().toLowerCase();
  const quarter = request.quarter.trim();

  if (!employeeEmail) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        status: "failed",
        runId: null,
        failedStage: "input_validation",
        errorCode: "invalid_employee_email",
        message: "employeeEmail is required.",
      },
    };
  }

  if (!QUARTER_PATTERN.test(quarter)) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        status: "failed",
        runId: null,
        failedStage: "input_validation",
        errorCode: "invalid_quarter",
        message: "quarter must match YYYY-Q1 to YYYY-Q4.",
      },
    };
  }

  const monthValidation = normalizeAndValidateMonthKeys(quarter, request.monthKeys);
  if (!monthValidation.ok) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        status: "failed",
        runId: null,
        failedStage: "input_validation",
        errorCode: "invalid_month_keys",
        message: monthValidation.message,
      },
    };
  }
  const monthKeys = monthValidation.months;

  const [existingRun] = await db
    .select({ id: analysisRun.id })
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.employeeEmail, employeeEmail),
        eq(analysisRun.quarter, quarter),
        eq(analysisRun.status, "running")
      )
    )
    .limit(1);

  if (existingRun) {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        status: "failed",
        runId: existingRun.id,
        failedStage: "evidence_load",
        errorCode: "run_already_in_progress",
        message: "A manager analysis run is already in progress for this employee and quarter.",
      },
    };
  }

  const [employeeRow] = await db
    .select({
      email: employees.email,
      role: employees.role,
    })
    .from(employees)
    .where(eq(employees.email, employeeEmail))
    .limit(1);

  if (!employeeRow) {
    return {
      ok: false,
      httpStatus: 404,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "employee_not_found",
        message: "Employee not found.",
      },
    };
  }

  const [contextRow] = await db
    .select({
      managerEmail: employeeAnalysisContext.managerEmail,
      bonusEligible: employeeAnalysisContext.bonusEligible,
      promotionEligible: employeeAnalysisContext.promotionEligible,
    })
    .from(employeeAnalysisContext)
    .where(eq(employeeAnalysisContext.employeeEmail, employeeEmail))
    .limit(1);

  if (!contextRow) {
    return {
      ok: false,
      httpStatus: 422,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "missing_analysis_context",
        message: "Missing employee_analysis_context row for this employee.",
      },
    };
  }

  const quarterlyRows = await db
    .select()
    .from(employeeQuarterlyInsights)
    .where(
      and(
        eq(employeeQuarterlyInsights.employeeEmail, employeeEmail),
        eq(employeeQuarterlyInsights.quarter, quarter)
      )
    )
    .orderBy(desc(employeeQuarterlyInsights.createdAt))
    .limit(1);

  if (quarterlyRows.length === 0) {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "missing_quarterly_evidence",
        message: "Required quarterly synthesis evidence was not found.",
      },
    };
  }

  const monthlyRows = await db
    .select()
    .from(employeeMonthlyInsights)
    .where(
      and(
        eq(employeeMonthlyInsights.employeeEmail, employeeEmail),
        inArray(employeeMonthlyInsights.month, monthKeys)
      )
    )
    .orderBy(desc(employeeMonthlyInsights.createdAt));

  const latestMonthlyByMonth = new Map<string, (typeof monthlyRows)[number]>();
  for (const row of monthlyRows) {
    if (!latestMonthlyByMonth.has(row.month)) {
      latestMonthlyByMonth.set(row.month, row);
    }
  }

  const missingMonths = monthKeys.filter((month) => !latestMonthlyByMonth.has(month));
  if (missingMonths.length > 0) {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "missing_monthly_evidence",
        message: `Required monthly synthesis evidence missing for: ${missingMonths.join(", ")}.`,
      },
    };
  }

  const quarterlyRow = quarterlyRows[0];
  const quarterlyConfidence = parseConfidenceLevel(quarterlyRow.confidenceLevel);
  const quarterlySynthesis: QuarterlySynthesisOutput = {
    trajectorySummary: quarterlyRow.trajectorySummary,
    keyStrengths: asStringArray(quarterlyRow.keyStrengths),
    keyConcerns: asStringArray(quarterlyRow.keyConcerns),
    burnoutAssessment: quarterlyRow.burnoutAssessment,
    growthAssessment: quarterlyRow.growthAssessment,
    retentionAssessment: quarterlyRow.retentionAssessment,
    recommendedActions: asStringArray(quarterlyRow.recommendedActions),
    evidenceSnapshots: asEvidenceSnapshots(quarterlyRow.evidenceSnapshots),
    confidence: quarterlyConfidence,
    model: quarterlyRow.generatedByModel,
    modelVersion: quarterlyRow.modelVersion,
  };
  const resolvedDataSufficiency = parseDataSufficiency(
    quarterlyRow.dataSufficiency,
    quarterlyConfidence
  );

  const monthlyHistory = monthKeys.map((month) => {
    const row = latestMonthlyByMonth.get(month);
    if (!row) {
      throw new Error(`Missing normalized monthly row for ${month}.`);
    }
    const confidence = parseConfidenceLevel(row.confidenceLevel);
    const synthesis: MonthlySynthesisOutput = {
      overallSummary: row.overallSummary,
      identifiedRisks: asStringArray(row.identifiedRisks),
      identifiedOpportunities: asStringArray(row.identifiedOpportunities),
      confidence,
      model: row.generatedByModel,
      modelVersion: row.modelVersion,
    };
    return { month, synthesis };
  });

  const evidenceCatalog = buildEvidenceCatalog({
    quarter,
    quarterly: quarterlySynthesis,
    monthlyHistory,
  });
  if (evidenceCatalog.length === 0) {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "empty_evidence_catalog",
        message: "Evidence catalog is empty; cannot run manager analysis.",
      },
    };
  }

  const coreInput: ManagerAnalysisCoreInput = {
    employeeId: employeeEmail,
    managerId: contextRow.managerEmail,
    role: employeeRow.role,
    quarterly: quarterlySynthesis,
    monthlyHistory: monthlyHistory.map((item) => item.synthesis),
    dataSufficiency: resolvedDataSufficiency,
    eligibility: {
      bonus: contextRow.bonusEligible,
      promotion: contextRow.promotionEligible,
    },
    evidenceCatalog,
  };

  const stageUsage: StageUsage = {
    debate: null,
    arbiter: null,
    guidance: null,
  };

  let runId: number;
  try {
    const inserted = await db
      .insert(analysisRun)
      .values({
        employeeEmail,
        managerEmail: contextRow.managerEmail,
        quarter,
        status: "running",
        requestPayload: {
          employeeEmail,
          quarter,
          monthKeys,
        },
        evidenceCatalog,
        dataSufficiency: resolvedDataSufficiency,
        stageUsage,
      })
      .returning({ id: analysisRun.id });
    runId = inserted[0].id;
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    return {
      ok: false,
      httpStatus: 409,
      body: {
        status: "failed",
        runId: null,
        failedStage: "evidence_load",
        errorCode: "run_insert_conflict",
        message,
      },
    };
  }
  let debateStage!: Awaited<ReturnType<typeof generateCombinedDebate>>;
  try {
    debateStage = await generateCombinedDebate(coreInput);
    stageUsage.debate = toUsage(debateStage.usage);
    await updateRunUsage(runId, stageUsage);
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "debate",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "debate",
        errorCode: "debate_generation_failed",
        message,
      },
    };
  }
  try {
    await db.insert(analysisDebateResponse).values([
      {
        runId,
        agentRole: "advocate",
        payload: debateStage.output.advocateAssessment,
        confidenceLevel: debateStage.output.advocateAssessment.confidence,
        generatedByModel: debateStage.model,
        modelVersion: debateStage.modelVersion,
      },
      {
        runId,
        agentRole: "examiner",
        payload: debateStage.output.examinerAssessment,
        confidenceLevel: debateStage.output.examinerAssessment.confidence,
        generatedByModel: debateStage.model,
        modelVersion: debateStage.modelVersion,
      },
    ]);
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "persistence",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "persistence",
        errorCode: "debate_persistence_failed",
        message,
      },
    };
  }
  let arbiterStage!: Awaited<ReturnType<typeof generateArbiterDecision>>;
  try {
    arbiterStage = await generateArbiterDecision({
      core: coreInput,
      debate: debateStage.output,
    });
    stageUsage.arbiter = toUsage(arbiterStage.usage);
    await updateRunUsage(runId, stageUsage);
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "arbiter",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "arbiter",
        errorCode: "arbiter_generation_failed",
        message,
      },
    };
  }

  try {
    await db.insert(analysisArbiterDecision).values({
      runId,
      payload: arbiterStage.output,
      confidenceLevel: arbiterStage.output.confidence,
      generatedByModel: arbiterStage.model,
      modelVersion: arbiterStage.modelVersion,
    });
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "persistence",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "persistence",
        errorCode: "arbiter_persistence_failed",
        message,
      },
    };
  }

  let guidanceStage!: Awaited<ReturnType<typeof generateCombinedGuidance>>;
  try {
    guidanceStage = await generateCombinedGuidance({
      core: coreInput,
      debate: debateStage.output,
      arbiter: arbiterStage.output,
    });
    stageUsage.guidance = toUsage(guidanceStage.usage);
    await updateRunUsage(runId, stageUsage);
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "guidance",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "guidance",
        errorCode: "guidance_generation_failed",
        message,
      },
    };
  }

  try {
    await db.insert(employeePrompt).values(
      guidanceStage.output.employeePings.map((ping) => ({
        runId,
        employeeEmail,
        quarter,
        theme: ping.theme,
        message: ping.message,
        evidenceRefs: ping.evidenceRefs,
        confidenceLevel: ping.confidence,
      }))
    );

    await db.insert(managerFeedback).values({
      runId,
      managerEmail: contextRow.managerEmail,
      focusAreas: guidanceStage.output.managerCoaching.focusAreas,
      suggestedQuestions: guidanceStage.output.managerCoaching.suggestedQuestions,
      doNotAssume: guidanceStage.output.managerCoaching.doNotAssume,
      evidenceRefs: guidanceStage.output.managerCoaching.evidenceRefs,
      confidenceLevel: guidanceStage.output.managerCoaching.confidence,
    });

    await db
      .update(analysisRun)
      .set({
        status: "completed",
        completedAt: new Date(),
        stageUsage,
      })
      .where(eq(analysisRun.id, runId));
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    await markRunFailed({
      runId,
      failedStage: "persistence",
      message,
      stageUsage,
    });
    return {
      ok: false,
      httpStatus: 500,
      body: {
        status: "failed",
        runId,
        failedStage: "persistence",
        errorCode: "guidance_persistence_failed",
        message,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: {
      status: "success",
      runId,
      employeeEmail,
      quarter,
      outputs: {
        debate: debateStage.output,
        arbiter: arbiterStage.output,
        guidance: guidanceStage.output,
      },
    },
  };
}
