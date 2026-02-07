import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { sendAgentSlackUpdates } from "@/lib/services/agentSlackUpdates";
import { SlackApiError } from "@/lib/services/slackClient";

export const runtime = "nodejs";

const messageBlockSchema = z.record(z.string(), z.unknown());

const employeeUpdateSchema = z.object({
  employeeEmail: z.string().email(),
  message: z.string().min(1),
  blocks: z.array(messageBlockSchema).optional(),
});

const managerUpdateSchema = z.object({
  managerEmail: z.string().email(),
  message: z.string().min(1),
  blocks: z.array(messageBlockSchema).optional(),
});

const requestSchema = z.object({
  employeeUpdates: z.array(employeeUpdateSchema).default([]),
  managerUpdate: managerUpdateSchema,
  accessToken: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const result = await sendAgentSlackUpdates(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof SlackApiError) {
      return NextResponse.json(
        {
          error: error.message,
          slackMethod: error.method,
          slackError: error.slackError,
        },
        { status: 502 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Slack update failed for an unknown reason.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
