CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "github_weekly_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_email" varchar(100) NOT NULL,
	"week_start" date NOT NULL,
	"pull_request_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issue_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prs_merged" integer DEFAULT 0 NOT NULL,
	"pr_reviews_given" integer DEFAULT 0 NOT NULL,
	"after_hours_ratio" numeric(4, 2) DEFAULT '0.00' NOT NULL,
	"weekend_ratio" numeric(4, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_weekly_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_email" varchar(100) NOT NULL,
	"week_start" date NOT NULL,
	"message_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"reactions_received" integer DEFAULT 0 NOT NULL,
	"after_hours_ratio" numeric(4, 2) DEFAULT '0.00' NOT NULL,
	"weekend_ratio" numeric(4, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_weekly_activity" ADD CONSTRAINT "github_weekly_activity_employee_email_employees_email_fk" FOREIGN KEY ("employee_email") REFERENCES "public"."employees"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_weekly_activity" ADD CONSTRAINT "slack_weekly_activity_employee_email_employees_email_fk" FOREIGN KEY ("employee_email") REFERENCES "public"."employees"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_weekly_employee_idx" ON "github_weekly_activity" USING btree ("employee_email","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_weekly_employee_idx" ON "slack_weekly_activity" USING btree ("employee_email","week_start");