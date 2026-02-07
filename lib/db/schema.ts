import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
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

export const employeeMonthlyInsights = pgTable("employee_monthly_insights", {
  employeeEmail: varchar("employee_email", { length: 100 })
    .notNull()
    .references(() => employees.email, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  executionInsight: text("execution_insight").notNull(),
  engagementInsight: text("engagement_insight").notNull(),
  collaborationInsight: text("collaboration_insight").notNull(),
  growthInsight: text("growth_insight").notNull(),
  overallSummary: text("overall_summary").notNull(),
  identifiedRisks: jsonb("identified_risks")
    .notNull()
    .default(sql`'[]'::jsonb`),
  identifiedOpportunities: jsonb("identified_opportunities")
    .notNull()
    .default(sql`'[]'::jsonb`),
  supportingSignals: jsonb("supporting_signals")
    .notNull()
    .default(sql`'[]'::jsonb`),
  confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
  generatedByModel: varchar("generated_by_model", { length: 64 }).notNull(),
  modelVersion: varchar("model_version", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const employeeQuarterlyInsights = pgTable(
  "employee_quarterly_insights",
  {
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    quarter: varchar("quarter", { length: 7 }).notNull(),
    trajectorySummary: text("trajectory_summary").notNull(),
    keyStrengths: jsonb("key_strengths").notNull().default(sql`'[]'::jsonb`),
    keyConcerns: jsonb("key_concerns").notNull().default(sql`'[]'::jsonb`),
    burnoutAssessment: text("burnout_assessment").notNull(),
    growthAssessment: text("growth_assessment").notNull(),
    retentionAssessment: text("retention_assessment").notNull(),
    recommendedActions: jsonb("recommended_actions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    evidenceSnapshots: jsonb("evidence_snapshots")
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    generatedByModel: varchar("generated_by_model", { length: 64 }).notNull(),
    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);
