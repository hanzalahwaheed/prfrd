import Link from "next/link";
import { notFound } from "next/navigation";

import ManagerDebateChat from "@/components/manager/manager-debate-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getEngineerSnapshotByEmail,
  latestGithubWeekStart,
  latestSlackWeekStart,
} from "@/lib/data/dashboard";
import { getManagerProfileInsightsByEmployeeEmail } from "@/lib/services/managerProfileInsights";

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatWeek(weekStart?: string) {
  if (!weekStart) return "—";
  return weekFormatter.format(new Date(`${weekStart}T00:00:00Z`));
}

function toTitleCase(text: string) {
  if (!text) return "";
  return text
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEligibility(value: boolean | null | undefined): string {
  if (value === undefined || value === null) {
    return "Not configured";
  }
  return value ? "Eligible" : "Not eligible";
}

function formatDecision(value: "approve" | "defer" | "deny" | null): string {
  if (!value) {
    return "No decision yet";
  }

  if (value === "approve") return "Approve";
  if (value === "defer") return "Defer";
  return "Deny";
}

type PageProps = {
  params: Promise<{
    email: string;
  }>;
};

export default async function ManagerEngineerDetailPage({ params }: PageProps) {
  const { email } = await params;
  const decodedEmail = decodeURIComponent(email);
  const snapshot = getEngineerSnapshotByEmail(decodedEmail);

  if (!snapshot) {
    return notFound();
  }

  const github = snapshot.github;
  const slack = snapshot.slack;
  const prHighlights = github?.pullRequestSummaries?.slice(0, 2) ?? [];
  const slackHighlights = slack?.messageSummaries?.slice(0, 2) ?? [];

  let profileInsights = {
    context: null,
    latestRun: null,
    bonusRecommendation: null,
    promotionRecommendation: null,
    unresolvedQuestions: [],
    suggestedQuestions: [],
    focusAreas: [],
  } as Awaited<ReturnType<typeof getManagerProfileInsightsByEmployeeEmail>>;

  try {
    profileInsights = await getManagerProfileInsightsByEmployeeEmail(decodedEmail);
  } catch (error) {
    console.error("[manager-profile] failed to load manager profile insights", error);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Manager View
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {snapshot.employee.name}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Compact profile, bonus suitability, and coaching prompts for the next 1:1.
            </p>
            <div className="text-xs text-muted-foreground">
              GitHub week: {formatWeek(latestGithubWeekStart)} · Slack week:{" "}
              {formatWeek(latestSlackWeekStart)}
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/manager">Back to manager overview</Link>
          </Button>
        </header>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {profileInsights.latestRun
              ? `Latest analysis run #${profileInsights.latestRun.id} · ${profileInsights.latestRun.quarter}`
              : "No manager analysis run found yet."}
          </div>
          <ManagerDebateChat
            employeeEmail={snapshot.employee.email}
            employeeName={snapshot.employee.name}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Engineer snapshot</CardTitle>
                <CardDescription>Concise weekly status for this profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">AI Engineer</Badge>
                  <Badge variant="outline">
                    Week of {formatWeek(github?.weekStart || slack?.weekStart)}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{snapshot.employee.email}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ConciseSignal
                    label="Delivery"
                    value={
                      github?.prsMerged && github.prsMerged >= 6 ? "Strong week" : "Normal week"
                    }
                  />
                  <ConciseSignal
                    label="Collaboration"
                    value={
                      slack?.messageCount && slack.messageCount >= 20
                        ? "Highly active"
                        : "Steady activity"
                    }
                  />
                  <ConciseSignal
                    label="PR review rhythm"
                    value={
                      github?.prReviewsGiven && github.prReviewsGiven >= 6
                        ? "Consistent reviewer"
                        : "Moderate reviewer"
                    }
                  />
                  <ConciseSignal
                    label="Sustainability"
                    value={
                      (github?.afterHoursRatio ?? 0) >= 0.35 ||
                      (slack?.afterHoursRatio ?? 0) >= 0.35
                        ? "Watch workload"
                        : "Looks stable"
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Bonus and promotion signal</CardTitle>
                <CardDescription>
                  Uses eligibility context and latest arbiter recommendation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DecisionRow
                  label="Bonus eligibility"
                  value={formatEligibility(profileInsights.context?.bonusEligible)}
                />
                <DecisionRow
                  label="Bonus recommendation"
                  value={formatDecision(profileInsights.bonusRecommendation)}
                />
                <DecisionRow
                  label="Promotion eligibility"
                  value={formatEligibility(profileInsights.context?.promotionEligible)}
                />
                <DecisionRow
                  label="Promotion recommendation"
                  value={formatDecision(profileInsights.promotionRecommendation)}
                />
                {profileInsights.focusAreas.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Focus areas
                    </div>
                    {profileInsights.focusAreas.slice(0, 3).map((item, index) => (
                      <div key={`focus-${index}`} className="border border-border/60 px-3 py-2">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Suggested manager prompts</CardTitle>
                <CardDescription>
                  Questions you can ask the engineer in the next check-in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {profileInsights.suggestedQuestions.length > 0 ? (
                  profileInsights.suggestedQuestions.slice(0, 6).map((question, index) => (
                    <div key={`question-${index}`} className="border border-border/60 px-3 py-2">
                      {question}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">
                    No stored suggested questions yet for this employee.
                  </div>
                )}

                {profileInsights.unresolvedQuestions.length > 0 ? (
                  <>
                    <div className="pt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Unresolved decision questions
                    </div>
                    {profileInsights.unresolvedQuestions.slice(0, 3).map((question, index) => (
                      <div
                        key={`unresolved-${index}`}
                        className="border border-border/60 bg-muted/20 px-3 py-2"
                      >
                        {question}
                      </div>
                    ))}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Latest engineering highlights</CardTitle>
                <CardDescription>
                  Quick context before opening the full weekly or monthly detail.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    PR highlights
                  </div>
                  {prHighlights.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No pull request highlights captured.
                    </div>
                  ) : (
                    prHighlights.map((summary, index) => (
                      <div
                        key={`${summary.area}-${index}`}
                        className="space-y-2 border border-border/60 px-3 py-3"
                      >
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{summary.type}</Badge>
                          <Badge
                            variant={summary.impact === "core" ? "default" : "secondary"}
                          >
                            {summary.impact}
                          </Badge>
                          <Badge variant={summary.merged ? "secondary" : "outline"}>
                            {summary.merged ? "Merged" : "Open"}
                          </Badge>
                        </div>
                        <div className="text-sm">{summary.summary}</div>
                        <div className="text-xs text-muted-foreground">Area: {summary.area}</div>
                      </div>
                    ))
                  )}
                </section>

                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Slack themes
                  </div>
                  {slackHighlights.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No Slack highlights captured.
                    </div>
                  ) : (
                    slackHighlights.map((summary, index) => (
                      <div
                        key={`${summary.theme}-${index}`}
                        className="space-y-2 border border-border/60 px-3 py-3"
                      >
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={
                              summary.intent === "blocking" ? "destructive" : "secondary"
                            }
                          >
                            {summary.intent}
                          </Badge>
                          <Badge variant="outline">{summary.sentiment}</Badge>
                        </div>
                        <div className="text-sm">{summary.example}</div>
                      </div>
                    ))
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

type ConciseSignalProps = {
  label: string;
  value: string;
};

function ConciseSignal({ label, value }: ConciseSignalProps) {
  return (
    <div className="border border-border/60 px-3 py-2">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

type DecisionRowProps = {
  label: string;
  value: string;
};

function DecisionRow({ label, value }: DecisionRowProps) {
  const isStrong = value === "Approve" || value === "Eligible";
  const isRisk = value === "Deny" || value === "Not eligible";

  return (
    <div className="flex items-center justify-between gap-3 border border-border/60 px-3 py-2">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <Badge variant={isRisk ? "destructive" : isStrong ? "secondary" : "outline"}>
        {toTitleCase(value)}
      </Badge>
    </div>
  );
}
