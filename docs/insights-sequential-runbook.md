# Sequential Insight Generation Runbook (Local)

This runbook generates monthly and quarterly insights one employee at a time.

## 1) Apply schema changes

```bash
npm run db:push
```

## 2) Start local API server

```bash
npm run dev
```

Optional model/rate-limit tuning:
- `OPENAI_MODEL=gpt-4o-mini npm run dev`
- `INSIGHT_LLM_MIN_INTERVAL_MS=30000 npm run dev`

The API endpoint used is:
- `POST http://localhost:3000/api/insights/generate-report`

## 3) Generate insights per employee (sequential)

Use a second terminal while the dev server is running.

```bash
curl -sS -X POST http://localhost:3000/api/insights/generate-report \
  -H 'Content-Type: application/json' \
  -d '{"employeeEmail":"alice@company.com","startDate":"2025-10-06","endDate":"2025-12-22"}'

curl -sS -X POST http://localhost:3000/api/insights/generate-report \
  -H 'Content-Type: application/json' \
  -d '{"employeeEmail":"bob@company.com","startDate":"2025-10-06","endDate":"2025-12-22"}'

curl -sS -X POST http://localhost:3000/api/insights/generate-report \
  -H 'Content-Type: application/json' \
  -d '{"employeeEmail":"carol@company.com","startDate":"2025-10-06","endDate":"2025-12-22"}'

curl -sS -X POST http://localhost:3000/api/insights/generate-report \
  -H 'Content-Type: application/json' \
  -d '{"employeeEmail":"dave@company.com","startDate":"2025-10-06","endDate":"2025-12-22"}'

curl -sS -X POST http://localhost:3000/api/insights/generate-report \
  -H 'Content-Type: application/json' \
  -d '{"employeeEmail":"eve@company.com","startDate":"2025-10-06","endDate":"2025-12-22"}'
```

Expected response shape per call:

```json
{
  "status": "success",
  "monthlyGenerated": 3,
  "quarterlyGenerated": 1
}
```

## 4) Verify inserted rows

```bash
node -e "require('dotenv').config({path:'.env.local'}); const {neon}=require('@neondatabase/serverless'); (async()=>{const sql=neon(process.env.DATABASE_URL); const m=await sql`select employee_email, count(*)::int as monthly_count from employee_monthly_insights group by employee_email order by employee_email`; const q=await sql`select employee_email, count(*)::int as quarterly_count from employee_quarterly_insights group by employee_email order by employee_email`; console.log('monthly',m); console.log('quarterly',q);})().catch(e=>{console.error(e); process.exit(1);});"
```

Notes:
- Default behavior (no `startDate`/`endDate`) still uses rolling last 12 weeks.
- This flow is run-once as-is; reruns append additional insight rows.
- Internally, the API now uses one LLM call per month bucket and one LLM call per quarter bucket.
