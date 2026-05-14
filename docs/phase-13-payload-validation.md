# Phase 13.3 Payload Validation

This slice moves critical action payload checks into reusable Zod schemas while keeping service-level ownership/status checks in place.

## Added Validation Modules

| File | Purpose |
| --- | --- |
| `src/lib/validations/action-payloads.ts` | Shared payload schemas for booking ids, client compensation choice, therapist request decisions, admin booking cancel, therapist review approve/reject, and Google Calendar target selection. |
| `src/lib/validations/therapist-payout.ts` | Payout details schema, including required account holder name, max lengths, optional text normalization, and GBP session price parsing to pence. |

## Updated Entrypoints

| Entrypoint | Validation now used |
| --- | --- |
| `src/app/client/bookings/actions.ts#cancelBookingAction` | `bookingIdPayloadSchema` |
| `src/app/client/bookings/actions.ts#resolveCompensationAction` | `clientCompensationPayloadSchema` |
| `src/app/therapist/requests/actions.ts#requestDecisionAction` | `therapistRequestDecisionPayloadSchema` |
| `src/app/therapist/requests/actions.ts#therapistCancelSessionAction` | `therapistCancelSessionPayloadSchema` |
| `src/app/admin/bookings/actions.ts#adminCancelBookingAction` | `adminCancelBookingPayloadSchema` |
| `src/app/admin/therapists/actions.ts#approveTherapistAction` | `therapistReviewPayloadSchema` |
| `src/app/admin/therapists/actions.ts#rejectTherapistAction` | `therapistRejectReviewPayloadSchema` |
| `src/app/therapist/payout-details/actions.ts#payoutDetailsAction` | `therapistPayoutDetailsPayloadSchema` |
| `src/app/therapist/payout-details/actions.ts#googleCalendarSelectionAction` | `googleCalendarSelectionPayloadSchema` |

## Notes

- Server-side role and ownership checks remain in actions/services.
- Validation does not replace service-level guards. Services still verify booking ownership, therapist ownership, admin authority, lifecycle status, and business-state transitions.
- Payout `sessionPriceGbp` keeps the UI field name for field errors, then maps to `sessionPricePence` before calling the service.
- Stripe checkout, auth, registration, reset password, booking request, therapist onboarding, and certificate upload already had schema/service validation before this slice.

## Remaining Follow-Ups

1. Add rate limiting around critical validated payloads.
2. Add AuditLog coverage for important validated mutations that still lack audit entries.
3. Consider stronger identifier validation, for example CUID format checks, if all deployed ids are guaranteed to stay on one format.

## Verification

Ran:

```bash
npx.cmd tsc --noEmit --incremental false
```

Result: passed.
