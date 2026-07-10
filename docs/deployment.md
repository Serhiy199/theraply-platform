# Theraply Deployment Workflow

Theraply uses a split deployment model:

- `develop` is the main working branch and should be connected to Vercel staging.
- `main` is the stable production branch and deploys to the VPS through GitHub Actions.
- `hotfix/*` branches are created from `main` only for urgent production fixes.
- annotated tags mark stable releases.

Do not commit production secrets to this repository. Production `.env` must live only on the VPS at `/var/www/theraply/.env`.

## Branch Flow

### develop -> Vercel Staging

1. Create feature work from `develop`.
2. Merge completed work back into `develop`.
3. Vercel should deploy staging from `develop`.
4. Run manual QA against staging before merging to `main`.

### main -> VPS Production

1. Merge only tested code from `develop` into `main`.
2. Push to `main`.
3. GitHub Actions runs checks, builds the app, syncs the deployment artifact to the VPS, applies Prisma migrations, and restarts PM2.

### hotfix/*

1. Create the hotfix branch from `main`.
2. Merge the fix into `main`.
3. Deploy production from `main`.
4. Merge the hotfix back into `develop`.

### Tags

Create tags for stable release points:

```bash
git tag -a v1.0.0-mvp -m "Theraply MVP production release"
git push origin v1.0.0-mvp
```

## GitHub Secrets

Add these secrets in GitHub repository settings:

- `VPS_HOST`: `57.128.169.11`
- `VPS_USER`: `ubuntu`
- `VPS_SSH_KEY`: private SSH key that can deploy to the VPS
- `VPS_PORT`: `22`

The workflow does not store or upload `.env` files.

## VPS Runtime

Production target:

- Project directory: `/var/www/theraply`
- PM2 app name: `theraply`
- Node.js: `24.x`
- npm: `11.x`
- PostgreSQL: `16.x`

The app runs through `ecosystem.config.js`:

```bash
pm2 startOrReload ecosystem.config.js --env production
pm2 save
```

## First Deployment Checklist

Before the first production deployment:

1. Ensure `/var/www/theraply` exists and is owned by the deploy user:

```bash
sudo mkdir -p /var/www/theraply
sudo chown -R ubuntu:ubuntu /var/www/theraply
```

2. Create `/var/www/theraply/.env` on the VPS.
3. Fill production values for database, NextAuth, Stripe, Google, SMTP, Cloudinary, and cron secrets.
4. Confirm PostgreSQL is reachable from the VPS.
5. Confirm Nginx proxies the production domain to the PM2 app port.
6. Add the GitHub secrets listed above.
7. Connect Vercel staging to `develop`.
8. Push tested code to `main`.

## What GitHub Actions Does

The production workflow at `.github/workflows/production-deploy.yml` runs only on `push` to `main`.

It runs:

```bash
npm ci
npm run lint
npm run test:unit
npm run verify:security
npm run build
```

Then it prepares a deployment artifact containing only runtime/build files:

- `.next`
- `public`
- `prisma`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `prisma.config.ts`
- `ecosystem.config.js`

It does not upload:

- `.git`
- `.env` or `.env.*`
- `node_modules`
- local caches
- logs
- local IDE files
- tests and development-only folders

On the VPS it runs:

```bash
cd /var/www/theraply
test -f .env
npm ci
npx prisma generate
npx prisma migrate deploy
pm2 startOrReload ecosystem.config.js --env production
pm2 save
```

`npm ci` is intentionally used instead of `npm ci --omit=dev` because this project currently keeps the Prisma CLI in `devDependencies`, and production migrations require that CLI.

## Rollback Strategy

Preferred rollback:

1. Find the last known good tag or commit.
2. Revert or reset `main` through a normal Git workflow.
3. Push `main` again to redeploy.

Example:

```bash
git checkout main
git pull origin main
git revert <bad_commit_sha>
git push origin main
```

For emergency server rollback, keep a VPS backup or snapshot before the first production deployment and before high-risk releases.

## Production Verification

After deployment:

- open `/login` and `/register`;
- verify client login/dashboard;
- verify therapist login/dashboard;
- verify admin login/dashboard;
- run a test booking on staging before production;
- verify Stripe webhook URL in live mode;
- verify Google OAuth production redirect URL;
- verify SMTP delivery;
- verify cron endpoints with the production `CRON_SECRET`;
- check `pm2 status`;
- check `pm2 logs theraply --lines 100`.
