import Link from "next/link";

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
  engineerSnapshots,
  latestGithubWeekStart,
  latestSlackWeekStart,
} from "@/lib/data/dashboard";

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatWeek(weekStart?: string) {
  if (!weekStart) return "—";
  return weekFormatter.format(new Date(`${weekStart}T00:00:00Z`));
}

export default function EngineerSelectPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Engineer Dashboard
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Select an engineer
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Choose a teammate to view their personal weekly activity snapshot.
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

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {engineerSnapshots.map((snapshot) => {
            const github = snapshot.github;
            const slack = snapshot.slack;
            const encodedEmail = encodeURIComponent(snapshot.employee.email);

            return (
              <Card key={snapshot.employee.email} className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{snapshot.employee.name}</span>
                    <Badge variant="secondary">AI Engineer</Badge>
                  </CardTitle>
                  <CardDescription>{snapshot.employee.email}</CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      Week of {formatWeek(github?.weekStart || slack?.weekStart)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
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
                      <span className="text-muted-foreground">Issues</span>
                      <span className="font-semibold">
                        {github?.issueSummaries?.length ?? "—"}
                      </span>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/engineer/${encodedEmail}`}>
                      Open personal dashboard
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
}
