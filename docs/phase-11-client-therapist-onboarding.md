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

## Step 1.7: Seed Data Alignment

Status: complete.

Seeded users now represent already verified development accounts:

- `emailVerified = true`
- `emailVerifiedAt` is set to a deterministic seed timestamp

Seeded approved therapist profiles now include completed onboarding and review
metadata:

- `approvalStatus = APPROVED`
- `isApproved = true`
- `onboardingCompleted = true`
- `submittedForReviewAt` is populated
- `approvedAt` is populated
- `rejectedAt = null`
- `rejectionReason = null`
- `profileDraft = null`

This keeps seeded client/admin accounts usable immediately and keeps seeded
therapists visible in client-facing booking flows under the new approval model.

## Step 1.8: Prisma Migration Creation and Application

Status: complete.

The Prisma migration set for Step 1 has been created and applied to the
development database.

Applied migrations:

- `20260503120000_add_user_email_verification_fields`
- `20260503121000_add_email_verification_tokens`
- `20260503122000_update_therapist_approval_statuses`
- `20260503123000_add_therapist_onboarding_fields`
- `20260503124000_add_therapist_onboarding_indexes`

`prisma migrate dev` completed successfully and regenerated Prisma Client.

## Step 1.9: Prisma Client Generation

Status: complete.

Prisma Client was generated successfully after the Step 1 schema and migration
changes.

Verification commands:

- `npm.cmd run prisma:generate`
- `npx.cmd prisma validate`

## Step 1.10: Minimal TypeScript Verification

Status: complete.

The Step 1 data-model changes pass the minimal TypeScript verification.

Verification commands:

- `npx.cmd tsc --noEmit --incremental false`
- `npx.cmd prisma validate`

Step 1 is now complete at the schema, migration, Prisma Client, and seed-code
level.

## Step 2.1: Registration Role Validation

Status: complete.

`registerSchema` now accepts a public self-signup role.

Allowed values:

- `CLIENT`
- `THERAPIST`

`ADMIN` is intentionally excluded from public registration validation.

## Step 2.2: Register Action Role Parsing

Status: complete.

`registerAction` now reads the public self-signup role from submitted form data
and passes it through `registerSchema`.

The action temporarily falls back to `CLIENT` when no role is present so the
existing registration form remains usable until the UI role selector is added.

The action still calls the existing `registerClientAccount` service in this
step. That service is replaced by role-aware `registerAccount` in Step 2.3.

## Step 2.3: Role-Aware Registration Service

Status: complete.

`registerClientAccount` has been replaced with `registerAccount`.

Registration behavior:

- `CLIENT` creates a `User` plus `ClientProfile`
- `THERAPIST` creates a `User` plus `TherapistProfile`
- `ADMIN` remains unavailable through public registration because validation
  only allows `CLIENT` and `THERAPIST`

New therapist profiles rely on the Prisma defaults from Step 1:

- `approvalStatus = EMAIL_NOT_VERIFIED`
- `isApproved = false`
- `onboardingCompleted = false`

`registerAction` now calls `registerAccount`.

## Step 2.4: Registration Role Selector UI

Status: complete.

`RegisterForm` now includes an account type selector.

Options:

- `Client`
- `Therapist`

The selector submits the `role` form field with one of these values:

- `CLIENT`
- `THERAPIST`

`CLIENT` remains the default selection so the previous client registration
behavior stays intact until the rest of the role-specific onboarding flow is
implemented.

## Step 2.5: Registration Copy Update

Status: complete.

Registration copy is now role-neutral across the registration screen.

Updated areas:

- `RegisterForm` helper text no longer describes registration as client-only.
- `/register` page intro no longer points only to client booking flow.

## Step 2.6: Registration Success Message Review

Status: complete.

No application code change was needed for this step.

The registration success message is role-neutral and points users to email
verification:

- `Account created successfully. Check your email to verify your account.`

This message remains valid for both `CLIENT` and `THERAPIST` registration.

## Step 2.7: TypeScript Verification

Status: complete.

The registration role-select changes pass TypeScript verification.

Verification commands:

- `npx.cmd tsc --noEmit --incremental false`
- `npx.cmd prisma validate`

## Step 3.1: Email Verification Auth Constants

Status: complete.

Auth constants now include the foundation for email verification:

- `AUTH_ROUTES.verifyEmailBase = "/verify-email"`
- `EMAIL_VERIFICATION_RULES.tokenTtlHours = 24`
- `EMAIL_TEMPLATES.verification = "EMAIL_VERIFICATION"`
- email verification success/error messages for invalid, expired, used, and
  generic failure states

These constants are storage/provider agnostic and will be used by the email
verification service and route in the next steps.

## Step 3.2: Email Delivery Abstraction

Status: complete.

`email-delivery.service.ts` now exposes `sendTransactionalEmail(...)`.

Current behavior:

- creates an `EmailLog` row with `PENDING`
- in non-production environments, logs the email content/action URL through
  `console.info`
- marks console-delivered messages as `SENT`
- in production without a configured provider, marks delivery as `FAILED`
  without throwing

The service is intentionally provider-agnostic. A future Resend/SMTP/SendGrid
adapter can be added inside this service without changing auth or verification
flow code.

## Step 3.3: Email Verification Service

Status: complete.

`email-verification.service.ts` now owns verification token lifecycle logic.

Functions:

- `createEmailVerificationForUser(user)`
- `sendEmailVerification(userId)`
- `verifyEmailToken(token)`

Implemented behavior:

- generates secure random verification tokens
- sets token expiry using `EMAIL_VERIFICATION_RULES`
- invalidates older active verification tokens for the same user
- creates `EmailVerificationToken` records
- builds `/verify-email/[token]` links from auth constants
- sends provider-agnostic transactional email through `sendTransactionalEmail`
- creates/updates `EmailLog` through the delivery abstraction
- verifies valid tokens by setting `User.emailVerified = true`
- sets `User.emailVerifiedAt`
- moves therapist profiles from `EMAIL_NOT_VERIFIED` to `PROFILE_INCOMPLETE`

## Step 3.4: Registration Email Verification Hook

Status: complete.

`registerAccount(...)` now sends email verification after successfully creating
the account and role-specific profile.

Registration now creates:

- `User` with Prisma default `emailVerified = false`
- `ClientProfile` immediately for `CLIENT`
- `TherapistProfile` immediately for `THERAPIST`
- `EmailVerificationToken` via `sendEmailVerification(user.id)`
- `EmailLog` via the provider-agnostic delivery abstraction

Therapist profiles still start from Prisma defaults:

- `approvalStatus = EMAIL_NOT_VERIFIED`
- `isApproved = false`
- `onboardingCompleted = false`

## Step 3.5: Email Verification Route

Status: complete.

`/verify-email/[token]` now verifies email confirmation tokens.

Implemented behavior:

- reads `token` from route params
- calls `verifyEmailToken(token)`
- shows a clear error page for invalid, expired, used, or inactive-user tokens
- redirects verified clients to `/client/dashboard`
- redirects verified therapists to `/therapist/onboarding`
- redirects verified admins to `/admin/dashboard`

Because protected role routes require an active session, unauthenticated users
may still be sent through login by the existing proxy with the intended
role-specific destination preserved as the callback URL.
