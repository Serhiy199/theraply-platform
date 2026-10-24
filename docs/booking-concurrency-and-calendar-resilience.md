# Booking Concurrency and Calendar Resilience

## Request Ordering

1. Validate client eligibility, canonical therapist readiness, date range and the 25-hour lead time.
2. Await Google FreeBusy verification before opening the database transaction.
3. Begin a READ COMMITTED transaction, without increasing Prisma's transaction timeout.
4. Set a transaction-local 1000 ms lock timeout and acquire a transaction-level advisory lock for the therapist, not the individual slot.
5. Recheck client eligibility and canonical therapist readiness through `tx`.
6. Check overlapping PENDING_THERAPIST/CONFIRMED bookings through `tx` (strict half-open interval overlap).
7. Recheck the lead time immediately before inserting, then commit.
8. Run notifications and cache invalidation after commit; their failure does not undo or misreport persisted creation.

The advisory lock is released on either commit or rollback. Under READ COMMITTED, the overlap SELECT starts after lock acquisition and sees the preceding holder's committed insert. Different overlapping slots therefore cannot evade serialization. Adjacent slots remain nonconflicting. Contention exceeding 1000 ms fails safely; no automatic retry is performed, including when commit outcome is unknown. Hash collisions can only serialize additional therapists, not bypass locking.

All application booking creation goes through `createBookingRequest`. Canonical confirmation also takes the therapist lock and rechecks overlap using `tx`. Both confirmation writers condition their update on ownership and current PENDING_THERAPIST status. Payment reconciliation uses a conditional PENDING_THERAPIST-to-CONFIRMED update, rather than reviving a row based on a stale snapshot. All other lifecycle writers only release/finish active slots or update metadata. No financial allocation rules change.

## Google Boundary

A selected-calendar response must contain an explicit busy array. Missing entries, calendar errors and malformed intervals fail closed. Valid empty arrays mean no Google conflict. Busy ranges require valid offset-bearing timestamps and positive duration. Calendar unavailability has a separate safe client message from a genuine slot conflict; raw provider errors are not logged by the availability service.

FreeBusy HTTP requests use the SDK's native 5000 ms abort timeout with retries disabled, not an unmanaged Promise.race. Existing OAuth/token refresh behavior is unchanged and occurs outside the booking transaction. That initialization is not covered by the FreeBusy HTTP deadline.

FreeBusy is a precondition, not a cross-system atomic lock. Independent Google calendar edits after the check can still race. The local invariant also assumes every writer uses the application mechanisms; manual SQL/imports must not bypass them. No exclusion constraint or database migration is introduced. Existing duration, 14-day availability window, London business hours and UTC/DST interpretation are unchanged.

## Verification Levels

`tests/unit/booking-flow-readiness.service.test.ts` includes deterministic simulated transactions. These verify ordering, lock-key shape, fresh transaction-scoped reads, rollback behavior, double submissions and partial/adjacent overlaps. They are not PostgreSQL engine proof.

`tests/integration/booking-concurrency.postgres.test.ts` exercises the actual service, Prisma transactions, advisory locks and overlap queries against a disposable PostgreSQL database. Only Google, email, audit and unrelated financial integrations are mocked. Synthetic readiness fixtures are created only inside that disposable database, never staging. The harness:

- Is skipped unless `THERAPLY_DISPOSABLE_POSTGRES_URL` is explicitly configured; never uses `DATABASE_URL` as a fallback.
- Requires PostgreSQL at `127.0.0.1:65439`, database `theraply_booking_resilience_test`, user `theraply_booking_test`, schema `public`.
- Requires an empty schema with the existing Prisma schema already applied.
- Tests identical/partial/nonoverlapping slots, same/different clients, active/inactive status handling, real rollback, and bounded real lock contention.
- Checks no Session or Payment is created; only its own disposable fixtures are removed.

Run only after independently verifying a newly created, isolated local PostgreSQL container/instance. Supply a generated disposable password through process environment, not Git. Apply the current Prisma schema to that exact disposable target, then run:

```powershell
npx.cmd vitest run tests/integration/booking-concurrency.postgres.test.ts
```

Unset `THERAPLY_DISPOSABLE_POSTGRES_URL` afterward. Remove only the owned disposable container/volume. Never substitute a shared staging or production URL. If the engine is unavailable, report integration tests as NOT RUN and do not present simulated concurrency acceptance as real PostgreSQL acceptance.

References: [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS), [READ COMMITTED](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED), [lock_timeout](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT), [Google FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).
