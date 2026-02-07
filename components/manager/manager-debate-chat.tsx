"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  employeeId: number;
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
  createdAt: string;
};

type DebateApiSuccess = {
  status: "success";
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

type ConversationEntry = {
  id: string;
  agentRole: "advocate" | "examiner";
  label: "stance" | "argument" | "risk" | "recommendation";
  text: string;
  evidenceRefs: string[];
  confidenceLevel: string;
  createdAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDateTime(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return dateTimeFormatter.format(parsed);
}

function toTitleCase(text: string): string {
  if (!text) return "";
  return text
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildConversationEntries(messages: DebateMessage[]): ConversationEntry[] {
  return messages.flatMap((message, messageIndex) => {
    const entries: ConversationEntry[] = [];

    if (message.stance) {
      entries.push({
        id: `${message.agentRole}-${messageIndex}-stance`,
        agentRole: message.agentRole,
        label: "stance",
        text: `Stance: ${toTitleCase(message.stance)}`,
        evidenceRefs: [],
        confidenceLevel: message.confidenceLevel,
        createdAt: message.createdAt,
      });
    }

    for (const [argumentIndex, argument] of message.arguments.entries()) {
      entries.push({
        id: `${message.agentRole}-${messageIndex}-argument-${argumentIndex}`,
        agentRole: message.agentRole,
        label: "argument",
        text: argument.claim,
        evidenceRefs: argument.evidenceRefs,
        confidenceLevel: message.confidenceLevel,
        createdAt: message.createdAt,
      });
    }

    for (const [riskIndex, risk] of message.risks.entries()) {
      entries.push({
        id: `${message.agentRole}-${messageIndex}-risk-${riskIndex}`,
        agentRole: message.agentRole,
        label: "risk",
        text: risk,
        evidenceRefs: [],
        confidenceLevel: message.confidenceLevel,
        createdAt: message.createdAt,
      });
    }

    if (message.recommendation) {
      const bonus = message.recommendation.bonus || "n/a";
      const promotion = message.recommendation.promotion || "n/a";

      entries.push({
        id: `${message.agentRole}-${messageIndex}-recommendation`,
        agentRole: message.agentRole,
        label: "recommendation",
        text: `Recommendation: bonus ${bonus}, promotion ${promotion}.`,
        evidenceRefs: [],
        confidenceLevel: message.confidenceLevel,
        createdAt: message.createdAt,
      });
    }

    if (entries.length === 0) {
      entries.push({
        id: `${message.agentRole}-${messageIndex}-empty`,
        agentRole: message.agentRole,
        label: "argument",
        text: "No persisted comments in this response.",
        evidenceRefs: [],
        confidenceLevel: message.confidenceLevel,
        createdAt: message.createdAt,
      });
    }

    return entries;
  });
}

export default function ManagerDebateChat({
  employeeEmail,
  employeeName,
}: ManagerDebateChatProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DebateViewState>({ kind: "idle" });

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

  const completionLabel = useMemo(() => {
    if (state.kind !== "ready") {
      return null;
    }

    return state.data.run.completedAt
      ? `Completed ${formatDateTime(state.data.run.completedAt)}`
      : `Started ${formatDateTime(state.data.run.createdAt)}`;
  }, [state]);

  const conversationEntries = useMemo(() => {
    if (state.kind !== "ready") {
      return [];
    }

    return buildConversationEntries(state.data.messages);
  }, [state]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Analysis debate</CardTitle>
          <CardDescription>
            Open the latest advocate and examiner responses in conversation view.
          </CardDescription>
          <CardAction>
            <SheetTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Open debate conversation
              </Button>
            </SheetTrigger>
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          This opens a sheet with the latest `analysis_debate_response` comments.
        </CardContent>
      </Card>

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
                {completionLabel ? <Badge variant="ghost">{completionLabel}</Badge> : null}
              </div>

              <div className="space-y-3">
                {conversationEntries.map((entry) => {
                  const isAdvocate = entry.agentRole === "advocate";

                  return (
                    <div
                      key={entry.id}
                      className={cn("flex", isAdvocate ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "w-full max-w-[40rem] border px-3 py-2",
                          isAdvocate
                            ? "border-border/60 bg-muted/20"
                            : "border-border/60 bg-secondary/30"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={isAdvocate ? "secondary" : "default"}>
                            {isAdvocate ? "Advocate" : "Examiner"}
                          </Badge>
                          <Badge variant="outline">{toTitleCase(entry.label)}</Badge>
                          <Badge variant="outline">
                            Confidence {toTitleCase(entry.confidenceLevel)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>

                        <div className="mt-2 text-xs font-medium">{entry.text}</div>

                        {entry.evidenceRefs.length > 0 ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Evidence: {entry.evidenceRefs.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
