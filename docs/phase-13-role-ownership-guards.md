# Phase 13.2 Role & Ownership Guards

This slice tightened server-side guard consistency for sensitive Theraply actions.

## What Changed

### Fresh action role guards

`src/lib/permissions.ts` now exposes:

- `requireActionRole(allowedRoles, message)`
- `requireCurrentActionRole(user, allowedRoles, message)`

These helpers do more than read the role from the current session. They:

1. Require an authenticated user.
2. Re-read the user from the database.
3. Verify the user still exists.
4. Verify `isActive`.
5. Verify the database role is still allowed.
6. Return a normalized current-user object for downstream service calls.

`requireActionActiveTherapistFeatures()` now uses the fresh action role guard before checking therapist approval/email/onboarding status.

## Updated Sensitive Entrypoints

| Entrypoint | Guard after this slice |
| --- | --- |
| `src/app/client/book/actions.ts` | Fresh `CLIENT` action role + service-level bookable therapist checks. |
| `src/app/client/bookings/actions.ts` | Fresh `CLIENT` action role + booking ownership in `client-bookings.service.ts`. |
| `src/app/admin/bookings/actions.ts` | Fresh `ADMIN` action role + admin existence re-check in `admin-operations.service.ts`. |
| `src/app/admin/therapists/actions.ts` | Fresh `ADMIN` action role + admin existence and pending-review checks in service. |
| `src/app/therapist/onboarding/actions.ts` | Fresh `THERAPIST` action role + onboarding lifecycle/editability checks in service. |
| `src/app/therapist/requests/actions.ts` | Fresh active therapist guard through `requireActionActiveTherapistFeatures()`. |
| `src/app/therapist/payout-details/actions.ts` | Fresh active therapist guard through `requireActionActiveTherapistFeatures()`. |
| `src/app/api/stripe/checkout/route.ts` | Authenticated request + fresh `CLIENT` role + booking ownership in payment service. |

## Ownership Coverage

| Area | Server-side ownership rule |
| --- | --- |
| Client bookings list/detail | Queries include `clientId: user.id`. |
| Client payments | Payment queries go through booking relation with `clientId: user.id`. |
| Client booking cancellation | Service queries booking by `id` + `clientId`. |
| Client compensation resolution | Service queries booking by `id` + `clientId`. |
| Stripe checkout | Route requires fresh client role; service queries booking by `id` + `clientId`. |
| Therapist requests/sessions | Queries include `therapistId: user.id`. |
| Therapist request decisions | Service queries booking by `id` + `therapistId`. |
| Therapist clients list | Derived only from bookings with `therapistId: user.id`. |
| Therapist payout details | Active therapist guard; service fetches profile by `userId`. |
| Therapist certificates | Fresh therapist role; upload service fetches profile by `userId` and editable lifecycle status. |
| Admin reads/actions | Admin routes use `/admin` server layout guard; admin mutations now use fresh admin action guard and service re-checks admin existence. |
| Cron/system | Cron route stays separate and uses bearer `CRON_SECRET`; no user role is expected. |
| Stripe webhook | Stays separate and uses Stripe signature verification; no user role is expected. |
| Google OAuth callbacks | Require signed-in active therapist and state user-id match before saving connection. |

## Remaining Follow-Ups

These are not blockers for 13.2, but belong to later Phase 13 slices:

1. Add reusable schemas for inline payloads: client cancel/compensation, therapist request decision, admin cancel/reject, payout details.
2. Add rate limiting to auth, resend verification, checkout, certificate upload, and OAuth connect endpoints.
3. Add missing AuditLog coverage for client cancellation, therapist confirm/reject, payout updates, certificate upload, and account lifecycle events.
4. Consider moving admin read services behind explicit admin-only data-access helpers if future code starts calling them outside `/admin` pages.

## Verification

Ran:

```bash
npx.cmd tsc --noEmit --incremental false
```

Result: passed.
