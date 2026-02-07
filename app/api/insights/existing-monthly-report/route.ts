import "server-only";

import { NextResponse } from "next/server";

import { getExistingMonthlyReportByEmployeeEmail } from "@/lib/services/engineerMonthlyReportLookup";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const employeeEmail = (url.searchParams.get("employeeEmail") ?? "")
    .trim()
    .toLowerCase();

  if (!employeeEmail) {
    return NextResponse.json(
      { error: "Missing `employeeEmail` query parameter." },
      { status: 400 }
    );
  }

  try {
    const status = await getExistingMonthlyReportByEmployeeEmail(employeeEmail);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[existing-monthly-report] failed", error);
    return NextResponse.json(
      { error: "Failed to load monthly report status." },
      { status: 500 }
    );
  }
}
