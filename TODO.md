# PRFRD TODO (Feb 12, 2026 -> Mar 12, 2026)

## Objective

Ship a resume-ready agentic performance analytics app with real Vercel AI SDK Agent interfaces and production-quality basics.

## Month Outcomes (Must-Have)

- [ ] Real Vercel AI SDK Agent interfaces are used in runtime code.
- [ ] Manager debate uses live Agent streaming in UI.
- [ ] Dashboard data path is DB-backed (not seed-data-only).
- [ ] Insight generation is idempotent.
- [ ] CI and automated tests are in place.
- [ ] Auth and rate limiting protect write/compute endpoints.
- [ ] Lint/build/test are green with a reproducible demo flow.

## Week 1 (Feb 12-18): Agent Foundations [P0]

- [ ] Implement `ToolLoopAgent`-based debate agent in `/Users/hanzo/prfrd/lib/ai/agents/managerDebateAgent.ts`.
- [ ] Add shared agent helpers in `/Users/hanzo/prfrd/lib/ai/agents/shared.ts`.
- [ ] Add streaming route `/Users/hanzo/prfrd/app/api/agents/manager-debate/route.ts` using `createAgentUIStreamResponse`.
- [ ] Integrate `@ai-sdk/react` in `/Users/hanzo/prfrd/components/manager/manager-debate-chat.tsx`.
- [ ] Remove fake streaming placeholders and render real streamed messages.
- [ ] Preserve persistence to `analysis_debate_response` after stream completion.
- [ ] Acceptance: live demo shows advocate/examiner responses streaming from Agent runtime.

## Week 2 (Feb 19-25): Data Correctness + Idempotency [P0/P1]

- [ ] Replace seed-data dashboard reads in `/Users/hanzo/prfrd/lib/data/dashboard.ts` with DB query services.
- [ ] Add uniqueness constraints for monthly/quarterly insight rows in `/Users/hanzo/prfrd/lib/db/schema.ts`.
- [ ] Add migration file in `/Users/hanzo/prfrd/drizzle/` for those constraints.
- [ ] Update `/Users/hanzo/prfrd/app/api/insights/generate-report/route.ts` to upsert instead of append duplicates.
- [ ] Add generation metadata/version field to track latest artifact provenance.
- [ ] Acceptance: rerunning report for same employee + period updates existing records without duplication.

## Week 3 (Feb 26-Mar 4): Reliability + Security [P0]

- [ ] Add API auth guard for mutation endpoints.
- [ ] Protect first: `/api/insights/generate-report`, `/api/insights/generate-manager-analysis`, `/api/slack/*`, `/api/insights/recheck-stats`.
- [ ] Add rate limiting for expensive AI endpoints.
- [ ] Replace dummy recheck handler in `/Users/hanzo/prfrd/app/api/insights/recheck-stats/route.ts` with real queued/persisted handling.
- [ ] Add unit tests for schema validation and normalization paths.
- [ ] Add integration tests for success/failure API behavior.
- [ ] Add CI workflow for `lint + test + build`.
- [ ] Acceptance: unauthorized requests fail, throttling works, CI passes on clean branch.

## Week 4 (Mar 5-11): Polish + Resume Packaging [P1]

- [ ] Resolve lint warning in `/Users/hanzo/prfrd/components/component-example.tsx`.
- [ ] Make build independent of external font fetch failure in `/Users/hanzo/prfrd/app/layout.tsx`.
- [ ] Add end-to-end demo script in `/Users/hanzo/prfrd/scripts/` for seed -> insights -> manager analysis -> streamed debate.
- [ ] Update `/Users/hanzo/prfrd/README.md` with current architecture and verified commands.
- [ ] Add `/Users/hanzo/prfrd/docs/resume-evidence.md` with 3-5 quantified resume bullets.
- [ ] Capture demo screenshots/GIF for debate stream and manager profile.
- [ ] Acceptance: one-command verified demo path and resume evidence doc are complete.

## Quality Gates (Must Be True by Mar 12, 2026)

- [ ] `npm run lint` returns 0 warnings and 0 errors.
- [ ] `npm run build` succeeds in a clean environment.
- [ ] Test suite passes locally and in CI.
- [ ] Agent flow demonstrates real multi-step behavior (not wrapper-only single call).
- [ ] README setup and demo commands are verified against current code.

## Stretch Goals (If Time Remains)

- [ ] Add telemetry traces per analysis stage.
- [ ] Add background job runner for long analysis requests.
- [ ] Add preview deployment checklist + smoke tests.

## Working Rules

- [ ] Update this file at the end of each work session.
- [ ] Keep unchecked items scoped to <= 1 day each.
- [ ] Add one-line evidence under completed tasks with PR/commit reference.
