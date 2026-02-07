import { db } from "./lib/db/config";
import {
  employeeAnalysisContext,
  employees,
  githubWeeklyActivity,
  slackWeeklyActivity,
} from "./lib/db/schema";
import {
  employeeAnalysisContextData,
  employeesData,
  githubWeeklyData,
  slackWeeklyData,
} from "./lib/db/seed-data";

const eveEmail = "eve@company.com";

async function seedEve() {
  console.log("🌱 Seeding Eve (append-only)...");

  const eveEmployees = employeesData.filter((employee) => employee.email === eveEmail);
  const eveAnalysisContext = employeeAnalysisContextData.filter(
    (row) => row.employeeEmail === eveEmail
  );
  const eveGithub = githubWeeklyData.filter((row) => row.employeeEmail === eveEmail);
  const eveSlack = slackWeeklyData.filter((row) => row.employeeEmail === eveEmail);

  if (eveEmployees.length === 0) {
    throw new Error("Eve not found in employeesData");
  }

  await db
    .insert(employees)
    .values(eveEmployees)
    .onConflictDoNothing({ target: employees.email });
  console.log(`✅ Seeded employees for ${eveEmail}`);

  if (eveAnalysisContext.length > 0) {
    await db
      .insert(employeeAnalysisContext)
      .values(eveAnalysisContext)
      .onConflictDoUpdate({
        target: employeeAnalysisContext.employeeEmail,
        set: {
          managerEmail: eveAnalysisContext[0].managerEmail,
          bonusEligible: eveAnalysisContext[0].bonusEligible,
          promotionEligible: eveAnalysisContext[0].promotionEligible,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`✅ Seeded analysis context for ${eveEmail}`);

  await db
    .insert(githubWeeklyActivity)
    .values(eveGithub)
    .onConflictDoNothing({
      target: [githubWeeklyActivity.employeeEmail, githubWeeklyActivity.weekStart],
    });
  console.log(`✅ Seeded ${eveGithub.length} GitHub weekly rows for ${eveEmail}`);

  await db
    .insert(slackWeeklyActivity)
    .values(eveSlack)
    .onConflictDoNothing({
      target: [slackWeeklyActivity.employeeEmail, slackWeeklyActivity.weekStart],
    });
  console.log(`✅ Seeded ${eveSlack.length} Slack weekly rows for ${eveEmail}`);

  console.log("\n🎉 EVE SEED COMPLETE!");
}

seedEve().catch((error) => {
  console.error(error);
  process.exit(1);
});
