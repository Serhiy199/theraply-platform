# Known Risks And Limitations

## Critical Before Production

- Live Stripe Connect must be activated and tested in the customer's Stripe account.
- Live Stripe webhook endpoint must be configured with the required events.
- Production environment variables must be copied carefully and kept out of git.
- Google OAuth consent/app settings must match the production domain.
- SMTP must be tested in production.
- Cron behavior depends on the host and plan; Vercel cron must be verified with `CRON_SECRET`.
- Production database backups should be configured before real users.
- Cloudinary certificate upload credentials must be production-ready.

## Non-Critical / Operational

- `EmailLog` has no dedicated `bookingId`, so booking email audit correlation is indirect.
- Legacy `TherapistPayoutDetails` remains in the schema for historical/manual payout data; current payout readiness uses Stripe Connect fields.
- Wix sync exists but is optional and configuration-dependent.
- Local Windows git may show dubious ownership in some checkouts; this does not affect app runtime but can affect local git commands.
- Admin mobile tables should be visually checked before handoff.
- Monitoring currently writes to console even when provider is set to `sentry`; provider integration is a future slice.

## Post-MVP

- Full reschedule UX.
- Redis/Upstash-backed distributed rate limiting instead of in-memory rate limits.
- Advanced analytics/reporting.
- Production monitoring/log drains/error tracking.
- Advanced subscriptions/packages/promo logic.
