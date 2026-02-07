import "server-only";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RecheckStatsRequest = {
  employeeEmail?: string;
  employeeName?: string;
  scope?: "weekly" | "monthly";
  periodKey?: string;
  detailLabel?: string;
  detailValue?: string;
  employeeNote?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isScope(value: unknown): value is "weekly" | "monthly" {
  return value === "weekly" || value === "monthly";
}

export async function POST(req: Request) {
  let body: RecheckStatsRequest;

  try {
    body = (await req.json()) as RecheckStatsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.employeeEmail)) {
    return NextResponse.json(
      { error: "Missing `employeeEmail` string." },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(body.employeeName)) {
    return NextResponse.json(
      { error: "Missing `employeeName` string." },
      { status: 400 }
    );
  }

  if (!isScope(body.scope)) {
    return NextResponse.json(
      { error: "`scope` must be either `weekly` or `monthly`." },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(body.periodKey)) {
    return NextResponse.json(
      { error: "Missing `periodKey` string." },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(body.detailLabel)) {
    return NextResponse.json(
      { error: "Missing `detailLabel` string." },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(body.detailValue)) {
    return NextResponse.json(
      { error: "Missing `detailValue` string." },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(body.employeeNote)) {
    return NextResponse.json(
      { error: "Missing `employeeNote` string." },
      { status: 400 }
    );
  }

  const requestId = crypto.randomUUID();

  console.info("[assistant-recheck-stats]", {
    requestId,
    employeeEmail: body.employeeEmail,
    employeeName: body.employeeName,
    scope: body.scope,
    periodKey: body.periodKey,
    detailLabel: body.detailLabel,
    detailValue: body.detailValue,
    employeeNote: body.employeeNote,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    status: "queued",
    requestId,
    message: "Dummy assistant recheck request accepted.",
  });
}
