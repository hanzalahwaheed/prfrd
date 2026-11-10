"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AgentRole = "advocate" | "examiner";
type DebatePhase = "opening" | "rebuttal";

type DebateTurn = {
  round: number;
  turnIndex: number;
  agentRole: AgentRole;
  phase: DebatePhase;
  content: string;
  evidenceRefs: string[];
  toolCalls: Array<{ name: string; input: unknown }>;
};

type Readiness =
  | "strong_case"
  | "mixed"
  | "not_yet"
  | "insufficient_evidence";

type DebateSummary = {
  readiness: Readiness;
  summary: string;
  strongestFor: Array<{ claim: string; evidenceRefs: string[] }>;
  strongestAgainst: Array<{ claim: string; evidenceRefs: string[] }>;
  openQuestions: string[];
  whatWouldChange: string[];
  confidence: "low" | "medium" | "high";
};

type StreamEvent =
  | { type: "run_started"; runId: number }
  | {
      type: "turn_started";
      turn: {
        round: number;
        turnIndex: number;
        agentRole: AgentRole;
        phase: DebatePhase;
      };
    }
  | { type: "delta"; agentRole: AgentRole; round: number; text: string }
  | {
      type: "tool_call";
      agentRole: AgentRole;
      round: number;
      name: string;
      input: unknown;
    }
  | { type: "turn_completed"; turn: DebateTurn }
  | { type: "summary"; summary: DebateSummary }
  | { type: "run_completed"; runId: number }
  | { type: "error"; message: string };

type PersistedDebate = {
  status: "success" | "empty";
  run: {
    id: number;
    quarter: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  turns: DebateTurn[];
  summary: DebateSummary | null;
};

type PanelState = {
  status: "idle" | "running" | "completed" | "failed" | "canceled";
  runId: number | null;
  quarter: string | null;
  turns: DebateTurn[];
  summary: DebateSummary | null;
  error: string | null;
};

const initialState: PanelState = {
  status: "idle",
  runId: null,
  quarter: null,
  turns: [],
  summary: null,
  error: null,
};

const readinessCopy: Record<
  Readiness,
  { label: string; description: string; variant: "secondary" | "outline" | "destructive" }
> = {
  strong_case: {
    label: "Strong case",
    description:
      "The evidence supports a serious promotion case, subject to the manager's judgment.",
    variant: "secondary",
  },
  mixed: {
    label: "Mixed",
    description:
      "The evidence cuts both ways. The open questions below are the deciding factor.",
    variant: "outline",
  },
  not_yet: {
    label: "Not yet",
    description:
      "The evidence suggests the case is not ready this cycle. Focus on the gaps below.",
    variant: "destructive",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    description:
      "The record is too thin to support a case either way. Gather more signal first.",
    variant: "outline",
  },
};

function turnKey(turn: Pick<DebateTurn, "round" | "turnIndex" | "agentRole">) {
  return `${turn.round}-${turn.turnIndex}-${turn.agentRole}`;
}

function toTitleCase(text: string) {
  return text
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortTurns(turns: DebateTurn[]) {
  return [...turns].sort((a, b) =>
    a.round === b.round ? a.turnIndex - b.turnIndex : a.round - b.round
  );
}

export default function PromotionDebatePanel({
  employeeEmail,
  employeeName,
  quarter,
}: {
  employeeEmail: string;
  employeeName: string;
  quarter?: string;
}) {
  const [state, setState] = useState<PanelState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const userStartedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPersistedDebate() {
      try {
        const response = await fetch(
          `/api/agents/promotion-debate?employeeEmail=${encodeURIComponent(employeeEmail)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;

        const payload = (await response.json()) as PersistedDebate;
        if (payload.status !== "success" || !payload.run) return;
        if (userStartedRef.current) return;

        setState({
          status:
            payload.run.status === "running"
              ? "idle"
              : payload.run.status === "failed"
                ? "failed"
                : payload.run.status === "canceled"
                  ? "canceled"
                  : "completed",
          runId: payload.run.id,
          quarter: payload.run.quarter,
          turns: sortTurns(payload.turns),
          summary: payload.summary,
          error: null,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[promotion-debate] failed to load persisted run", error);
        }
      }
    }

    loadPersistedDebate();
    return () => controller.abort();
  }, [employeeEmail]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const applyEvent = useCallback((event: StreamEvent) => {
    setState((current) => {
      switch (event.type) {
        case "run_started":
          return {
            ...current,
            status: "running",
            runId: event.runId,
            turns: [],
            summary: null,
            error: null,
          };
        case "turn_started": {
          const nextTurn: DebateTurn = {
            ...event.turn,
            content: "",
            evidenceRefs: [],
            toolCalls: [],
          };
          return {
            ...current,
            turns: [...current.turns, nextTurn],
          };
        }
        case "delta":
          return {
            ...current,
            turns: current.turns.map((turn) =>
              turn.round === event.round &&
              turn.agentRole === event.agentRole
                ? { ...turn, content: turn.content + event.text }
                : turn
            ),
          };
        case "tool_call":
          return {
            ...current,
            turns: current.turns.map((turn) =>
              turn.round === event.round &&
              turn.agentRole === event.agentRole
                ? {
                    ...turn,
                    toolCalls: [
                      ...turn.toolCalls,
                      { name: event.name, input: event.input },
                    ],
                  }
                : turn
            ),
          };
        case "turn_completed":
          return {
            ...current,
            turns: current.turns.map((turn) =>
              turnKey(turn) === turnKey(event.turn) ? event.turn : turn
            ),
          };
        case "summary":
          return { ...current, summary: event.summary };
        case "run_completed":
          return { ...current, status: "completed" };
        case "error":
          return { ...current, status: "failed", error: event.message };
        default:
          return current;
      }
    });
  }, []);

  const runDebate = useCallback(async () => {
    abortRef.current?.abort();
    userStartedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      status: "running",
      runId: null,
      quarter: quarter ?? null,
      turns: [],
      summary: null,
      error: null,
    });

    try {
      const response = await fetch("/api/agents/promotion-debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeEmail, quarter }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "The debate could not be started.";
        setState((current) => ({ ...current, status: "failed", error: message }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              applyEvent(JSON.parse(line) as StreamEvent);
            } catch {
              // Ignore malformed frames; the run continues.
            }
          }
          newline = buffer.indexOf("\n");
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        try {
          applyEvent(JSON.parse(trailing) as StreamEvent);
        } catch {
          // Ignore a truncated final frame.
        }
      }

      setState((current) =>
        current.status === "running"
          ? {
              ...current,
              status: "failed",
              error: "The stream ended before the debate completed.",
            }
          : current
      );
    } catch (error) {
      if (controller.signal.aborted) {
        setState((current) => ({ ...current, status: "canceled" }));
        return;
      }
      setState((current) => ({
        ...current,
        status: "failed",
        error:
          error instanceof Error ? error.message : "The debate failed to run.",
      }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [applyEvent, employeeEmail, quarter]);

  const stopDebate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((current) => ({ ...current, status: "canceled" }));
  }, []);

  const isRunning = state.status === "running";
  const turns = sortTurns(state.turns);
  const rounds = Array.from(new Set(turns.map((turn) => turn.round))).sort(
    (a, b) => a - b
  );

  return (
    <Card className="border-border/60">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">
            Promotion debate · {employeeName}
          </CardTitle>
          <CardDescription className="max-w-2xl">
            Two agents argue the strongest case for and against promotion using
            the same evidence. A moderator summarizes the arguments and what is
            still unresolved. This is a decision aid, not a verdict.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.runId ? (
            <Badge variant="outline">Run #{state.runId}</Badge>
          ) : null}
          {state.quarter ? (
            <Badge variant="outline">{state.quarter}</Badge>
          ) : null}
          {isRunning ? (
            <Button type="button" size="sm" variant="outline" onClick={stopDebate}>
              Stop debate
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={runDebate}>
              {turns.length > 0 ? "Run again" : "Run promotion debate"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {state.error ? (
          <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        ) : null}

        {state.status === "canceled" ? (
          <div className="border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Debate stopped. Completed turns remain below and the run is marked
            canceled.
          </div>
        ) : null}

        {state.summary ? <ReadinessSummary summary={state.summary} /> : null}

        {turns.length === 0 && !isRunning ? (
          <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No debate yet for this engineer. Run one to see both agents argue
            the promotion case from the recorded evidence.
          </div>
        ) : null}

        {rounds.map((round) => {
          const roundTurns = turns.filter((turn) => turn.round === round);
          const phase = roundTurns[0]?.phase ?? "opening";

          return (
            <section key={round} className="space-y-3">
              <div className="flex items-baseline gap-2 border-b border-border/60 pb-2">
                <h3 className="text-sm font-semibold">
                  Round {round} · {toTitleCase(phase)}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {round === 1
                    ? "Independent opening cases"
                    : "Direct response to the opposing case"}
                </span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {roundTurns.map((turn) => (
                  <TurnCard key={turnKey(turn)} turn={turn} live={isRunning} />
                ))}
              </div>
            </section>
          );
        })}

        {isRunning && turns.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Agents are reading the evidence catalog…
          </div>
        ) : null}

        {isRunning ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Streaming live. You can stop the debate at any time.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TurnCard({ turn, live }: { turn: DebateTurn; live: boolean }) {
  const isAdvocate = turn.agentRole === "advocate";
  const isStreaming = live && turn.content.length === 0;

  return (
    <article
      className={cn(
        "flex h-full flex-col border px-4 py-3",
        isAdvocate
          ? "border-border/60 bg-muted/15"
          : "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isAdvocate ? "secondary" : "destructive"}>
          {isAdvocate ? "Advocate · for" : "Examiner · against"}
        </Badge>
        <Badge variant="outline">{toTitleCase(turn.phase)}</Badge>
        {turn.toolCalls.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {turn.toolCalls.length} evidence lookup
            {turn.toolCalls.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed">
        {turn.content || (
          <span className="text-muted-foreground">
            {isStreaming ? "Thinking through the evidence…" : "No response yet."}
          </span>
        )}
      </div>

      {turn.evidenceRefs.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2">
          <span className="mr-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Evidence
          </span>
          {turn.evidenceRefs.map((ref) => (
            <Badge key={ref} variant="outline" className="font-mono">
              {ref}
            </Badge>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ReadinessSummary({ summary }: { summary: DebateSummary }) {
  const copy = readinessCopy[summary.readiness];

  return (
    <div className="border border-border/60 bg-muted/10 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Moderator signal
        </span>
        <Badge variant={copy.variant}>{copy.label}</Badge>
        <Badge variant="outline">
          Confidence {toTitleCase(summary.confidence)}
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-relaxed">{summary.summary}</p>
      <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ArgumentList title="Strongest case for" items={summary.strongestFor} />
        <ArgumentList
          title="Strongest case against"
          items={summary.strongestAgainst}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BulletList title="Open questions" items={summary.openQuestions} />
        <BulletList
          title="What would change this"
          items={summary.whatWouldChange}
        />
      </div>
    </div>
  );
}

function ArgumentList({
  title,
  items,
}: {
  title: string;
  items: Array<{ claim: string; evidenceRefs: string[] }>;
}) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {items.map((item, index) => (
        <div
          key={`${title}-${index}`}
          className="border border-border/50 bg-background/60 px-3 py-2 text-sm"
        >
          <div>{item.claim}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.evidenceRefs.map((ref) => (
              <Badge key={ref} variant="outline" className="font-mono">
                {ref}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="border-l border-border/70 pl-3 text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
