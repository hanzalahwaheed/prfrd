import "server-only";

import { NextResponse } from "next/server";

import { getLatestManagerDebateFeedByEmployeeEmail } from "@/lib/services/managerDebateFeed";

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
    const debateFeed = await getLatestManagerDebateFeedByEmployeeEmail(employeeEmail);

    if (!debateFeed) {
      return NextResponse.json({
        status: "empty",
        run: null,
        messages: [],
      });
    }

    return NextResponse.json({
      status: "success",
      run: debateFeed.run,
      messages: debateFeed.messages,
    });
  } catch (error) {
    console.error("[manager-analysis-debate] failed to load debate feed", error);
    return NextResponse.json(
      { error: "Failed to load analysis debate response." },
      { status: 500 }
    );
  }
}
