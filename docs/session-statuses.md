# Session And Booking Statuses

## BookingStatus

| Status | Meaning | Set by | Next transitions | Payment impact | Calendar/email/audit impact |
| --- | --- | --- | --- | --- | --- |
| `PENDING_THERAPIST` | Client request waiting for therapist decision | Client booking creation | `CONFIRMED`, `REJECTED` | Payment unavailable | Request emails; no calendar event |
| `CONFIRMED` | Therapist accepted and session is scheduled | Therapist confirm, payment reconciliation can preserve confirmed state | `CANCELLED`, `AUTO_CANCELLED`, `COMPLETED` | Stripe Checkout available until payment deadline; paid state tracked separately | Google event/Meet created; confirmation email; audit log |
| `REJECTED` | Therapist rejected request | Therapist | Final | No payment/transfer | Rejection email; audit log; calendar cleanup if needed |
| `CANCELLED` | Client, therapist, or admin cancelled | Client/therapist/admin flows | Final for MVP | Refund or no-refund rule applies; late client cancellation can transfer 90% | Cancellation emails; calendar deletion; audit log |
| `AUTO_CANCELLED` | System cancelled unpaid confirmed booking after deadline | Cron booking rules | Final | Pending/unpaid payment can become failed | Cancellation emails; calendar deletion best effort; audit log |
| `COMPLETED` | Session settled after end time | Therapist completion/no-show action | Final | Paid booking becomes transfer-eligible | Audit log; transfer attempt |

## SessionStatus

| Status | Meaning |
| --- | --- |
| `SCHEDULED` | Session exists and is scheduled. |
| `CANCELLED` | Session was cancelled and meeting/calendar metadata is cleared. |
| `DONE` | Session was completed or marked client no-show. |

## SessionOutcome

| Outcome | Meaning |
| --- | --- |
| `COMPLETED` | Session happened normally. |
| `CLIENT_NO_SHOW` | Client did not attend; therapist still receives 90% under current business rules. |

## Payment/Settlement Scenarios

- Completed session: 90% transfer to therapist.
- Client no-show: 90% transfer to therapist.
- Therapist cancellation: full refund to client for paid bookings.
- Admin/platform cancellation: full refund attempt for paid bookings.
- Client cancellation more than 24 hours before session: full refund for paid bookings.
- Client cancellation less than 24 hours before session: no refund and 90% transfer to therapist when eligible.
- Rejected booking: no payment transfer.
- Reschedule is not a primary implemented MVP flow; payment-preserving reschedule should be treated as post-MVP unless separately implemented.
