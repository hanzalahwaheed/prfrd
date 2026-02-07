ALTER TABLE "employee_monthly_insights"
ADD COLUMN "data_sufficiency" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "employee_quarterly_insights"
ADD COLUMN "data_sufficiency" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

CREATE TABLE "employee_analysis_context" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_email" varchar(100) NOT NULL,
  "manager_email" varchar(100) NOT NULL,
  "bonus_eligible" boolean DEFAULT false NOT NULL,
  "promotion_eligible" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_analysis_context"
ADD CONSTRAINT "employee_analysis_context_employee_email_employees_email_fk"
FOREIGN KEY ("employee_email")
REFERENCES "public"."employees"("email")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "employee_analysis_context_employee_idx"
ON "employee_analysis_context" USING btree ("employee_email");
--> statement-breakpoint

CREATE TABLE "analysis_run" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_email" varchar(100) NOT NULL,
  "manager_email" varchar(100) NOT NULL,
  "quarter" varchar(7) NOT NULL,
  "status" varchar(16) DEFAULT 'running' NOT NULL,
  "failed_stage" varchar(32),
  "failure_reason" text,
  "request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_catalog" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_sufficiency" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stage_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_run"
ADD CONSTRAINT "analysis_run_employee_email_employees_email_fk"
FOREIGN KEY ("employee_email")
REFERENCES "public"."employees"("email")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "analysis_run_employee_quarter_created_idx"
ON "analysis_run" USING btree ("employee_email","quarter","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "analysis_run_status_created_idx"
ON "analysis_run" USING btree ("status","created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_run_active_employee_quarter_idx"
ON "analysis_run" USING btree ("employee_email","quarter")
WHERE "status" = 'running';
--> statement-breakpoint

CREATE TABLE "analysis_debate_response" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "agent_role" varchar(16) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence_level" varchar(16) NOT NULL,
  "generated_by_model" varchar(64) NOT NULL,
  "model_version" varchar(64) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_debate_response"
ADD CONSTRAINT "analysis_debate_response_run_id_analysis_run_id_fk"
FOREIGN KEY ("run_id")
REFERENCES "public"."analysis_run"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_debate_response_run_agent_idx"
ON "analysis_debate_response" USING btree ("run_id","agent_role");
--> statement-breakpoint

CREATE TABLE "analysis_arbiter_decision" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence_level" varchar(16) NOT NULL,
  "generated_by_model" varchar(64) NOT NULL,
  "model_version" varchar(64) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_arbiter_decision"
ADD CONSTRAINT "analysis_arbiter_decision_run_id_analysis_run_id_fk"
FOREIGN KEY ("run_id")
REFERENCES "public"."analysis_run"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_arbiter_decision_run_idx"
ON "analysis_arbiter_decision" USING btree ("run_id");
--> statement-breakpoint

CREATE TABLE "employee_prompt" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "employee_email" varchar(100) NOT NULL,
  "quarter" varchar(7) NOT NULL,
  "theme" varchar(32) NOT NULL,
  "message" text NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence_level" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_prompt"
ADD CONSTRAINT "employee_prompt_run_id_analysis_run_id_fk"
FOREIGN KEY ("run_id")
REFERENCES "public"."analysis_run"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_prompt"
ADD CONSTRAINT "employee_prompt_employee_email_employees_email_fk"
FOREIGN KEY ("employee_email")
REFERENCES "public"."employees"("email")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "employee_prompt_run_idx"
ON "employee_prompt" USING btree ("run_id");
--> statement-breakpoint

CREATE TABLE "manager_feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "manager_email" varchar(100) NOT NULL,
  "focus_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "suggested_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "do_not_assume" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence_level" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manager_feedback"
ADD CONSTRAINT "manager_feedback_run_id_analysis_run_id_fk"
FOREIGN KEY ("run_id")
REFERENCES "public"."analysis_run"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "manager_feedback_run_idx"
ON "manager_feedback" USING btree ("run_id");
