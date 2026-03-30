# Backend

Express + Prisma API for TradesApp.

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 15+

## Environment
Copy `.env.example` to `.env` and set the values you need for your environment.

Core variables:
- `DATABASE_URL`
- `BASE_URL`
- `PORT`

Optional integrations:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM`
- `TWILIO_WHATSAPP_FROM`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LLM_PROVIDER`
- `LLM_API_KEY`
- `LLM_MODEL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Operational flags:
- `BILLING_ENABLED`
- `EXPORT_TOKEN_SECRET`
- `APP_TZ`
- `BACKUP_ENABLED`
- `BACKUP_DIR`
- `BACKUP_HOUR`
- `BACKUP_MINUTE`
- `BACKUP_RETENTION_DAYS`
- `PG_DUMP_BIN`
- `AGENT_DEBUG`
- `AGENT_OBSERVABILITY_ENABLED`
- `AGENT_RULE_PARSER_ENABLED`

## Development
```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

## Production
```bash
npm run build
npm run start
```

## Health Check
```bash
curl http://localhost:3000/health
```
