# Setup

## Prerequisites

- Node.js compatible with Next.js `16.2.2` and the repo's dependency set.
- npm, because this repo includes `package-lock.json` and npm scripts.
- PostgreSQL database.
- Stripe, Google, SMTP, and Cloudinary credentials for full integration testing.

On this Windows checkout, `npm.cmd` and `npx.cmd` are reliable command forms if plain `npm`/`npx` are inconsistent.

## Install

```bash
npm install
```

The `postinstall` script runs `prisma generate`.

## Environment

```bash
cp .env.example .env
```

Fill in local PostgreSQL and safe test credentials. Do not put live secrets in committed files.

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

Use `npm run prisma:studio` if you need to inspect local data.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Tests And Checks

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run verify:security
npm run verify:phase10
npm run build
```

## Common Local Issues

- Stripe flows need test keys and a local webhook secret from `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Google Calendar flows need the local redirect URI `http://localhost:3000/api/integrations/google/callback`.
- Email delivery uses console output outside production; SMTP is required for production behavior.
- Cloudinary certificate upload routes fail clearly when Cloudinary env vars are missing.
- Production-like cron testing requires `Authorization: Bearer <CRON_SECRET>`.
