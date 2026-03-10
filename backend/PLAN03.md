# PLAN03 - Web Onboarding, Auth, Dashboard, and WhatsApp Activation

## 1) Objective
Build a web product layer with:
- Landing page
- Register/Login
- Dashboard
- WhatsApp-ready onboarding

Goal: A user registers on web with Clerk, then completes business profile (phone + company data), then activates WhatsApp bot via Twilio sandbox join step (code + QR/deep-link), so agent usage is tied to a verified account.

---

## 2) Scope (MVP)
- Public landing page (marketing + CTA)
- Auth pages:
  - register
  - login
  - logout
- Clerk-based auth flow (hosted SignUp/SignIn)
- User record creation after authenticated profile completion
- WhatsApp activation screen after verification:
  - show Twilio sandbox join code
  - show QR/deep-link that opens WhatsApp with prefilled join message
- Basic dashboard for authenticated users:
  - account status
  - WhatsApp activation status
  - quick KPIs

Out of scope (later):
- social login
- team/multi-user access
- custom branded invoice templates
- production WhatsApp sender onboarding (non-sandbox)

---

## 3) Product Flow (End-to-End)
1. User opens landing page and clicks `Get started`.
2. User signs up/logs in with Clerk.
3. User completes business profile form (phone + business info) in dashboard.
4. Backend links `clerkUserId` with local `User` record in DB.
5. After profile save, user sees `WhatsApp activation` step:
6. Activation step shows:
- sandbox WhatsApp number
- join code text (e.g. `join <code>`)
- QR/deep-link: `https://wa.me/<sandbox_number>?text=join%20<code>`
7. User sends join message in WhatsApp.
8. From this point, the same phone can use the agent webhook.
9. User can log in to dashboard and see status + data summaries.

---

## 4) Data Model Changes
## 4.1 User additions
- `clerkUserId` (nullable unique during migration, required post rollout)
- `phoneVerifiedAt` (DateTime?, set when profile is linked/verified)
- `whatsappActivatedAt` (DateTime?)
- `authStatus` enum (optional MVP+), or derive from fields

## 4.2 No local password/session model in MVP
- Auth/session managed by Clerk.
- Backend trusts Clerk JWT/session for protected API calls.

---

## 5) Security and Auth Rules
1. Protected routes require valid Clerk auth context.
2. `clerkUserId` must map to exactly one local user.
3. Phone uniqueness must remain enforced for WhatsApp identity.
6. Only verified phones can be linked to WhatsApp bot access.

---

## 6) Twilio Integration Plan
## 6.1 Auth source
Use Clerk for signup/login/session.

## 6.2 WhatsApp sandbox activation UX
After profile save, backend provides activation payload:
- `sandboxNumber`
- `joinCode`
- `joinText`
- `qrPayload` (wa.me deep link)

UI actions:
- copy code button
- open WhatsApp button
- render QR from `qrPayload`

## 6.3 Activation confirmation
MVP options:
- passive: show instructions and trust user completion
- better: mark `whatsappActivatedAt` when first inbound webhook arrives from same verified phone

Use better option in implementation.

---

## 7) Backend API Plan
## 7.1 Clerk-protected API
- `GET /api/account/me`
- `POST /api/account/profile`
  - input: phone, businessName (+ optional address/phone/iban)
  - links/creates local `User` by `clerkUserId`
- `GET /api/account/activation`

## 7.2 Protected
- `GET /dashboard/summary`
  - jobs count
  - outstanding total
  - overdue count
  - invoice count (or pending count)
- `GET /dashboard/whatsapp-status`
  - verified phone
  - whatsapp activated yes/no
  - activation instructions payload (if not activated)

## 7.3 Webhook tie-in
In existing WhatsApp webhook flow:
- on inbound message, if sender phone matches verified user and `whatsappActivatedAt` is null, set it once.

---

## 8) Frontend Plan
## 8.1 Landing page
Sections:
- hero
- value bullets
- WhatsApp-first workflow visual
- CTA to register/login

## 8.2 Register flow
Step 1: form (phone, password, business name)
Step 2: OTP input
Step 3: WhatsApp activation card (code + QR + deep link)

## 8.3 Login flow
- phone + password
- redirect to dashboard

## 8.4 Dashboard
Cards:
- today jobs / outstanding / overdue
- WhatsApp connection status
- quick actions (open WhatsApp, export PDF, summaries)

---

## 9) Error Handling UX
- invalid OTP
- OTP expired
- too many attempts
- phone already registered
- Twilio send failure
- sandbox activation not completed yet

All errors should return clear recovery action.

---

## 10) Implementation Order
1. Prisma schema + migrations (`clerkUserId` + profile fields)
2. Clerk middleware integration on backend
3. Protected account/profile/dashboard endpoints
4. Webhook activation marker (`whatsappActivatedAt`)
5. Frontend Clerk integration (SignUp/SignIn, protected dashboard)
6. Profile completion + activation UI
7. QA scenarios and hardening

---

## 11) QA Checklist
- register start sends OTP
- correct OTP creates user + session
- wrong OTP rejected
- login works only with verified account
- dashboard protected route blocks anonymous users
- activation payload shows code + QR/deep-link
- first WhatsApp inbound marks `whatsappActivatedAt`
- existing agent flows still work

---

## 12) Rollout Notes
- Keep current WhatsApp-first onboarding backward compatible during transition.
- Feature-flag web auth rollout if needed.
- For production, replace sandbox join UX with approved WhatsApp sender onboarding.
