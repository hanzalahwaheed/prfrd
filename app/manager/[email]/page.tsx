import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getEngineerSnapshotByEmail,
  latestGithubWeekStart,
  latestSlackWeekStart,
} from "@/lib/data/dashboard";

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatWeek(weekStart?: string) {
  if (!weekStart) return "—";
  return weekFormatter.format(new Date(`${weekStart}T00:00:00Z`));
}

function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "—";
  return percentFormatter.format(value);
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
  const prHighlights = github?.pullRequestSummaries?.slice(0, 3) ?? [];
  const slackHighlights = slack?.messageSummaries?.slice(0, 2) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Manager View
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {snapshot.employee.name}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Personal engineer snapshot for quick 1:1 prep and follow-ups.
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

        <section className="mt-8">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {snapshot.employee.name}
                <Badge variant="secondary">AI Engineer</Badge>
              </CardTitle>
              <CardDescription>{snapshot.employee.email}</CardDescription>
              <CardAction>
                <Badge variant="outline">
                  Week of {formatWeek(github?.weekStart || slack?.weekStart)}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="PRs merged" value={github?.prsMerged ?? "—"} />
                <Metric
                  label="PR reviews"
                  value={github?.prReviewsGiven ?? "—"}
                />
                <Metric
                  label="Issues raised"
                  value={github?.issueSummaries?.length ?? "—"}
                />
                <Metric label="Messages" value={slack?.messageCount ?? "—"} />
                <Metric
                  label="After-hours coding"
                  value={formatPercent(github?.afterHoursRatio)}
                />
                <Metric
                  label="Weekend messaging"
                  value={formatPercent(slack?.weekendRatio)}
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  PR highlights
                </div>
                {prHighlights.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No pull request highlights captured.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {prHighlights.map((summary, index) => (
                      <div
                        key={`${summary.area}-${index}`}
                        className="rounded-none border border-border/60 p-3"
                      >
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{summary.type}</Badge>
                          <Badge
                            variant={
                              summary.impact === "core"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {summary.impact}
                          </Badge>
                          <Badge
                            variant={summary.merged ? "secondary" : "outline"}
                          >
                            {summary.merged ? "Merged" : "Open"}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {summary.summary}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Area: {summary.area}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Slack themes
                </div>
                {slackHighlights.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No Slack highlights captured.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slackHighlights.map((summary, index) => (
                      <div
                        key={`${summary.theme}-${index}`}
                        className="rounded-none border border-border/60 p-3"
                      >
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={
                              summary.intent === "blocking"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {summary.intent}
                          </Badge>
                          <Badge variant="outline">{summary.sentiment}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {summary.example}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
              Signals: {prHighlights.length} PR highlights ·{" "}
              {slackHighlights.length} Slack themes
            </CardFooter>
          </Card>
        </section>
      </main>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: React.ReactNode;
};

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-none border border-border/60 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
