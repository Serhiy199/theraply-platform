# Phase 9: Google Calendar Integration

This document fixes the agreed integration scenario for Phase 9 so implementation can continue without ambiguity.

## Agreed MVP Scenario

- each therapist connects their own Google account
- Theraply reads therapist availability from Google Calendar
- the booking request remains in `PENDING_THERAPIST` until the therapist confirms or rejects it
- after therapist confirmation, Theraply creates a Google Calendar event for the booked session
- the created Google Calendar event is expected to provide the meeting link used by the platform

## Source Of Truth

- therapist availability comes from Google Calendar, not from a local static slot table
- Theraply still remains the source of truth for booking state:
  - `PENDING_THERAPIST`
  - `CONFIRMED`
  - `REJECTED`
  - cancellation flows

## Expected User Flow

1. Therapist connects their Google account.
2. Client selects a therapist.
3. Theraply reads available time from that therapist's Google Calendar.
4. Client creates a booking request for a free slot.
5. Booking is stored with `PENDING_THERAPIST`.
6. Therapist confirms or rejects the request.
7. If confirmed, Theraply creates a Google Calendar event and stores the event reference plus meeting link in the platform.

## Implementation Boundary For This Step

Phase 9 Step 1 does not yet add OAuth, token storage, Google API calls, or UI settings pages.

This step only fixes the integration contract that future implementation must follow.

## Step 2: Google Cloud Configuration

Phase 9 Step 2 prepares the project for Google OAuth and Calendar API access without adding runtime integration yet.

### Google Cloud Setup

1. Create or reuse a Google Cloud project for Theraply.
2. Enable the Google Calendar API.
3. Configure an OAuth consent screen for the product environment you are testing.
4. Create an OAuth 2.0 Web application client.
5. Register the callback URL that Theraply will use after Google authentication.

### Redirect URI

The agreed callback URL for the upcoming integration is:

- local: `http://localhost:3000/api/integrations/google/callback`
- production example: `https://app.example.com/api/integrations/google/callback`

### Required Environment Variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`

### Notes For The Next Step

- the connect route will redirect a therapist to Google OAuth
- the callback route will exchange the authorization code for tokens
- the redirect URI documented here must exactly match the Google Cloud OAuth client configuration
