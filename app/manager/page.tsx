import Link from "next/link";

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
  engineerSnapshots,
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

const githubRows = engineerSnapshots.flatMap((snapshot) =>
  snapshot.github ? [snapshot.github] : []
);
const slackRows = engineerSnapshots.flatMap((snapshot) =>
  snapshot.slack ? [snapshot.slack] : []
);

const totals = {
  prsMerged: githubRows.reduce((sum, row) => sum + row.prsMerged, 0),
  prReviews: githubRows.reduce((sum, row) => sum + row.prReviewsGiven, 0),
  messages: slackRows.reduce((sum, row) => sum + row.messageCount, 0),
  replies: slackRows.reduce((sum, row) => sum + row.replyCount, 0),
};

const average = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const avgGithubAfterHours = average(
  githubRows.map((row) => row.afterHoursRatio)
);
const avgSlackWeekend = average(slackRows.map((row) => row.weekendRatio));

const employeeLookup = new Map(
  engineerSnapshots.map((snapshot) => [
    snapshot.employee.email,
    snapshot.employee.name,
  ])
);

const corePrHighlights = githubRows
  .flatMap((row) =>
    row.pullRequestSummaries
      .filter((summary) => summary.impact === "core")
      .map((summary) => ({
        summary,
        employeeEmail: row.employeeEmail,
      }))
  )
  .slice(0, 5);

const blockingHighlights = slackRows
  .flatMap((row) =>
    row.messageSummaries
      .filter((summary) => summary.intent === "blocking")
      .map((summary) => ({
        summary,
        employeeEmail: row.employeeEmail,
      }))
  )
  .slice(0, 5);

function buildRiskFlags({
  github,
  slack,
}: {
  github?: (typeof githubRows)[number];
  slack?: (typeof slackRows)[number];
}) {
  const flags: string[] = [];
  if (github && github.afterHoursRatio >= 0.4) {
    flags.push("High after-hours coding");
  }
  if (slack && slack.afterHoursRatio >= 0.4) {
    flags.push("High after-hours messaging");
  }
  if (slack && slack.weekendRatio >= 0.3) {
    flags.push("Weekend load");
  }
  if (slack && slack.messageSummaries.some((summary) => summary.intent === "blocking")) {
    flags.push("Blocking threads");
  }
  return flags;
}

export default function ManagerDashboardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Manager Dashboard
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Team health overview
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Aggregated engineering output with workload and collaboration
              signals for fast weekly reviews.
            </p>
            <div className="text-xs text-muted-foreground">
              GitHub week: {formatWeek(latestGithubWeekStart)} · Slack week:{" "}
              {formatWeek(latestSlackWeekStart)}
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to role picker</Link>
          </Button>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="PRs merged" value={totals.prsMerged} />
          <KpiCard label="PR reviews" value={totals.prReviews} />
          <KpiCard label="Messages sent" value={totals.messages} />
          <KpiCard label="Replies" value={totals.replies} />
          <KpiCard
            label="Avg after-hours coding"
            value={formatPercent(avgGithubAfterHours)}
          />
          <KpiCard
            label="Avg weekend messaging"
            value={formatPercent(avgSlackWeekend)}
          />
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Team breakdown</CardTitle>
              <CardDescription>
                Latest weekly snapshot by engineer.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{engineerSnapshots.length} members</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {engineerSnapshots.map((snapshot) => {
                const github = snapshot.github;
                const slack = snapshot.slack;
                const flags = buildRiskFlags({ github, slack });
                const encodedEmail = encodeURIComponent(snapshot.employee.email);

                return (
                  <div
                    key={snapshot.employee.email}
                    className="rounded-none border border-border/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {snapshot.employee.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {snapshot.employee.email}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          Week of{" "}
                          {formatWeek(github?.weekStart || slack?.weekStart)}
                        </Badge>
                        <Button asChild size="xs" variant="outline">
                          <Link href={`/manager/${encodedEmail}`}>View</Link>
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="flex items-center justify-between border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">PRs merged</span>
                        <span className="font-semibold">
                          {github?.prsMerged ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Reviews</span>
                        <span className="font-semibold">
                          {github?.prReviewsGiven ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Messages</span>
                        <span className="font-semibold">
                          {slack?.messageCount ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">After-hours</span>
                        <span className="font-semibold">
                          {formatPercent(github?.afterHoursRatio)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {flags.length === 0 ? (
                        <Badge variant="secondary">Steady</Badge>
                      ) : (
                        flags.slice(0, 3).map((flag) => (
                          <Badge key={flag} variant="destructive">
                            {flag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
              Focus on sustained after-hours work or blocking threads.
            </CardFooter>
          </Card>

          <div className="grid gap-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Core PR highlights</CardTitle>
                <CardDescription>
                  High-impact work from the latest week.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {corePrHighlights.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No core impact PRs captured.
                  </div>
                ) : (
                  corePrHighlights.map((item, index) => (
                    <div
                      key={`${item.employeeEmail}-${index}`}
                      className="rounded-none border border-border/60 p-3"
                    >
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {employeeLookup.get(item.employeeEmail) ??
                            item.employeeEmail}
                        </Badge>
                        <Badge variant="outline">{item.summary.type}</Badge>
                        <Badge variant="default">{item.summary.impact}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {item.summary.summary}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Area: {item.summary.area}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Blocking signals</CardTitle>
                <CardDescription>
                  Slack threads that indicate active blockers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {blockingHighlights.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No blocking themes captured.
                  </div>
                ) : (
                  blockingHighlights.map((item, index) => (
                    <div
                      key={`${item.employeeEmail}-${index}`}
                      className="rounded-none border border-border/60 p-3"
                    >
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {employeeLookup.get(item.employeeEmail) ??
                            item.employeeEmail}
                        </Badge>
                        <Badge variant="destructive">Blocking</Badge>
                        <Badge variant="outline">{item.summary.sentiment}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {item.summary.example}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Theme: {item.summary.theme}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
};

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
