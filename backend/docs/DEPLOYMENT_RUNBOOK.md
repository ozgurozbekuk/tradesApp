# Deployment Runbook

## Prerequisites
- Node.js 20+
- PostgreSQL access
- Twilio WhatsApp sandbox or sender
- Public HTTPS endpoint (reverse proxy or tunnel)
- `pg_dump` available on host

## Environment
Set required env vars:
- `DATABASE_URL`
- `BASE_URL`
- `APP_TZ`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `EXPORT_TOKEN_SECRET`
- `BILLING_ENABLED=false` (current mode)

Optional backup vars:
- `BACKUP_ENABLED=true`
- `BACKUP_DIR=./backups`
- `BACKUP_HOUR=2`
- `BACKUP_MINUTE=30`
- `BACKUP_RETENTION_DAYS=7`
- `PG_DUMP_BIN=pg_dump`

## Deploy steps
1. Install dependencies: `npm install`
2. Generate prisma client: `npm run prisma:generate`
3. Run migrations: `npm run prisma:migrate -- --name init`
4. Build app: `npm run build`
5. Start app: `npm run start`

## Post-deploy checks
1. Health: `GET /health`
2. Terms pages: `GET /privacy`, `GET /terms`
3. WhatsApp webhook receives and replies
4. Cron tick running (reminders and backup)

## Rollback
1. Stop current process
2. Restore previous build artifact
3. Restart app
4. If needed, restore DB from latest backup dump
