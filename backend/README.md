# WhatsApp Trades Assistant (UK) - MVP

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 15+

## Environment Variables
Copy `.env.example` to `.env` and set values:

- `DATABASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILLING_ENABLED` (`false` by default)
- `EXPORT_TOKEN_SECRET` (recommended for export link signing)
- `BASE_URL`
- `APP_TZ` (default: `Europe/London`)
- `BACKUP_ENABLED` (`false` by default)
- `BACKUP_DIR` (default: `./backups`)
- `BACKUP_HOUR` (default: `2`)
- `BACKUP_MINUTE` (default: `30`)
- `BACKUP_RETENTION_DAYS` (default: `7`)
- `PG_DUMP_BIN` (default: `pg_dump`)
- `LLM_PROVIDER` (optional)
- `LLM_API_KEY` (optional)
- `LLM_MODEL` (optional, default: `gpt-4o-mini`)
- `AGENT_DEBUG` (`false` by default)
- `AGENT_OBSERVABILITY_ENABLED` (`true` by default)
- `AGENT_RULE_PARSER_ENABLED` (`false` by default)
- `PORT` (default: `3000`)

## Install
```bash
npm install
```

## Run Prisma Migrations
```bash
npm run prisma:migrate -- --name init
```

## Run Development Server
```bash
npm run dev
```

## Build and Run Production
```bash
npm run build
npm run start
```

## Health Check
```bash
curl http://localhost:3000/health
```
Expected response:
```json
{"status":"ok"}
```

## Milestone B (Twilio Webhook)
- Webhook endpoint: `POST /webhook/whatsapp`
- Signature validation: `X-Twilio-Signature` is required and validated.
- Inbound/outbound messages are logged (when sender phone is mapped to an existing user).

### Twilio Sandbox Setup
1. Start app: `npm run dev`
2. Expose local server with a public HTTPS URL (for example, ngrok).
3. In Twilio WhatsApp sandbox, set webhook URL to:
   - `https://<public-host>/webhook/whatsapp`
4. Send `hello` from your WhatsApp sandbox number.
5. Expected reply:
   - `Hello. Assistant is online.`

## Milestone D (Reminders)
- `NEW JOB` with `due` date schedules:
  - due reminder (1 day before)
  - overdue reminder (every 3 days, max 3)
- Morning briefing runs daily at 08:30 (`APP_TZ`) when briefing is enabled.
- Toggle commands:
  - `STOP BRIEFING`
  - `START BRIEFING`

### Quick test (without waiting for 08:30)
Run this in local development:
```bash
curl -X POST http://localhost:3000/internal/test/cron/run \
  -H "Content-Type: application/json" \
  -d '{"forceBriefing": true}'
```

## Milestone E (Summary + Export)
- WhatsApp commands:
  - `Summary last 7 days`
  - `Summary last 30 days`
  - `Export my data`
- Export flow:
  - User receives a 30-minute access link.
  - Access page provides CSV downloads for `jobs`, `customers`, `payments`.

## Milestone F (Subscription - Passive Mode)
- Stripe routes and service stubs exist for future activation.
- Current mode is fully free access with billing disabled:
  - Set `BILLING_ENABLED=false`
  - `Subscribe` command responds with an informational message.

## LLM Fallback (Agent Parsing)
- Optional provider-based fallback parsing is available.
- Supported provider now: `openai`.
- To enable:
  - `LLM_PROVIDER=openai`
  - `LLM_API_KEY=<your_openai_api_key>`
  - `LLM_MODEL=gpt-4o-mini` (or your preferred model)
- To force LLM-first behavior and bypass rule parser:
  - `AGENT_RULE_PARSER_ENABLED=false`
- LLM is used only for parsing/clarification support, not business logic decisions.

## Agent Quality
- Offline eval set:
  - runner: `npm run eval:agent`
  - dataset: `scripts/eval/agent-eval-set.json`
- Structured observability:
  - set `AGENT_OBSERVABILITY_ENABLED=true`
  - JSON events emitted: `agent.parse.result`, `tool.execute`
- Details: `docs/AGENT_QUALITY.md`

## Internal Tool Layer
- Router executes deterministic actions through internal tools (`ToolExecutor`).
- Current tools:
  - create job
  - add payment
  - list active jobs
  - list outstanding
  - find customer records
  - close job
  - summary
  - export link creation
  - briefing toggle

## Milestone G (Hardening)
- In-memory rate limiting:
  - `/webhook/*` (120 req/min per IP)
  - `/export/*` (40 req/min per IP)
- Global not-found and error handlers enabled.
- Daily DB backup support via cron tick (`BACKUP_ENABLED=true`).
- Static pages:
  - `GET /privacy`
  - `GET /terms`
- Deployment runbook:
  - `docs/DEPLOYMENT_RUNBOOK.md`
