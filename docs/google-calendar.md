# Google Calendar

## OAuth

Therapists connect Google Calendar through `/api/integrations/google/connect` and return through `/api/integrations/google/callback`. The configured redirect URI is `GOOGLE_CALENDAR_REDIRECT_URI`.

Scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar`

The app stores Google account email, selected calendar ID, access token, refresh token, token expiry, connection timestamp, and connection flag on `TherapistProfile`.

## Availability

Availability uses Google Calendar free/busy data plus local active bookings. The current slot mapper builds 60-minute slots in a 14-day window with business hours from 09:00 to 17:00. Local active booking conflicts are merged with Google busy ranges.

If Google Calendar is not connected or no target calendar is selected, availability reads fail with safe messages and audit/diagnostic events.

## Event And Meet Creation

When a therapist confirms a booking, the server creates a Google Calendar event in the therapist's selected calendar with `conferenceDataVersion: 1` and a Google Meet request. The returned event ID, conference ID, event HTML link, and meeting URL are stored on `Session`.

If the app cannot create the Google event, confirmation fails and any partially created event is best-effort deleted.

## Deletion

Reject/cancel/auto-cancel flows delete the linked Google Calendar event when an event ID exists. Auto-cancel deletion is best effort and logs failures.

## Production Notes

Production Google OAuth configuration must include the production callback URL:

```text
https://your-production-domain/api/integrations/google/callback
```

Google consent screen, scopes, test users or publication state, and domain settings must match the production domain.
