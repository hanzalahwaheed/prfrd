import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/config";
import { analysisDebateResponse, analysisRun, employees } from "@/lib/db/schema";

type DebateAgentRole = "advocate" | "examiner";

type DebateArgument = {
  claim: string;
  evidenceRefs: string[];
};

export type DebateMessage = {
  employeeId: number;
  agentRole: DebateAgentRole;
  stance: string;
  confidenceLevel: string;
  arguments: DebateArgument[];
  risks: string[];
  recommendation: {
    bonus: string;
    promotion: string;
  } | null;
  createdAt: string;
};

export type ManagerDebateFeed = {
  run: {
    id: number;
    employeeId: number;
    quarter: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  messages: DebateMessage[];
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

function asArguments(value: unknown): DebateArgument[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const claim = asString(record.claim).trim();

      if (!claim) {
        return null;
      }

      return {
        claim,
        evidenceRefs: asStringArray(record.evidenceRefs),
      } satisfies DebateArgument;
    })
    .filter((entry): entry is DebateArgument => Boolean(entry));
}

function asRecommendation(value: unknown): {
  bonus: string;
  promotion: string;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const bonus = asString(record.bonus).trim();
  const promotion = asString(record.promotion).trim();

  if (!bonus && !promotion) {
    return null;
  }

  return {
    bonus,
    promotion,
  };
}

function parseAgentRole(value: unknown): DebateAgentRole | null {
  if (value === "advocate" || value === "examiner") {
    return value;
  }

  return null;
}

function normalizePayload(payload: unknown): {
  stance: string;
  arguments: DebateArgument[];
  risks: string[];
  recommendation: { bonus: string; promotion: string } | null;
} {
  if (!payload || typeof payload !== "object") {
    return {
      stance: "",
      arguments: [],
      risks: [],
      recommendation: null,
    };
  }

  const record = payload as Record<string, unknown>;

  return {
    stance: asString(record.stance).trim(),
    arguments: asArguments(record.arguments),
    risks: asStringArray(record.risks),
    recommendation: asRecommendation(record.recommendation),
  };
}

export async function getLatestManagerDebateFeedByEmployeeEmail(
  rawEmployeeEmail: string
): Promise<ManagerDebateFeed | null> {
  const employeeEmail = rawEmployeeEmail.trim().toLowerCase();
  if (!employeeEmail) {
    return null;
  }

  const runRows = await db
    .select({
      id: analysisRun.id,
      employeeId: employees.id,
      quarter: analysisRun.quarter,
      status: analysisRun.status,
      createdAt: analysisRun.createdAt,
      completedAt: analysisRun.completedAt,
    })
    .from(analysisRun)
    .innerJoin(employees, eq(analysisRun.employeeEmail, employees.email))
    .where(eq(analysisRun.employeeEmail, employeeEmail))
    .orderBy(desc(analysisRun.createdAt))
    .limit(20);

  if (runRows.length === 0) {
    return null;
  }

  const runIds = runRows.map((row) => row.id);

  const debateRows = await db
    .select({
      runId: analysisDebateResponse.runId,
      agentRole: analysisDebateResponse.agentRole,
      payload: analysisDebateResponse.payload,
      confidenceLevel: analysisDebateResponse.confidenceLevel,
      createdAt: analysisDebateResponse.createdAt,
    })
    .from(analysisDebateResponse)
    .where(inArray(analysisDebateResponse.runId, runIds))
    .orderBy(desc(analysisDebateResponse.createdAt));

  if (debateRows.length === 0) {
    return null;
  }

  const rowsByRunId = new Map<number, typeof debateRows>();
  for (const row of debateRows) {
    const group = rowsByRunId.get(row.runId) ?? [];
    group.push(row);
    rowsByRunId.set(row.runId, group);
  }

  for (const runRow of runRows) {
    const runDebateRows = rowsByRunId.get(runRow.id);
    if (!runDebateRows || runDebateRows.length === 0) {
      continue;
    }
    const runEmployeeId = runRow.employeeId;

    const messages = runDebateRows
      .map((row) => {
        const agentRole = parseAgentRole(row.agentRole);
        if (!agentRole) {
          return null;
        }

        const payload = normalizePayload(row.payload);

        return {
          employeeId: runEmployeeId,
          agentRole,
          stance: payload.stance,
          confidenceLevel: row.confidenceLevel,
          arguments: payload.arguments,
          risks: payload.risks,
          recommendation: payload.recommendation,
          createdAt: row.createdAt.toISOString(),
        } satisfies DebateMessage;
      })
      .filter((entry): entry is DebateMessage => Boolean(entry))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (messages.length === 0) {
      continue;
    }

    return {
      run: {
        id: runRow.id,
        employeeId: runEmployeeId,
        quarter: runRow.quarter,
        status: runRow.status,
        createdAt: runRow.createdAt.toISOString(),
        completedAt: runRow.completedAt ? runRow.completedAt.toISOString() : null,
      },
      messages,
    };
  }

  return null;
}
