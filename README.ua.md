# Theraply Platform

English version: [README.md](./README.md)

Theraply Platform - це приватна продуктова частина платформи для клієнтів, терапевтів і адміністраторів. Маркетинговий сайт залишається поза цим репозиторієм; цей застосунок має працювати на продуктовому субдомені, наприклад `app.theraply.online`.

## Поточний Стан

MVP готовий до фінального hosted acceptance testing.

Реалізовано:

- Технічну основу, Prisma/PostgreSQL schema, приватний app shell.
- Авторизацію, ролі, email verification, forgot/reset password.
- Кабінети клієнта, терапевта й адміністратора.
- Booking flow: вибір терапевта, availability з Google Calendar, заявка, підтвердження терапевтом, оплата, скасування, історія.
- Therapist onboarding, admin review, certificate upload, Google Calendar, Stripe Connect, заявки, клієнти, completed/no-show, payout status.
- Admin users, therapists, bookings, payments, finance cases, transfer retry, audit logs.
- Stripe Checkout, webhooks, refunds, client credit, Stripe Connect transfers, cron retry.
- Email delivery/logging abstraction.
- Cron endpoints для unpaid booking rules і therapist transfer retry.
- Security hardening: role guards, ownership checks, payload validation, rate-limit foundation, safe errors, monitoring redaction, audit logs.
- Vitest test infrastructure і базові unit/service tests.

## Стек

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Ant Design
- NextAuth v4
- Prisma 6
- PostgreSQL
- Stripe Checkout і Stripe Connect
- Google Calendar / Google Meet
- Nodemailer SMTP
- Cloudinary certificate storage
- Wix forms sync support

## Основні Сценарії

### Client

- Реєструється і підтверджує email.
- Обирає approved therapist.
- Бачить slots з Google Calendar availability терапевта.
- Створює pending booking request.
- Платить через Stripe Checkout після підтвердження терапевтом.
- Скасовує запис за правилом: `24h+` може бути refund, `<24h` після оплати не повертається.

### Therapist

- Реєструється, підтверджує email, проходить onboarding і очікує admin approval.
- Підключає Google Calendar і Stripe Connect.
- Встановлює session price.
- Підтверджує або відхиляє booking requests.
- Скасовує confirmed paid sessions з автоматичним full refund.
- Після завершення часу сесії ставить completed або client no-show.
- Для completed/no-show paid sessions запускається 90% transfer терапевту, cron використовується як retry/fallback.

### Admin

- Переглядає users, therapists, bookings, payments, finance cases і audit logs.
- Approve/reject therapists.
- Manual booking cancellation.
- Переглядає payment split і transfer status.
- Retry failed therapist transfers.

## Важливі Бізнес-Правила

- Client платить тільки після therapist confirmation.
- Therapist cancellation paid session створює 100% Stripe refund; credit у цьому сценарії не пропонується.
- Client cancellation працює за 24h refund policy.
- Stripe Connect readiness потрібен перед payable bookings для терапевта.
- Payout використовує separate charges and transfers: 10% platform fee, 90% therapist amount.
- Transfer створюється після Mark completed або Mark client no-show.
- Cron потрібен для retry/fallback, не для основного завершення сесії.

## Routes

Public:

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/verify-email/[token]`
- `/403`

Client:

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`
- `/client/payments/success`
- `/client/payments/failed`

Therapist:

- `/therapist/dashboard`
- `/therapist/onboarding`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

Admin:

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

API:

- `/api/auth/[...nextauth]`
- `/api/integrations/google/connect`
- `/api/integrations/google/callback`
- `/api/stripe/checkout`
- `/api/stripe/webhook`
- `/api/stripe/connect/account-link`
- `/api/stripe/connect/refresh`
- `/api/stripe/connect/return`
- `/api/cron/booking-rules`
- `/api/cron/therapist-transfers`
- `/api/therapist/certificates/upload-signature`
- `/api/therapist/certificates/confirm-upload`

## База Даних

Основні Prisma models:

- `User`, `ClientProfile`, `TherapistProfile`
- `TherapistCertificate`, `TherapistReviewNote`
- `Booking`, `Session`, `Payment`
- `StripeWebhookEvent`
- `ClientCreditBalance`, `ClientCreditTransaction`
- `TherapistPayoutDetails`
- `EmailLog`, `AuditLog`
- `PasswordResetToken`, `EmailVerificationToken`

`TherapistPayoutDetails` - legacy storage для сумісності/історії. Новий payout flow використовує Stripe Connect поля в `TherapistProfile` і transfer поля в `Payment`.

## Env Variables

Групи змінних:

- App/auth: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`
- Cron: `CRON_SECRET`
- Stripe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CERTIFICATES_FOLDER`
- Wix sync: `WIX_API_TOKEN`, `WIX_SITE_ID`, `WIX_THERAPIST_APPLICATION_FORM_ID`, `WIX_ACCOUNT_ID`
- Monitoring: `ERROR_MONITORING_PROVIDER`, `SENTRY_DSN`

## Корисні Команди

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npx.cmd prisma validate
npx.cmd prisma migrate status
npx.cmd prisma migrate deploy
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd test
npm.cmd run verify:security
npm.cmd run verify:phase10
```

## Поточна Verification Baseline

Після Stripe Connect migration:

- `npx prisma migrate status` проходить і показує, що DB up to date.
- `npm run verify:security` проходить.
- `npm run verify:phase10` проходить.
- `npx tsc --noEmit --incremental false` проходить.
- `npm test` проходить: 17 files / 90 tests.
- `npm run lint` проходить без warnings.
- `npm run build` проходить.

Нюанс: у поточному Windows/local середовищі `npm run build` може друкувати Prisma TLS warnings під час prerender сторінок, які читають remote DB. Build завершується успішно. DB connectivity треба окремо підтвердити на hosted environment.

## Production Notes

- Поточний rate limiter використовує in-memory store. Для production з кількома інстансами краще Redis/Upstash або інший shared store.
- Не запускати seed проти production DB, якщо це не свідоме створення demo data.
- Cron треба перевірити вже на фінальному хостингу, бо проєкт може переноситися з Vercel.
- Hosted QA checklist: [docs/hosted-qa-handoff-checklist.md](./docs/hosted-qa-handoff-checklist.md)
