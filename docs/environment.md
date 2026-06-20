# Environment Variables

Use `.env.example` as the source template. Values below are examples only.

| Name | Required | Example | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://user:password@localhost:5432/theraply` | Prisma/PostgreSQL |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` | Client-visible app URL and fallback meeting links |
| `APP_URL` | Yes | `http://localhost:3000` | Email links, auth links, Stripe/Connect redirects |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` | NextAuth base URL and fallback email links |
| `AUTH_SECRET` | Yes | `generate_a_long_random_auth_secret_here` | NextAuth JWT/session secret and route proxy |
| `CRON_SECRET` | Yes in production | `generate_a_long_random_cron_secret_here` | Cron route authorization |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes for payments | `<stripe-publishable-key>` | Stripe client/public config |
| `STRIPE_SECRET_KEY` | Yes for payments | `<stripe-secret-key>` | Stripe server API |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhooks | `<stripe-webhook-secret>` | Stripe webhook signature verification |
| `GOOGLE_CLIENT_ID` | Yes for calendar | `your_google_client_id_here` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes for calendar | `your_google_client_secret_here` | Google OAuth |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Yes for calendar | `http://localhost:3000/api/integrations/google/callback` | Google OAuth callback |
| `SMTP_HOST` | Yes in production | `smtp.example.com` | Nodemailer SMTP |
| `SMTP_PORT` | Yes in production | `587` | Nodemailer SMTP |
| `SMTP_USER` | Yes in production | `smtp_user@example.com` | Nodemailer SMTP |
| `SMTP_PASS` | Yes in production | `your_smtp_password_here` | Nodemailer SMTP |
| `EMAIL_FROM` | Yes in production | `smtp_user@example.com` | Sender validation and from address |
| `EMAIL_REPLY_TO` | Yes in production | `support@example.com` | Reply-to header |
| `CLOUDINARY_CLOUD_NAME` | Yes for certificate uploads | `your_cloudinary_cloud_name_here` | Cloudinary signed uploads |
| `CLOUDINARY_API_KEY` | Yes for certificate uploads | `your_cloudinary_api_key_here` | Cloudinary signed uploads |
| `CLOUDINARY_API_SECRET` | Yes for certificate uploads | `your_cloudinary_api_secret_here` | Cloudinary signatures and verification |
| `CLOUDINARY_CERTIFICATES_FOLDER` | Optional | `theraply/therapist-certificates` | Certificate folder prefix |
| `ERROR_MONITORING_PROVIDER` | Optional | `console` | Diagnostic event routing |
| `WIX_API_TOKEN` | Optional | empty or placeholder | Optional approved therapist Wix sync |
| `WIX_SITE_ID` | Optional | `your_wix_site_id_here` | Optional Wix sync |
| `WIX_THERAPIST_APPLICATION_FORM_ID` | Optional | `your_wix_form_id_here` | Optional Wix sync |
| `WIX_ACCOUNT_ID` | Optional | empty or placeholder | Optional Wix sync |

## Production-Critical Values

Set `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, Stripe live keys, `STRIPE_WEBHOOK_SECRET`, Google OAuth credentials, SMTP credentials, Cloudinary credentials, and `CRON_SECRET` before launch.

The code uses `AUTH_SECRET` for NextAuth. `NEXTAUTH_SECRET` is not read by the current implementation.

Stripe Connect client ID and platform fee env vars are not used by the current code. The Stripe API creates Express accounts server-side, and the 10/90 split is defined in `src/lib/constants/payments.ts`.
