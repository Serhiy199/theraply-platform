# Phase 14.1 Test Strategy & Scope Map

## Goal

Build a practical test plan for the Theraply MVP before adding the actual test runner and test suites.

This slice is intentionally documentation-only. It defines what must be covered, which test level fits each flow, which external systems must be mocked, and which manual checks remain necessary.

## Current Baseline

| Area | Current state | Notes |
| --- | --- | --- |
| Test runner | Missing | `package.json` has verification scripts, but no `test` script or committed Vitest/Jest/Playwright config. |
| Verification scripts | Partial | Existing scripts cover Stripe Phase 10, email records, therapist onboarding, cron booking rules, and security static checks. |
| E2E tooling | Missing | `package-lock.json` references Playwright metadata, but the project does not currently expose a Playwright script/config. |
| Test database strategy | Missing | Automated tests must not mutate the production/remote Vercel database. |
| External provider mocks | Missing | Stripe, Google Calendar, Cloudinary, SMTP/Nodemailer, and cron clock behavior need deterministic test doubles. |

## Test Levels

| Level | Purpose | Good targets | Should avoid |
| --- | --- | --- | --- |
| Unit | Fast checks for pure business rules and validation. | Zod schemas, permission helpers, rate limit logic, safe error mapping, email templates, cron candidate rules. | Real database, network, provider SDK calls. |
| Integration | Verify service behavior with a controlled test database and mocked providers. | Booking lifecycle, payment reconciliation, therapist onboarding review, certificate metadata persistence, audit/email log writes. | Live Stripe/Google/Cloudinary/SMTP calls. |
| E2E | Verify real user journeys through the Next.js UI. | Registration, email verification, login, onboarding, admin approve/reject, booking, payment handoff, cancellation, access control. | Deep provider behavior; use mocked callbacks where possible. |
| Manual QA | Confirm production-like integrations and provider dashboards. | Real SMTP delivery, real Google OAuth consent, real Stripe webhook delivery, Cloudinary upload, Vercel cron trigger. | Repeating coverage that automated tests can own. |

## Priority Legend

- P0: must pass before MVP handoff or production-like testing.
- P1: should be automated before the product is actively used by real clients.
- P2: useful hardening and regression coverage after the core flows are stable.

## Scope Map

### Auth And Account Lifecycle

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Client registration creates user/profile and verification token | P0 | Integration + E2E | Test DB, SMTP mocked | User exists, role is `CLIENT`, email is unverified, verification email is logged. |
| Therapist registration creates locked therapist profile | P0 | Integration + E2E | Test DB, SMTP mocked | User exists, role is `THERAPIST`, active features are locked until verification and approval. |
| Email verification first click | P0 | Integration + E2E | Test DB, fixed token clock | User email becomes verified, token is consumed, redirect target is role-appropriate. |
| Email verification repeated click | P0 | Integration + E2E | Test DB | Friendly `already verified` state, no crash, continue goes to the correct workspace. |
| Invalid/expired verification link | P0 | Integration + E2E | Test DB, fixed clock | Friendly invalid/expired state, resend path is available. |
| Login with valid/invalid credentials | P0 | Integration + E2E | Test DB | Valid user enters correct dashboard, invalid login shows safe message. |
| Forgot/reset password | P1 | Integration + E2E | Test DB, SMTP mocked | Reset token is issued, password changes only with valid token, old password no longer works. |
| Auth endpoint rate limiting | P1 | Unit + Integration | Rate limit store reset helper | Repeated attempts return friendly throttle messages and do not leak raw errors. |

### Role And Access Control

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Client cannot access therapist/admin pages | P0 | E2E | Seeded users | Client is redirected/blocked and sees no privileged data. |
| Therapist cannot access client/admin pages | P0 | E2E | Seeded users | Therapist is redirected/blocked and sees no privileged data. |
| Non-admin cannot submit admin actions | P0 | Integration + E2E | Test DB | Server action rejects even if UI is bypassed. |
| Client cannot open another client's booking/payment | P0 | Integration + E2E | Test DB | Data is not returned, mutation is rejected. |
| Therapist cannot open another therapist's request/session/client data | P0 | Integration + E2E | Test DB | Data is not returned, mutation is rejected. |
| Unapproved therapist active features remain locked | P0 | Integration + E2E | Test DB | Requests, clients, payout, and calendar actions are blocked server-side. |

### Therapist Onboarding And Admin Review

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Verified therapist sees Wix-compatible onboarding form | P0 | E2E | Seeded verified therapist | Form contains readonly name/email and all required Wix-compatible fields. |
| Save draft accepts incomplete data | P0 | Integration + E2E | Test DB | Draft persists, reload restores values, status remains editable. |
| Submit incomplete form returns field errors | P0 | Integration + E2E | Test DB | Missing required fields are shown beside fields, no raw errors. |
| Submit complete form moves to `PENDING_REVIEW` | P0 | Integration + E2E | Test DB, SMTP mocked | Profile fields are persisted, legacy fallbacks are populated, email/audit logs are written. |
| Admin can view pending therapist details | P0 | Integration + E2E | Test DB | Admin sees User fields, profile fields, draft comparison, and certificates list. |
| Admin reject returns therapist to editable form | P0 | Integration + E2E | Test DB, SMTP mocked | Rejection reason is visible, previous values remain editable, audit/email logs exist. |
| Therapist resubmit after rejection | P0 | Integration + E2E | Test DB, SMTP mocked | Status returns to `PENDING_REVIEW`, draft/profile updates are consistent. |
| Admin approve unlocks therapist features | P0 | Integration + E2E | Test DB, SMTP mocked | Status is `APPROVED`, `isApproved=true`, dashboard/features open. |
| Certificate upload validates type and size | P1 | Integration + E2E | Cloudinary mocked | Invalid type/oversize rejected; valid metadata is stored. |
| Certificate links visible to admin only | P1 | Integration + E2E | Test DB | Admin sees files; client booking flow does not expose certificates. |

### Client Booking Flow

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Approved therapist appears in client booking | P0 | Integration + E2E | Test DB | Only verified, approved, active, onboarding-complete therapists are shown. |
| Rejected/pending/suspended therapists are hidden | P0 | Integration + E2E | Test DB | Non-bookable therapists never appear in client booking results. |
| Therapist card uses profile fallbacks correctly | P1 | Unit + Integration + E2E | Test DB | Name uses `displayName`; specialisation uses `specialisation ?? specialization`; summary uses `bio ?? therapyServicesProvided`. |
| Client creates booking request | P0 | Integration + E2E | Test DB, Google mocked, SMTP mocked | Booking is created with pending status, ownership is correct, email/audit logs are written. |
| Slot conflict prevention | P0 | Integration | Test DB, fixed time | Duplicate or overlapping booking is rejected deterministically. |
| Therapist confirms booking | P0 | Integration + E2E | Test DB, Google mocked, SMTP mocked | Booking/session status updates, meeting link/event behavior is correct, email/audit logs are written. |
| Therapist rejects booking | P0 | Integration + E2E | Test DB, SMTP mocked | Booking becomes rejected, client notification is logged, audit exists. |
| Client cancels booking/session | P0 | Integration + E2E | Test DB, Google mocked, Stripe mocked, SMTP mocked | Booking/session cancellation rules apply, refund/credit logic is consistent, audit/email logs exist. |
| Therapist/admin cancellation | P1 | Integration + E2E | Test DB, Google mocked, Stripe mocked | Correct permissions, best-effort provider handling where defined, audit/email logs exist. |

### Payments And Stripe

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Checkout creation for confirmed booking | P0 | Integration + E2E | Stripe mocked | Client-owned booking gets checkout session; duplicate invalid states are rejected. |
| Checkout cannot be created for another client's booking | P0 | Integration | Test DB, Stripe mocked | Request is rejected server-side. |
| Stripe success webhook | P0 | Integration | Stripe signature/helper mocked | Payment becomes paid, booking/session state remains valid, success email/audit logs exist. |
| Stripe failed/expired payment | P0 | Integration | Stripe mocked | Payment becomes failed/expired, failed email/audit logs exist. |
| Webhook does not resurrect cancelled booking | P0 | Integration | Test DB, Stripe mocked | `AUTO_CANCELLED`/cancelled bookings do not return to confirmed after late success. |
| Invalid webhook signature | P0 | Integration/API | Raw route request | Returns `400`, no raw provider error leak. |
| Refund/credit paths | P1 | Integration | Stripe mocked | Financial records, audit logs, and user-facing states are consistent. |
| `pricePerHour` is not used for Stripe charges | P0 | Unit + Integration | Test DB | Payment flow uses technical session price fields only. |

### Google Calendar

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Therapist OAuth connect success | P1 | Integration + E2E/manual | Google mocked for automated; real Google manual | Connection metadata persists, audit logs exist, duplicate calendar id is rejected. |
| OAuth callback state mismatch | P0 | Integration/API | Mock request | Request is rejected safely and audited/logged. |
| Target calendar selection | P1 | Integration + E2E | Google mocked | Only writable calendars owned by the connected account can be selected. |
| Event creation on booking confirmation | P1 | Integration | Google mocked | Event/meeting metadata persists without breaking booking status. |
| Event delete on cancellation | P1 | Integration | Google mocked | Manual flow follows current strict/best-effort behavior; cron remains best-effort. |
| Calendar provider failure | P1 | Integration | Google mocked to throw | User sees friendly message; diagnostic logs are sanitized. |

### Cron And Time Rules

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Unpaid confirmed booking after `paymentDueBy` | P0 | Integration + script | Test DB, fixed clock, SMTP mocked | Booking/session auto-cancel, email/audit logs exist. |
| Unpaid confirmed booking less than 24h before session | P0 | Integration + script | Test DB, fixed clock | Booking/session auto-cancel. |
| Paid booking is untouched | P0 | Integration + script | Test DB | No mutation occurs. |
| Final booking states are untouched | P0 | Integration + script | Test DB | Cancelled/rejected/completed records are idempotently skipped. |
| Cron endpoint protection | P0 | API + manual | `CRON_SECRET` | Missing/wrong token rejected, correct token returns dry-run summary. |
| Cron idempotency | P0 | Integration | Test DB | Repeated run does not duplicate emails or repeat final mutations. |

### Email, Audit, Monitoring

| Scenario | Priority | Test level | Dependencies / mocks | Pass criteria |
| --- | --- | --- | --- | --- |
| Transactional templates render text and HTML | P1 | Unit | No provider | All required variables are present, text fallback exists. |
| Email send failure does not break core flows | P0 | Integration | SMTP mocked to fail | Main booking/payment/onboarding mutation succeeds; EmailLog stores failed status. |
| EmailLog sent/failed persistence | P0 | Integration | SMTP mocked | Recipient, template, status, error, related ids, timestamp are stored. |
| Audit log for critical mutations | P0 | Integration | Test DB | Admin/therapist/client/payment/cron/calendar/payout changes create audit entries. |
| Monitoring redacts secrets/tokens | P1 | Unit + Integration | Synthetic errors | Diagnostic logs do not include passwords, tokens, API keys, or raw provider secrets. |
| Safe UI/API messages | P0 | Unit + Integration | Synthetic errors | UI responses are friendly; raw DB/Stripe/Google/Prisma errors stay server-side. |

## Test Data Strategy

Automated tests should use deterministic seed data:

- Admin user.
- Client A and Client B.
- Approved Therapist A and Approved Therapist B.
- Pending therapist.
- Rejected therapist.
- Suspended therapist.
- Bookings covering pending, confirmed, paid, unpaid, cancelled, rejected, auto-cancelled, and completed states.
- Payments covering pending, paid, failed, expired, refunded, and credit-applied states.

The test database must be isolated from the real remote production/staging database. A future slice should choose one of these approaches:

1. Dedicated test database URL with disposable data.
2. Local PostgreSQL container for automated tests.
3. Transaction-per-test strategy with rollback where practical.

Do not run destructive automated tests against the current production-like Vercel database.

## Provider Mock Strategy

| Provider | Mock goal | Manual confirmation still needed |
| --- | --- | --- |
| Stripe | Checkout creation, webhook payload/signature handling, refund/credit outcomes. | Real webhook delivery in Stripe dashboard. |
| Google Calendar | OAuth callback, writable calendar listing, event create/delete, failure handling. | Real OAuth consent and event creation on a test Google account. |
| Cloudinary | Upload success/failure and metadata shape. | Real file upload to configured folder. |
| Nodemailer/SMTP | Sent/failed delivery outcomes and EmailLog writes. | Real Gmail/Google Workspace inbox delivery. |
| Clock/cron | Fixed `now` for payment due and 24h cancellation rules. | Hosted scheduler trigger in Vercel or future hosting cron. |

## Recommended Implementation Order

1. Add test infrastructure with a fast unit runner and scripts.
2. Add provider mocks/test factories.
3. Add unit tests for validation, permissions, safe errors, email templates, rate limit, and cron rules.
4. Add integration tests for service-level booking/payment/onboarding/cron flows.
5. Add E2E tests for auth, therapist onboarding/admin review, booking, payment handoff, cancellation, and access control.
6. Add CI/local scripts that run in a safe order without touching production data.

## Out Of Scope For 14.1

- Installing or configuring a test runner.
- Writing executable tests.
- Changing runtime business logic.
- Changing database schema.
- Running destructive DB checks.

## Acceptance Criteria For 14.1

- Critical MVP flows are mapped to unit/integration/E2E/manual coverage.
- P0 scenarios include auth, roles, onboarding, booking, payment, cron, email, audit, and provider safety.
- External providers have a clear mock strategy.
- Test database isolation is explicitly required before integration/E2E automation.
- The next implementation slice can start with test infrastructure without re-discussing scope.
