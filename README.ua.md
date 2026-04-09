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

Поточний стан застосунку вже включає:
- самостійну реєстрацію клієнта
- логін через `NextAuth` credentials
- `forgot password` і `reset password`
- захищені маршрути за ролями
- спільний private dashboard shell
- role-specific overview dashboards для `client`, `therapist` і `admin`
- дочірні dashboard-маршрути для наступних бізнес-модулів
- server-side dashboard data layer на Prisma

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
- додано захист маршрутів через middleware
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
- `/client/bookings`
- `/client/payments`

### Захищені маршрути для therapist

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/clients`
- `/therapist/payout-details`

### Захищені маршрути для admin

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
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
|  \- middleware.ts
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

## Віддалена production / Vercel база даних

Щоб не змінювати локальний `.env` і випадково не перепідключити локальну WSL-базу, використовуй окремий `.env.production.local`.

1. Скопіюй шаблон:

```bash
cp .env.production.local.example .env.production.local
```

2. Встав у `.env.production.local` значення `DATABASE_URL` із Vercel / Prisma Postgres.

3. Запусти віддалені Prisma-команди через окремі скрипти:

```bash
npm run prisma:migrate:remote
npm run prisma:seed:remote
```

Ці команди читають `DATABASE_URL` тільки з `.env.production.local` і не чіпають локальну WSL-базу.

## Тестові акаунти із seed

Поточний seed створює:
- 1 admin
- 2 therapists
- 2 clients

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

## Підсумок перевірки

У поточному стані перевірено:
- production build проходить успішно
- реєстрація створює `User` + `ClientProfile`
- credentials login працює з хешованими паролями
- forgot-password створює валідний reset token
- reset-password оновлює збережений password hash
- role-based redirects працюють для `client`, `therapist` і `admin`
- private shell завантажується з session-aware header і sidebar
- розгорнуту базу можна мігрувати й засівати через окремий remote Prisma workflow

## Примітки

- `middleware.ts` поки працює нормально, але Next.js 16 попереджає, що згодом file convention перейде на `proxy.ts`
- відправка транзакційних email ще не підключена; у dev-середовищі reset link логуються на сервері
- booking flow, payment flow, Google Calendar sync і deeper operational logic ще попереду
- якщо якийсь секрет від віддаленої БД світився поза очікуваним середовищем, його потрібно ротувати у Prisma Postgres / Vercel

## Наступний крок

Наступна логічна фаза — реальні бізнес-модулі:
- booking workflows
- therapist request handling
- payment flow preparation
- поглиблення role-specific pages на базі вже готового private shell
