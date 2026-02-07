import "server-only";

import { NextResponse } from "next/server";

import {
  generateManagerAnalysisOrchestration,
  type GenerateManagerAnalysisRequest,
} from "@/lib/services/managerAnalysisOrchestrator";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Partial<GenerateManagerAnalysisRequest>;

  try {
    body = (await req.json()) as Partial<GenerateManagerAnalysisRequest>;
  } catch {
    return NextResponse.json(
      {
        status: "failed",
        runId: null,
        failedStage: "input_validation",
        errorCode: "invalid_json",
        message: "Invalid JSON body.",
      },
      { status: 400 }
    );
  }

  const employeeEmail =
    typeof body.employeeEmail === "string" ? body.employeeEmail : "";
  const quarter = typeof body.quarter === "string" ? body.quarter : "";
  const monthKeys = Array.isArray(body.monthKeys)
    ? body.monthKeys.map((item) => String(item))
    : [];

  const result = await generateManagerAnalysisOrchestration({
    employeeEmail,
    quarter,
    monthKeys: monthKeys as [string, string, string],
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
