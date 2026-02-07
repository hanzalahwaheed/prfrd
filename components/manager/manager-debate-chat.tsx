"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type ManagerDebateChatProps = {
  employeeEmail: string;
  employeeName: string;
};

type DebateMessage = {
  agentRole: "advocate" | "examiner";
  stance: string;
  confidenceLevel: string;
  arguments: Array<{
    claim: string;
    evidenceRefs: string[];
  }>;
  risks: string[];
  recommendation: {
    bonus: string;
    promotion: string;
  } | null;
};

type DebateApiSuccess = {
  status: "success";
  run: {
    id: number;
    quarter: string;
    status: string;
  };
  messages: DebateMessage[];
};

type DebateApiEmpty = {
  status: "empty";
  run: null;
  messages: [];
};

type DebateApiError = {
  error: string;
};

type DebateViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; data: DebateApiSuccess };

function toTitleCase(text: string): string {
  if (!text) return "";
  return text
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pickLatestMessages(messages: DebateMessage[]) {
  let advocate: DebateMessage | null = null;
  let examiner: DebateMessage | null = null;

  for (const message of messages) {
    if (message.agentRole === "advocate") {
      advocate = message;
      continue;
    }
    if (message.agentRole === "examiner") {
      examiner = message;
    }
  }

  return { advocate, examiner };
}

export default function ManagerDebateChat({
  employeeEmail,
  employeeName,
}: ManagerDebateChatProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DebateViewState>({ kind: "idle" });
  const [visibleRoles, setVisibleRoles] = useState<{
    advocate: boolean;
    examiner: boolean;
  }>({
    advocate: false,
    examiner: false,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();

    async function loadDebate() {
      setState({ kind: "loading" });

      try {
        const response = await fetch(
          `/api/insights/manager-analysis/debate?employeeEmail=${encodeURIComponent(employeeEmail)}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        );

        const payload = (await response.json()) as
          | DebateApiSuccess
          | DebateApiEmpty
          | DebateApiError;

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? payload.error
              : "Failed to load debate responses.";
          setState({ kind: "error", message });
          return;
        }

        if ("status" in payload && payload.status === "empty") {
          setState({ kind: "empty" });
          return;
        }

        if ("status" in payload && payload.status === "success") {
          setState({ kind: "ready", data: payload });
          return;
        }

        setState({ kind: "error", message: "Unexpected debate response payload." });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load debate responses.",
        });
      }
    }

    loadDebate();

    return () => controller.abort();
  }, [employeeEmail, open]);

  const latestMessages = useMemo(() => {
    if (state.kind !== "ready") {
      return { advocate: null, examiner: null };
    }

    return pickLatestMessages(state.data.messages);
  }, [state]);

  useEffect(() => {
    if (!open || state.kind !== "ready") {
      const resetTimer = window.setTimeout(() => {
        setVisibleRoles({
          advocate: false,
          examiner: false,
        });
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    const timers: number[] = [];
    const hasAdvocate = Boolean(latestMessages.advocate);
    const hasExaminer = Boolean(latestMessages.examiner);

    timers.push(
      window.setTimeout(() => {
        setVisibleRoles({
          advocate: false,
          examiner: false,
        });
      }, 0)
    );

    if (hasAdvocate) {
      timers.push(
        window.setTimeout(() => {
          setVisibleRoles((current) => ({ ...current, advocate: true }));
        }, 120)
      );
    }

    if (hasExaminer) {
      timers.push(
        window.setTimeout(() => {
          setVisibleRoles((current) => ({ ...current, examiner: true }));
        }, hasAdvocate ? 700 : 120)
      );
    }

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [
    latestMessages.advocate,
    latestMessages.examiner,
    open,
    state.kind,
  ]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Open debate conversation
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Analysis debate conversation</SheetTitle>
          <SheetDescription>
            Latest advocate and examiner comments for {employeeName}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {state.kind === "idle" || state.kind === "loading" ? (
            <div className="text-xs text-muted-foreground">Loading debate responses...</div>
          ) : null}

          {state.kind === "error" ? (
            <div className="text-xs text-destructive">{state.message}</div>
          ) : null}

          {state.kind === "empty" ? (
            <div className="text-xs text-muted-foreground">
              No `analysis_debate_response` rows were found for this engineer yet.
            </div>
          ) : null}

          {state.kind === "ready" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Run #{state.data.run.id}</Badge>
                <Badge variant="outline">Quarter {state.data.run.quarter}</Badge>
                <Badge variant={state.data.run.status === "completed" ? "secondary" : "outline"}>
                  {toTitleCase(state.data.run.status)}
                </Badge>
              </div>

              <div className="space-y-3">
                {latestMessages.advocate ? (
                  visibleRoles.advocate ? (
                    <DebateBubble role="advocate" message={latestMessages.advocate} />
                  ) : (
                    <StreamingPlaceholder label="Advocate is responding..." />
                  )
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No advocate response was persisted for this run.
                  </div>
                )}

                {latestMessages.examiner ? (
                  visibleRoles.examiner ? (
                    <DebateBubble role="examiner" message={latestMessages.examiner} />
                  ) : visibleRoles.advocate || !latestMessages.advocate ? (
                    <StreamingPlaceholder label="Examiner is responding..." />
                  ) : null
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No examiner response was persisted for this run.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type DebateBubbleProps = {
  role: "advocate" | "examiner";
  message: DebateMessage;
};

function DebateBubble({ role, message }: DebateBubbleProps) {
  const isAdvocate = role === "advocate";

  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500",
        "flex",
        isAdvocate ? "justify-start" : "justify-end"
      )}
    >
      <article
        className={cn(
          "w-full max-w-[40rem] border px-4 py-3",
          isAdvocate
            ? "border-border/60 bg-muted/15"
            : "border-destructive/40 bg-destructive/10"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isAdvocate ? "secondary" : "destructive"}>
            {isAdvocate ? "Advocate" : "Examiner"}
          </Badge>
          <Badge variant="outline">Confidence {toTitleCase(message.confidenceLevel)}</Badge>
        </div>

        <div className="mt-3 space-y-3 text-sm">
          <section className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Stance
            </div>
            <div className="font-medium">
              {message.stance ? toTitleCase(message.stance) : "No stance provided."}
            </div>
          </section>

          <section className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Arguments
            </div>
            {message.arguments.length > 0 ? (
              <div className="space-y-2">
                {message.arguments.map((argument, index) => (
                  <div key={`${role}-argument-${index}`} className="border border-border/50 px-3 py-2">
                    <div>{argument.claim}</div>
                    {argument.evidenceRefs.length > 0 ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Evidence: {argument.evidenceRefs.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No argument details were captured.</div>
            )}
          </section>

          {message.risks.length > 0 ? (
            <section className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Risks
              </div>
              <div className="space-y-1">
                {message.risks.map((risk, index) => (
                  <div key={`${role}-risk-${index}`} className="border border-border/50 px-3 py-2">
                    {risk}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {message.recommendation ? (
            <section className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Recommendation
              </div>
              <div>
                Bonus: {toTitleCase(message.recommendation.bonus || "n/a")} · Promotion:{" "}
                {toTitleCase(message.recommendation.promotion || "n/a")}
              </div>
            </section>
          ) : null}
        </div>
      </article>
    </div>
  );
}

type StreamingPlaceholderProps = {
  label: string;
};

function StreamingPlaceholder({ label }: StreamingPlaceholderProps) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 border border-dashed border-border/60 px-3 py-2">
      <div className="animate-pulse text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
