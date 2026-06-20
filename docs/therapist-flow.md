# Therapist Flow

## Registration And Verification

Therapists register through the standard auth flow. Registration creates a `User` with role `THERAPIST` and an empty `TherapistProfile`. Email verification is required before the therapist can progress to a fully bookable profile.

## Onboarding Draft

The onboarding form stores a JSON draft on `TherapistProfile.profileDraft`. Draft fields include gender, contact number, therapy services provided, years of experience, education/certifications, specialisation, and price per hour. Trusted name/email values come from the authenticated user.

Draft save is allowed while the profile is editable, including incomplete and changes-requested states.

## Certificates

Certificate uploads use signed Cloudinary upload parameters. Allowed formats are `jpg`, `jpeg`, `png`, `webp`, `pdf`, `doc`, `docx`, and `txt`. Maximum file size is `10MB`. Uploaded assets are verified server-side before `TherapistCertificate` records are created.

## Submit For Review

Submitting validates required onboarding fields, maps price per hour to `sessionPricePence`, sets `approvalStatus` to `PENDING_REVIEW`, sets `onboardingCompleted`, records `submittedForReviewAt`, creates audit logs, and sends a pending review email.

## Admin Review

Admin can:

- Approve: sets `APPROVED`, `isApproved=true`, clears rejection data, sends approval email, and attempts optional Wix sync.
- Reject: sets `REJECTED`, stores rejection reason, sends rejection email.
- Request changes: sets `CHANGES_REQUESTED`, stores a review note, sends changes requested email.

## Bookable Visibility

A therapist is listed to clients only when the profile is approved, active, email verified, onboarding completed, Stripe Connect payout readiness exists, and the profile has a valid session price. Google Calendar connection is required for availability reads and booking confirmation.

## Edge Cases

- Pending/rejected/incomplete profiles are hidden from clients.
- Incomplete profile data cannot be submitted for review.
- Missing Google Calendar connection prevents availability and calendar event creation, but does not corrupt existing data.
- Stripe Connect incomplete/restricted state keeps payment unavailable with a clear readiness message.
