# PLAN02 - UK Natural Language Vendor Payments and Expenses

## 1) Objective
Enable a tradesperson to log:
- daily paid expenses
- supplier/vendor debt
- supplier/vendor debt payments

Using natural UK-style WhatsApp language (not rigid commands), while keeping strict data integrity and ambiguity checks.
Also allow users to request vendor debt/payment records as PDF via WhatsApp at any time.

---

## 2) Scope (MVP)
- Add vendor debt ledger and transaction history.
- Add daily paid expense recording.
- Parse UK money expressions (`£100`, `100 quid`, `100 pounds`, `100 gbp`).
- Support natural-language intent mapping.
- Enforce identity resolution when vendor/customer name is ambiguous.
- Include records in reporting/export.

Out of scope (later):
- VAT handling
- receipt/image OCR
- multi-currency

---

## 3) Data Model
### 3.1 VendorLedger
- `id`
- `userId`
- `vendorName`
- `balancePence` (open amount owed to that vendor)
- timestamps

Unique/index:
- unique `(userId, vendorName_normalized)` or equivalent safe matching strategy.

### 3.2 MoneyTransaction
- `id`
- `userId`
- `kind`:
  - `expense_paid`
  - `vendor_debt_added`
  - `vendor_payment_made`
- `direction`: `outflow` (MVP all three are outflow in cashflow terms)
- `amountPence`
- `vendorId?`
- `counterpartyName?`
- `note?`
- `occurredAt`
- timestamps

### 3.3 Customer (already present)
- keep existing `balancePence` and current logic.

---

## 4) Business Rules
1. `expense_paid`
- Logs immediate spend.
- Does not affect `VendorLedger.balancePence`.

2. `vendor_debt_added`
- Increases `VendorLedger.balancePence`.
- Adds transaction row.

3. `vendor_payment_made`
- Decreases `VendorLedger.balancePence`.
- Reject if payment exceeds current vendor balance (MVP strict mode).
- Adds transaction row.

4. All write operations must be transactional.

---

## 5) Natural Language Coverage (UK-oriented)
### 5.1 Expense paid
- `paid £85 for paint at Screwfix`
- `spent 40 quid on fittings`
- `bought materials for £120`

### 5.2 Vendor debt added
- `put £200 on account at Selco`
- `owe Toolstation £95`
- `charged £140 at timber yard`

### 5.3 Vendor payment made
- `paid £100 to Selco`
- `settled £50 with Toolstation`
- `paid off £80 to Y Market`

Parser/LLM should tolerate misspellings and shorthand.

---

## 6) Intent Layer Changes
Add intents:
- `expense_add`
- `vendor_debt_add`
- `vendor_payment_add`
- `vendor_summary` (optional MVP+, but recommended)

Each intent must include normalized amount in pence and resolved vendor/counterparty text.

---

## 7) Ambiguity & Safety (Centralized Resolver)
Create one shared resolver for vendor names (same principle as customer resolver):
- no match -> `Vendor not found` (for payment/debt follow-up where existing vendor expected)
- single match -> proceed
- multiple matches -> store pending disambiguation and ask for confirmation

No write action proceeds without exact target resolution.

---

## 8) Service Layer
Add `vendor-payments.service.ts`:
- `addExpensePaid(...)`
- `addVendorDebt(...)`
- `addVendorPayment(...)`
- `getVendorSummary(...)`
- `getCashflowSummary(...)` (daily/weekly/monthly totals)

All write methods:
- validate amount
- resolve vendor (if needed)
- write transaction
- update ledger (if needed)
- return user-facing summary payload

---

## 9) Router Integration
In `executeIntent`:
- map new intents to service methods
- return short WhatsApp replies:
  - `Expense logged: £X for ...`
  - `Debt added: £X to ... | Vendor balance: £Y`
  - `Payment recorded: £X to ... | Remaining vendor balance: £Y`

Use existing pending disambiguation flow for multi-match selection.

---

## 10) Reporting & Export
Extend export:
- CSV:
  - `vendor_ledgers.csv`
  - `money_transactions.csv`
- PDF:
  - add `Suppliers & Expenses` section
  - add dedicated vendor debt/payment report output (same direct WhatsApp PDF delivery pattern as current customer exports)

Include:
- total outflow (period)
- vendor outstanding total
- recent vendor payments
- vendor debt additions

### 10.1 PDF Request Intents (Vendor Side)
Support natural-language requests such as:
- `send my supplier payments as pdf`
- `export my vendor debts pdf`
- `show expenses pdf`
- `send Selco payments pdf`

Behavior:
- all-records request -> full supplier/expense PDF
- named vendor request -> vendor-specific PDF
- ambiguous vendor name -> require disambiguation before PDF generation

---

## 11) Tests
### Core cases
- expense add success
- debt add success
- payment add success
- payment over-balance rejected
- ambiguous vendor requires selection
- no vendor found path
- UK amount variants parse correctly

### Regression
- existing customer/job/payment flows unaffected
- current export endpoints still valid

---

## 12) Rollout Steps
1. Prisma schema + migration
2. Service implementation
3. Intent schema + parser + LLM prompt updates
4. Router wiring + ambiguity pending flow
5. Export/report updates
6. Build/lint + scenario tests
7. Final pass on UK phrasing quality