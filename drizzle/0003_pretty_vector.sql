CREATE TABLE "analysis_debate_turn" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"round" integer NOT NULL,
	"turn_index" integer NOT NULL,
	"agent_role" varchar(16) NOT NULL,
	"phase" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_by_model" varchar(64) NOT NULL,
	"model_version" varchar(64) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_debate_response" DROP CONSTRAINT "analysis_debate_response_employee_id_employees_id_fk";
--> statement-breakpoint
DROP INDEX "analysis_debate_response_employee_created_idx";--> statement-breakpoint
ALTER TABLE "analysis_debate_turn" ADD CONSTRAINT "analysis_debate_turn_run_id_analysis_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."analysis_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_debate_turn_run_round_role_idx" ON "analysis_debate_turn" USING btree ("run_id","round","turn_index","agent_role");--> statement-breakpoint
CREATE INDEX "analysis_debate_turn_run_idx" ON "analysis_debate_turn" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "analysis_debate_response" DROP COLUMN "employee_id";