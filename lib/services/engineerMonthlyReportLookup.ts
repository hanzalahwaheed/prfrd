import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/config";
import { employeeMonthlyInsights } from "@/lib/db/schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

export type ExistingMonthlyReportStatus =
  | {
      status: "ready";
      month: string;
      generatedAt: string;
      stale: false;
      report: {
        executionInsight: string;
        engagementInsight: string;
        collaborationInsight: string;
        growthInsight: string;
        overallSummary: string;
        identifiedRisks: string[];
        identifiedOpportunities: string[];
      };
    }
  | {
      status: "missing";
      stale: true;
      message: string;
      lastGeneratedAt: null;
      month: null;
    }
  | {
      status: "stale";
      stale: true;
      message: string;
      lastGeneratedAt: string;
      month: string;
    };

export async function getExistingMonthlyReportByEmployeeEmail(
  rawEmployeeEmail: string
): Promise<ExistingMonthlyReportStatus> {
  const employeeEmail = rawEmployeeEmail.trim().toLowerCase();

  if (!employeeEmail) {
    return {
      status: "missing",
      stale: true,
      message: "No monthly report generated yet in the last week.",
      lastGeneratedAt: null,
      month: null,
    };
  }

  const [latest] = await db
    .select({
      month: employeeMonthlyInsights.month,
      createdAt: employeeMonthlyInsights.createdAt,
      executionInsight: employeeMonthlyInsights.executionInsight,
      engagementInsight: employeeMonthlyInsights.engagementInsight,
      collaborationInsight: employeeMonthlyInsights.collaborationInsight,
      growthInsight: employeeMonthlyInsights.growthInsight,
      overallSummary: employeeMonthlyInsights.overallSummary,
      identifiedRisks: employeeMonthlyInsights.identifiedRisks,
      identifiedOpportunities: employeeMonthlyInsights.identifiedOpportunities,
    })
    .from(employeeMonthlyInsights)
    .where(eq(employeeMonthlyInsights.employeeEmail, employeeEmail))
    .orderBy(desc(employeeMonthlyInsights.createdAt))
    .limit(1);

  if (!latest) {
    return {
      status: "missing",
      stale: true,
      message: "No monthly report generated yet in the last week.",
      lastGeneratedAt: null,
      month: null,
    };
  }

  const generatedAtMs = latest.createdAt.getTime();
  if (Date.now() - generatedAtMs > WEEK_MS) {
    return {
      status: "stale",
      stale: true,
      message: "No monthly report generated yet in the last week.",
      lastGeneratedAt: latest.createdAt.toISOString(),
      month: latest.month,
    };
  }

  return {
    status: "ready",
    month: latest.month,
    generatedAt: latest.createdAt.toISOString(),
    stale: false,
    report: {
      executionInsight: latest.executionInsight,
      engagementInsight: latest.engagementInsight,
      collaborationInsight: latest.collaborationInsight,
      growthInsight: latest.growthInsight,
      overallSummary: latest.overallSummary,
      identifiedRisks: asStringArray(latest.identifiedRisks),
      identifiedOpportunities: asStringArray(latest.identifiedOpportunities),
    },
  };
}
