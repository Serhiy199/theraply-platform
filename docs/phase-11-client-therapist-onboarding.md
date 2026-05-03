# Phase 11: Client and Therapist Onboarding

This document tracks the staged implementation of separate client and therapist
registration, onboarding, and approval flows.

## Step 1.1: Current Data Model Baseline

Status: complete.

The current Prisma schema already separates the account record from role-specific
profile records through these models:

- `User`
- `ClientProfile`
- `TherapistProfile`

The current role and therapist approval enums are:

- `UserRole`
- `TherapistApprovalStatus`

In this codebase, `User` is the current account-level model. It stores the shared
authentication and identity fields used by all roles, including:

- `email`
- `passwordHash`
- `firstName`
- `lastName`
- `role`
- `isActive`
- shared relations into bookings, email logs, audit logs, password reset tokens,
  and role-specific profiles

For Phase 11, `User` should be treated as the existing `Account` equivalent.
It should not be renamed to `Account` during this phase because the existing
auth flow, dashboard routing, booking relations, admin views, and Prisma
relations are already built around `User`.

The intended direction is to extend `User` with account-level verification fields
and keep role-specific data in `ClientProfile` and `TherapistProfile`.

## Step 1.1 Verification Notes

Confirmed in `prisma/schema.prisma`:

- `UserRole` exists with `CLIENT`, `THERAPIST`, and `ADMIN`.
- `TherapistApprovalStatus` currently exists with `PENDING`, `APPROVED`,
  `REJECTED`, and `SUSPENDED`.
- `User` owns shared account/auth fields and links to `ClientProfile` and
  `TherapistProfile`.
- `ClientProfile` is already a separate client-specific profile entity.
- `TherapistProfile` is already a separate therapist-specific profile entity.

No schema rename is required for this step.

## Step 1.2: User Email Verification Fields

Status: complete.

`User` now includes account-level email verification fields:

- `emailVerified Boolean @default(false)`
- `emailVerifiedAt DateTime?`

Expected lifecycle:

1. New accounts are created with `emailVerified = false`.
2. When a verification link is completed, the account will be updated to
   `emailVerified = true`.
3. The same verification action will set `emailVerifiedAt` to the current time.

This step only adds the storage fields. The token model, verification link
generation, email sending integration, and redirect behavior are handled by
later steps.

## Step 1.3: Email Verification Token Model

Status: complete.

`EmailVerificationToken` now stores one-time verification tokens for account
email confirmation.

Fields:

- `id`
- `userId`
- `token`
- `expiresAt`
- `usedAt`
- `createdAt`

The model belongs to `User` with `onDelete: Cascade`, and `User` now exposes
the `emailVerificationTokens` relation.

Indexes cover:

- lookup by `userId`
- lookup by unique `token`
- expiry cleanup via `expiresAt`
- used-token filtering via `usedAt`
- active-token queries by `[userId, expiresAt]`

This step only adds storage for verification tokens. Token generation, email
delivery, token validation, account activation, and role-based redirect behavior
are implemented in later steps.

## Step 1.4: Therapist Approval Status Model

Status: complete.

`TherapistApprovalStatus` now uses explicit onboarding and review states:

- `EMAIL_NOT_VERIFIED`
- `PROFILE_INCOMPLETE`
- `PENDING_REVIEW`
- `APPROVED`
- `REJECTED`
- `SUSPENDED`

`TherapistProfile.approvalStatus` now defaults to `EMAIL_NOT_VERIFIED`.

Migration behavior:

- existing `PENDING` values are converted to `PROFILE_INCOMPLETE`
- existing `APPROVED`, `REJECTED`, and `SUSPENDED` values are preserved

The admin dashboard pending-approval count now targets `PENDING_REVIEW`, because
that is the state for profiles explicitly submitted to admin review.

## Step 1.5: Therapist Onboarding Fields

Status: complete.

`TherapistProfile` now includes onboarding and admin-review fields:

- `onboardingCompleted Boolean @default(false)`
- `submittedForReviewAt DateTime?`
- `approvedAt DateTime?`
- `rejectedAt DateTime?`
- `rejectionReason String?`
- `profileDraft Json?`

Expected lifecycle:

1. Newly created therapist profiles start with `onboardingCompleted = false`.
2. Draft saves can store incomplete profile data in `profileDraft`.
3. Submit for review will later set `onboardingCompleted = true`,
   `submittedForReviewAt = now()`, and `approvalStatus = PENDING_REVIEW`.
4. Admin approval will later set `approvedAt = now()`,
   `approvalStatus = APPROVED`, and `isApproved = true`.
5. Admin rejection will later set `rejectedAt = now()`,
   `approvalStatus = REJECTED`, `isApproved = false`, and optionally
   `rejectionReason`.

This step only adds storage fields. Indexes for onboarding/admin review queries
are handled separately in Step 1.6.

## Step 1.6: Therapist Onboarding Query Indexes

Status: complete.

`TherapistProfile` now has additional indexes for upcoming onboarding and admin
review queries:

- `[onboardingCompleted]`
- `[submittedForReviewAt]`
- `[approvalStatus, onboardingCompleted]`
- `[approvalStatus, submittedForReviewAt]`

Existing indexes on `[approvalStatus]`, `[isApproved]`, and
`[approvalStatus, isApproved]` remain in place for public listing and approval
filters.

These indexes support:

- finding therapists who have not completed onboarding
- sorting/reviewing submitted therapist profiles
- querying `PENDING_REVIEW` profiles for admin review
- querying `APPROVED` and completed profiles for public/client-facing flows
