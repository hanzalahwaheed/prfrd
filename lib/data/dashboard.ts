import {
  employeesData,
  githubWeeklyData,
  slackWeeklyData,
} from "@/lib/db/seed-data";

export type Employee = (typeof employeesData)[number];
type GithubWeek = (typeof githubWeeklyData)[number];
type SlackWeek = (typeof slackWeeklyData)[number];

type WeeklyRow = {
  employeeEmail: string;
  weekStart: string;
};

export type EngineerSnapshot = {
  employee: Employee;
  github?: GithubWeek;
  slack?: SlackWeek;
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
