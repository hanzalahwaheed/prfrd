import { db, sql } from "./lib/db/config";
import {
  employees,
  githubWeeklyActivity,
  slackWeeklyActivity,
} from "./lib/db/schema";
import {
  employeesData,
  githubWeeklyData,
  slackWeeklyData,
} from "./lib/db/seed-data";

async function seed() {
  console.log("🌱 Seeding GitHub + Slack weekly activity...");

  await sql`
    TRUNCATE slack_weekly_activity, github_weekly_activity, employees
    RESTART IDENTITY CASCADE
  `;

  await db.insert(employees).values(employeesData);
  console.log(`✅ Seeded ${employeesData.length} employees`);

  await db.insert(githubWeeklyActivity).values(githubWeeklyData);
  console.log(
    `✅ Seeded ${githubWeeklyData.length} GitHub weekly activity records`
  );

  await db.insert(slackWeeklyActivity).values(slackWeeklyData);
  console.log(
    `✅ Seeded ${slackWeeklyData.length} Slack weekly activity records`
  );

  console.log("\n🎉 SEED COMPLETE!");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
