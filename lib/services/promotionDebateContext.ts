import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type {
  ConfidenceLevel,
  DataSufficiency,
  MonthlySynthesisOutput,
  QuarterlySynthesisOutput,
  SignalEvidence,
} from "@/lib/ai/insightGenerator";
import { db } from "@/lib/db/config";
import {
  employeeAnalysisContext,
  employeeMonthlyInsights,
  employeeQuarterlyInsights,
  employees,
} from "@/lib/db/schema";
import { buildEvidenceCatalog } from "@/lib/services/evidenceCatalog";
import type { EvidenceCatalogEntry } from "@/lib/ai/managerAnalysis";

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export type PromotionDebateContext = {
  employee: {
    email: string;
    name: string;
    role: string;
  };
  managerEmail: string;
  quarter: string;
  promotionEligible: boolean;
  dataSufficiency: DataSufficiency;
  quarterly: QuarterlySynthesisOutput;
  monthlyHistory: Array<{ month: string; synthesis: MonthlySynthesisOutput }>;
  evidenceCatalog: EvidenceCatalogEntry[];
};

export type PromotionDebateContextResult =
  | { ok: true; context: PromotionDebateContext }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry : String(entry)))
    .filter((entry) => entry.trim().length > 0);
}

function parseConfidenceLevel(value: unknown): ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "low";
}

function parseDataSufficiency(value: unknown): DataSufficiency {
  if (!value || typeof value !== "object") {
    return {
      level: "insufficient",
      notes: "No data-sufficiency metadata was stored for this period.",
      weeks: 0,
      months: 0,
      sources: { github: false, slack: false },
    };
  }

  const record = value as Record<string, unknown>;
  const level =
    record.level === "sufficient" ||
    record.level === "partial" ||
    record.level === "insufficient"
      ? record.level
      : "insufficient";
  const sources =
    record.sources && typeof record.sources === "object"
      ? (record.sources as Record<string, unknown>)
      : {};

  return {
    level,
    notes: typeof record.notes === "string" ? record.notes : "",
    weeks: Number(record.weeks ?? 0),
    months: Number(record.months ?? 0),
    sources: {
      github: Boolean(sources.github),
      slack: Boolean(sources.slack),
    },
  };
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

export async function loadPromotionDebateContext(input: {
  employeeEmail: string;
  quarter?: string;
}): Promise<PromotionDebateContextResult> {
  const [employee] = await db
    .select({
      email: employees.email,
      name: employees.name,
      role: employees.role,
    })
    .from(employees)
    .where(eq(employees.email, input.employeeEmail))
    .limit(1);

  if (!employee) {
    return {
      ok: false,
      status: 404,
      code: "employee_not_found",
      message: "Employee not found.",
    };
  }

  const [contextRow] = await db
    .select({
      managerEmail: employeeAnalysisContext.managerEmail,
      promotionEligible: employeeAnalysisContext.promotionEligible,
    })
    .from(employeeAnalysisContext)
    .where(eq(employeeAnalysisContext.employeeEmail, input.employeeEmail))
    .limit(1);

  const quarterlyWhere = input.quarter
    ? and(
        eq(employeeQuarterlyInsights.employeeEmail, input.employeeEmail),
        eq(employeeQuarterlyInsights.quarter, input.quarter)
      )
    : eq(employeeQuarterlyInsights.employeeEmail, input.employeeEmail);

  const [quarterlyRow] = await db
    .select()
    .from(employeeQuarterlyInsights)
    .where(quarterlyWhere)
    .orderBy(desc(employeeQuarterlyInsights.quarter))
    .limit(1);

  if (!quarterlyRow) {
    return {
      ok: false,
      status: 409,
      code: "missing_quarterly_insights",
      message:
        "No quarterly insights exist for this employee. Generate monthly and quarterly insights first.",
    };
  }

  const months = expectedMonthsForQuarter(quarterlyRow.quarter);
  if (!months) {
    return {
      ok: false,
      status: 409,
      code: "invalid_quarter",
      message: "The stored quarter key is not in YYYY-QN format.",
    };
  }

  const monthlyRows = await db
    .select()
    .from(employeeMonthlyInsights)
    .where(
      and(
        eq(employeeMonthlyInsights.employeeEmail, input.employeeEmail),
        inArray(employeeMonthlyInsights.month, months)
      )
    )
    .orderBy(asc(employeeMonthlyInsights.month));

  if (monthlyRows.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "missing_monthly_insights",
      message:
        "No monthly insights exist for this quarter. Generate monthly insights first.",
    };
  }

  const quarterly: QuarterlySynthesisOutput = {
    trajectorySummary: quarterlyRow.trajectorySummary,
    keyStrengths: asStringArray(quarterlyRow.keyStrengths),
    keyConcerns: asStringArray(quarterlyRow.keyConcerns),
    burnoutAssessment: quarterlyRow.burnoutAssessment,
    growthAssessment: quarterlyRow.growthAssessment,
    retentionAssessment: quarterlyRow.retentionAssessment,
    recommendedActions: asStringArray(quarterlyRow.recommendedActions),
    evidenceSnapshots: asEvidenceSnapshots(quarterlyRow.evidenceSnapshots),
    confidence: parseConfidenceLevel(quarterlyRow.confidenceLevel),
    model: quarterlyRow.generatedByModel,
    modelVersion: quarterlyRow.modelVersion,
  };

  const monthlyHistory = monthlyRows.map((row) => ({
    month: row.month,
    synthesis: {
      overallSummary: row.overallSummary,
      identifiedRisks: asStringArray(row.identifiedRisks),
      identifiedOpportunities: asStringArray(row.identifiedOpportunities),
      confidence: parseConfidenceLevel(row.confidenceLevel),
      model: row.generatedByModel,
      modelVersion: row.modelVersion,
    } satisfies MonthlySynthesisOutput,
  }));

  const evidenceCatalog = buildEvidenceCatalog({
    quarter: quarterlyRow.quarter,
    quarterly,
    monthlyHistory,
  });

  if (evidenceCatalog.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "empty_evidence_catalog",
      message:
        "The evidence catalog is empty. Regenerate insights before running a debate.",
    };
  }

  return {
    ok: true,
    context: {
      employee,
      managerEmail: contextRow?.managerEmail ?? "unassigned",
      quarter: quarterlyRow.quarter,
      promotionEligible: contextRow?.promotionEligible ?? false,
      dataSufficiency: parseDataSufficiency(quarterlyRow.dataSufficiency),
      quarterly,
      monthlyHistory,
      evidenceCatalog,
    },
  };
}
