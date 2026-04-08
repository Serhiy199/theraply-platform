# Theraply Platform

English version: [README.md](./README.md)

Theraply Platform — це застосунок на Next.js для трьох основних ролей:
- клієнти
- терапевти
- адміністратори

Маркетинговий сайт лишається поза межами цього репозиторію. У цьому проєкті знаходиться продуктова частина платформи, яка працюватиме на окремому субдомені.

## Поточний стан

Завершені фази:
- `Phase 1` - ініціалізація проєкту
- `Phase 2` - проєктування бази даних і локальний запуск PostgreSQL
- `Phase 3` - авторизація, відновлення пароля, захист маршрутів і базові кабінети ролей

Поточний стан застосунку вже включає:
- `register` для клієнтських акаунтів
- `login` через `NextAuth` credentials
- `forgot password`
- `reset password`
- захищені маршрути за ролями
- базові dashboard-сторінки для `client`, `therapist`, `admin`

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
- локально перевірено реєстрацію, логін, генерацію reset token і зміну пароля

## Реалізовані маршрути

### Публічні маршрути

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Захищені маршрути

- `/client/dashboard`
- `/therapist/dashboard`
- `/admin/dashboard`

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
|- src/
|  |- app/
|  |- components/
|  |- lib/
|  |- server/
|  |- types/
|  \- middleware.ts
|- .env
|- .env.example
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

Створити і застосувати міграцію:

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

## Тестові акаунти із seed

Локальний seed зараз створює:
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

## Підсумок перевірки Phase 3

Локально перевірено:
- production build проходить успішно
- реєстрація клієнта створює `User` + `ClientProfile`
- credentials login працює з хешованими паролями
- forgot-password створює валідний reset token
- reset-password оновлює збережений password hash
- старий пароль після reset більше не працює
- новий пароль після reset працює
- використаний reset token інвалідовується

## Примітки

- `middleware.ts` поки працює нормально, але Next.js 16 попереджає, що згодом file convention перейде на `proxy.ts`
- відправка транзакційних email ще не підключена; у dev-середовищі reset link логуються на сервері
- кнопка `logout` у UI ще не додана, хоча auth-основа вже готова

## Наступний крок

Наступна запланована фаза:
- `Phase 4: розвиток базового dashboard experience і role-specific workspace`

У цій фазі будемо рухатись у напрямку:
- більш насичених dashboard layouts
- навігації між секціями кабінетів
- перших реальних блоків контенту для кожної ролі
- підготовки до booking і payment flows