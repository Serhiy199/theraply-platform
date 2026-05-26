# Phase 13.11 Manual Security QA

## Goal

Manually verify that role, ownership, cron, webhook, upload, and rate-limit protections work in a production-like environment.

## Preconditions

- Use a staging/preview deployment or a controlled production test window.
- Prepare test accounts:
  - Client A
  - Client B
  - Approved Therapist A
  - Approved Therapist B
  - Unapproved/Pending Therapist
  - Admin
- Prepare at least one booking owned by Client A and Therapist A.
- Prepare one confirmed session if testing therapist/client cancellation.
- Keep `CRON_SECRET`, Stripe webhook secret, SMTP, Google, and Cloudinary env values configured in the target environment.

## Checklist

### 1. Client cannot open another client's booking

Steps:

1. Sign in as Client A.
2. Open a booking detail URL owned by Client A and note the booking id.
3. Sign out and sign in as Client B.
4. Manually navigate to `/client/bookings/{client-a-booking-id}`.

Expected:

- Client B sees `404`/not found or an equivalent inaccessible state.
- Client B does not see Client A personal, session, payment, or meeting data.

Evidence:

- PASS/FAIL:
- Notes:

### 2. Therapist cannot open another therapist's booking/request

Steps:

1. Sign in as Therapist A.
2. Open a request/session detail URL owned by Therapist A and note the booking id.
3. Sign out and sign in as Therapist B.
4. Manually navigate to `/therapist/requests/{therapist-a-booking-id}`.

Expected:

- Therapist B sees `404`/not found or an equivalent inaccessible state.
- Therapist B cannot confirm, reject, cancel, or view Client A data for Therapist A's booking.

Evidence:

- PASS/FAIL:
- Notes:

### 3. Unapproved therapist has no active features

Steps:

1. Sign in as an unapproved or pending therapist.
2. Open:
   - `/therapist/dashboard`
   - `/therapist/requests`
   - `/therapist/clients`
   - `/therapist/payout-details`
3. Try direct action submissions if buttons/forms are visible.

Expected:

- Active therapist features are locked until approval.
- Server actions return permission/locked states, not successful mutations.
- Onboarding remains the only allowed flow, depending on lifecycle status.

Evidence:

- PASS/FAIL:
- Notes:

### 4. Non-admin cannot open admin area

Steps:

1. Sign in as Client A and open `/admin/dashboard`, `/admin/bookings`, `/admin/therapists`.
2. Repeat as Therapist A.

Expected:

- Non-admin users are redirected to `/403` or blocked.
- No admin data is rendered.
- Admin actions cannot be submitted successfully by non-admin users.

Evidence:

- PASS/FAIL:
- Notes:

### 5. Cron endpoint requires `CRON_SECRET`

Steps:

1. Call `/api/cron/booking-rules?dryRun=1` without `Authorization`.
2. Call it with `Authorization: Bearer wrong-secret`.
3. Call it with `Authorization: Bearer {CRON_SECRET}`.

Expected:

- Missing/wrong secret returns `401`.
- Correct secret returns `200` with a dry-run summary.
- No booking mutation happens during `dryRun=1`.

Example PowerShell:

```powershell
Invoke-WebRequest "https://YOUR_DOMAIN/api/cron/booking-rules?dryRun=1" -Method GET
Invoke-WebRequest "https://YOUR_DOMAIN/api/cron/booking-rules?dryRun=1" -Headers @{ Authorization = "Bearer wrong-secret" } -Method GET
Invoke-WebRequest "https://YOUR_DOMAIN/api/cron/booking-rules?dryRun=1" -Headers @{ Authorization = "Bearer YOUR_CRON_SECRET" } -Method GET
```

Evidence:

- PASS/FAIL:
- Notes:

### 6. Invalid Stripe webhook signature is rejected

Steps:

1. Send any JSON body to `/api/stripe/webhook` without `stripe-signature`.
2. Send any JSON body with a fake `stripe-signature`.

Expected:

- Missing signature returns `400`.
- Fake signature returns `400`.
- Response does not leak raw Stripe/provider internals.
- Server logs contain sanitized diagnostic metadata.

Example PowerShell:

```powershell
Invoke-WebRequest "https://YOUR_DOMAIN/api/stripe/webhook" -Method POST -ContentType "application/json" -Body "{}"
Invoke-WebRequest "https://YOUR_DOMAIN/api/stripe/webhook" -Method POST -ContentType "application/json" -Headers @{ "stripe-signature" = "fake" } -Body "{}"
```

Evidence:

- PASS/FAIL:
- Notes:

### 7. Certificate upload rejects wrong file type and size

Steps:

1. Sign in as a therapist whose onboarding form is editable.
2. Try uploading an unsupported file type, for example `.exe`.
3. Try uploading a file larger than 10MB.
4. Try uploading a valid `jpg`, `png`, `webp`, `pdf`, `doc`, `docx`, or `txt` under 10MB.

Expected:

- Unsupported type shows a friendly validation error.
- Oversized file shows a friendly validation error.
- Valid file is uploaded directly from the browser to Cloudinary, confirmed through Theraply, and appears in the certificates list.
- Uploading a valid file larger than 1MB and no larger than 10MB does not fail with a Server Action request-body limit error.
- Admin review can see the uploaded certificate metadata/link.

Evidence:

- PASS/FAIL:
- Notes:

### 8. Repeated auth attempts are rate-limited

Steps:

1. Try incorrect login credentials for the same email more than 5 times within 15 minutes.
2. Try repeated registration attempts for the same email.
3. Try repeated forgot/reset/resend verification attempts.

Expected:

- The user sees a friendly rate-limit message.
- No raw error details are shown.
- Legitimate attempts work again after the configured window.

Evidence:

- PASS/FAIL:
- Notes:

## Automated baseline

Run before or after manual QA:

```powershell
npm.cmd run verify:security
npx.cmd tsc --noEmit --incremental false
```

Current local baseline:

- `npm.cmd run verify:security`: PASS

## Fail handling

If any scenario fails:

1. Record the account role, URL, action, and expected/actual result.
2. Do not patch immediately in production.
3. Fix server-side guard/service ownership first, then UI lock copy second.
4. Re-run `verify:security` and the affected manual scenario.
