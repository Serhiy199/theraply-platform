# Phase 12: Cron Booking Rules

## Runtime entry points

- Business logic: `src/server/services/cron-booking-rules.service.ts`
- HTTP trigger: `src/app/api/cron/booking-rules/route.ts`
- Vercel trigger: `vercel.json`
- Manual verification: `npm.cmd run verify:cron-booking-rules`

The service owns the booking/payment logic. Vercel Cron is only a hosted trigger, so the same logic can be moved to another host by calling the HTTP endpoint or running the script from system cron.

## Vercel Hobby schedule

The current `vercel.json` schedule is daily because the project is staying on the Vercel Hobby plan for development:

```json
{
  "path": "/api/cron/booking-rules",
  "schedule": "0 8 * * *"
}
```

On a future VPS or paid scheduler, run this more frequently, for example every 15 or 30 minutes, without changing the service.

## Protection

The cron endpoint requires:

```http
Authorization: Bearer <CRON_SECRET>
```

Required production env:

```env
CRON_SECRET=<long-random-secret>
```

## Manual commands

Dry-run, no database changes:

```powershell
npm.cmd run verify:cron-booking-rules
```

Dry-run with a small batch:

```powershell
npm.cmd run verify:cron-booking-rules -- --limit=5
```

Execute against the configured database:

```powershell
npm.cmd run verify:cron-booking-rules -- --run --limit=5
```

HTTP dry-run:

```powershell
Invoke-RestMethod `
  -Uri "https://theraply-platform.vercel.app/api/cron/booking-rules?dryRun=1&limit=5" `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

## Manual QA checklist

1. Unpaid confirmed booking after `paymentDueBy`
   - Setup: `bookingStatus=CONFIRMED`, `paymentDueBy` in the past, no payment or payment `UNPAID`/`FAILED`.
   - Expected: booking becomes `AUTO_CANCELLED`; session becomes `CANCELLED`; cancellation emails are logged; audit log contains `SYSTEM_AUTO_CANCEL_UNPAID_BOOKING`.

2. Unpaid confirmed booking less than 24 hours before session
   - Setup: `bookingStatus=CONFIRMED`, `startsAt` less than 24 hours away, no `paymentDueBy` or `paymentDueBy` in the past, no paid payment.
   - Expected: same as unpaid overdue booking.

3. Paid booking
   - Setup: `bookingStatus=CONFIRMED`, payment `PAID`.
   - Expected: cron does not cancel it.

4. Cancelled, rejected, auto-cancelled, or completed booking
   - Setup: final booking status.
   - Expected: cron does not change booking, session, or payment state.

5. Stale pending Stripe checkout
   - Setup: payment `PENDING`, `checkoutExpiresAt` in the past, booking still active.
   - Expected: payment becomes `FAILED`; applied credit is restored if present; payment failed email is logged.

6. Stripe success after auto-cancel
   - Setup: booking already `AUTO_CANCELLED`; simulate checkout success.
   - Expected: payment may be marked `PAID` by webhook reconciliation, but booking must not return to `CONFIRMED`.

7. Google Calendar delete failure
   - Setup: confirmed unpaid booking with a stale/invalid Google event id.
   - Expected: booking still becomes `AUTO_CANCELLED`; audit log contains `SYSTEM_AUTO_CANCEL_GOOGLE_CALENDAR_DELETE_FAILED`.

8. Endpoint protection
   - No `Authorization` header: `401`.
   - Wrong token: `401`.
   - Missing `CRON_SECRET`: `503`.
   - Correct token: `200` with summary.
