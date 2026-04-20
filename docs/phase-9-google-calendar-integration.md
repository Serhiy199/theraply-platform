# Phase 9: Google Calendar Integration

This document describes the implemented Google Calendar integration for Theraply after Phase 9 completion.

## Final Scope

Phase 9 is built around therapist-owned Google accounts.

Implemented behavior:

- each therapist connects their own Google account
- the therapist can choose the target Google Calendar used for sync
- Theraply reads therapist availability from Google Calendar `freeBusy`
- booking requests remain in `PENDING_THERAPIST` until the therapist decides
- therapist confirmation creates a real Google Calendar event
- the Google Calendar event provides the Google Meet link stored in the platform
- reject and cancel flows remove the synced Google Calendar event
- audit logging and runtime diagnostics cover connect, sync, refresh, and failure scenarios

## Source Of Truth

- therapist availability comes from Google Calendar, not from a local static slot table
- Theraply remains the source of truth for booking state:
  - `PENDING_THERAPIST`
  - `CONFIRMED`
  - `REJECTED`
  - `CANCELLED`
  - `AUTO_CANCELLED`

## Implemented User Flow

1. Therapist opens `/therapist/payout-details`.
2. Therapist connects a Google account through `/api/integrations/google/connect`.
3. Google redirects back to `/api/integrations/google/callback`.
4. Theraply stores OAuth tokens and the connected Google account metadata in `TherapistProfile`.
5. Therapist selects the target Google Calendar.
6. Client opens therapist availability and sees slots derived from Google Calendar `freeBusy`.
7. Client creates a booking request for a free slot.
8. The booking is stored with `PENDING_THERAPIST`.
9. Therapist confirms the request.
10. Theraply creates a Google Calendar event and stores:
    - `googleCalendarEventId`
    - `googleCalendarConferenceId`
    - `googleCalendarEventHtmlLink`
    - `meetingUrl`
11. If the booking is rejected or cancelled later, Theraply deletes the synced Google Calendar event and clears the session metadata.

## Data Model

### `TherapistProfile`

Google Calendar connection state is stored in:

- `googleCalendarId`
- `googleCalendarEmail`
- `googleAccessToken`
- `googleRefreshToken`
- `googleTokenExpiresAt`
- `googleCalendarConnectedAt`
- `isGoogleCalendarConnected`

### `Session`

Google Calendar event state is stored in:

- `googleCalendarEventId`
- `googleCalendarConferenceId`
- `googleCalendarEventHtmlLink`
- `meetingUrl`

## Required Environment Variables

Local or deployed environments must define:

- `DATABASE_URL`
- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

## Google Cloud Setup

1. Create or reuse a Google Cloud project for Theraply.
2. Enable the `Google Calendar API`.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Web application client.
5. Register the callback URL used by Theraply.

### Redirect URI

- local: `http://localhost:3000/api/integrations/google/callback`
- deployed example: `https://app.example.com/api/integrations/google/callback`

The redirect URI must exactly match the Google Cloud OAuth client configuration.

## Key Server Files

- `src/lib/google/google-calendar-config.ts`
- `src/lib/google/google-oauth.ts`
- `src/lib/google/google-calendar.ts`
- `src/lib/google/google-slot-mapper.ts`
- `src/server/services/google-calendar.service.ts`
- `src/server/services/google-availability.service.ts`
- `src/server/services/booking-flow.service.ts`
- `src/server/services/audit-log.service.ts`
- `src/app/api/integrations/google/connect/route.ts`
- `src/app/api/integrations/google/callback/route.ts`

## Audit Logging And Diagnostics

Google Calendar lifecycle events are written into `AuditLog`.

Covered events include:

- connect started
- connected
- disconnected
- target calendar updated
- token refreshed
- availability read failures
- Google event created
- Google event deleted
- OAuth callback mismatch or denial
- event create/delete failures

Runtime diagnostics are also written to server logs for failure scenarios.

## UI Surface

Google Calendar status is visible in:

- therapist dashboard overview
- therapist payout and calendar settings
- therapist booking details
- client booking details
- admin booking details

The UI distinguishes between:

- Google Calendar connected vs setup incomplete
- Google Meet synced vs pending/manual meeting link state

## End-Of-Phase Verification

Use this checklist to verify the final Phase 9 behavior:

1. Connect a therapist Google account.
2. Select the target Google Calendar.
3. Open the client booking flow and verify slots come from Google Calendar.
4. Create a booking request for a visible free slot.
5. Confirm the request as the therapist.
6. Verify a Google Calendar event exists and a Google Meet link appears in Theraply.
7. Reject or cancel another synced booking and verify the Google Calendar event is removed.
8. Verify `AuditLog` contains Google Calendar lifecycle records.
9. Run `npm run build` and confirm the project builds successfully.
