import Link from "next/link";
import { notFound } from "next/navigation";

import EngineerActivityPanels from "@/components/engineer/engineer-activity-panels";
import { Button } from "@/components/ui/button";
import {
  getEngineerMonthlySummariesByEmail,
  getEngineerSnapshotByEmail,
  getEngineerWeeklyHistoryByEmail,
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

type PageProps = {
  params: Promise<{
    email: string;
  }>;
};

export default async function EngineerDetailPage({ params }: PageProps) {
  const { email } = await params;
  const decodedEmail = decodeURIComponent(email);
  const snapshot = getEngineerSnapshotByEmail(decodedEmail);

  if (!snapshot) {
    return notFound();
  }

  const weeklyHistory = getEngineerWeeklyHistoryByEmail(decodedEmail);
  const monthlySummaries = getEngineerMonthlySummariesByEmail(decodedEmail);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Engineer Dashboard
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {snapshot.employee.name}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Weekly activity cards with monthly reporting actions.
            </p>
            <div className="text-xs text-muted-foreground">
              GitHub week: {formatWeek(latestGithubWeekStart)} · Slack week:{" "}
              {formatWeek(latestSlackWeekStart)}
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </header>

        <section className="mt-8">
          <EngineerActivityPanels
            snapshot={snapshot}
            weeklyHistory={weeklyHistory}
            monthlySummaries={monthlySummaries}
          />
        </section>
      </main>
    </div>
  );
}
