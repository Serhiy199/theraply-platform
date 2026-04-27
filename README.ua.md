# Theraply Platform

English version: [README.md](./README.md)

Theraply Platform — це продуктова частина платформи на Next.js для трьох основних ролей:

- клієнти
- терапевти
- адміністратори

Маркетинговий сайт залишається поза межами цього репозиторію. У цьому проєкті знаходиться приватна продуктова зона, яка працює на окремому субдомені платформи.

## Поточний стан

Завершені фази:

- `Phase 1` — ініціалізація проєкту
- `Phase 2` — проєктування БД і запуск PostgreSQL
- `Phase 3` — авторизація, відновлення пароля і захист маршрутів
- `Phase 4` — private app shell, role dashboards і базова внутрішня навігація
- `Етапи 5-7` — operational-модулі для client, therapist і admin
- `Phase 8` — end-to-end логіка бронювання
- `Phase 9` — інтеграція з Google Calendar
- `Phase 10` — Stripe payments, refunds, client credit і finance visibility

Поточний застосунок уже включає:

- самостійну реєстрацію клієнта і логін через `NextAuth`
- forgot-password і reset-password flow
- захищені маршрути за ролями
- приватні кабінети для `client`, `therapist` і `admin`
- реальні booking, payment і cancellation flows для клієнта
- therapist requests, sessions, clients, payout details і pricing
- admin visibility для users, therapists, bookings, payments і audit logs
- повну Google Calendar інтеграцію з therapist-owned calendars
- Stripe Checkout із client booking details
- webhook-синхронізацію оплати, failure, expiry і refund подій
- refund flow для стандартного client cancellation і platform-side paid cancellation
- client credit balance, transaction history, apply і reverse logic
- late cancellation UX для сценарію `< 24 години`
- admin finance visibility для pending, failed, refunded і credit-backed cases
- audit logging для Google Calendar, Stripe, refund і credit lifecycle

## Технічний стек

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Ant Design
- NextAuth v4
- Prisma 6
- PostgreSQL
- bcryptjs
- Zod
- Stripe

## Реалізовані фази

### Phase 9

Реалізовано повну інтеграцію з Google Calendar:

- therapist-owned Google OAuth connection
- вибір target calendar
- реальні availability slots через Google Calendar `freeBusy`
- conflict-aware booking creation з перевіркою і в БД, і в Google Calendar
- створення Google Calendar event після therapist confirmation
- збереження Google Meet link у `Session`
- видалення synced event при reject / cancel
- UI indicators і audit logging для lifecycle інтеграції

### Phase 10

Реалізовано Stripe payment і compensation layer:

- therapist-specific pricing через `sessionPricePence`
- server-side payment eligibility logic
- `GBP` payment flow після therapist confirmation
- правило оплати не пізніше ніж за `24 години` до сесії
- `Stripe Checkout` із client booking details
- success / failed payment pages
- webhook handling для:
  - `checkout.session.completed`
  - `payment_intent.payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
- refund flow для standard client cancellation
- refund flow для platform-side paid cancellation
- client credit balance і transaction model
- automatic credit apply before Stripe charge
- partial credit + Stripe mixed settlement
- full payment by credit без відкриття Stripe Checkout
- reverse credit при failed / expired checkout
- credit restoration при refund
- admin finance visibility
- audit logging для checkout, webhook, refund і credit lifecycle

## Реалізовані маршрути

### Публічні маршрути

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Client routes

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`
- `/client/payments/success`
- `/client/payments/failed`

### Therapist routes

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

### Admin routes

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

### API routes

- `/api/auth/[...nextauth]`
- `/api/integrations/google/connect`
- `/api/integrations/google/callback`
- `/api/stripe/checkout`
- `/api/stripe/webhook`

## Модель БД

### Enums

- `UserRole`
- `TherapistApprovalStatus`
- `BookingStatus`
- `SessionStatus`
- `PaymentStatus`
- `CompensationResolutionType`
- `ClientCreditTransactionType`
- `EmailStatus`

### Models

- `User`
- `ClientProfile`
- `TherapistProfile`
- `Booking`
- `Session`
- `Payment`
- `ClientCreditBalance`
- `ClientCreditTransaction`
- `TherapistPayoutDetails`
- `EmailLog`
- `AuditLog`
- `PasswordResetToken`

### Важливі доменні примітки

- ролі зберігаються в `User.role`
- `Booking` описує стан запису і намір бронювання
- `Session` зберігає фактичну сесію і meeting metadata
- `Payment` зберігає Stripe identifiers, checkout expiry, refund metadata і applied credit
- `ClientCreditBalance` і `ClientCreditTransaction` роблять platform credit окремою доменною сутністю
- booking compensation закривається через `compensationResolutionType`
- therapist availability читається з Google Calendar `freeBusy`
- payment починається тільки після therapist confirmation

## Змінні середовища

Проєкт очікує:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

## Google Calendar інтеграція

Поточна runtime-логіка:

- therapist підключає власний Google account з `/therapist/payout-details`
- Theraply читає availability через Google Calendar `freeBusy`
- booking request залишається в `PENDING_THERAPIST`, доки therapist не прийме рішення
- confirmation створює Google Calendar event і зберігає Google Meet link
- reject і cancel видаляють synced Google Calendar event
- connect, token refresh, sync і failure events пишуться в `AuditLog`

Деталі: [docs/phase-9-google-calendar-integration.md](./docs/phase-9-google-calendar-integration.md)

## Stripe Payments

Phase 10 реалізовано з test-mode support для локального і hosted тестування.

Поточна runtime-логіка:

- therapist спочатку підтверджує booking, і лише після цього client платить
- payable amount береться з therapist-specific `GBP` pricing
- client credit автоматично застосовується до checkout перед Stripe
- якщо credit покриває сесію повністю, Stripe Checkout не відкривається
- якщо credit покриває сесію частково, Stripe отримує лише залишок
- Stripe webhooks є джерелом правди для payment confirmation
- standard client cancellation (`24h+`) може створити Stripe refund
- late cancellation (`< 24h`) вимагає явного підтвердження і вважається non-refundable після capture payment
- platform-side paid cancellation теж може створити Stripe refund
- checkout, webhook, refund і credit events пишуться в `AuditLog`

Потрібні Stripe змінні:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Рекомендований local setup:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Для локальної розробки використовуй `pk_test` і `sk_test` із Stripe Dashboard, а `whsec_...` бери з output `stripe listen`.

Для hosted test setup:

- залишай Stripe у `Test mode`
- створи webhook endpoint на `https://your-domain/api/stripe/webhook`
- його signing secret встав у `STRIPE_WEBHOOK_SECRET`

Деталі: [docs/phase-10-stripe-payments.md](./docs/phase-10-stripe-payments.md)

## Корисні команди

```bash
npm install
npm run dev
npm run build
npm run prisma:generate
npm run prisma:migrate:dev -- --name your_migration_name
npm run prisma:studio
npx prisma db seed
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Remote Vercel / Prisma Postgres БД

1. Скопіюй шаблон:

```bash
cp .env.production.local.example .env.production.local
```

2. Встав у `.env.production.local` віддалений `DATABASE_URL`.
3. Якщо хочеш використовувати remote DB як основну локально, продублюй цей `DATABASE_URL` у `.env`.
4. Для remote міграцій:

```bash
npm run prisma:migrate:remote
```

5. Для remote seed тільки коли це справді потрібно:

```bash
npm run prisma:seed:remote
```

## Тестові акаунти

### Admin

- email: `admin@theraply.local`
- password: `Admin123!`

### Therapists

- email: `therapist.anna@theraply.local`
- password: `Therapist123!`

- email: `therapist.david@theraply.local`
- password: `Therapist123!`

### Clients

- email: `client.emma@theraply.local`
- password: `Client123!`

- email: `client.james@theraply.local`
- password: `Client123!`

## Verification Summary

Поточний verified state:

- `Phase 3` перевірено через registration, login, reset flow і JWT session behavior
- `Phase 4` перевірено через build і private role routes
- `Етапи 5-7` перевірено через operational flows
- `Phase 8` перевірено через booking creation, confirmation і session linkage
- `Phase 9` перевірено через Google Calendar connect, availability, confirm і cancellation sync
- `Phase 10` перевірено через build-passing Stripe checkout, webhook, refund, credit, late-cancellation і admin-finance flows
- `npm run build` проходить успішно
- `npm run dev` стартує коректно

## Що далі

Найлогічніші наступні кроки:

- email notifications
- production hardening, filters, pagination і monitoring
- фінальна hosted end-to-end verification для payment flow
