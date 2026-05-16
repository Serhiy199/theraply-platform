# Phase 14.2 Test Infrastructure

## Goal

Add the first executable test layer for Theraply without touching production data or live providers.

## Implemented

| Item | Status | Notes |
| --- | --- | --- |
| Unit/integration test runner | Done | Added Vitest as the base runner. |
| Test scripts | Done | Added `test`, `test:watch`, and `test:unit`. |
| Test config | Done | Added `vitest.config.ts` with Node environment and path aliases. |
| Test env setup | Done | Added safe placeholder env values in `tests/setup/test-env.ts`. |
| First smoke test | Done | Added a safe error message unit test to prove the runner works without DB/provider access. |

## Commands

Run all current tests:

```powershell
npm.cmd test
```

Run only unit tests:

```powershell
npm.cmd run test:unit
```

Watch mode while developing tests:

```powershell
npm.cmd run test:watch
```

## Boundaries

- No tests in this slice call the real remote database.
- No tests call live Stripe, Google Calendar, Cloudinary, or SMTP.
- No Playwright/E2E setup was added yet; that should happen after the test database strategy is agreed.
- The setup file uses safe placeholder values only.

## Next Recommended Slice

Phase 14.3 should define the test database strategy before integration tests are added. The project currently uses a remote Vercel/Postgres database for development work, but automated tests need an isolated database or transaction strategy so they cannot mutate production-like data.
