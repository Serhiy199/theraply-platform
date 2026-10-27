# Wix CMS Automation and Customer Acceptance

## Source of Truth

Theraply owns therapist data and `evaluateTherapistReadiness()` owns publication eligibility.
The existing reconciler creates or updates one `Therapists` item per profile ID (`theraplyId`).
When readiness is lost it preserves the item and its ID, setting both `isPublished` and
`isBookable` false. Readiness recovery updates that same item. Unmanaged CMS fields are
preserved. Unknown identities and duplicate matches fail closed; no global cleanup occurs.
The separate approved-therapist Wix Forms integration and its status fields are unchanged.

## Activation and Operations

`WIX_CMS_AUTOMATION_ENABLED` must be exactly `true` to permit automatic writes. Missing or
false means no automatic DB/CMS work. Deploying this change does not activate it.
Do not enable production automation without separate owner authorization and fresh dry run.

Activation requires the correct dedicated CMS token/site, exact canonical APP_URL origin,
compatible collection fields, and `theraplyId_unique` ACTIVE/unique on `theraplyId` alone.
Draft/publish collections are rejected. Staging requires the existing verified Vercel
project/develop/postgres-public isolation checks; the Connect E2E isolated profile stays
excluded before any CMS request. Production requires the production origin, non-Vercel
runtime and the local `theraply_db/public` connection. No token fallback is introduced.

After committed public-profile, photo, session-price, review, onboarding-submission,
email-verification, Calendar connection/selection/disconnection/invalid-grant, or Stripe
readiness mutations, Next.js `after()` schedules a fresh canonical reconciliation. It does
not wait for Wix before returning the user response. Render/prefetch does not itself
schedule publication. A Stripe status refresh schedules only when readiness inputs change.

The authenticated `/api/cron/wix-cms` backstop scans ALL profiles, not just approved or
currently ready ones. Vercel staging schedules it daily at 09:00 UTC. A future VPS release
must separately provision a scheduler calling this route with the existing CRON_SECRET;
`vercel.json` does not schedule anything on the VPS. Never publish the cron secret.

Each sweep handles at most 50 profiles / approximately 180 seconds plus its final request.
`WIX_CMS_BACKSTOP_RUN.after.nextCursor` persists continuation for the next invocation;
the cursor resets after the sweep. Failures do not stop later profiles. A failed profile
is retried from fresh DB/CMS state on the next complete sweep, so larger directories may
need a more frequent authorized scheduler. Failed cursor persistence fails the cron with
HTTP 503 and replays from the prior checkpoint; repair storage rather than claiming success.

All CMS HTTP calls have an eight-second timeout. No immediate blind write retry occurs:
after an ambiguous CREATE, the next attempt queries by canonical identity first. The
required server-side unique index protects concurrent creates. Updates are eventually
consistent: overlapping lifecycle changes or provider failures can temporarily leave an
older projection until another trigger/backstop. This is not instantaneous revocation.
Do not represent a failed/partial sweep as fully synchronized.

Inspect `WIX_CMS_RECONCILED`, `WIX_CMS_RECONCILIATION_FAILED`, `WIX_CMS_BACKSTOP_RUN` audits
and `[wix-cms-automation]` diagnostics. Failed cron runs return HTTP 503. Repair credentials,
schema or provider access, then rerun the authenticated backstop; do not fabricate readiness.
Provider payloads, tokens and biography content are not stored in automation audit records.

## Manual Production Dry Run

From the positively verified production `/var/www/theraply/current`:

```sh
npm run wix:cms:reconcile:production
```

Default is DRY_RUN, with no DB or Wix writes. The improved planner includes existing CMS
profiles that are no longer ready. `eligibleCount` still counts PUBLIC_READY profiles;
`reconciliationProfileIds` additionally includes existing non-public profiles. Write mode
requires an exact allowlist matching that entire reconciliation set, plus the existing
eligible expected-count and production confirmation. An old eligible-only allowlist cannot
silently authorize additional depublishing. Orphan CMS identities are not deleted.

## Read-only Baseline, 27 October 2026

Production release: `f5b1e1dfedd878eee26f29839c704664c363ad21`; DB `theraply_db/public`.
Five imported profiles are APPROVED but none are PUBLIC_READY. All five lack verified email,
Calendar readiness, Stripe readiness and public profile completeness (bio/photo absent).
The sixth historical test profile also is not ready (Calendar). No data was changed.

Deployed old CLI DRY_RUN reports zero eligible, one CMS item, no plan. The reviewed planner
fix now covers that omission: the existing item for `cmsr4h3zi000poykgtg1y1s3n` needs HIDDEN
because its stored flags remain true despite canonical Calendar readiness being false.
No production reconciliation write was authorized or executed.

Production schema includes `bioDisplay=TEXT`, original `bio=RICH_TEXT`, all required mapping
fields, and an ACTIVE unique identity index. The existing item has the canonical production
booking URL. Collection writes remain ADMIN-only; reads are public.

Wix Copy staging read-only schema/index/query checks also passed using the owner-confirmed
staging credential: identical required field types, ACTIVE unique index, no Draft Items
plugin, one existing CMS item. No live item was created/updated for acceptance. Full
CREATE/UPDATE/HIDE/RESTORE/retry acceptance in this release uses isolated mocked fixtures,
not manufactured readiness or changes to the historical Test Therapist.

The published `/all-therapists-test` response is noindex and not in header/footer navigation,
but currently displays 13 cards, not the one-item canonical CMS inventory. Book-session
elements do not expose normal href links. This does NOT verify the editor dataset/filter or
any unpublished draft. No authenticated editor tab was available. Desktop appearance was
inspected, but automatic CMS publication acceptance remains blocked. At a 390px viewport
the desktop-browser document measured 1134px wide; true mobile-device acceptance is still
required. No page, design, navigation or Wix data was edited/published.

## Customer Checklist

Use existing controlled accounts; no passwords or tokens belong in handover documents.
Staging: https://theraply-platform.vercel.app . Production: https://platform.theraply.online .
The production website is https://www.theraply.online . These are separate environments.

- CLIENT: `/client/dashboard`, `/client/book/new`, `/client/bookings`, `/client/payments`.
  Review existing booking/session/Meet and paid TEST history. New financial actions require
  a separately agreed controlled TEST scenario; never use a real card for staging.
- THERAPIST: `/therapist/dashboard`, `/therapist/requests`, `/therapist/payout-details`.
  Review own public profile/photo/price, approval, Calendar and Stripe status. Each real
  therapist must verify email, complete profile/bio/photo, receive approval, set a positive
  price, connect their Calendar with a target calendar, and complete the correct Stripe
  onboarding. None of these requirements may be bypassed to fill the directory.
- ADMIN: `/admin/dashboard`, `/admin/therapists`, `/admin/bookings`, `/admin/payments`.
  Verify review/approval and historical statuses without editing financial history.
  Forms sync status is NOT proof of CMS publication; inspect CMS-specific audit evidence.
- Wix acceptance: owner opens the existing hidden editor page, verifies the intended
  `Therapists` dataset in read-only mode, `isPublished=true` filter, mapping of profilePhoto,
  displayName, specialization, bioDisplay, yearsOfExperience, sessionPriceDisplay and
  canonical bookingUrl. Preserve existing design/noindex/navigation and `/all-therapists`.
  Verify a legitimate eligible therapist on desktop and actual mobile before any launch.

Remaining launch gates: separately authorized production code promotion/scheduler/activation;
controlled real CMS lifecycle acceptance; hidden-page dataset and mobile acceptance;
real therapist completion; credentials/rotation review. Stripe LIVE payments and therapist
transfers are NOT certified complete by staging TEST acceptance. Stripe destination cleanup
is deferred and was not investigated or modified in this task.
