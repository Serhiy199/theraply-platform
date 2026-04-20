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
- автоматичну генерацію meeting link після підтвердження терапевтом
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
- доступність терапевтів планується через Google Calendar
- Google Calendar замінив Calendly в оновленому ТЗ

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
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

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

3. Запусти міграції для віддаленої бази:

```bash
npm run prisma:migrate:remote
```

4. Запусти seed для віддаленої бази:

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
- `npm run build` проходить успішно
- `npm run dev` стартує коректно

## Що далі

Найлогічніші наступні етапи:

- повна інтеграція з Google Calendar
- Stripe payments і webhook-логіка
- email notifications
- production hardening, filters, pagination і monitoring
