import {
  employeesData,
  githubWeeklyData,
  slackWeeklyData,
} from "@/lib/db/seed-data";

export type Employee = (typeof employeesData)[number];
export type GithubWeek = (typeof githubWeeklyData)[number];
export type SlackWeek = (typeof slackWeeklyData)[number];

type WeeklyRow = {
  employeeEmail: string;
  weekStart: string;
};

export type EngineerSnapshot = {
  employee: Employee;
  github?: GithubWeek;
  slack?: SlackWeek;
};

export type EngineerWeeklyHistory = {
  weekStart: string;
  github?: GithubWeek;
  slack?: SlackWeek;
};

export type EngineerMonthlySummary = {
  monthKey: string;
  weekCount: number;
  prsMerged: number;
  prReviews: number;
  issuesRaised: number;
  messageCount: number;
  replies: number;
  corePrHighlights: number;
  blockingThemes: number;
  avgGithubAfterHours?: number;
  avgSlackAfterHours?: number;
  avgSlackWeekend?: number;
};

function getLatestWeekStart<T extends { weekStart: string }>(data: T[]) {
  return data.reduce((latest, row) => {
    if (!latest) return row.weekStart;
    return row.weekStart > latest ? row.weekStart : latest;
  }, "");
}

function getLatestByEmail<T extends WeeklyRow>(data: T[], email: string) {
  return data.reduce<T | undefined>((latest, row) => {
    if (row.employeeEmail !== email) {
      return latest;
    }
    if (!latest || row.weekStart > latest.weekStart) {
      return row;
    }
    return latest;
  }, undefined);
}

function getByEmail<T extends WeeklyRow>(data: T[], email: string) {
  return data
    .filter((row) => row.employeeEmail === email)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export const latestGithubWeekStart = getLatestWeekStart(githubWeeklyData);
export const latestSlackWeekStart = getLatestWeekStart(slackWeeklyData);

export const employees = [...employeesData];

export const engineerSnapshots: EngineerSnapshot[] = employeesData.map(
  (employee) => ({
    employee,
    github: getLatestByEmail(githubWeeklyData, employee.email),
    slack: getLatestByEmail(slackWeeklyData, employee.email),
  })
);

export function getEmployeeByEmail(email: string) {
  return employeesData.find((employee) => employee.email === email);
}

export function getEngineerSnapshotByEmail(email: string) {
  return engineerSnapshots.find((snapshot) => snapshot.employee.email === email);
}

export function getEngineerWeeklyHistoryByEmail(
  email: string
): EngineerWeeklyHistory[] {
  const githubRows = getByEmail(githubWeeklyData, email);
  const slackRows = getByEmail(slackWeeklyData, email);
  const byWeek = new Map<string, EngineerWeeklyHistory>();

  for (const row of githubRows) {
    const current = byWeek.get(row.weekStart) ?? {
      weekStart: row.weekStart,
    };
    current.github = row;
    byWeek.set(row.weekStart, current);
  }

  for (const row of slackRows) {
    const current = byWeek.get(row.weekStart) ?? {
      weekStart: row.weekStart,
    };
    current.slack = row;
    byWeek.set(row.weekStart, current);
  }

  return Array.from(byWeek.values()).sort((a, b) =>
    b.weekStart.localeCompare(a.weekStart)
  );
}

export function getEngineerMonthlySummariesByEmail(
  email: string
): EngineerMonthlySummary[] {
  const weeklyHistory = getEngineerWeeklyHistoryByEmail(email);
  const summaryByMonth = new Map<
    string,
    {
      weekStarts: Set<string>;
      githubRows: GithubWeek[];
      slackRows: SlackWeek[];
    }
  >();

  for (const week of weeklyHistory) {
    const monthKey = week.weekStart.slice(0, 7);
    const monthSummary = summaryByMonth.get(monthKey) ?? {
      weekStarts: new Set<string>(),
      githubRows: [],
      slackRows: [],
    };

    monthSummary.weekStarts.add(week.weekStart);
    if (week.github) {
      monthSummary.githubRows.push(week.github);
    }
    if (week.slack) {
      monthSummary.slackRows.push(week.slack);
    }

    summaryByMonth.set(monthKey, monthSummary);
  }

  return Array.from(summaryByMonth.entries())
    .map(([monthKey, monthSummary]) => ({
      monthKey,
      weekCount: monthSummary.weekStarts.size,
      prsMerged: monthSummary.githubRows.reduce(
        (sum, row) => sum + row.prsMerged,
        0
      ),
      prReviews: monthSummary.githubRows.reduce(
        (sum, row) => sum + row.prReviewsGiven,
        0
      ),
      issuesRaised: monthSummary.githubRows.reduce(
        (sum, row) => sum + row.issueSummaries.length,
        0
      ),
      messageCount: monthSummary.slackRows.reduce(
        (sum, row) => sum + row.messageCount,
        0
      ),
      replies: monthSummary.slackRows.reduce((sum, row) => sum + row.replyCount, 0),
      corePrHighlights: monthSummary.githubRows.reduce(
        (sum, row) =>
          sum +
          row.pullRequestSummaries.filter((summary) => summary.impact === "core")
            .length,
        0
      ),
      blockingThemes: monthSummary.slackRows.reduce(
        (sum, row) =>
          sum +
          row.messageSummaries.filter((summary) => summary.intent === "blocking")
            .length,
        0
      ),
      avgGithubAfterHours: average(
        monthSummary.githubRows.map((row) => row.afterHoursRatio)
      ),
      avgSlackAfterHours: average(
        monthSummary.slackRows.map((row) => row.afterHoursRatio)
      ),
      avgSlackWeekend: average(
        monthSummary.slackRows.map((row) => row.weekendRatio)
      ),
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
