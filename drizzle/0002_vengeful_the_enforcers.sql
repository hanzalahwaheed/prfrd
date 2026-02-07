ALTER TABLE "analysis_debate_response" ADD COLUMN "employee_id" integer;--> statement-breakpoint
UPDATE "analysis_debate_response" AS adr
SET "employee_id" = e."id"
FROM "analysis_run" AS ar
JOIN "employees" AS e ON e."email" = ar."employee_email"
WHERE adr."run_id" = ar."id";--> statement-breakpoint
ALTER TABLE "analysis_debate_response" ALTER COLUMN "employee_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_debate_response" ADD CONSTRAINT "analysis_debate_response_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_debate_response_employee_created_idx" ON "analysis_debate_response" USING btree ("employee_id","created_at");
