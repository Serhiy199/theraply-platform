# Theraply Platform

English version: [README.md](./README.md)

Theraply Platform — це продуктова частина платформи на Next.js для трьох основних ролей:

- клієнти
- терапевти
- адміністратори

Маркетинговий сайт лишається поза межами цього репозиторію. У цьому проєкті знаходиться застосунок платформи, який працюватиме на окремому продуктовому субдомені.

## Поточний стан

Завершені фази:

- `Phase 1` - ініціалізація проєкту
- `Phase 2` - проєктування бази даних і запуск PostgreSQL
- `Phase 3` - авторизація, відновлення пароля і захист маршрутів
- `Phase 4` - приватний app shell, role dashboards і базова внутрішня навігація
- `Етапи 5-7` - operational-модулі для client, therapist і admin
- `Phase 8` - end-to-end логіка бронювання
- `Phase 9` - інтеграція з Google Calendar

Поточний стан застосунку вже включає:

- самостійну реєстрацію клієнта
- логін через `NextAuth` credentials
- `forgot password` і `reset password`
- захищені маршрути за ролями
- спільний private dashboard shell
- role-specific overview dashboards для `client`, `therapist` і `admin`
- реальний client module для booking-ів, деталей запису, payments і скасування
- реальний therapist module для requests, sessions, clients і payout details
- реальний admin module для users, therapists, bookings, payments, manual cancellation і audit visibility
- жорсткі server-side role guards для mutation actions
- спільні empty, loading, success і error states у приватній зоні
- server-side Prisma service layer для dashboards, bookings, sessions, payments, admin operations і booking flow
- вибір терапевта і слотів для нового booking flow клієнта
- створення booking request зі статусом `PENDING_THERAPIST`
- єдиний end-to-end booking flow між client, therapist і admin
- підключення власного Google-акаунта терапевта і вибір target calendar
- реальні availability slots із Google Calendar `freeBusy`
- conflict-aware створення booking з перевіркою і в БД, і в Google Calendar
- автоматичне створення Google Calendar event після підтвердження терапевтом
- автоматичне збереження Google Meet link у `Session`
- синхронне видалення Google Calendar event при reject / cancel
- audit logging і технічну діагностику для життєвого циклу Google Calendar інтеграції
- booking-flow empty, loading, conflict і success states

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

## Реалізовані фази

### Phase 1

Завершені базові роботи:

- ініціалізовано застосунок на Next.js App Router
- підключено Ant Design через глобальний provider
- створено базові публічні сторінки:
  - `/`
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/403`
  - `not-found`
- налаштовано Prisma
- налаштовано локальні змінні середовища
- підготовлено локальний PostgreSQL у WSL

### Phase 2

Завершено проєктування БД і локальний bootstrap:

- спроєктовано й реалізовано Prisma schema
- створено і застосовано першу доменну міграцію
- додано auth-міграцію для токенів відновлення пароля
- створено і виконано seed для локальної розробки
- перевірено доступ до БД через Prisma Client і Prisma Studio

### Phase 3

Завершено основу авторизації та доступів:

- налаштовано `NextAuth` з `CredentialsProvider`
- додано хешування паролів через `bcryptjs`
- реалізовано самостійну реєстрацію клієнта
- реалізовано логін через credentials
- реалізовано forgot-password flow
- реалізовано reset-password flow
- додано JWT session support
- додано захист маршрутів через `proxy.ts`
- додано role-based redirects після логіну
- створено захищені базові dashboards для всіх трьох ролей
- перевірено реєстрацію, логін, reset token і зміну пароля локально та в розгорнутому середовищі

### Phase 4

Завершено основу приватної продуктової зони:

- побудовано спільний dashboard shell з header, sidebar і logout controls
- додано role-aware layouts для `client`, `therapist` і `admin`
- налаштовано живу внутрішню навігацію для приватних маршрутів
- створено дочірні маршрути для майбутніх модулів bookings, payments, therapists та admin operations
- реалізовано role-specific overview dashboards:
  - client workspace з upcoming sessions, payment summary, quick actions і account summary
  - therapist workspace з pending requests, client summary і profile/payout completion
  - admin workspace з users, approvals, bookings, payments і recent activity
- додано server-side dashboard data layer у `dashboard.service.ts`
- приватний shell зроблено auth-aware: користувач бачить себе, роль, стан сесії і logout controls

### Етапи 5-7

Завершено перший operational-блок для всіх трьох ролей:

- додано спільні booking/payment contracts у `src/lib/contracts/bookings.ts`
- додано спільні labels, badge mappings і policy helpers для booking/payment статусів
- створено role-specific service layer:
  - `client-bookings.service.ts`
  - `therapist-bookings.service.ts`
  - `admin-operations.service.ts`
- реалізовано client module:
  - upcoming sessions
  - past sessions
  - booking details page
  - payments page
  - client cancellation flow
  - попередження про late cancellation менше ніж за 24 години
  - показ meeting link, якщо він уже існує
- реалізовано therapist module:
  - pending requests
  - upcoming sessions
  - session history
  - clients list
  - request detail page
  - confirm / reject actions
  - payout details view і update flow
- реалізовано admin module:
  - users list
  - therapists list
  - bookings list
  - booking details page
  - payments list
  - manual admin cancellation
  - audit trail visibility
- server actions захищено спільними role guards, щоб кожна mutation дія валідувалась на сервері
- у приватній зоні додано спільні empty, loading і status states

### Phase 8

Завершено головний booking flow end-to-end:

- додано окремий booking flow service у `src/server/services/booking-flow.service.ts`
- додано спільні contracts, constants і validation для booking flow:
  - `src/lib/contracts/booking-flow.ts`
  - `src/lib/constants/booking-flow.ts`
  - `src/lib/validations/booking-flow.ts`
- реалізовано клієнтський booking flow:
  - сторінка вибору терапевта
  - сторінка доступних слотів терапевта
  - надсилання slot request
  - conflict-aware стани у формі створення booking request
- therapist confirm / reject actions інтегровано з новим booking flow service
- після therapist confirmation система автоматично генерує і зберігає meeting link
- для booking flow додано окремі empty, loading і conflict states
- додано end-to-end verification script `scripts/verify-stage-8.ts`

### Phase 9

Завершено інтеграцію з Google Calendar:

- додано Google OAuth конфігурацію і therapist connect flow
- додано callback-обробку Google авторизації та збереження токенів у `TherapistProfile`
- додано вибір target calendar для therapist-owned Google account
- локальну генерацію слотів замінено на availability із Google Calendar `freeBusy`
- додано захист від конфліктів часу на етапі створення booking
- після therapist confirmation система створює реальний Google Calendar event
- Google event references і Google Meet link зберігаються в `Session`
- reject і cancel flows синхронно видаляють Google Calendar event
- у dashboard UI додано індикатори connection state і Meet sync state
- для інтеграції додано audit logging і runtime diagnostics

## Реалізовані маршрути

### Публічні маршрути

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Захищені маршрути для client

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`

### Захищені маршрути для therapist

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

### Захищені маршрути для admin

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

### Auth API

- `/api/auth/[...nextauth]`

### Integration API

- `/api/integrations/google/connect`
- `/api/integrations/google/callback`

## Модель бази даних

### Enums

- `UserRole`
- `TherapistApprovalStatus`
- `BookingStatus`
- `SessionStatus`
- `PaymentStatus`
- `EmailStatus`

### Models

- `User`
- `ClientProfile`
- `TherapistProfile`
- `Booking`
- `Session`
- `Payment`
- `TherapistPayoutDetails`
- `EmailLog`
- `AuditLog`
- `PasswordResetToken`

### Важливі доменні примітки

- ролі зберігаються в `User.role`
- `ClientProfile` і `TherapistProfile` — окремі one-to-one профілі ролей
- `Booking` описує стан бронювання і намір запису
- `Session` описує фактичну сесію і пов’язана one-to-one з `Booking`
- `Payment` зберігається окремо від `Booking`
- токени відновлення пароля зберігаються в `PasswordResetToken`
- доступність терапевтів читається з Google Calendar `freeBusy`
- Google Calendar замінив Calendly в оновленому ТЗ
- кожен therapist підключає власний Google account для calendar sync
- booking request лишається в `PENDING_THERAPIST`, доки therapist не прийме рішення
- після therapist confirmation платформа створює Google Calendar event і зберігає meeting link
- reject і cancel flows видаляють синхронізований Google Calendar event, якщо він існує
- події життєвого циклу інтеграції пишуться в `AuditLog`

## Структура проєкту

```text
theraply-platform/
|- prisma/
|  |- migrations/
|  |- schema.prisma
|  \- seed.ts
|- public/
|- scripts/
|- src/
|  |- app/
|  |- components/
|  |- lib/
|  |- server/
|  |- types/
|  \- proxy.ts
|- .env
|- .env.example
|- .env.production.local.example
|- package.json
|- prisma.config.ts
|- README.md
\- README.ua.md
```

## Локальне середовище

Приклад локального підключення до бази:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/theraply_platform"
```

Змінні середовища, які очікує проєкт:

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

Phase 9 використовує therapist-owned Google accounts.

Що потрібно для конфігурації:

- увімкнути `Google Calendar API` у Google Cloud
- створити OAuth 2.0 Web application client
- зареєструвати `http://localhost:3000/api/integrations/google/callback` для локального середовища
- зареєструвати `https://your-domain/api/integrations/google/callback` для продакшену
- заповнити `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` і `GOOGLE_CALENDAR_REDIRECT_URI`

Поточна runtime-логіка:

- therapist підключає свій Google account на `/therapist/payout-details`
- Theraply читає availability slots із Google Calendar `freeBusy`
- booking request лишається в `PENDING_THERAPIST`, поки therapist не підтвердить або не відхилить його
- therapist confirmation створює Google Calendar event і зберігає Google Meet link
- reject і cancel flows видаляють синхронізований Google Calendar event
- connect, refresh token, event sync і failure-сценарії логуються в `AuditLog`

## Корисні команди

Встановити залежності:

```bash
npm install
```

Запустити застосунок локально:

```bash
npm run dev
```

Зібрати проєкт:

```bash
npm run build
```

Згенерувати Prisma client:

```bash
npm run prisma:generate
```

Створити і застосувати локальну міграцію:

```bash
npm run prisma:migrate:dev -- --name your_migration_name
```

Відкрити Prisma Studio:

```bash
npm run prisma:studio
```

Запустити seed вручну:

```bash
npx prisma db seed
```

Запустити verification script для Етапів 5-7:

```bash
npx tsx scripts/verify-stages-5-7.ts
```

Запустити verification script для Phase 8:

```bash
npx tsx scripts/verify-stage-8.ts
```

## Віддалена production / Vercel база даних

Щоб не змінювати локальний `.env` і випадково не перепідключити локальну WSL-базу, використовуй окремий `.env.production.local`.

1. Скопіюй шаблон:

```bash
cp .env.production.local.example .env.production.local
```

2. Встав у `.env.production.local` віддалений `DATABASE_URL` з Vercel / Prisma Postgres.

3. Якщо хочеш, щоб локальний проєкт теж використовував віддалену БД як основну, продублюй той самий `DATABASE_URL` у `.env`.

4. Запусти міграції для віддаленої бази:

```bash
npm run prisma:migrate:remote
```

5. Запусти seed для віддаленої бази лише якщо справді хочеш записати seed-дані в це спільне середовище:

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

## Verification summary

Поточний verified стан:

- `Phase 3` перевірений через реєстрацію, логін, reset flow і JWT session behavior
- `Phase 4` перевірений через build і роботу приватних role routes
- `Етапи 5-7` перевірені через `scripts/verify-stages-5-7.ts`
- `Phase 8` перевірений через `scripts/verify-stage-8.ts`
- `Phase 9` перевірений через Google Calendar connect, availability, confirm і cancellation sync flows
- `npm run build` проходить успішно
- `npm run dev` стартує коректно

## Що далі

Найлогічніші наступні етапи:

- Stripe payments і webhook-логіка
- email notifications
- production hardening, filters, pagination і monitoring

Деталі реалізації `Phase 9` описані в [docs/phase-9-google-calendar-integration.md](./docs/phase-9-google-calendar-integration.md).

Контракт для `Phase 10` описаний у [docs/phase-10-stripe-payments.md](./docs/phase-10-stripe-payments.md).

Поточну Stripe-конфігурацію можна почати з порожніх placeholder-значень у env-шаблонах, а реальні ключі додати пізніше, коли буде доступ до Stripe credentials.
