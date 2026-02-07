import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/config";
import {
  analysisArbiterDecision,
  analysisRun,
  employeeAnalysisContext,
  managerFeedback,
} from "@/lib/db/schema";

type Decision = "approve" | "defer" | "deny";

export type ManagerProfileInsights = {
  context: {
    bonusEligible: boolean;
    promotionEligible: boolean;
  } | null;
  latestRun: {
    id: number;
    quarter: string;
    status: string;
  } | null;
  bonusRecommendation: Decision | null;
  promotionRecommendation: Decision | null;
  unresolvedQuestions: string[];
  suggestedQuestions: string[];
  focusAreas: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asString(entry).trim())
    .filter((entry) => entry.length > 0);
}

function asDecision(value: unknown): Decision | null {
  if (value === "approve" || value === "defer" || value === "deny") {
    return value;
  }
  return null;
}

function parseArbiterPayload(payload: unknown): {
  bonusRecommendation: Decision | null;
  promotionRecommendation: Decision | null;
  unresolvedQuestions: string[];
} {
  if (!payload || typeof payload !== "object") {
    return {
      bonusRecommendation: null,
      promotionRecommendation: null,
      unresolvedQuestions: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const finalRecommendation =
    record.finalRecommendation && typeof record.finalRecommendation === "object"
      ? (record.finalRecommendation as Record<string, unknown>)
      : null;

  return {
    bonusRecommendation: asDecision(finalRecommendation?.bonus),
    promotionRecommendation: asDecision(finalRecommendation?.promotion),
    unresolvedQuestions: asStringArray(record.unresolvedQuestions),
  };
}

export async function getManagerProfileInsightsByEmployeeEmail(
  rawEmployeeEmail: string
): Promise<ManagerProfileInsights> {
  const employeeEmail = rawEmployeeEmail.trim().toLowerCase();
  const empty: ManagerProfileInsights = {
    context: null,
    latestRun: null,
    bonusRecommendation: null,
    promotionRecommendation: null,
    unresolvedQuestions: [],
    suggestedQuestions: [],
    focusAreas: [],
  };

  if (!employeeEmail) {
    return empty;
  }

  const [contextRow, runRows] = await Promise.all([
    db
      .select({
        bonusEligible: employeeAnalysisContext.bonusEligible,
        promotionEligible: employeeAnalysisContext.promotionEligible,
      })
      .from(employeeAnalysisContext)
      .where(eq(employeeAnalysisContext.employeeEmail, employeeEmail))
      .limit(1),
    db
      .select({
        id: analysisRun.id,
        quarter: analysisRun.quarter,
        status: analysisRun.status,
        createdAt: analysisRun.createdAt,
      })
      .from(analysisRun)
      .where(eq(analysisRun.employeeEmail, employeeEmail))
      .orderBy(desc(analysisRun.createdAt))
      .limit(20),
  ]);

  if (runRows.length === 0) {
    return {
      ...empty,
      context: contextRow[0] ?? null,
    };
  }

  const runIds = runRows.map((run) => run.id);
  const [feedbackRows, arbiterRows] = await Promise.all([
    db
      .select({
        runId: managerFeedback.runId,
        suggestedQuestions: managerFeedback.suggestedQuestions,
        focusAreas: managerFeedback.focusAreas,
      })
      .from(managerFeedback)
      .where(inArray(managerFeedback.runId, runIds)),
    db
      .select({
        runId: analysisArbiterDecision.runId,
        payload: analysisArbiterDecision.payload,
      })
      .from(analysisArbiterDecision)
      .where(inArray(analysisArbiterDecision.runId, runIds)),
  ]);

  const feedbackByRun = new Map(feedbackRows.map((row) => [row.runId, row]));
  const arbiterByRun = new Map(arbiterRows.map((row) => [row.runId, row]));
  const selectedRun =
    runRows.find((run) => feedbackByRun.has(run.id) || arbiterByRun.has(run.id)) ??
    runRows[0];

  const feedback = feedbackByRun.get(selectedRun.id);
  const arbiter = arbiterByRun.get(selectedRun.id);
  const parsedArbiter = parseArbiterPayload(arbiter?.payload);

  return {
    context: contextRow[0] ?? null,
    latestRun: {
      id: selectedRun.id,
      quarter: selectedRun.quarter,
      status: selectedRun.status,
    },
    bonusRecommendation: parsedArbiter.bonusRecommendation,
    promotionRecommendation: parsedArbiter.promotionRecommendation,
    unresolvedQuestions: parsedArbiter.unresolvedQuestions,
    suggestedQuestions: asStringArray(feedback?.suggestedQuestions),
    focusAreas: asStringArray(feedback?.focusAreas),
  };
}
