# Phase 13.9 Error Monitoring

## Goal

Prepare a production-safe monitoring layer without coupling the MVP to a specific vendor before approval.

## Implemented

- Added `src/server/services/monitoring.service.ts`.
- Existing `logDiagnosticEvent(...)` now delegates to the monitoring layer.
- Diagnostic metadata is sanitized before logging:
  - sensitive keys such as password, secret, token, key, cookie, authorization, signature, webhook, credential, and DSN are redacted;
  - known Stripe, Google OAuth, webhook, and bearer-token value patterns are redacted;
  - `Error` objects are normalized to name/message only;
  - nested metadata is depth-limited.
- `createAuditLogEntryBestEffort(...)` now uses `logDiagnosticEvent(...)`, so audit-log failures also pass through sanitization.
- Added env placeholders:
  - `ERROR_MONITORING_PROVIDER`
  - `SENTRY_DSN`

## Provider strategy

Current MVP provider:

- `ERROR_MONITORING_PROVIDER=console`

Future approved slice:

- install and configure Sentry or another provider;
- wire provider-specific capture inside `captureDiagnosticEvent(...)`;
- keep the rest of the codebase using `logDiagnosticEvent(...)` / `captureDiagnosticEvent(...)`.

## Safety rules

- Do not log passwords, app passwords, OAuth tokens, API keys, webhook secrets, cookies, auth headers, or DSNs.
- Keep provider errors in server diagnostics only.
- UI/API responses continue using safe messages from Phase 13.7.
