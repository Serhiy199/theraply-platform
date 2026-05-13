import "server-only";
import { BookingStatus, PaymentStatus, Prisma, SessionStatus } from "@prisma/client";
import {
  CRON_BOOKING_RULES_AUDIT_ACTIONS,
  CRON_BOOKING_RULES_AUTO_CANCEL_CANDIDATE_BOOKING_STATUSES,
  CRON_BOOKING_RULES_AUTO_CANCEL_EMAIL_REASON,
  CRON_BOOKING_RULES_AUTO_CANCEL_REASONS,
  CRON_BOOKING_RULES_AUTO_CANCEL_UNPAID_PAYMENT_STATUSES,
  CRON_BOOKING_RULES_EXPIRED_CHECKOUT_PAYMENT_STATUSES,
  CRON_BOOKING_RULES_FINAL_BOOKING_STATUSES,
  CRON_BOOKING_RULES_SKIP_REASONS,
  CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
  type CronBookingRulesSkipReason,
} from "@/lib/constants/cron-booking-rules";
import { PAYMENT_POLICY_HOURS_BEFORE_SESSION } from "@/lib/constants/payments";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { deleteTherapistGoogleCalendarEvent } from "@/server/services/google-calendar.service";
import { markStripeCheckoutSessionExpired } from "@/server/services/payment-flow.service";
import { sendBookingCancelledEmailsBestEffort } from "@/server/services/transactional-email-events.service";

const DEFAULT_CRON_BOOKING_RULES_LIMIT = 50;

const cronBookingRulesBookingSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  paymentDueBy: true,
  bookingStatus: true,
  cancelledAt: true,
  cancelledByUserId: true,
  therapistId: true,
  session: {
    select: {
      id: true,
      sessionStatus: true,
      meetingUrl: true,
      googleCalendarEventId: true,
      googleCalendarConferenceId: true,
      googleCalendarEventHtmlLink: true,
    },
  },
  payment: {
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      checkoutExpiresAt: true,
      stripeCheckoutSessionId: true,
    },
  },
} satisfies Prisma.BookingSelect;

const cronBookingRulesPaymentSelect = {
  id: true,
  bookingId: true,
  amount: true,
  currency: true,
  paymentStatus: true,
  checkoutExpiresAt: true,
  stripeCheckoutSessionId: true,
  booking: {
    select: {
      id: true,
      bookingStatus: true,
    },
  },
} satisfies Prisma.PaymentSelect;

type CronBookingRulesBooking = Prisma.BookingGetPayload<{
  select: typeof cronBookingRulesBookingSelect;
}>;

type CronBookingRulesPayment = Prisma.PaymentGetPayload<{
  select: typeof cronBookingRulesPaymentSelect;
}>;

export type CronBookingRulesRunInput = {
  dryRun?: boolean;
  now?: Date;
  limit?: number;
};

export type CronBookingRulesItemResult =
  | {
      id: string;
      status: "candidate";
      reason: string;
    }
  | {
      id: string;
      status: "processed";
      reason: string;
    }
  | {
      id: string;
      status: "skipped";
      reason: CronBookingRulesSkipReason;
    }
  | {
      id: string;
      status: "failed";
      reason: string;
    };

export type CronBookingRulesRunSummary = {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  now: Date;
  limit: number;
  expiredCheckoutPayments: {
    candidates: number;
    processed: number;
    skipped: number;
    failed: number;
    items: CronBookingRulesItemResult[];
  };
  autoCancelledBookings: {
    candidates: number;
    processed: number;
    skipped: number;
    failed: number;
    items: CronBookingRulesItemResult[];
  };
};

function getPaymentDeadlineFallback(startsAt: Date) {
  return new Date(
    startsAt.getTime() - PAYMENT_POLICY_HOURS_BEFORE_SESSION * 60 * 60 * 1000,
  );
}

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_CRON_BOOKING_RULES_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 250));
}

function isFinalBookingStatus(status: BookingStatus) {
  return CRON_BOOKING_RULES_FINAL_BOOKING_STATUSES.some((finalStatus) => finalStatus === status);
}

function getAutoCancelSkipReason(
  booking: Pick<CronBookingRulesBooking, "bookingStatus" | "paymentDueBy" | "startsAt" | "payment">,
  now: Date,
): CronBookingRulesSkipReason | null {
  if (isFinalBookingStatus(booking.bookingStatus)) {
    return CRON_BOOKING_RULES_SKIP_REASONS.alreadyFinal;
  }

  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
    return CRON_BOOKING_RULES_SKIP_REASONS.alreadyFinal;
  }

  if (booking.payment?.paymentStatus === PaymentStatus.PAID) {
    return CRON_BOOKING_RULES_SKIP_REASONS.paymentAlreadyPaid;
  }

  if (booking.payment?.paymentStatus === PaymentStatus.REFUNDED) {
    return CRON_BOOKING_RULES_SKIP_REASONS.paymentAlreadyRefunded;
  }

  if (booking.payment?.paymentStatus === PaymentStatus.PENDING) {
    return CRON_BOOKING_RULES_SKIP_REASONS.paymentStillPending;
  }

  const paymentDueBy = booking.paymentDueBy ?? getPaymentDeadlineFallback(booking.startsAt);

  if (paymentDueBy > now) {
    return CRON_BOOKING_RULES_SKIP_REASONS.paymentDeadlineNotPassed;
  }

  return null;
}

function buildExpiredCheckoutPaymentWhere(now: Date): Prisma.PaymentWhereInput {
  return {
    paymentStatus: {
      in: [...CRON_BOOKING_RULES_EXPIRED_CHECKOUT_PAYMENT_STATUSES],
    },
    checkoutExpiresAt: {
      lte: now,
    },
    booking: {
      bookingStatus: {
        notIn: [...CRON_BOOKING_RULES_FINAL_BOOKING_STATUSES],
      },
    },
  };
}

function buildAutoCancelBookingWhere(now: Date): Prisma.BookingWhereInput {
  const fallbackDeadline = new Date(
    now.getTime() + PAYMENT_POLICY_HOURS_BEFORE_SESSION * 60 * 60 * 1000,
  );

  return {
    bookingStatus: {
      in: [...CRON_BOOKING_RULES_AUTO_CANCEL_CANDIDATE_BOOKING_STATUSES],
    },
    AND: [
      {
        OR: [
          {
            paymentDueBy: {
              lte: now,
            },
          },
          {
            paymentDueBy: null,
            startsAt: {
              lte: fallbackDeadline,
            },
          },
        ],
      },
      {
        OR: [
          {
            payment: null,
          },
          {
            payment: {
              paymentStatus: {
                in: [...CRON_BOOKING_RULES_AUTO_CANCEL_UNPAID_PAYMENT_STATUSES],
              },
            },
          },
        ],
      },
    ],
  };
}

async function getExpiredCheckoutPaymentCandidates(now: Date, limit: number) {
  return prisma.payment.findMany({
    where: buildExpiredCheckoutPaymentWhere(now),
    orderBy: [{ checkoutExpiresAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: cronBookingRulesPaymentSelect,
  });
}

async function getAutoCancelBookingCandidates(now: Date, limit: number) {
  return prisma.booking.findMany({
    where: buildAutoCancelBookingWhere(now),
    orderBy: [{ paymentDueBy: "asc" }, { startsAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: cronBookingRulesBookingSelect,
  });
}

async function expireCheckoutPayment(
  payment: CronBookingRulesPayment,
  dryRun: boolean,
): Promise<CronBookingRulesItemResult> {
  if (dryRun) {
    return {
      id: payment.id,
      status: "candidate",
      reason: CRON_BOOKING_RULES_AUDIT_ACTIONS.paymentCheckoutExpired,
    };
  }

  try {
    await markStripeCheckoutSessionExpired(payment.bookingId, {
      checkoutSessionId: payment.stripeCheckoutSessionId,
      amount: payment.amount,
      currency: payment.currency,
      checkoutExpiresAt: payment.checkoutExpiresAt,
      failedReason: "Payment checkout expired before the 24-hour session payment deadline.",
    });

    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "Payment",
      entityId: payment.id,
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.paymentCheckoutExpired,
      before: {
        paymentStatus: payment.paymentStatus,
        checkoutExpiresAt: payment.checkoutExpiresAt,
      },
      after: {
        paymentStatus: PaymentStatus.FAILED,
        bookingId: payment.bookingId,
      },
    });

    return {
      id: payment.id,
      status: "processed",
      reason: CRON_BOOKING_RULES_AUDIT_ACTIONS.paymentCheckoutExpired,
    };
  } catch (error) {
    logDiagnosticEvent("cron-booking-rules", "Unable to expire stale checkout payment.", {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });

    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "Payment",
      entityId: payment.id,
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.runFailed,
      after: {
        bookingId: payment.bookingId,
        operation: CRON_BOOKING_RULES_AUDIT_ACTIONS.paymentCheckoutExpired,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      id: payment.id,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function deleteGoogleCalendarEventBestEffort(booking: CronBookingRulesBooking) {
  if (!booking.session?.googleCalendarEventId) {
    return null;
  }

  try {
    await deleteTherapistGoogleCalendarEvent(
      booking.therapistId,
      booking.session.googleCalendarEventId,
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logDiagnosticEvent("cron-booking-rules", "Unable to delete Google Calendar event during auto-cancel.", {
      bookingId: booking.id,
      therapistUserId: booking.therapistId,
      googleCalendarEventId: booking.session.googleCalendarEventId,
      error: message,
    });

    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "Booking",
      entityId: booking.id,
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.googleCalendarDeleteFailed,
      after: {
        therapistUserId: booking.therapistId,
        googleCalendarEventId: booking.session.googleCalendarEventId,
        error: message,
      },
    });

    return message;
  }
}

async function autoCancelBooking(
  booking: CronBookingRulesBooking,
  now: Date,
  dryRun: boolean,
): Promise<CronBookingRulesItemResult> {
  const skipReason = getAutoCancelSkipReason(booking, now);

  if (skipReason) {
    return {
      id: booking.id,
      status: "skipped",
      reason: skipReason,
    };
  }

  if (dryRun) {
    return {
      id: booking.id,
      status: "candidate",
      reason: CRON_BOOKING_RULES_AUTO_CANCEL_REASONS.paymentDeadlinePassed,
    };
  }

  const googleCalendarDeleteError = await deleteGoogleCalendarEventBestEffort(booking);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const currentBooking = await tx.booking.findUnique({
        where: { id: booking.id },
        select: cronBookingRulesBookingSelect,
      });

      if (!currentBooking) {
        throw new Error("Booking was not found while auto-cancelling.");
      }

      const refreshedSkipReason = getAutoCancelSkipReason(currentBooking, now);

      if (refreshedSkipReason) {
        return {
          status: "skipped" as const,
          reason: refreshedSkipReason,
        };
      }

      await tx.booking.update({
        where: { id: currentBooking.id },
        data: {
          bookingStatus: BookingStatus.AUTO_CANCELLED,
          cancelledAt: now,
          cancelledByUserId: null,
        },
      });

      if (currentBooking.session?.id) {
        await tx.session.update({
          where: { id: currentBooking.session.id },
          data: {
            sessionStatus: SessionStatus.CANCELLED,
            meetingUrl: null,
            googleCalendarEventId: null,
            googleCalendarConferenceId: null,
            googleCalendarEventHtmlLink: null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
          entityType: "Booking",
          entityId: currentBooking.id,
          action: CRON_BOOKING_RULES_AUDIT_ACTIONS.bookingAutoCancelled,
          before: {
            bookingStatus: currentBooking.bookingStatus,
            paymentDueBy: currentBooking.paymentDueBy,
            paymentStatus: currentBooking.payment?.paymentStatus ?? null,
            sessionStatus: currentBooking.session?.sessionStatus ?? null,
            googleCalendarEventId: currentBooking.session?.googleCalendarEventId ?? null,
          },
          after: {
            bookingStatus: BookingStatus.AUTO_CANCELLED,
            cancelledAt: now,
            cancelledByUserId: null,
            sessionStatus: SessionStatus.CANCELLED,
            reason: CRON_BOOKING_RULES_AUTO_CANCEL_REASONS.paymentDeadlinePassed,
            googleCalendarDeleteError,
          },
        },
      });

      return {
        status: "processed" as const,
        reason: CRON_BOOKING_RULES_AUTO_CANCEL_REASONS.paymentDeadlinePassed,
      };
    });

    if (result.status === "processed") {
      await sendBookingCancelledEmailsBestEffort(booking.id, {
        reason: CRON_BOOKING_RULES_AUTO_CANCEL_EMAIL_REASON,
      });

      return {
        id: booking.id,
        status: "processed",
        reason: result.reason,
      };
    }

    return {
      id: booking.id,
      status: "skipped",
      reason: result.reason,
    };
  } catch (error) {
    logDiagnosticEvent("cron-booking-rules", "Unable to auto-cancel unpaid booking.", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });

    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "Booking",
      entityId: booking.id,
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.runFailed,
      after: {
        operation: CRON_BOOKING_RULES_AUDIT_ACTIONS.bookingAutoCancelled,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      id: booking.id,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function countResults(items: CronBookingRulesItemResult[], status: CronBookingRulesItemResult["status"]) {
  return items.filter((item) => item.status === status).length;
}

function buildSummary(input: {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  now: Date;
  limit: number;
  expiredCheckoutPaymentResults: CronBookingRulesItemResult[];
  autoCancelBookingResults: CronBookingRulesItemResult[];
}): CronBookingRulesRunSummary {
  return {
    dryRun: input.dryRun,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    now: input.now,
    limit: input.limit,
    expiredCheckoutPayments: {
      candidates: input.expiredCheckoutPaymentResults.length,
      processed: countResults(input.expiredCheckoutPaymentResults, "processed"),
      skipped: countResults(input.expiredCheckoutPaymentResults, "skipped"),
      failed: countResults(input.expiredCheckoutPaymentResults, "failed"),
      items: input.expiredCheckoutPaymentResults,
    },
    autoCancelledBookings: {
      candidates: input.autoCancelBookingResults.length,
      processed: countResults(input.autoCancelBookingResults, "processed"),
      skipped: countResults(input.autoCancelBookingResults, "skipped"),
      failed: countResults(input.autoCancelBookingResults, "failed"),
      items: input.autoCancelBookingResults,
    },
  };
}

export async function getCronBookingRulesCandidates(input: CronBookingRulesRunInput = {}) {
  const now = input.now ?? new Date();
  const limit = normalizeLimit(input.limit);
  const [expiredCheckoutPayments, autoCancelBookings] = await Promise.all([
    getExpiredCheckoutPaymentCandidates(now, limit),
    getAutoCancelBookingCandidates(now, limit),
  ]);

  return {
    now,
    limit,
    expiredCheckoutPayments,
    autoCancelBookings,
  };
}

export async function runCronBookingRules(
  input: CronBookingRulesRunInput = {},
): Promise<CronBookingRulesRunSummary> {
  const dryRun = input.dryRun ?? false;
  const now = input.now ?? new Date();
  const limit = normalizeLimit(input.limit);
  const startedAt = new Date();

  if (!dryRun) {
    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "CronJob",
      entityId: "booking-rules",
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.runStarted,
      after: {
        now,
        limit,
      },
    });
  }

  const expiredCheckoutPayments = await getExpiredCheckoutPaymentCandidates(now, limit);
  const expiredCheckoutPaymentResults: CronBookingRulesItemResult[] = [];

  for (const payment of expiredCheckoutPayments) {
    expiredCheckoutPaymentResults.push(await expireCheckoutPayment(payment, dryRun));
  }

  const autoCancelBookings = await getAutoCancelBookingCandidates(now, limit);
  const autoCancelBookingResults: CronBookingRulesItemResult[] = [];

  for (const booking of autoCancelBookings) {
    autoCancelBookingResults.push(await autoCancelBooking(booking, now, dryRun));
  }

  const finishedAt = new Date();
  const summary = buildSummary({
    dryRun,
    startedAt,
    finishedAt,
    now,
    limit,
    expiredCheckoutPaymentResults,
    autoCancelBookingResults,
  });

  if (!dryRun) {
    await createAuditLogEntryBestEffort({
      actorUserId: CRON_BOOKING_RULES_SYSTEM_ACTOR_ID,
      entityType: "CronJob",
      entityId: "booking-rules",
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.runCompleted,
      after: {
        now,
        limit,
        expiredCheckoutPayments: {
          candidates: summary.expiredCheckoutPayments.candidates,
          processed: summary.expiredCheckoutPayments.processed,
          skipped: summary.expiredCheckoutPayments.skipped,
          failed: summary.expiredCheckoutPayments.failed,
        },
        autoCancelledBookings: {
          candidates: summary.autoCancelledBookings.candidates,
          processed: summary.autoCancelledBookings.processed,
          skipped: summary.autoCancelledBookings.skipped,
          failed: summary.autoCancelledBookings.failed,
        },
      },
    });
  }

  return summary;
}
