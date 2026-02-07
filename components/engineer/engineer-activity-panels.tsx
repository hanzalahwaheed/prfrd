"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  EngineerMonthlySummary,
  EngineerSnapshot,
  EngineerWeeklyHistory,
} from "@/lib/data/dashboard";

type EngineerActivityPanelsProps = {
  snapshot: EngineerSnapshot;
  weeklyHistory: EngineerWeeklyHistory[];
  monthlySummaries: EngineerMonthlySummary[];
};

type RecheckStatsRequest = {
  employeeEmail: string;
  employeeName: string;
  scope: "weekly" | "monthly";
  periodKey: string;
  detailLabel: string;
  detailValue: string;
  employeeNote: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type DetailItem = {
  id: string;
  label: string;
  text: string;
  scope: "weekly" | "monthly";
  periodKey: string;
};

type ExistingMonthlyReportResponse =
  | {
      status: "ready";
      month: string;
      generatedAt: string;
      stale: false;
      report: {
        executionInsight: string;
        engagementInsight: string;
        collaborationInsight: string;
        growthInsight: string;
        overallSummary: string;
        identifiedRisks: string[];
        identifiedOpportunities: string[];
      };
    }
  | {
      status: "missing";
      stale: true;
      message: string;
      lastGeneratedAt: null;
      month: null;
    }
  | {
      status: "stale";
      stale: true;
      message: string;
      lastGeneratedAt: string;
      month: string;
    };

type ExistingMonthlyReportView =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: ExistingMonthlyReportResponse & { status: "ready" } }
  | { kind: "empty"; data: ExistingMonthlyReportResponse & { status: "missing" } }
  | { kind: "stale"; data: ExistingMonthlyReportResponse & { status: "stale" } }
  | { kind: "error"; message: string };

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatWeek(weekStart: string) {
  return weekFormatter.format(new Date(`${weekStart}T00:00:00Z`));
}

function formatMonth(monthKey: string) {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthKey;
  }

  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return dateTimeFormatter.format(parsed);
}

function getErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") {
      return error;
    }
  }

  return "Request failed.";
}

function sanitizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueTop(values: string[], max: number) {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= max) break;
  }
  return Array.from(unique);
}

function describeLoad(value?: number) {
  if (value === undefined || Number.isNaN(value)) {
    return "No strong load signal detected from captured data.";
  }

  if (value >= 0.35) {
    return "Sustained after-hours pressure is visible and worth rechecking.";
  }

  if (value >= 0.2) {
    return "Load appears elevated during non-core hours and should be monitored.";
  }

  return "Load appears stable with limited after-hours pressure.";
}

function buildWeeklyDetails(week: EngineerWeeklyHistory): DetailItem[] {
  const details: DetailItem[] = [];
  const periodKey = week.weekStart;

  const prHighlights = week.github?.pullRequestSummaries ?? [];
  for (const [index, pr] of prHighlights.slice(0, 3).entries()) {
    details.push({
      id: `weekly-pr-${index}`,
      label: `PR highlight ${index + 1}`,
      text: `${pr.summary} Focus area: ${pr.area}.`,
      scope: "weekly",
      periodKey,
    });
  }

  const slackHighlights = week.slack?.messageSummaries ?? [];
  for (const [index, message] of slackHighlights.slice(0, 3).entries()) {
    details.push({
      id: `weekly-slack-${index}`,
      label: `Slack theme ${index + 1}`,
      text: `${message.theme}: ${message.example}`,
      scope: "weekly",
      periodKey,
    });
  }

  details.push({
    id: "weekly-load-signal",
    label: "Workload signal",
    text: describeLoad(week.github?.afterHoursRatio ?? week.slack?.afterHoursRatio),
    scope: "weekly",
    periodKey,
  });

  if (details.length === 0) {
    details.push({
      id: "weekly-empty",
      label: "Snapshot",
      text: "No detailed highlights were captured for this week.",
      scope: "weekly",
      periodKey,
    });
  }

  return details;
}

function buildMonthlyDetails(input: {
  summary: EngineerMonthlySummary;
  weeks: EngineerWeeklyHistory[];
}): DetailItem[] {
  const { summary, weeks } = input;
  const periodKey = summary.monthKey;

  const areas = uniqueTop(
    weeks.flatMap((week) =>
      (week.github?.pullRequestSummaries ?? []).map((item) => item.area)
    ),
    4
  );

  const themes = uniqueTop(
    weeks.flatMap((week) =>
      (week.slack?.messageSummaries ?? []).map((item) => item.theme)
    ),
    4
  );

  const details: DetailItem[] = [
    {
      id: "monthly-delivery",
      label: "Delivery momentum",
      text:
        summary.prsMerged >= 12
          ? "Delivery looked strong throughout the month with frequent merged work."
          : summary.prsMerged >= 7
            ? "Delivery looked steady, with a consistent stream of shipped work."
            : "Delivery looked lighter this month and may need deeper context.",
      scope: "monthly",
      periodKey,
    },
    {
      id: "monthly-collaboration",
      label: "Collaboration rhythm",
      text:
        summary.blockingThemes > 0
          ? "Blocking conversations appeared and should be reviewed for repeat patterns."
          : "Collaboration looked healthy with no major blocking conversation pattern.",
      scope: "monthly",
      periodKey,
    },
    {
      id: "monthly-load",
      label: "Sustainability signal",
      text: describeLoad(summary.avgGithubAfterHours ?? summary.avgSlackAfterHours),
      scope: "monthly",
      periodKey,
    },
  ];

  if (areas.length > 0) {
    details.push({
      id: "monthly-pr-areas",
      label: "Recurring engineering themes",
      text: `Most visible PR focus areas: ${areas.join(", ")}.`,
      scope: "monthly",
      periodKey,
    });
  }

  if (themes.length > 0) {
    details.push({
      id: "monthly-slack-themes",
      label: "Communication themes",
      text: `Most visible Slack themes: ${themes.join(", ")}.`,
      scope: "monthly",
      periodKey,
    });
  }

  return details;
}

export default function EngineerActivityPanels({
  snapshot,
  weeklyHistory,
  monthlySummaries,
}: EngineerActivityPanelsProps) {
  const [activeView, setActiveView] = useState<"weekly" | "monthly">("weekly");
  const [selectedWeekKey, setSelectedWeekKey] = useState(weeklyHistory[0]?.weekStart ?? "");
  const [flaggingKey, setFlaggingKey] = useState<string | null>(null);
  const [flagNotice, setFlagNotice] = useState<Notice | null>(null);
  const [isMonthlySheetOpen, setIsMonthlySheetOpen] = useState(false);
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  const [activeFlagDetail, setActiveFlagDetail] = useState<DetailItem | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagReasonError, setFlagReasonError] = useState<string | null>(null);
  const [existingMonthlyReport, setExistingMonthlyReport] =
    useState<ExistingMonthlyReportView>({ kind: "idle" });

  const visibleWeeks = weeklyHistory.slice(0, 4);
  const selectedWeek = useMemo(
    () =>
      visibleWeeks.find((week) => week.weekStart === selectedWeekKey) ??
      weeklyHistory.find((week) => week.weekStart === selectedWeekKey) ??
      visibleWeeks[0] ??
      weeklyHistory[0] ??
      null,
    [selectedWeekKey, visibleWeeks, weeklyHistory]
  );

  const latestMonthlySummary = monthlySummaries[0] ?? null;
  const latestMonthWeeks = useMemo(() => {
    if (!latestMonthlySummary) {
      return [];
    }

    return weeklyHistory.filter((week) => week.weekStart.startsWith(latestMonthlySummary.monthKey));
  }, [latestMonthlySummary, weeklyHistory]);

  const weeklyDetails = useMemo(() => {
    if (!selectedWeek) {
      return [];
    }

    return buildWeeklyDetails(selectedWeek);
  }, [selectedWeek]);

  const monthlyDetails = useMemo(() => {
    if (!latestMonthlySummary) {
      return [];
    }

    return buildMonthlyDetails({
      summary: latestMonthlySummary,
      weeks: latestMonthWeeks,
    });
  }, [latestMonthWeeks, latestMonthlySummary]);

  useEffect(() => {
    if (!isMonthlySheetOpen) {
      return;
    }

    const controller = new AbortController();

    async function loadExistingMonthlyReport() {
      setExistingMonthlyReport({ kind: "loading" });

      try {
        const response = await fetch(
          `/api/insights/existing-monthly-report?employeeEmail=${encodeURIComponent(snapshot.employee.email)}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        );
        const payload = (await response.json()) as
          | ExistingMonthlyReportResponse
          | { error: string };

        if (!response.ok) {
          throw new Error(getErrorMessage(payload));
        }

        if (!("status" in payload)) {
          throw new Error("Unexpected monthly report payload.");
        }

        if (payload.status === "ready") {
          setExistingMonthlyReport({ kind: "ready", data: payload });
          return;
        }

        if (payload.status === "stale") {
          setExistingMonthlyReport({ kind: "stale", data: payload });
          return;
        }

        setExistingMonthlyReport({ kind: "empty", data: payload });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setExistingMonthlyReport({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load generated monthly report.",
        });
      }
    }

    loadExistingMonthlyReport();

    return () => controller.abort();
  }, [isMonthlySheetOpen, snapshot.employee.email]);

  function openFlagDialog(detail: DetailItem) {
    setActiveFlagDetail(detail);
    setFlagReason("");
    setFlagReasonError(null);
    setIsFlagDialogOpen(true);
  }

  async function submitFlagForRecheck() {
    if (!activeFlagDetail) {
      return;
    }

    const note = flagReason.trim();
    if (note.length < 5) {
      setFlagReasonError("Please add a short note explaining what seems inaccurate.");
      return;
    }

    const payload: RecheckStatsRequest = {
      employeeEmail: snapshot.employee.email,
      employeeName: snapshot.employee.name,
      scope: activeFlagDetail.scope,
      periodKey: activeFlagDetail.periodKey,
      detailLabel: activeFlagDetail.label,
      detailValue: activeFlagDetail.text,
      employeeNote: note,
    };

    const detailKey = sanitizeKey(payload.detailLabel);
    const requestKey = `${payload.scope}:${payload.periodKey}:${detailKey}`;
    setFlaggingKey(requestKey);
    setFlagNotice(null);
    setFlagReasonError(null);

    try {
      const response = await fetch("/api/insights/recheck-stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseBody = (await response.json()) as { requestId?: string };

      if (!response.ok) {
        throw new Error(getErrorMessage(responseBody));
      }

      setFlagNotice({
        tone: "success",
        message: `Recheck queued for ${payload.detailLabel} (${payload.periodKey})${responseBody.requestId ? ` · ${responseBody.requestId}` : ""}.`,
      });
      setIsFlagDialogOpen(false);
      setActiveFlagDetail(null);
      setFlagReason("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to flag this detail.";
      setFlagReasonError(message);
      setFlagNotice({
        tone: "error",
        message,
      });
    } finally {
      setFlaggingKey(null);
    }
  }

  const activeFlagRequestKey = activeFlagDetail
    ? `${activeFlagDetail.scope}:${activeFlagDetail.periodKey}:${sanitizeKey(activeFlagDetail.label)}`
    : null;
  const isSubmittingFlag = Boolean(
    activeFlagRequestKey && flaggingKey === activeFlagRequestKey
  );

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">Weekly Activity Sheet</CardTitle>
          <CardDescription className="text-sm">
            Pick a week card to focus the view. Monthly report details are available from the sheet.
          </CardDescription>
          <CardAction>
            <Badge variant="outline" className="text-xs">
              {visibleWeeks.length} cards
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[42rem] grid-cols-4 gap-3">
              {visibleWeeks.map((week, index) => {
                const isSelected = selectedWeek?.weekStart === week.weekStart;

                return (
                  <button
                    key={week.weekStart}
                    type="button"
                    onClick={() => {
                      setSelectedWeekKey(week.weekStart);
                      setActiveView("weekly");
                    }}
                    className={cn(
                      "flex min-h-28 flex-col justify-between border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-background hover:bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "text-xs uppercase tracking-[0.18em]",
                        isSelected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      Week {index + 1}
                    </div>
                    <div className="text-lg font-semibold sm:text-xl">
                      {formatWeek(week.weekStart)}
                    </div>
                    <div
                      className={cn(
                        "text-xs",
                        isSelected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      Open week sheet
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={activeView === "weekly" ? "default" : "outline"}
              onClick={() => setActiveView("weekly")}
              className="text-xs"
            >
              Weekly focus
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeView === "monthly" ? "default" : "outline"}
              onClick={() => setActiveView("monthly")}
              className="text-xs"
            >
              Monthly focus
            </Button>

            <Sheet open={isMonthlySheetOpen} onOpenChange={setIsMonthlySheetOpen}>
              <SheetTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="text-xs">
                  View generated monthly report
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex h-full flex-col p-0 sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Generated monthly report</SheetTitle>
                  <SheetDescription>
                    Existing generated data for {snapshot.employee.name}.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {existingMonthlyReport.kind === "idle" ||
                  existingMonthlyReport.kind === "loading" ? (
                    <div className="text-xs text-muted-foreground">
                      Checking for generated monthly data...
                    </div>
                  ) : null}

                  {existingMonthlyReport.kind === "error" ? (
                    <div className="text-xs text-destructive">
                      {existingMonthlyReport.message}
                    </div>
                  ) : null}

                  {existingMonthlyReport.kind === "empty" ? (
                    <div className="text-xs text-muted-foreground">
                      {existingMonthlyReport.data.message}
                    </div>
                  ) : null}

                  {existingMonthlyReport.kind === "stale" ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {existingMonthlyReport.data.message}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last generated:{" "}
                        {formatDateTime(existingMonthlyReport.data.lastGeneratedAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last month key: {existingMonthlyReport.data.month}
                      </div>
                    </div>
                  ) : null}

                  {existingMonthlyReport.kind === "ready" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          Month {formatMonth(existingMonthlyReport.data.month)}
                        </Badge>
                        <Badge variant="secondary">
                          Generated {formatDateTime(existingMonthlyReport.data.generatedAt)}
                        </Badge>
                      </div>

                      <ReportBlock
                        title="Overall summary"
                        body={existingMonthlyReport.data.report.overallSummary}
                      />
                      <ReportBlock
                        title="Execution"
                        body={existingMonthlyReport.data.report.executionInsight}
                      />
                      <ReportBlock
                        title="Engagement"
                        body={existingMonthlyReport.data.report.engagementInsight}
                      />
                      <ReportBlock
                        title="Collaboration"
                        body={existingMonthlyReport.data.report.collaborationInsight}
                      />
                      <ReportBlock
                        title="Growth"
                        body={existingMonthlyReport.data.report.growthInsight}
                      />

                      {existingMonthlyReport.data.report.identifiedRisks.length > 0 ? (
                        <ReportList
                          title="Identified risks"
                          items={existingMonthlyReport.data.report.identifiedRisks}
                        />
                      ) : null}

                      {existingMonthlyReport.data.report.identifiedOpportunities.length > 0 ? (
                        <ReportList
                          title="Identified opportunities"
                          items={existingMonthlyReport.data.report.identifiedOpportunities}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>

            {latestMonthlySummary ? (
              <Badge variant="secondary" className="text-xs">
                Latest month: {formatMonth(latestMonthlySummary.monthKey)}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        {activeView === "weekly" ? (
          <div className="animate-in slide-in-from-bottom-4 border border-foreground/20 bg-background p-6 duration-300 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-2xl font-semibold text-primary sm:text-3xl">
                {selectedWeek ? `Week sheet · ${formatWeek(selectedWeek.weekStart)}` : "Week sheet"}
              </div>
              <Badge variant="default">Weekly focus</Badge>
            </div>
            <div className="mt-2 text-base text-muted-foreground">
              Focused PR summaries and Slack activity for this selected week.
            </div>

            <div className="mt-6 space-y-3">
              {weeklyDetails.map((detail) => (
                <FlaggableDetailRow
                  key={`${detail.scope}-${detail.periodKey}-${detail.id}`}
                  detail={detail}
                  isFlagging={
                    flaggingKey ===
                    `${detail.scope}:${detail.periodKey}:${sanitizeKey(detail.label)}`
                  }
                  onFlag={() => openFlagDialog(detail)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-in slide-in-from-bottom-4 border border-foreground/20 bg-background p-6 duration-300 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-2xl font-semibold text-primary sm:text-3xl">
                {latestMonthlySummary
                  ? `Monthly sheet · ${formatMonth(latestMonthlySummary.monthKey)}`
                  : "Monthly sheet"}
              </div>
              <Badge variant="default">Monthly focus</Badge>
            </div>
            <div className="mt-2 text-base text-muted-foreground">
              Narrative monthly roll-up for manager-ready context.
            </div>

            <div className="mt-6 space-y-3">
              {monthlyDetails.length > 0 ? (
                monthlyDetails.map((detail) => (
                  <FlaggableDetailRow
                    key={`${detail.scope}-${detail.periodKey}-${detail.id}`}
                    detail={detail}
                    isFlagging={
                      flaggingKey ===
                      `${detail.scope}:${detail.periodKey}:${sanitizeKey(detail.label)}`
                    }
                    onFlag={() => openFlagDialog(detail)}
                  />
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No monthly narrative is available yet.
                </div>
              )}
            </div>
          </div>
        )}

        {flagNotice ? (
          <div
            className={cn(
              "text-sm",
              flagNotice.tone === "error" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {flagNotice.message}
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={isFlagDialogOpen}
        onOpenChange={(open) => {
          setIsFlagDialogOpen(open);
          if (!open) {
            setFlagReasonError(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader className="items-start text-left">
            <AlertDialogTitle>Report inaccurate stat</AlertDialogTitle>
            <AlertDialogDescription>
              Add context so the assistant can recheck this detail.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {activeFlagDetail ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {activeFlagDetail.label}
              </div>
              <div className="border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {activeFlagDetail.text}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="flag-reason">
              Why is this inaccurate?
            </label>
            <Textarea
              id="flag-reason"
              placeholder="Example: this PR was reverted, or this summary misses context."
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
              className="min-h-24 text-xs"
              disabled={isSubmittingFlag}
            />
            {flagReasonError ? (
              <div className="text-xs text-destructive">{flagReasonError}</div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingFlag}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={submitFlagForRecheck}
              disabled={isSubmittingFlag}
            >
              {isSubmittingFlag ? "Submitting..." : "Submit recheck"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type FlaggableDetailRowProps = {
  detail: DetailItem;
  isFlagging: boolean;
  onFlag: () => void;
};

type ReportBlockProps = {
  title: string;
  body: string;
};

function ReportBlock({ title, body }: ReportBlockProps) {
  return (
    <div className="border border-border/60 bg-background px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 text-sm leading-relaxed">{body}</div>
    </div>
  );
}

type ReportListProps = {
  title: string;
  items: string[];
};

function ReportList({ title, items }: ReportListProps) {
  return (
    <div className="border border-border/60 bg-background px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 space-y-1 text-sm leading-relaxed">
        {items.slice(0, 4).map((item, index) => (
          <div key={`${title}-${index}`} className="text-foreground/90">
            - {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlaggableDetailRow({ detail, isFlagging, onFlag }: FlaggableDetailRowProps) {
  return (
    <div className="group/detail border border-border/60 bg-background/70 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {detail.label}
          </div>
          <div className="text-base font-medium leading-relaxed">{detail.text}</div>
        </div>

        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onFlag}
          disabled={isFlagging}
          className="opacity-0 transition-opacity group-hover/detail:opacity-100 focus-visible:opacity-100"
        >
          {isFlagging ? "Flagging..." : "Flag"}
        </Button>
      </div>
    </div>
  );
}
