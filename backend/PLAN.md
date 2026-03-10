# PLAN.md — WhatsApp Trades Assistant (UK) MVP

Owner: Özgür Özbek  
Goal: Build a WhatsApp-first “operations assistant” for UK tradespeople that tracks jobs & payments, sends reminders, and generates summaries — with **no mobile app** and **no dashboard** in MVP.

---

## 0) Product North Star

**Run your trade business from WhatsApp.**  
Users can:
- Create jobs
- Record payments
- Ask “who owes me money?”
- Get reminders (due + overdue)
- Get 7/30 day summaries
- Export their data
- Subscribe via Stripe after a 14-day trial

---

## 1) MVP Scope (Feature Freeze)

### IN SCOPE
1. WhatsApp inbound webhook + outbound replies (Twilio WhatsApp for MVP)
2. User identity = WhatsApp sender phone number
3. Onboarding: business name (required), trade type (optional)
4. Job CRUD (minimal):
   - Create job
   - List active jobs / due this week / last 30 days
   - Close job
   - Update: due_date, price, notes, status
5. Customer minimal:
   - Upsert by phone
   - Search “Find John”
6. Payments:
   - Add payment (deposit/partial)
   - Outstanding calculation
   - Outstanding list “Who owes me money?”
7. Reminders:
   - Due date reminder 1 day before
   - Overdue reminder every 3 days, max 3 sends
   - Morning briefing (08:30) + opt-out
8. Reports:
   - Summary last 7 days
   - Summary last 30 days
9. Export:
   - CSV export (jobs/customers/payments) via time-limited link
10. Subscription:
   - 14-day trial
   - Stripe checkout link
   - Webhook updates subscription status
   - Past due blocks job create/update; export always allowed
11. Ops:
   - Daily DB backup
   - Basic audit log

### OUT OF SCOPE (NOPE for MVP)
- Mobile app, web dashboard, teams/roles
- Tax/HMRC logic, invoicing, Open Banking
- Lead capture / call bot
- Media upload / OCR / PDF parsing
- Autonomous agent behavior (beyond parsing + phrasing)

---

## 2) Architecture (Decisions)

### Stack
- Backend: Node.js + TypeScript + Express
- DB: Postgres
- ORM: Prisma
- Queue/Cron: node-cron (MVP) or BullMQ (optional later)
- Payments: Stripe (subscriptions + webhooks)
- WhatsApp: Twilio WhatsApp (MVP)
- LLM: used **only** for free-text parsing + summary phrasing (never for business logic)
- Hosting: VPS + PM2

### Key Principles
- Deterministic business logic in code
- LLM is a parser/formatter only
- Multi-tenant: every record tied to user_id
- Minimal message spam (cost control + user trust)
- UK timezone default: Europe/London

### Assistant Behavior Layer
- Replies must sound like a virtual admin, not a tool.
- Use contextual awareness (customer name, outstanding, due dates).
- Offer optional actions (e.g., "Want me to draft a reminder?").

---

## 3) Data Model (Prisma Entities)

### Users
- id (uuid)
- phone (unique)
- businessName
- tradeType (nullable)
- timezone (default Europe/London)
- briefingEnabled (bool default true)
- trialEndsAt
- subscriptionStatus (trial|active|past_due|canceled)
- stripeCustomerId (nullable)
- stripeSubscriptionId (nullable)

### Customers
- id
- userId
- name
- phone (nullable but recommended)
- notes (nullable)

Unique constraint: (userId, phone) when phone present

### Jobs
- id
- userId
- customerId (nullable)
- title
- description (nullable)
- scheduledDate (nullable)
- dueDate (nullable)
- priceTotalPence (int)
- depositPence (nullable)  // optional, but payments table is source of truth
- status (active|completed|canceled)
- createdAt

### Payments
- id
- userId
- jobId
- amountPence
- method (cash|bank|card|unknown)
- paidAt
- note (nullable)

### Reminders
- id
- userId
- jobId
- type (due_1d|overdue_3d|morning_briefing|custom)
- remindAt
- sentAt (nullable)
- sendCount (int default 0)
- maxSends (int default 1 or 3)
- lastSentAt (nullable)

### AuditLogs
- id
- userId
- action
- metadataJson
- createdAt

---

## 4) WhatsApp Message Contract

### Incoming (Twilio)
- From (phone)
- Body (text)
- MessageSid

### Outgoing
- Plain text only for MVP

### Commands (user examples)
- `NEW JOB ...` (structured)
- `New job £450 boiler repair John due 20 March deposit £100`
- `John paid 200`
- `Active jobs`
- `Jobs due this week`
- `Who owes me money?`
- `Summary last 7 days`
- `Summary last 30 days`
- `Export my data`
- `STOP BRIEFING` / `START BRIEFING`
- `Subscribe`

---

## 5) Intent & Parsing

### Intent list (MVP)
- onboarding_start
- job_create
- job_list_active
- job_list_due_week
- job_list_last_30
- payment_add
- outstanding_list
- job_close
- summary_7
- summary_30
- export_data
- briefing_toggle
- subscribe

### Parsing strategy
1. Try structured parsing (`NEW JOB` key-value lines)
2. If not matched, attempt rule-based patterns (quick wins)
3. Else, LLM parse to JSON schema
4. If missing required fields or low confidence => ask **one** clarification question
5. Save only after required fields are confirmed

**Never let LLM decide pricing calculations, reminder schedules, or subscription gating.**

---

## 6) Subscription Gating Rules

- trial users: full access until `trialEndsAt`
- active: full access
- past_due/canceled/expired trial:
  - allow: read-only reports + export
  - block: create/update/close jobs, add payments, reminders (sending)

---

## 7) Milestones & Work Breakdown (Engineering Backlog → Implementation Plan)

### Milestone A (Day 1–2): Project scaffolding
- [ ] Repo init, TypeScript setup, linting/formatting
- [ ] Env config (dotenv), config validation
- [ ] Prisma schema + migrations
- [ ] Health check endpoint
- [ ] PM2 ecosystem config (optional for dev)

Acceptance:
- Server runs, connects to DB, migration applied

### Milestone B (Day 3–4): WhatsApp plumbing
- [ ] Twilio webhook endpoint `/webhook/whatsapp`
- [ ] Signature validation
- [ ] Outbound send utility
- [ ] Message logging

Acceptance:
- Send “hello” from WhatsApp, get a reply

### Milestone C (Day 5–7): Core CRUD (Jobs, Customers, Payments)
- [ ] User lookup/create by phone
- [ ] Onboarding flow (business name required)
- [ ] Job create + customer upsert
- [ ] Payment add
- [ ] Outstanding calculation
- [ ] List active jobs + outstanding list

Acceptance:
- Create 10 jobs, add payments, query outstanding

### Milestone D (Day 8–9): Reminders + Morning briefing
- [ ] Reminder creation on job create (due_1d)
- [ ] Overdue reminder schedule logic (every 3 days, max 3)
- [ ] Cron runner (every minute for reminders; daily for briefing)
- [ ] Briefing toggle command

Acceptance:
- Reminders fire correctly in test clock / staging

### Milestone E (Day 10–11): Reports + Export
- [ ] Summary 7 days
- [ ] Summary 30 days
- [ ] CSV export generation
- [ ] Time-limited download link (signed URL or token endpoint)
- [ ] Audit logs for export

Acceptance:
- User can request summary and export from WhatsApp

### Milestone F (Day 12–14): Stripe subscriptions
- [ ] Stripe customer creation
- [ ] Checkout session link generation
- [ ] Webhook handler updates subscription status
- [ ] Trial expiry enforcement
- [ ] Past-due read-only mode

Acceptance:
- Trial → subscribe works end-to-end in Stripe test mode

### Milestone G (Day 15): Hardening & release
- [ ] Rate limiting
- [ ] Error handling + fallback prompts
- [ ] Daily DB backup cron
- [ ] Minimal privacy/terms pages (static)
- [ ] Deployment runbook

Acceptance:
- MVP stable for 2 pilot users

### Milestone H (Agent Layer Integration)
- [ ] Define structured intent JSON schemas (zod)
- [ ] Implement LLM parsing fallback
- [ ] Confidence scoring + clarification flow
- [ ] Confirm-to-write mechanism
- [ ] Reply phrasing layer (assistant tone)
- [ ] Context memory (recent job/customer recall)

Acceptance:
- User can write free-form messages naturally
- System asks clarification when ambiguous
- Replies feel conversational, not mechanical
- No business logic delegated to LLM

---

## 8) Repository Structure (Suggested)

.
├── src
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── db/ (prisma client wrapper)
│   ├── integrations/
│   │   ├── twilio/
│   │   └── stripe/
│   ├── messaging/
│   │   ├── intents/
│   │   ├── parsers/
│   │   ├── router.ts
│   │   └── replies.ts
│   ├── services/
│   │   ├── users.service.ts
│   │   ├── jobs.service.ts
│   │   ├── payments.service.ts
│   │   ├── reminders.service.ts
│   │   ├── reports.service.ts
│   │   └── export.service.ts
│   ├── cron/
│   └── routes/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── scripts/
├── README.md
└── PLAN.md

---

## 9) Environment Variables (MVP)

- DATABASE_URL
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_WHATSAPP_FROM
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- BASE_URL (public)
- APP_TZ=Europe/London
- LLM_PROVIDER (optional)
- LLM_API_KEY (optional)

---

## 10) Testing Strategy (Minimum)

- Unit tests:
  - parsing (structured + free text stub)
  - outstanding calculation
  - reminder scheduling rules
- Integration tests:
  - webhook → intent router → DB side effects
- Manual test scripts:
  - onboarding
  - job create
  - payment add
  - summaries
  - export
  - subscription gating

---

## 11) Definition of Done (MVP)

MVP is done when:
- New user can onboard via WhatsApp
- Can create jobs + add payments
- Can ask “who owes me money?”
- Receives due reminder
- Can get 7/30 day summaries
- Can export CSV
- Trial → Stripe subscription works
- Past due becomes read-only but export still works

---

## 12) Codex Instructions (How to Work)

- Follow PLAN.md strictly; do not add out-of-scope features.
- Prefer deterministic logic over LLM decisions.
- Keep WhatsApp replies short and professional.
- No Turkish comments in code.
- Keep message volume low (cost control).
- Ask user for confirmation when required fields are missing or ambiguous.

End.
