# Production releases: schema before code

## Verified baseline (read-only, 2026-09-10)

The VPS currently uses a flat `/var/www/theraply` directory. PM2 `theraply`
is online with that cwd and `/usr/bin/npm` as its script. `.env` is an ubuntu-owned
regular file, mode 600. `logs/` and `node_modules/` exist; `current`, `releases`,
`shared`, `uploads`, and `storage` did not exist at inspection. Nginx proxies to
127.0.0.1:3000, with no root/alias directive found in the inspected configuration.
The old workflow replaced active files using rsync before migrating. It had no
filesystem rollback, even though migration failure prevented PM2 reload.

## Compatible layout

Do not move or delete the existing root or its files during initial adoption.

```text
/var/www/theraply/
  .env                       # unchanged contents, owner and mode
  logs/                      # shared existing persistent directory
  .next/, node_modules/, ... # retained original rollback runtime
  current -> releases/<sha>-<run>-<attempt>
  releases/
    <sha>-<run>-<attempt>/
      .env -> /var/www/theraply/.env
      logs -> /var/www/theraply/logs
      .next/, node_modules/, prisma/, public/
      build/wix-cms/reconcile.cjs
      scripts/deploy-production-release.mjs
      RELEASE_SHA
      PREVIOUS_RELEASE
```

Existing `uploads/` and `storage/` are linked too if present. They are not invented
or relocated. Future persistent paths must be explicitly reviewed before use.
Candidate directories are unique and cannot be reused. No active-directory rsync,
no automatic release pruning, and no automatic Wix reconciliation occur.
PM2 cwd is the physical release directory (`__dirname` in ecosystem config), not
the mutable `current` symlink. This keeps an old process on old files until replacement.
Manual CLI commands after adoption must run from `/var/www/theraply/current`, not
the retained legacy root. In particular this applies to the manual Wix CLI.

## Mandatory backup gate for the later production release task

This change does not run a production backup or migration. Before pushing a release
to main, the operator must create a fresh custom-format dump using the established
production backup procedure, named:

`/var/backups/theraply/theraply-before-release-<exact-main-release-SHA>.dump`

Create it without overwriting any existing dump. It must be owned by the deploy user,
mode 600, nonempty, less than six hours old, and pass `pg_restore --list`. Confirm the
source is `theraply_db/public` and record dump evidence in the release report. The
runner rechecks file metadata and `pg_restore --list`; a listing alone cannot prove
the source database or restorability. No backup is fabricated by deployment.
Determine the local main merge SHA before push, then back up, then push. If delayed
beyond six hours, archive the stale dump without overwriting it and create/approve
a fresh dump at the required path before retrying. Do not weaken this gate.

## Sequence

1. CI installs, lints, tests, security-checks and builds Next and the Wix bundle.
2. Upload only to a new isolated candidate. A partial/failed upload cannot activate.
3. Take host `flock` for preflight through activation, smoke and recovery.
4. Verify old PM2 cwd/status, protected env, fresh backup, artifact SHA and files.
5. Link existing env/persistent paths; `npm ci --include=dev` (Prisma CLI is a dev
   dependency; includes postinstall), then explicit
   candidate Prisma generate. Nothing runs inside the active runtime.
6. Read-only check local production DB identity, then run candidate `prisma migrate
   deploy` and `prisma migrate status`. Any failure exits before activation or PM2.
7. Record previous physical directory, atomically rename a new symlink to `current`.
8. Inspect PM2 and reject duplicate `theraply` registrations. Delete only the existing
   `theraply` registration, then start the candidate ecosystem with `--only theraply
   --env production`. Verify exactly one online process with candidate cwd and
   `/login` HTTP 200; PM2 save. This introduces brief downtime, not zero-downtime reload.

Do not use `startOrReload` to switch physical release directories: an existing PM2
registration can retain its old internal `pm_cwd` despite a changed ecosystem `cwd`.
Replacement forces PM2 to resolve the new script and working directory. Unrelated
PM2 processes are never deleted. If activation failed after deletion, recovery can
start the previous release even when no `theraply` registration remains.

Build/preparation/migration failure leaves the active runtime and PM2 untouched.
Candidate files are retained for diagnosis. A failed SQL migration can still have
partial database effects: no destructive automatic database rollback is attempted.
All future migrations must be backward-compatible with the old running code
(expand/contract). This ordering does not make destructive schema changes safe.

## Recovery and code rollback

PM2 replacement, health or save failure triggers restoration of the prior current link
(or removal of the newly introduced link on first adoption), re-registers the previous
ecosystem, rechecks health and saves PM2. The Action still fails. If recovery fails,
stop and inspect sanitized process metadata; do not blindly rerun the deployment.

Manual code rollback after a successful release, under the same deploy lock:

1. Read and validate `current/PREVIOUS_RELEASE`. It must resolve to the retained root
   or a physical direct child of `releases`. Verify its runtime still exists.
2. Atomically replace `current` with a symlink to that directory using a unique
   temporary link and `mv -Tf`. For first-adoption rollback to the retained root,
   remove only the verified `current` symlink instead (never remove its target).
3. Verify at most one `theraply` registration. If present, run `pm2 delete theraply`.
   Run `pm2 start <previous>/ecosystem.config.js --only theraply --env production`.
4. Verify PM2 physical cwd/status and localhost `/login` HTTP 200, then `pm2 save`.
5. Report the database migration as still applied. Do not run down migrations.

Booking Fee adds a default-zero column and constraint, without rewriting money.
Old Prisma queries select their known columns and tolerate the additional column.
If new fee-bearing payments have already been created, old code does NOT understand
their fee/refund semantics: do not roll back to pre-fee code without a financial
incident plan. Code rollback is not financial or database rollback.

## Verification boundary

Unit simulations use temporary local files and mocked deployment operations to
prove success, preflight/preparation/migration failure and PM2/health recovery order.
The isolated Linux `scripts/verify-pm2-release.mjs --pm2-cli=<absolute-pinned-cli>`
test exercises real PM2 with synthetic HTTP servers and a private PM2_HOME, including
old-cwd reproduction, candidate activation, recovery and unrelated-process preservation.
It never loads application env or connects to a database. It kills only its private
daemon and removes its temporary fixtures. Neither test claims a live VPS deployment
or real migration smoke. Production
activation must still be verified in the separately authorized release task.
Free Intro, booking/payment/Wix logic and Prisma schema are unchanged by this fix.

Failures emit sanitized `RELEASE_FAILURE_GATE` and, if recovery fails,
`RECOVERY_FAILURE_GATE` codes. PM2 inspection/delete/start/save, cwd/status/count,
and HTTP request/status failures are distinguishable without printing child output,
environment values or database URLs. A recovered release still exits unsuccessfully.
