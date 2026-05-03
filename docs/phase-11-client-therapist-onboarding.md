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
