# Phase 13.4 Rate Limiting Foundation

This slice adds a reusable rate-limit foundation without attaching it to production flows yet.
Endpoint integration should happen in the next slices so each UX can get the right error handling.

## Added Files

| File | Purpose |
| --- | --- |
| `src/lib/constants/rate-limit.ts` | Shared rate-limit scopes and default presets for auth, checkout, upload, Google Calendar OAuth, and cron. |
| `src/server/services/rate-limit.service.ts` | Server-only fixed-window rate limiter with an in-memory store, hashed keys, request IP helpers, user/email/IP identifier helper, and standard rate-limit headers. |

## Presets

| Preset | Scope | Default |
| --- | --- | --- |
| `authLogin` | `auth:login` | 5 attempts / 15 minutes |
| `authRegister` | `auth:register` | 5 attempts / 1 hour |
| `authForgotPassword` | `auth:forgot-password` | 3 attempts / 15 minutes |
| `authResetPassword` | `auth:reset-password` | 5 attempts / 15 minutes |
| `authResendVerification` | `auth:resend-verification` | 3 attempts / 15 minutes |
| `stripeCheckout` | `stripe:checkout` | 10 attempts / 5 minutes |
| `therapistCertificateUpload` | `therapist:certificate-upload` | 10 attempts / 1 hour |
| `googleCalendarConnect` | `google-calendar:connect` | 10 attempts / 15 minutes |
| `cronBookingRules` | `cron:booking-rules` | 30 attempts / 15 minutes |

## API Surface

Use:

```ts
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import {
  checkRateLimitPreset,
  getClientIpFromRequest,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";
```

For API routes:

```ts
const result = await checkRateLimitPreset(
  RATE_LIMIT_PRESETS.stripeCheckout,
  getClientIpFromRequest(request),
);

if (!result.allowed) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: getRateLimitHeaders(result) },
  );
}
```

For server actions, use `buildUserRateLimitIdentifier()` with the current user id, email, or client IP if available.

## Provider Note

The current provider is in-memory. This is acceptable as a foundation and for local/dev MVP behavior, but it is not a complete distributed production limiter on serverless or multi-instance hosting.

When the project moves to a VPS or uses Redis/Upstash, keep the same exported service API and replace the backing store implementation.

## Next Integration Targets

1. Login / NextAuth credentials authorize flow.
2. Registration.
3. Forgot/reset password.
4. Resend email verification.
5. Stripe checkout.
6. Therapist certificate upload.
7. Google Calendar connect callback/start route.
8. Cron endpoint unauthorized request dampening.

## Verification

Run:

```bash
npx.cmd tsc --noEmit --incremental false
```
