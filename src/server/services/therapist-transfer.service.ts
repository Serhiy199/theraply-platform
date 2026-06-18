import "server-only";
import {
  BookingStatus,
  PaymentStatus,
  PaymentTransferStatus,
  Prisma,
  SessionOutcome,
  SessionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/stripe";
import { isStripeConfigured } from "@/lib/stripe/stripe-config";
import { THERAPIST_SHARE_PERCENT } from "@/lib/constants/payments";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { isStripeConnectReady } from "@/server/services/stripe-connect.service";

const DEFAULT_TRANSFER_LIMIT = 50;
const SYSTEM_ACTOR_ID = null;

export type TherapistTransferResult =
  | {
      status: "transferred";
      paymentId: string;
      bookingId: string;
      stripeTransferId: string;
    }
  | {
      status: "skipped";
      paymentId: string | null;
      bookingId: string;
      reason:
        | "PAYMENT_NOT_FOUND"
        | "PAYMENT_NOT_PAID"
        | "SESSION_NOT_SETTLED"
        | "TRANSFER_ALREADY_COMPLETED"
        | "THERAPIST_STRIPE_NOT_READY"
        | "CHARGE_MISSING";
    }
  | {
      status: "failed";
      paymentId: string | null;
      bookingId: string;
      reason: string;
    };

export type TherapistTransfersRunSummary = {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  limit: number;
  candidates: number;
  transferred: number;
  skipped: number;
  failed: number;
  items: TherapistTransferResult[];
};

export class TherapistTransferServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "STRIPE_NOT_CONFIGURED"
      | "TRANSFER_CREATE_FAILED",
  ) {
    super(message);
    this.name = "TherapistTransferServiceError";
  }
}

const transferBookingSelect = {
  id: true,
  bookingStatus: true,
  therapistId: true,
  startsAt: true,
  endsAt: true,
  session: {
    select: {
      id: true,
      sessionStatus: true,
      outcome: true,
      completedAt: true,
    },
  },
  therapist: {
    select: {
      therapistProfile: {
        select: {
          stripeAccountId: true,
          stripeOnboardingStatus: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
        },
      },
    },
  },
  payment: {
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      transferStatus: true,
      stripeChargeId: true,
      stripeTransferGroup: true,
      stripeTransferId: true,
      therapistAmount: true,
      transferredAt: true,
      transferAttemptCount: true,
    },
  },
} satisfies Prisma.BookingSelect;

type TransferBooking = Prisma.BookingGetPayload<{
  select: typeof transferBookingSelect;
}>;

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_TRANSFER_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 250));
}

function getTherapistAmount(amount: number) {
  return Math.round((amount * THERAPIST_SHARE_PERCENT) / 100);
}

function getTransferGroup(bookingId: string) {
  return `theraply_booking_${bookingId}`;
}

function isSettledSession(booking: TransferBooking) {
  return (
    booking.bookingStatus === BookingStatus.COMPLETED &&
    booking.session?.sessionStatus === SessionStatus.DONE &&
    (booking.session.outcome === SessionOutcome.COMPLETED ||
      booking.session.outcome === SessionOutcome.CLIENT_NO_SHOW)
  );
}

function buildSkippedResult(
  booking: Pick<TransferBooking, "id" | "payment">,
  reason: Extract<TherapistTransferResult, { status: "skipped" }>["reason"],
): Extract<TherapistTransferResult, { status: "skipped" }> {
  return {
    status: "skipped",
    bookingId: booking.id,
    paymentId: booking.payment?.id ?? null,
    reason,
  };
}

async function getTransferBookingOrThrow(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: transferBookingSelect,
  });

  if (!booking) {
    throw new TherapistTransferServiceError(
      "Booking not found for therapist transfer.",
      "BOOKING_NOT_FOUND",
    );
  }

  return booking;
}

function evaluateTransferEligibility(
  booking: TransferBooking,
): Extract<TherapistTransferResult, { status: "skipped" }> | null {
  if (!booking.payment) {
    return buildSkippedResult(booking, "PAYMENT_NOT_FOUND");
  }

  if (booking.payment.transferStatus === PaymentTransferStatus.TRANSFERRED) {
    return buildSkippedResult(booking, "TRANSFER_ALREADY_COMPLETED");
  }

  if (booking.payment.paymentStatus !== PaymentStatus.PAID) {
    return buildSkippedResult(booking, "PAYMENT_NOT_PAID");
  }

  if (!isSettledSession(booking)) {
    return buildSkippedResult(booking, "SESSION_NOT_SETTLED");
  }

  if (!booking.payment.stripeChargeId) {
    return buildSkippedResult(booking, "CHARGE_MISSING");
  }

  if (!isStripeConnectReady(booking.therapist.therapistProfile ?? {})) {
    return buildSkippedResult(booking, "THERAPIST_STRIPE_NOT_READY");
  }

  return null;
}

export async function createTherapistTransferForBooking(
  bookingId: string,
  actorUserId: string | null = SYSTEM_ACTOR_ID,
): Promise<TherapistTransferResult> {
  if (!isStripeConfigured()) {
    throw new TherapistTransferServiceError(
      "Stripe is not configured yet in this environment.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const booking = await getTransferBookingOrThrow(bookingId);
  const skipResult = evaluateTransferEligibility(booking);

  if (skipResult) {
    await createAuditLogEntryBestEffort({
      actorUserId,
      entityType: "Payment",
      entityId: skipResult.paymentId ?? booking.id,
      action: "STRIPE_TRANSFER_SKIPPED",
      after: {
        bookingId: booking.id,
        reason: skipResult.reason,
      },
    });

    return skipResult;
  }

  const payment = booking.payment;
  const stripeAccountId = booking.therapist.therapistProfile?.stripeAccountId;

  if (!payment || !stripeAccountId || !payment.stripeChargeId) {
    return buildSkippedResult(booking, "THERAPIST_STRIPE_NOT_READY");
  }

  const therapistAmount = payment.therapistAmount ?? getTherapistAmount(payment.amount);
  const transferGroup = payment.stripeTransferGroup ?? getTransferGroup(booking.id);
  const stripe = getStripeClient();

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      transferStatus: PaymentTransferStatus.PENDING,
      therapistAmount,
      stripeTransferGroup: transferGroup,
      transferFailureReason: null,
      transferFailedAt: null,
      transferAttemptCount: {
        increment: 1,
      },
    },
  });

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: therapistAmount,
        currency: payment.currency,
        destination: stripeAccountId,
        source_transaction: payment.stripeChargeId,
        transfer_group: transferGroup,
        metadata: {
          bookingId: booking.id,
          paymentId: payment.id,
          therapistUserId: booking.therapistId,
          sessionOutcome: booking.session?.outcome ?? "",
        },
      },
      {
        idempotencyKey: `theraply-transfer-${payment.id}`,
      },
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        transferStatus: PaymentTransferStatus.TRANSFERRED,
        stripeTransferId: transfer.id,
        transferredAt: new Date(),
        transferFailureReason: null,
        transferFailedAt: null,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "STRIPE_TRANSFER_CREATED",
      after: {
        bookingId: booking.id,
        stripeTransferId: transfer.id,
        stripeAccountId,
        amount: therapistAmount,
        currency: payment.currency,
        transferGroup,
      },
    });

    return {
      status: "transferred",
      paymentId: payment.id,
      bookingId: booking.id,
      stripeTransferId: transfer.id,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    logDiagnosticEvent("therapist-transfer", "Unable to create therapist transfer.", {
      bookingId: booking.id,
      paymentId: payment.id,
      stripeAccountId,
      error: reason,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        transferStatus: PaymentTransferStatus.FAILED,
        transferFailedAt: new Date(),
        transferFailureReason: reason,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "STRIPE_TRANSFER_CREATE_FAILED",
      after: {
        bookingId: booking.id,
        stripeAccountId,
        amount: therapistAmount,
        currency: payment.currency,
        error: reason,
      },
    });

    return {
      status: "failed",
      paymentId: payment.id,
      bookingId: booking.id,
      reason,
    };
  }
}

async function getTransferCandidates(limit: number) {
  return prisma.booking.findMany({
    where: {
      bookingStatus: BookingStatus.COMPLETED,
      session: {
        is: {
          sessionStatus: SessionStatus.DONE,
          outcome: {
            in: [SessionOutcome.COMPLETED, SessionOutcome.CLIENT_NO_SHOW],
          },
        },
      },
      payment: {
        is: {
          paymentStatus: PaymentStatus.PAID,
          transferStatus: {
            in: [PaymentTransferStatus.PENDING, PaymentTransferStatus.FAILED, PaymentTransferStatus.NOT_ELIGIBLE],
          },
        },
      },
    },
    orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
    },
  });
}

function countResults(items: TherapistTransferResult[], status: TherapistTransferResult["status"]) {
  return items.filter((item) => item.status === status).length;
}

export async function runTherapistTransfers(input: {
  dryRun?: boolean;
  limit?: number;
} = {}): Promise<TherapistTransfersRunSummary> {
  const dryRun = input.dryRun ?? false;
  const limit = normalizeLimit(input.limit);
  const startedAt = new Date();
  const candidates = await getTransferCandidates(limit);
  const items: TherapistTransferResult[] = [];

  await createAuditLogEntryBestEffort({
    actorUserId: SYSTEM_ACTOR_ID,
    entityType: "CronJob",
    entityId: "therapist-transfers",
    action: "CRON_THERAPIST_TRANSFERS_RUN_STARTED",
    after: {
      dryRun,
      limit,
      candidates: candidates.length,
    },
  });

  for (const candidate of candidates) {
    if (dryRun) {
      const booking = await getTransferBookingOrThrow(candidate.id);
      const skipResult = evaluateTransferEligibility(booking);

      items.push(
        skipResult ?? {
          status: "skipped",
          bookingId: candidate.id,
          paymentId: booking.payment?.id ?? null,
          reason: "SESSION_NOT_SETTLED",
        },
      );
      continue;
    }

    try {
      items.push(await createTherapistTransferForBooking(candidate.id));
    } catch (error) {
      if (error instanceof TherapistTransferServiceError && error.code === "STRIPE_NOT_CONFIGURED") {
        throw error;
      }

      items.push({
        status: "failed",
        bookingId: candidate.id,
        paymentId: null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finishedAt = new Date();
  const summary = {
    dryRun,
    startedAt,
    finishedAt,
    limit,
    candidates: candidates.length,
    transferred: countResults(items, "transferred"),
    skipped: countResults(items, "skipped"),
    failed: countResults(items, "failed"),
    items,
  };

  await createAuditLogEntryBestEffort({
    actorUserId: SYSTEM_ACTOR_ID,
    entityType: "CronJob",
    entityId: "therapist-transfers",
    action: "CRON_THERAPIST_TRANSFERS_RUN_COMPLETED",
    after: summary,
  });

  return summary;
}
