import "server-only";

import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db/config";
import {
  employeeMonthlyInsights,
  employeeQuarterlyInsights,
  employees,
  githubWeeklyActivity,
  slackWeeklyActivity,
} from "@/lib/db/schema";
import {
  generateMonthlyInsightsSinglePass,
  generateQuarterlyInsightsSinglePass,
  type PeriodType,
  type WeeklyGithubActivity,
  type WeeklySlackActivity,
} from "@/lib/ai/insightGenerator";

export const runtime = "nodejs";

type GenerateReportRequest = {
  employeeEmail?: string;
  startDate?: string;
  endDate?: string;
};

type PeriodBucket = {
  githubWeekly: WeeklyGithubActivity[];
  slackWeekly: WeeklySlackActivity[];
};

const LOOKBACK_WEEKS = 12;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
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

function quarterKey(dateStr: string): string {
  const [year, monthStr] = dateStr.split("-");
  const month = Number(monthStr);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

function groupByPeriod(
  githubWeekly: WeeklyGithubActivity[],
  slackWeekly: WeeklySlackActivity[],
  periodType: PeriodType
): Map<string, PeriodBucket> {
  const buckets = new Map<string, PeriodBucket>();

  const addToBucket = (
    key: string,
    type: "githubWeekly" | "slackWeekly",
    record: WeeklyGithubActivity | WeeklySlackActivity
  ) => {
    const existing = buckets.get(key) ?? {
      githubWeekly: [],
      slackWeekly: [],
    };
    if (type === "githubWeekly") {
      existing.githubWeekly.push(record as WeeklyGithubActivity);
    } else {
      existing.slackWeekly.push(record as WeeklySlackActivity);
    }
    buckets.set(key, existing);
  };

  githubWeekly.forEach((week) => {
    const weekStart = toISODate(week.weekStart);
    const key =
      periodType === "month" ? monthKey(weekStart) : quarterKey(weekStart);
    addToBucket(key, "githubWeekly", week);
  });

  slackWeekly.forEach((week) => {
    const weekStart = toISODate(week.weekStart);
    const key =
      periodType === "month" ? monthKey(weekStart) : quarterKey(weekStart);
    addToBucket(key, "slackWeekly", week);
  });

  return buckets;
}

export async function POST(req: Request) {
  let body: GenerateReportRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.employeeEmail || typeof body.employeeEmail !== "string") {
    return NextResponse.json(
      { error: "Missing `employeeEmail` string." },
      { status: 400 }
    );
  }

  const employeeEmail = body.employeeEmail.trim().toLowerCase();
  const hasStartDate = typeof body.startDate === "string";
  const hasEndDate = typeof body.endDate === "string";

  if (hasStartDate !== hasEndDate) {
    return NextResponse.json(
      {
        error:
          "Both `startDate` and `endDate` are required when using a backfill window.",
      },
      { status: 400 }
    );
  }

  let startDate: string | null = null;
  let endDate: string | null = null;

  if (hasStartDate && hasEndDate) {
    startDate = body.startDate!.trim();
    endDate = body.endDate!.trim();

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        { error: "`startDate` and `endDate` must be in YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "`startDate` must be less than or equal to `endDate`." },
        { status: 400 }
      );
    }
  }

  const [employee] = await db
    .select({ email: employees.email })
    .from(employees)
    .where(eq(employees.email, employeeEmail))
    .limit(1);

  if (!employee) {
    return NextResponse.json(
      { error: "Employee not found." },
      { status: 404 }
    );
  }

  const effectiveStartDate =
    startDate ??
    (() => {
      const lookbackStart = new Date();
      lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_WEEKS * 7);
      return lookbackStart.toISOString().slice(0, 10);
    })();

  const githubWhereClause = endDate
    ? and(
        eq(githubWeeklyActivity.employeeEmail, employeeEmail),
        gte(githubWeeklyActivity.weekStart, effectiveStartDate),
        lte(githubWeeklyActivity.weekStart, endDate)
      )
    : and(
        eq(githubWeeklyActivity.employeeEmail, employeeEmail),
        gte(githubWeeklyActivity.weekStart, effectiveStartDate)
      );

  const slackWhereClause = endDate
    ? and(
        eq(slackWeeklyActivity.employeeEmail, employeeEmail),
        gte(slackWeeklyActivity.weekStart, effectiveStartDate),
        lte(slackWeeklyActivity.weekStart, endDate)
      )
    : and(
        eq(slackWeeklyActivity.employeeEmail, employeeEmail),
        gte(slackWeeklyActivity.weekStart, effectiveStartDate)
      );

  const githubWeekly = await db
    .select()
    .from(githubWeeklyActivity)
    .where(githubWhereClause)
    .orderBy(asc(githubWeeklyActivity.weekStart));

  const slackWeekly = await db
    .select()
    .from(slackWeeklyActivity)
    .where(slackWhereClause)
    .orderBy(asc(slackWeeklyActivity.weekStart));

  const monthlyBuckets = groupByPeriod(githubWeekly, slackWeekly, "month");
  const quarterlyBuckets = groupByPeriod(githubWeekly, slackWeekly, "quarter");

  let monthlyGenerated = 0;
  let quarterlyGenerated = 0;

  const monthlyKeys = Array.from(monthlyBuckets.keys()).sort();
  for (const key of monthlyKeys) {
    const bucket = monthlyBuckets.get(key);
    if (!bucket) continue;

    // Single LLM pass for monthly signals, dimensions, and synthesis.
    const monthlyBundle = await generateMonthlyInsightsSinglePass({
      periodKey: key,
      githubWeekly: bucket.githubWeekly,
      slackWeekly: bucket.slackWeekly,
    });

    await db.insert(employeeMonthlyInsights).values({
      employeeEmail,
      month: key,
      executionInsight: monthlyBundle.dimensionInsights.Execution.insight,
      engagementInsight: monthlyBundle.dimensionInsights.Engagement.insight,
      collaborationInsight: monthlyBundle.dimensionInsights.Collaboration.insight,
      growthInsight: monthlyBundle.dimensionInsights.Growth.insight,
      overallSummary: monthlyBundle.synthesis.overallSummary,
      identifiedRisks: monthlyBundle.synthesis.identifiedRisks,
      identifiedOpportunities: monthlyBundle.synthesis.identifiedOpportunities,
      supportingSignals: monthlyBundle.allSignals,
      dataSufficiency: monthlyBundle.dataSufficiency,
      confidenceLevel: monthlyBundle.synthesis.confidence,
      generatedByModel: monthlyBundle.synthesis.model,
      modelVersion: monthlyBundle.synthesis.modelVersion,
    });
    monthlyGenerated += 1;
  }

  const quarterlyKeys = Array.from(quarterlyBuckets.keys()).sort();
  for (const key of quarterlyKeys) {
    const bucket = quarterlyBuckets.get(key);
    if (!bucket) continue;

    // Single LLM pass for quarterly signals, dimensions, and synthesis.
    const quarterlyBundle = await generateQuarterlyInsightsSinglePass({
      periodKey: key,
      githubWeekly: bucket.githubWeekly,
      slackWeekly: bucket.slackWeekly,
    });

    await db.insert(employeeQuarterlyInsights).values({
      employeeEmail,
      quarter: key,
      trajectorySummary: quarterlyBundle.synthesis.trajectorySummary,
      keyStrengths: quarterlyBundle.synthesis.keyStrengths,
      keyConcerns: quarterlyBundle.synthesis.keyConcerns,
      burnoutAssessment: quarterlyBundle.synthesis.burnoutAssessment,
      growthAssessment: quarterlyBundle.synthesis.growthAssessment,
      retentionAssessment: quarterlyBundle.synthesis.retentionAssessment,
      recommendedActions: quarterlyBundle.synthesis.recommendedActions,
      evidenceSnapshots: quarterlyBundle.synthesis.evidenceSnapshots,
      dataSufficiency: quarterlyBundle.dataSufficiency,
      confidenceLevel: quarterlyBundle.synthesis.confidence,
      generatedByModel: quarterlyBundle.synthesis.model,
      modelVersion: quarterlyBundle.synthesis.modelVersion,
    });

    quarterlyGenerated += 1;
  }

  return NextResponse.json({
    status: "success",
    monthlyGenerated,
    quarterlyGenerated,
  });
}
