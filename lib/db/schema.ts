import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const githubWeeklyActivity = pgTable(
  "github_weekly_activity",
  {
    id: serial("id").primaryKey(),
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    pullRequestSummaries: jsonb("pull_request_summaries")
      .notNull()
      .default(sql`'[]'::jsonb`),
    issueSummaries: jsonb("issue_summaries").notNull().default(sql`'[]'::jsonb`),
    prsMerged: integer("prs_merged").notNull().default(0),
    prReviewsGiven: integer("pr_reviews_given").notNull().default(0),
    afterHoursRatio: numeric("after_hours_ratio", {
      precision: 4,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0.00),
    weekendRatio: numeric("weekend_ratio", {
      precision: 4,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0.00),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("github_weekly_employee_idx").on(
      table.employeeEmail,
      table.weekStart
    ),
  ]
);

export const slackWeeklyActivity = pgTable(
  "slack_weekly_activity",
  {
    id: serial("id").primaryKey(),
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    messageSummaries: jsonb("message_summaries")
      .notNull()
      .default(sql`'[]'::jsonb`),
    messageCount: integer("message_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    reactionsReceived: integer("reactions_received").notNull().default(0),
    afterHoursRatio: numeric("after_hours_ratio", {
      precision: 4,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0.00),
    weekendRatio: numeric("weekend_ratio", {
      precision: 4,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0.00),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("slack_weekly_employee_idx").on(
      table.employeeEmail,
      table.weekStart
    ),
  ]
);
