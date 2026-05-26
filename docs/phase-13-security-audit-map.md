# Phase 13.1 Security Audit Map

This document maps the sensitive Theraply entrypoints before Phase 13 hardening work.
It is intentionally read-only: no runtime logic is changed by this slice.

Legend:
- OK: guard is present and matches the current flow.
- Partial: some protection exists, but a follow-up is recommended.
- Missing: no dedicated protection found in the audited code path.
- N/A: not applicable for this entrypoint.

## Cross-Cutting Security Layers

| Layer | Status | Current coverage | Gaps / follow-up |
| --- | --- | --- | --- |
| Route role protection | OK | `src/proxy.ts` protects `/client`, `/therapist`, and `/admin` by JWT role. Layouts also call `requireRole()` for role-specific shells. | Keep both proxy and server layout checks. Do not rely only on client-side navigation. |
| Server action role checks | OK | Sensitive actions use `getCurrentUser()` with `assertActionRole()` or `requireActionActiveTherapistFeatures()`. | Phase 13.2 should standardize this pattern across every new action. |
| Fresh DB user check | OK | `requireRole()` reloads user from DB and checks `isActive`. | Server actions that only use `getCurrentUser()` depend on service-level ownership checks; keep reviewing per action. |
| Form/payload validation | Partial | Auth, booking request, payment checkout, therapist onboarding, and certificates use Zod or explicit validation. | Some forms still use inline validation instead of reusable schemas, notably payout details and admin cancel/reject payloads. |
| Ownership checks | OK | Booking services query by both entity id and current actor id: client id, therapist id, or admin role. | Keep ownership in service layer, not only actions. |
| Audit trail | Partial | Stripe, refunds, Google Calendar, cron, admin review, admin cancel, therapist cancel, credits are audited. | Client direct cancellation, payout detail updates, certificate uploads, registration/email verification are not consistently audited. |
| Rate limiting | Missing | No rate limiter, throttle, CAPTCHA, Redis, or Upstash usage found. | Phase 13.4/13.5 should add rate limiting for auth, resend verification, checkout, upload, and cron/API abuse surfaces. |
| Error handling | Partial | Server actions generally return typed UI states. Webhooks/cron log diagnostic events. | Some API routes return service/config error messages directly. Decide which messages are safe for production clients. |
| Secrets hygiene | Needs Review | Runtime code uses environment variables. | `.env.example` and `.env.production.local.example` currently contain real-looking secrets/placeholders. This was previously deferred, but remains a security risk. |

## Auth Flows

| Entrypoint | Type | Role / auth check | Validation | Audit/logging | Rate limit | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/api/auth/[...nextauth]/route.ts` | API route | NextAuth credentials provider. | `loginSchema.safeParse()` in `src/auth.ts`; `authenticateWithCredentials()` verifies password and active user. | Missing dedicated audit for login success/failure. | Missing | Highest-priority rate-limit target. |
| `src/app/register/actions.ts` | Server action | Public self-signup only allows `CLIENT` / `THERAPIST` via schema. | `registerSchema.safeParse()`. | Email verification is logged through EmailLog, but user creation itself is not audited. | Missing | Needs signup rate limit and optional audit for account creation. |
| `src/app/forgot-password/actions.ts` | Server action | Public. | `forgotPasswordSchema.safeParse()`. | Dev-only reset link logging; no audit/event log for reset requests. | Missing | Response avoids user enumeration; still needs rate limit. |
| `src/app/reset-password/[token]/actions.ts` | Server action | Public token flow. | `resetPasswordSchema.safeParse()`. | No audit for successful reset or invalid token attempts. | Missing | Needs rate limit by IP/token/email and audit for successful password changes. |
| `src/app/verify-email/[token]/page.tsx` | Server page/token handler | Public token flow; optional current session read. | Token lookup and state handling in service. | Dev logging for token lifecycle; EmailLog exists for sends. | Missing | Friendly handling exists for already verified / invalid / expired token. Consider audit on successful verification. |
| `src/app/verify-email/actions.ts` | Server action | Uses current user when signed in, otherwise public email input. | `forgotPasswordSchema.safeParse()` for email resend. | EmailLog for send result. | Missing | Needs rate limit for resend abuse. |

## Client Booking And Payment Entrypoints

| Entrypoint | Type | Role / ownership check | Validation | Audit/logging | Rate limit | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/client/book/actions.ts` | Server action | `assertActionRole(user, [CLIENT])`; service checks therapist is bookable. | `bookingRequestSchema.safeParse()`. | Booking request emails logged; no explicit AuditLog entry for booking creation. | Missing | Slot conflict is protected with DB advisory lock and availability checks. |
| `src/app/client/bookings/actions.ts#cancelBookingAction` | Server action | `assertActionRole(user, [CLIENT])`; service queries booking by `id` + `clientId`. | Minimal booking id presence check. | Refund service may audit refund; cancellation itself is not explicitly audited. | Missing | Follow-up: add audit for client cancellation and best-effort calendar delete behavior if desired. |
| `src/app/client/bookings/actions.ts#resolveCompensationAction` | Server action | `assertActionRole(user, [CLIENT])`; service queries booking by `id` + `clientId`. | Inline resolution check. | Credit/refund services audit financial movement. | Missing | Good ownership check; validation could move to schema. |
| `src/app/api/stripe/checkout/route.ts` | API route | `getCurrentUser()` + `hasRole(CLIENT)`; service validates client owns booking. | JSON parse + `paymentCheckoutRequestSchema.safeParse()`. | Payment service audits checkout creation/failure. | Missing | Critical endpoint: add rate limit to reduce duplicate checkout/session abuse. |
| `src/app/client/payments/success/page.tsx` | Server page | `requireRole(CLIENT)`. | Query params checked before reconciliation. | Payment service audits success return reconciliation. | N/A | Webhook remains source of truth; page reconciliation is supplementary. |

## Therapist Entrypoints

| Entrypoint | Type | Role / ownership check | Validation | Audit/logging | Rate limit | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/therapist/onboarding/actions.ts#saveTherapistOnboardingDraftAction` | Server action | `assertActionRole(user, [THERAPIST])`; service checks editable lifecycle status. | `therapistOnboardingDraftSchema.safeParse()`. | Missing AuditLog for draft save. | Missing | Low risk, but noisy if audited on every save. |
| `src/app/therapist/onboarding/actions.ts#submitTherapistOnboardingForReviewAction` | Server action | `assertActionRole(user, [THERAPIST])`; service checks editable lifecycle status. | `therapistOnboardingSubmitSchema.safeParse()`. | Email notification is logged; audit coverage should be verified/added. | Missing | Business-critical lifecycle change; audit recommended. |
| `src/app/api/therapist/certificates/upload-signature/route.ts` | API route | Fresh therapist role check; service locks upload to editable onboarding states. | Generates a therapist-scoped signed Cloudinary public ID; exposes 10MB/type contract only. | Diagnostic logging on failed signing. | Present | File bytes upload directly from browser to Cloudinary; no certificate binary body crosses a Theraply Server Action. |
| `src/app/api/therapist/certificates/confirm-upload/route.ts` | API route | Fresh therapist role check; service locks confirmation to editable onboarding states. | Validates confirmation JSON, Cloudinary response signature, therapist-specific public ID, trusted asset metadata, MIME/extension, and 10MB size. | `THERAPIST_CERTIFICATE_UPLOAD_CONFIRMED` audit event plus diagnostic failure logging. | Present | Persists certificate metadata only after Cloudinary verification; consider malware/content scanning before production acceptance. |
| `src/app/therapist/requests/actions.ts#requestDecisionAction` | Server action | `requireActionActiveTherapistFeatures()`; service queries booking by `id` + therapist id. | Inline booking id + intent check. | Emails logged. Therapist cancel is audited, but confirm/reject do not show explicit AuditLog entries in current service. | Missing | Add audit for confirm/reject in Phase 13.8. |
| `src/app/therapist/requests/actions.ts#therapistCancelSessionAction` | Server action | `requireActionActiveTherapistFeatures()`; service queries booking by `id` + therapist id. | Inline booking id check. | `THERAPIST_CANCEL_BOOKING` AuditLog entry. | Missing | Calendar delete failure currently blocks manual cancel; acceptable if business wants strict sync, unlike cron best-effort. |
| `src/app/therapist/payout-details/actions.ts#payoutDetailsAction` | Server action | `requireActionActiveTherapistFeatures()`. | Inline required account holder + numeric session price validation. | Missing AuditLog for payout/bank detail changes. | Missing | Payout details are sensitive; add schema validation and audit before real payouts. |
| `src/app/therapist/payout-details/actions.ts#googleCalendarSelectionAction` | Server action | `requireActionActiveTherapistFeatures()`. | Service validates target calendar belongs to connected Google account. | Google service audits target updates. | Missing | Keep DB unique constraints for connected calendar identities. |

## Admin Entrypoints

| Entrypoint | Type | Role / ownership check | Validation | Audit/logging | Rate limit | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/admin/therapists/actions.ts#approveTherapistAction` | Server action | `assertActionRole(user, [ADMIN])`; service re-checks admin exists. | Profile id presence; service requires pending review. | `ADMIN_APPROVE_THERAPIST` AuditLog + email log. | Missing | Good baseline. |
| `src/app/admin/therapists/actions.ts#rejectTherapistAction` | Server action | `assertActionRole(user, [ADMIN])`; service re-checks admin exists. | Profile id presence; service requires non-empty reason. | `ADMIN_REJECT_THERAPIST` AuditLog + email log. | Missing | Good baseline. |
| `src/app/admin/bookings/actions.ts#adminCancelBookingAction` | Server action | `assertActionRole(user, [ADMIN])`; service re-checks admin exists. | Booking id presence; service checks cancellable status. | `ADMIN_CANCEL_BOOKING` AuditLog + refund/email logs where applicable. | Missing | Calendar delete failure currently blocks cancel. Decide if admin manual cancel should be strict or best-effort. |
| Admin pages under `/admin/*` | Server pages | `requireRole([ADMIN])` in layout/pages. | N/A | Reads only. | N/A | Proxy + server guards present. |

## API Routes And Callbacks

| Entrypoint | Type | Auth / verification | Validation | Audit/logging | Rate limit | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `src/app/api/stripe/webhook/route.ts` | API route | Stripe signature verified with `stripe.webhooks.constructEvent()`. | Raw body + signature required. | Signature failures, route failures, and webhook processing are audited/logged. | N/A | This is protected by Stripe signature, not user session. Good. |
| `src/app/api/integrations/google/connect/route.ts` | API route | Signed-in therapist + active therapist feature guard. | `returnTo` normalized to same-app relative path. | Failed connect route audited/logged. | Missing | OAuth start endpoint can be rate-limited lightly. |
| `src/app/api/integrations/google/callback/route.ts` | API route | Signed-in therapist + active therapist feature guard + OAuth state user id match. | State, OAuth error, and code presence are handled. | User mismatch, denied, missing code, failed callback are audited. | Missing | Good guard surface. Keep state user-id check. |
| `src/app/api/cron/booking-rules/route.ts` | API route | Bearer `CRON_SECRET` with length check + `timingSafeEqual()`. | Query params `dryRun` and `limit` parsed. | Run failures audited/logged; service audits cron operations. | Partial | Unauthorized attempts are not audited. Usually fine, but can be added if useful. |

## Domain Service Notes

| Service | Security-relevant behavior | Gaps / follow-up |
| --- | --- | --- |
| `src/server/services/booking-flow.service.ts` | Bookable therapist filter requires active, verified, approved, onboarding completed therapist. Slot creation uses advisory DB lock and checks local + Google availability. Therapist confirm/reject query by therapist id. | Add explicit AuditLog for booking request creation, therapist confirm, therapist reject if product wants full booking history. |
| `src/server/services/payment-flow.service.ts` | Payment actions validate client ownership, confirmed booking status, payment state, Stripe session metadata, and avoids resurrecting closed bookings. | Add rate limit at checkout API boundary. |
| `src/server/services/stripe-webhook.service.ts` | Webhook events are processed best-effort and audited. | Keep idempotency checks; ensure new webhook event types do not mutate closed bookings. |
| `src/server/services/google-calendar.service.ts` | Calendar connect/refresh/target/event operations have audit entries; DB uniqueness prevents duplicate connected calendar identifiers. | OAuth connect endpoints still need rate limiting. |
| `src/server/services/certificate-storage.service.ts` | MIME/extension/10MB validation, editable-state guard, and confirmed Cloudinary metadata-only DB storage. | Consider failed-confirmation audit policy and malware/content scanning. |
| `src/server/services/email-delivery.service.ts` | Transactional sends create EmailLog with sent/failed result. Email failure should not break booking/payment flows where best-effort event helpers are used. | Ensure new transactional emails keep best-effort behavior unless explicitly blocking. |

## Priority Findings For Next Phase 13 Slices

1. Add a reusable rate limiting layer before changing individual flows.
2. Apply rate limits first to login, register, forgot/reset password, resend verification, Stripe checkout, certificate upload, and Google OAuth connect.
3. Add/review audit entries for client booking cancellation, booking request creation, therapist confirm/reject, payout details update, certificate upload, password reset success, and email verification success.
4. Convert remaining inline payload validation to reusable schemas where the surface is critical: payout details, admin cancel/reject ids, client cancel/compensation, therapist request decisions.
5. Review API error responses and decide which service messages are safe to expose in production.
6. Keep existing proxy/layout/server-action role checks intact; they currently overlap in a useful way.
7. Keep Stripe webhook signature verification and cron bearer-secret protection as-is while adding only surrounding observability/rate-limit improvements.
