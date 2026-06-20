# Deployment

Theraply can be deployed to any host that supports a Node.js Next.js server. The repo includes `build` and `start` scripts and a Vercel cron configuration.

## Production Setup

1. Create a production PostgreSQL database.
2. Configure all production environment variables from `.env.example`.
3. Run Prisma migration deployment for the production database.
4. Build the app with `npm run build`.
5. Start with `npm run start` or the hosting provider's Next.js adapter.
6. Configure Stripe live keys and webhook endpoint.
7. Configure Google OAuth production redirect URI.
8. Configure SMTP production credentials.
9. Configure Cloudinary certificate storage.
10. Configure cron with `CRON_SECRET`.
11. Run post-deployment verification.

## Prisma

Use the host's release/migration mechanism to run migrations against production. Do not run destructive schema commands against production without a backup.

## Stripe

Production webhook URL:

```text
https://your-production-domain/api/stripe/webhook
```

Enable the webhook events documented in [payments-stripe.md](payments-stripe.md). Use live mode keys only in the production environment.

## Google

Production redirect URL:

```text
https://your-production-domain/api/integrations/google/callback
```

The Google OAuth consent screen and authorized redirect URI must match the deployed domain.

## Vercel Notes

`vercel.json` defines:

- `/api/cron/booking-rules` at `0 8 * * *`
- `/api/cron/therapist-transfers` at `30 8 * * *`

Set environment variables in the Vercel dashboard for the correct environment. Ensure cron route handlers receive `Authorization: Bearer <CRON_SECRET>`.

## Post-Deployment Verification

- Open login/register pages.
- Verify client registration and email verification.
- Verify therapist onboarding/admin approval.
- Verify Google Calendar connection and event creation.
- Verify Stripe Checkout, webhook, refund, and transfer.
- Verify admin payments and audit logs.
- Verify cron endpoints with the bearer secret.
