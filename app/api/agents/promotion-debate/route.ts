import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  debateSummarySchema,
  runPromotionDebate,
  type DebateAgentRole,
  type DebatePhase,
  type DebateSummary,
  type PromotionDebateEvent,
} from "@/lib/ai/agents/promotionDebate";
import { db } from "@/lib/db/config";
import {
  analysisArbiterDecision,
  analysisDebateTurn,
  analysisRun,
} from "@/lib/db/schema";
import { loadPromotionDebateContext } from "@/lib/services/promotionDebateContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z
  .object({
    employeeEmail: z.string().trim().min(3).max(100),
    quarter: z
      .string()
      .regex(/^\d{4}-Q[1-4]$/)
      .optional(),
  })
  .strict();

function asSummary(value: unknown): DebateSummary | null {
  if (!value || typeof value !== "object") return null;
  const record: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete record.kind;
  const parsed = debateSummarySchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

function asAgentRole(value: string): DebateAgentRole {
  return value === "examiner" ? "examiner" : "advocate";
}

function asPhase(value: string): DebatePhase {
  return value === "rebuttal" ? "rebuttal" : "opening";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const employeeEmail = (url.searchParams.get("employeeEmail") ?? "")
    .trim()
    .toLowerCase();

  if (!employeeEmail) {
    return Response.json(
      { error: "Missing `employeeEmail` query parameter." },
      { status: 400 }
    );
  }

  try {
    const [run] = await db
      .select()
      .from(analysisRun)
      .where(
        and(
          eq(analysisRun.employeeEmail, employeeEmail),
          sql`${analysisRun.requestPayload}->>'kind' = 'promotion_debate'`
        )
      )
      .orderBy(desc(analysisRun.createdAt))
      .limit(1);

    if (!run) {
      return Response.json({
        status: "empty",
        run: null,
        turns: [],
        summary: null,
      });
    }

    const [turns, decisions] = await Promise.all([
      db
        .select()
        .from(analysisDebateTurn)
        .where(eq(analysisDebateTurn.runId, run.id))
        .orderBy(
          asc(analysisDebateTurn.round),
          asc(analysisDebateTurn.turnIndex)
        ),
      db
        .select()
        .from(analysisArbiterDecision)
        .where(eq(analysisArbiterDecision.runId, run.id))
        .limit(1),
    ]);

    return Response.json({
      status: "success",
      run: {
        id: run.id,
        quarter: run.quarter,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      turns: turns.map((turn) => ({
        round: turn.round,
        turnIndex: turn.turnIndex,
        agentRole: asAgentRole(turn.agentRole),
        phase: asPhase(turn.phase),
        content: turn.content,
        evidenceRefs: turn.evidenceRefs,
        toolCalls: turn.toolCalls,
        model: turn.generatedByModel,
      })),
      summary: asSummary(decisions[0]?.payload ?? null),
    });
  } catch (error) {
    console.error("[promotion-debate] failed to load persisted run", error);
    return Response.json(
      { error: "Could not load the latest promotion debate." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: z.infer<typeof requestSchema>;

  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return Response.json(
      { error: "Expected `{ employeeEmail, quarter? }`." },
      { status: 400 }
    );
  }

  const employeeEmail = body.employeeEmail.toLowerCase();
  let contextResult: Awaited<ReturnType<typeof loadPromotionDebateContext>>;

  try {
    contextResult = await loadPromotionDebateContext({
      employeeEmail,
      quarter: body.quarter,
    });
  } catch (error) {
    console.error("[promotion-debate] failed to load context", error);
    return Response.json(
      { error: "Could not load the evidence needed for this debate." },
      { status: 500 }
    );
  }

  if (!contextResult.ok) {
    return Response.json(
      { error: contextResult.message, code: contextResult.code },
      { status: contextResult.status }
    );
  }

  const { context } = contextResult;

  let run: { id: number };

  try {
    [run] = await db
      .insert(analysisRun)
      .values({
        employeeEmail,
        managerEmail: context.managerEmail,
        quarter: context.quarter,
        status: "running",
        requestPayload: {
          kind: "promotion_debate",
          employeeEmail,
          quarter: context.quarter,
        },
        evidenceCatalog: context.evidenceCatalog,
        dataSufficiency: context.dataSufficiency,
      })
      .returning({ id: analysisRun.id });
  } catch (error) {
    console.error("[promotion-debate] failed to create run", error);
    return Response.json(
      { error: "Could not start the promotion debate." },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const onAbort = () => abortController.abort();
  req.signal.addEventListener("abort", onAbort);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stageUsage: Record<string, unknown> = {};

      const send = (event: PromotionDebateEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client disconnected; the abort signal handles cleanup.
        }
      };

      try {
        const result = await runPromotionDebate({
          runId: run.id,
          employeeEmail,
          employeeName: context.employee.name,
          role: context.employee.role,
          quarter: context.quarter,
          promotionEligible: context.promotionEligible,
          dataSufficiency: context.dataSufficiency,
          evidenceCatalog: context.evidenceCatalog,
          signal: abortController.signal,
          onEvent: send,
          onTurnComplete: async (turn) => {
            await db
              .insert(analysisDebateTurn)
              .values({
                runId: run.id,
                round: turn.round,
                turnIndex: turn.turnIndex,
                agentRole: turn.agentRole,
                phase: turn.phase,
                content: turn.content,
                evidenceRefs: turn.evidenceRefs,
                toolCalls: turn.toolCalls,
                generatedByModel: turn.model,
                modelVersion: turn.modelVersion,
                inputTokens: turn.usage?.inputTokens,
                outputTokens: turn.usage?.outputTokens,
              })
              .onConflictDoNothing();

            stageUsage[`round${turn.round}_${turn.agentRole}`] = turn.usage ?? null;
          },
        });

        await db
          .insert(analysisArbiterDecision)
          .values({
            runId: run.id,
            payload: {
              kind: "promotion_debate_summary",
              ...result.summary,
            },
            confidenceLevel: result.summary.confidence,
            generatedByModel: result.model,
            modelVersion: result.modelVersion,
          })
          .onConflictDoNothing();

        await db
          .update(analysisRun)
          .set({
            status: "completed",
            completedAt: new Date(),
            stageUsage,
          })
          .where(eq(analysisRun.id, run.id));

        send({ type: "run_completed", runId: run.id });
      } catch (error) {
        const aborted = abortController.signal.aborted || req.signal.aborted;
        const message =
          error instanceof Error ? error.message : "Unknown debate error.";

        await db
          .update(analysisRun)
          .set({
            status: aborted ? "canceled" : "failed",
            failedStage: aborted ? null : "promotion_debate",
            failureReason: aborted ? "Client aborted the run." : message,
            completedAt: new Date(),
            stageUsage,
          })
          .where(eq(analysisRun.id, run.id));

        if (!aborted) {
          send({ type: "error", message });
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
