import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { sendAgentSlackWebhookUpdates } from "@/lib/services/agentSlackWebhookUpdates";

export const runtime = "nodejs";

const messageBlockSchema = z.record(z.string(), z.unknown());

const updateSchema = z.object({
  recipient: z.string().min(1),
  message: z.string().min(1),
  blocks: z.array(messageBlockSchema).optional(),
  webhookUrl: z.string().url().optional(),
});

const requestSchema = z.object({
  employeeUpdates: z.array(updateSchema).default([]),
  managerUpdate: updateSchema.optional(),
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
    const result = await sendAgentSlackWebhookUpdates(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Slack webhook update failed for an unknown reason.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
