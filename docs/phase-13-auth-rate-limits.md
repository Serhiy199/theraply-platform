# Phase 13.5 Auth Endpoint Rate Limits

This slice connects the Phase 13.4 rate-limit foundation to authentication and account lifecycle flows.

## Active Limits

| Flow | File | Preset | Identifier |
| --- | --- | --- | --- |
| Login credentials | `src/auth.ts` | `RATE_LIMIT_PRESETS.authLogin` | Normalized email |
| Registration | `src/app/register/actions.ts` | `RATE_LIMIT_PRESETS.authRegister` | Normalized email |
| Forgot password | `src/app/forgot-password/actions.ts` | `RATE_LIMIT_PRESETS.authForgotPassword` | Normalized email |
| Reset password | `src/app/reset-password/[token]/actions.ts` | `RATE_LIMIT_PRESETS.authResetPassword` | Reset token |
| Resend verification, signed in | `src/app/verify-email/actions.ts` | `RATE_LIMIT_PRESETS.authResendVerification` | Current user id |
| Resend verification, signed out | `src/app/verify-email/actions.ts` | `RATE_LIMIT_PRESETS.authResendVerification` | Normalized email |

## User-Facing Behavior

When a limit is exceeded, server actions return:

```txt
Too many attempts. Please wait a little and try again.
```

Login throws the same message from the NextAuth credentials provider. The current login UI still maps sign-in failures to the existing generic invalid-login message, so this does not expose extra account state.

## Security Notes

- Limits are applied after schema validation so identifiers are normalized before they are used.
- Rate-limit keys are hashed by the rate-limit service.
- This is currently backed by the in-memory provider introduced in Phase 13.4. It reduces abuse per running process but is not a distributed limiter across multiple serverless instances.
- The service API is ready for a Redis/Upstash/VPS-backed provider later.

## Remaining Rate-Limit Targets

1. Stripe checkout API.
2. Therapist certificate upload.
3. Google Calendar connect/callback start points.
4. Cron endpoint request dampening.

## Verification

Ran:

```bash
npx.cmd tsc --noEmit --incremental false
```

Result: passed.
