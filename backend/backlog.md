# Product Backlog

## EPIC 1 - Core Infrastructure & Multi-Tenant Setup

### Story 1.1 - User Identification via WhatsApp
As a system, I want to identify users by their WhatsApp phone number so that each message maps to the correct account.

**Acceptance Criteria**
- Incoming webhook extracts `from_phone`.
- If phone exists in `users` -> attach to user.
- If not -> trigger onboarding flow.
- Phone is unique constraint in DB.
- All data queries filtered by `user_id`.

### Story 1.2 - Database Schema Setup
As a system, I need core tables to store jobs, customers, payments, reminders so that business tracking works reliably.

**Acceptance Criteria**
- Tables created:
  - `users`
  - `customers`
  - `jobs`
  - `payments`
  - `reminders`
- Constraints:
  - All business tables include `user_id`.
  - Foreign key relationships enforced.
  - Monetary values stored as integer (pence).

### Story 1.3 - Daily Backup
As a system owner, I want automatic daily DB backup so that user data is protected.

**Acceptance Criteria**
- Daily cron backup.
- Backup stored securely.
- Restore tested once manually.

## 📲 EPIC 2 - WhatsApp Integration

### Story 2.1 - Incoming Webhook Handler
As a system, I want to receive WhatsApp messages via webhook so that I can process user commands.

**Acceptance Criteria**
- POST endpoint `/webhook/whatsapp`.
- Validates provider signature.
- Logs inbound message.
- Routes to message processor.

### Story 2.2 - Outgoing Message Sender
As a system, I want to send structured replies so users receive confirmations and reports.

**Acceptance Criteria**
- Send text messages.
- Handle message failures.
- Log outbound messages.
- Retry logic (basic).

## 🧠 EPIC 3 - Intent Parsing & Command Layer

### Story 3.1 - Structured Command Mode
As a user, I want to send structured job entries so the assistant records them accurately.

**Acceptance Criteria**
- Detect `NEW JOB` format.
- Parse key-value pairs.
- Validate required fields.
- Save job.
- Confirm summary.

### Story 3.2 - Free Text Parsing (LLM-assisted)
As a user, I want to send natural messages so I don't need strict formatting.

**Acceptance Criteria**
- LLM converts text -> structured JSON.
- JSON validated against schema.
- If confidence low -> ask clarification.
- No business logic executed by LLM.
- LLM only extracts fields.

### Story 3.3 - Intent Routing
As a system, I want to route messages to correct handlers so each command triggers correct action.

**Supported MVP intents**
- `job_create`
- `job_list`
- `payment_add`
- `job_close`
- `summary_7`
- `summary_30`
- `export_data`
- `who_owes_me`

**Acceptance Criteria**
- Intent detection works.
- Unknown intent returns fallback message.

## 🏗 EPIC 4 - Job Management

### Story 4.1 - Create Job
As a tradesperson, I want to create a new job via WhatsApp so I can track it.

**Acceptance Criteria**
- Required: customer + title + total price.
- Optional: deposit, `due_date`, notes.
- Customer auto-upsert.
- Outstanding calculated.
- Confirmation message sent.

### Story 4.2 - List Active Jobs
As a user, I want to see active jobs so I know what's pending.

**Acceptance Criteria**
- Returns active jobs only.
- Sorted by due date.
- Includes outstanding amount.

### Story 4.3 - Close Job
As a user, I want to mark job completed so it's removed from active list.

**Acceptance Criteria**
- Status changes to completed.
- Confirmation sent.
- Outstanding preserved.

## 💷 EPIC 5 - Payment Tracking

### Story 5.1 - Add Payment
As a user, I want to record payment so outstanding is updated.

**Acceptance Criteria**
- Accepts partial payments.
- Updates outstanding.
- Payment record created.
- Confirmation sent with new balance.

### Story 5.2 - Outstanding Report
As a user, I want to see who owes me money so I can chase payments.

**Acceptance Criteria**
- Lists jobs with outstanding > 0.
- Indicates overdue status.
- Sorted by oldest due date.

## 🔔 EPIC 6 - Reminder Engine

### Story 6.1 - Due Date Reminder
As a system, I want to remind users 1 day before due date so they don't forget jobs.

**Acceptance Criteria**
- Reminder created at job creation.
- Triggered via cron.
- Message sent once.
- Marked as sent.

### Story 6.2 - Overdue Reminder
As a system, I want to notify users of overdue jobs so they chase payments.

**Acceptance Criteria**
- Trigger after `due_date` passes.
- Repeat every 3 days.
- Max 3 reminders per job.

### Story 6.3 - Morning Briefing
As a user, I want a daily summary so I know my situation.

**Acceptance Criteria**
- Message includes:
  - Active job count.
  - Due this week.
  - Overdue count.
  - Outstanding total.
- User can disable with: `STOP BRIEFING`.

## 📊 EPIC 7 - Reporting

### Story 7.1 - 7-Day Summary
As a user, I want a 7-day summary so I understand recent performance.

**Acceptance Criteria**
- Includes:
  - Jobs created.
  - Jobs completed.
  - Revenue total.
  - Payments received.
  - Outstanding.

### Story 7.2 - 30-Day Summary
Same structure as 7-day. Different date range.

## 📁 EPIC 8 - Data Export & Trust

### Story 8.1 - Export Data (CSV)
As a user, I want to export my data so I maintain control.

**Acceptance Criteria**
- Generates CSV for:
  - `jobs`
  - `customers`
  - `payments`
- Secure download link.
- Link expires.

## 💳 EPIC 9 - Subscription System

### Story 9.1 - Trial Handling
As a system, I want new users to have 14-day trial so they can test before paying.

**Acceptance Criteria**
- `trial_start` saved.
- `trial_end` auto-calculated.
- Expired users blocked from job creation.

### Story 9.2 - Stripe Integration
As a user, I want to subscribe securely so I can continue using the assistant.

**Acceptance Criteria**
- Stripe checkout link generated.
- Webhook updates `subscription_status`.
- `past_due` disables job creation.
- Export always allowed.

## 🚫 Explicitly Out of Scope (MVP Guardrail)
- Mobile app.
- Web dashboard.
- Multi-user teams.
- HMRC/tax logic.
- Invoice generator.
- Bank integration.
- Lead capture.
- AI autonomy beyond parsing.

## 🏁 Definition of Done (MVP Complete)
MVP is complete when:
- A new user can onboard via WhatsApp.
- Create 10 jobs successfully.
- Record payments.
- Receive due reminder.
- Run 7/30 summary.
- Export data.
- Subscribe after trial.
