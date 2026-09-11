# Paid-session booking fee

New GBP Payments explicitly snapshot a server-owned 199-pence booking fee.
Missing/zero-price sessions remain invalid; this does not implement free intros.

## Monetary contract

- `amount` is the original session price, not the total customer charge.
- `therapistAmount` remains 90% of the original session price.
- `platformFeeAmount` remains the platform SESSION share after the platform-funded promo.
- `clientPayableAmount` is session price minus promo, excluding the booking fee.
- `creditAppliedAmount` is capped at session payable; credit cannot pay the fee.
- `stripeChargeAmount = clientPayableAmount - creditAppliedAmount + bookingFeeAmount`.
- Platform gross before processing costs is `platformFeeAmount + bookingFeeAmount`.

An 8000-pence session pays the therapist 7200, keeps a platform session share
of 800, and charges 8199 without credit/promo. With 2000 credit it charges
6199. With 8000 or more credit it consumes only 8000 credit and charges 199.
Ten-percent promo on that session leaves 7200 session payable plus 199 fee.

## Snapshot and legacy compatibility

The additive migration defaults historical Payments to zero. It changes no
historical totals. New Payments explicitly store 199; reused Payments retain
their existing fee, including zero. Existing PENDING Payments cannot be
re-priced by checkout. Failed/expired attempts retain the fee for retry.
Webhook reconciliation validates the persisted card total, not today's fee.
Checkout requests do not accept authoritative monetary inputs.

## Refund semantics

For any eligible cancellation actor, refund only `stripeChargeAmount -
bookingFeeAmount`. Restore the original applied credit once through the
existing locked credit ledger. Never send a zero-value Stripe refund request.
The Stripe refund has a Payment-scoped idempotency key; pending/failed refunds
do not mark the session refunded. Existing transferred-payment safeguards remain.

`REFUNDED` means the SESSION was refunded; the non-refundable booking fee
can remain captured. `refundedAmount` records only actual card refund pence,
not restored credit and not the retained fee. For 2000 credit on an 8000 session,
refund 6000 card pence and restore 2000 credit. For full credit, restore 8000,
record refundedAmount zero, and retain the 199 card charge.

For fee-bearing Payments, unsupported external partial refunds or refunds
including the fee fail closed for manual reconciliation. This is not an
arbitrary partial-refund system. Legacy zero-fee refunds retain their existing
accounting behavior. Repeated refund events cannot restore credit twice.

## Migration and recovery

Migration: `20260910220000_add_payment_booking_fee`. Apply before deploying
the new generated Prisma client. The default is zero with a nonnegative check.
Staging verification compared all 28 existing Payment rows before/after and
confirmed every fee zero, every prior field unchanged, and migrations up to date.

Do not drop the column after fee-bearing payments exist or run old payment
code against them: old code cannot correctly reconcile their totals/refunds.
Use a forward fix preserving snapshots. Before any future production rollout,
take the normal backup and explicitly approve migration/deployment separately.

## Acceptance boundary

Automated tests cover money, promo, credit, retry/legacy snapshots, payout,
session-only refunds, repeated refund events, presentation, and email details.
Real Stripe and browser acceptance must use an isolated staging TEST account.
The inspected local TEST account has a production webhook, so no test financial
writes were performed through it. This is an open acceptance gate, not a pass.
