import { notFound } from "next/navigation";

import EngineerActivityPanels from "@/components/engineer/engineer-activity-panels";
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
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="border-b border-border/60 pb-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Engineer Dashboard
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {snapshot.employee.name}
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:gap-10">
              <div className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Latest GitHub week
                </div>
                <div className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {formatWeek(latestGithubWeekStart)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Latest Slack week
                </div>
                <div className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {formatWeek(latestSlackWeekStart)}
                </div>
              </div>
            </div>
          </div>
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
