import {
  boolean,
  date,
  index,
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
  dataSufficiency: jsonb("data_sufficiency")
    .notNull()
    .default(sql`'{}'::jsonb`),
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
    dataSufficiency: jsonb("data_sufficiency")
      .notNull()
      .default(sql`'{}'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    generatedByModel: varchar("generated_by_model", { length: 64 }).notNull(),
    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

export const employeeAnalysisContext = pgTable(
  "employee_analysis_context",
  {
    id: serial("id").primaryKey(),
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    managerEmail: varchar("manager_email", { length: 100 }).notNull(),
    bonusEligible: boolean("bonus_eligible").notNull().default(false),
    promotionEligible: boolean("promotion_eligible").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employee_analysis_context_employee_idx").on(table.employeeEmail),
  ]
);

export const analysisRun = pgTable(
  "analysis_run",
  {
    id: serial("id").primaryKey(),
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    managerEmail: varchar("manager_email", { length: 100 }).notNull(),
    quarter: varchar("quarter", { length: 7 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    failedStage: varchar("failed_stage", { length: 32 }),
    failureReason: text("failure_reason"),
    requestPayload: jsonb("request_payload").notNull().default(sql`'{}'::jsonb`),
    evidenceCatalog: jsonb("evidence_catalog")
      .notNull()
      .default(sql`'{}'::jsonb`),
    dataSufficiency: jsonb("data_sufficiency")
      .notNull()
      .default(sql`'{}'::jsonb`),
    stageUsage: jsonb("stage_usage").notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("analysis_run_employee_quarter_created_idx").on(
      table.employeeEmail,
      table.quarter,
      table.createdAt
    ),
    index("analysis_run_status_created_idx").on(table.status, table.createdAt),
  ]
);

export const analysisDebateResponse = pgTable(
  "analysis_debate_response",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => analysisRun.id, { onDelete: "cascade" }),
    agentRole: varchar("agent_role", { length: 16 }).notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    generatedByModel: varchar("generated_by_model", { length: 64 }).notNull(),
    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("analysis_debate_response_run_agent_idx").on(
      table.runId,
      table.agentRole
    ),
  ]
);

export const analysisArbiterDecision = pgTable(
  "analysis_arbiter_decision",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => analysisRun.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    generatedByModel: varchar("generated_by_model", { length: 64 }).notNull(),
    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("analysis_arbiter_decision_run_idx").on(table.runId)]
);

export const employeePrompt = pgTable(
  "employee_prompt",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => analysisRun.id, { onDelete: "cascade" }),
    employeeEmail: varchar("employee_email", { length: 100 })
      .notNull()
      .references(() => employees.email, { onDelete: "cascade" }),
    quarter: varchar("quarter", { length: 7 }).notNull(),
    theme: varchar("theme", { length: 32 }).notNull(),
    message: text("message").notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull().default(sql`'[]'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("employee_prompt_run_idx").on(table.runId)]
);

export const managerFeedback = pgTable(
  "manager_feedback",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => analysisRun.id, { onDelete: "cascade" }),
    managerEmail: varchar("manager_email", { length: 100 }).notNull(),
    focusAreas: jsonb("focus_areas").notNull().default(sql`'[]'::jsonb`),
    suggestedQuestions: jsonb("suggested_questions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    doNotAssume: jsonb("do_not_assume").notNull().default(sql`'[]'::jsonb`),
    evidenceRefs: jsonb("evidence_refs").notNull().default(sql`'[]'::jsonb`),
    confidenceLevel: varchar("confidence_level", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("manager_feedback_run_idx").on(table.runId)]
);
