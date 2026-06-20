# Theraply Platform

Theraply - це MVP-платформа для бронювання онлайн-сесій з терапевтами. Проєкт має три основні ролі:

- `Client`: реєструється, підтверджує email, переглядає схвалених терапевтів, створює booking request, оплачує сесію та керує своїми бронюваннями.
- `Therapist`: реєструється, проходить onboarding, подає профіль на перевірку, підключає Google Calendar і Stripe Connect, приймає або відхиляє запити та закриває сесії.
- `Admin`: перевіряє терапевтів, бачить users/bookings/payments, контролює refunds/transfers і audit trail.

Це full-stack Next.js App Router застосунок з PostgreSQL базою даних і Prisma ORM.

## Основний функціонал

- Реєстрація, login, email verification і password reset.
- Therapist onboarding: draft, certificate upload, submit for review, approve/reject/request changes.
- Профіль терапевта стає bookable тільки після email verification, завершеного onboarding, admin approval і Stripe payout readiness.
- Booking flow: вибір терапевта, Google Calendar availability, захист від дублювання слотів, therapist confirmation, cancellation і booking history.
- Google Calendar OAuth, free/busy availability, створення/видалення calendar event і Google Meet link.
- Stripe Checkout для оплат у GBP після підтвердження терапевтом.
- Stripe Connect onboarding для виплат терапевтам.
- Бізнес-правило 10/90: платформа залишає 10%, терапевт отримує 90% після completed/no-show/late client cancellation.
- Refund/no-refund правила для client/therapist/admin cancellation сценаріїв.
- Admin dashboard для users, therapists, bookings, payments і audit logs.
- Email notifications з записами в `EmailLog`.
- Role guards, rate limits, payload validation і verification scripts.

## Технологічний стек

- Framework: Next.js `16.2.2` App Router
- UI/runtime: React `19.2.4`, Ant Design `6`, Tailwind CSS `4`
- Language: TypeScript `5`
- Database: PostgreSQL
- ORM: Prisma `6.15`
- Auth: NextAuth v4 credentials provider, JWT sessions
- Payments: Stripe Checkout і Stripe Connect
- Calendar/video: Google Calendar API і Google Meet
- Email: Nodemailer SMTP, console delivery у non-production
- File storage: Cloudinary signed uploads для сертифікатів
- Testing/build: Vitest, ESLint, TypeScript, custom verification scripts, `next build`

## Локальний запуск

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev
npm run dev
```

Після запуску застосунок доступний на `http://localhost:3000`.

Базові перевірки:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run verify:security
npm run verify:phase10
npm run build
```

## Команди

- `npm run dev`: запускає Next.js dev server.
- `npm run build`: збирає production build.
- `npm run start`: запускає зібраний Next.js server.
- `npm run lint`: запускає ESLint.
- `npm run test`: запускає всі Vitest тести.
- `npm run test:unit`: запускає unit тести з `tests/unit`.
- `npm run verify:security`: перевіряє security/configuration вимоги.
- `npm run verify:phase10`: перевіряє Stripe payment flow.
- `npm run verify:phase11-email`: перевіряє email/onboarding records.
- `npm run verify:email-records`: перевіряє email verification records.
- `npm run verify:therapist-onboarding`: перевіряє therapist onboarding.
- `npm run verify:cron-booking-rules`: перевіряє cron booking rules.
- `npm run prisma:generate`: генерує Prisma Client.
- `npm run prisma:migrate:dev`: застосовує локальні dev migrations.
- `npm run prisma:studio`: відкриває Prisma Studio.
- `npm run prisma:migrate:remote`: запускає remote migration helper.
- `npm run prisma:seed:remote`: запускає remote seed helper.

## Environment variables

`.env.example` містить тільки безпечні placeholder values. Детальний опис змінних є в [docs/environment.md](docs/environment.md).

Основні групи:

- App/auth: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`
- Cron: `CRON_SECRET`
- Stripe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CERTIFICATES_FOLDER`
- Optional Wix sync: `WIX_API_TOKEN`, `WIX_SITE_ID`, `WIX_THERAPIST_APPLICATION_FORM_ID`, `WIX_ACCOUNT_ID`

## Документація

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Environment](docs/environment.md)
- [User roles](docs/user-roles.md)
- [Therapist flow](docs/therapist-flow.md)
- [Booking flow](docs/booking-flow.md)
- [Session statuses](docs/session-statuses.md)
- [Stripe payments](docs/payments-stripe.md)
- [Google Calendar](docs/google-calendar.md)
- [Emails](docs/emails.md)
- [Admin dashboard](docs/admin-dashboard.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Production checklist](docs/production-checklist.md)
- [Post-MVP roadmap](docs/post-mvp-roadmap.md)
- [Known risks](docs/known-risks.md)

## Перед production deployment

Перед запуском потрібно налаштувати production PostgreSQL database, `AUTH_SECRET`, app URLs, Stripe live keys і webhook endpoint, Google OAuth production redirect URI, SMTP, Cloudinary certificate storage, `CRON_SECRET` і production domain. Якщо деплой відбувається на Vercel, потрібно окремо перевірити cron routes з `vercel.json` і авторизацію через `Authorization: Bearer <CRON_SECRET>`.
