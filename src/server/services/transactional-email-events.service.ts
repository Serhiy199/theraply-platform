import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildBookingCancelledEmail,
  buildBookingConfirmedEmail,
  buildBookingRejectedEmail,
  buildBookingRequestCreatedEmail,
  buildPaymentFailedEmail,
  buildPaymentSuccessfulEmail,
} from "@/lib/email/templates/transactional";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import { sendTransactionalEmail } from "@/server/services/email-delivery.service";

const transactionalEmailBookingSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingStatus: true,
  notes: true,
  cancelledByUserId: true,
  client: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  therapist: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      therapistProfile: {
        select: {
          displayName: true,
        },
      },
    },
  },
  cancelledBy: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  session: {
    select: {
      meetingUrl: true,
      googleCalendarEventHtmlLink: true,
    },
  },
  payment: {
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      failedReason: true,
    },
  },
} satisfies Prisma.BookingSelect;

type TransactionalEmailBooking = Prisma.BookingGetPayload<{
  select: typeof transactionalEmailBookingSelect;
}>;

type EmailRecipient = {
  userId: string;
  email: string;
  name: string;
  workspaceUrl: string;
};

type SendEmailTemplateInput = {
  recipient: EmailRecipient;
  email: ReturnType<
    | typeof buildBookingRequestCreatedEmail
    | typeof buildBookingConfirmedEmail
    | typeof buildBookingRejectedEmail
    | typeof buildBookingCancelledEmail
    | typeof buildPaymentSuccessfulEmail
    | typeof buildPaymentFailedEmail
  >;
};

type BookingEventOptions = {
  reason?: string | null;
};

function getAppBaseUrl() {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function buildAppUrl(path: string) {
  return `${getAppBaseUrl()}${path}`;
}

function getUserName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  return [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ") ||
    user.email?.trim() ||
    "Theraply user";
}

function getTherapistName(booking: TransactionalEmailBooking) {
  return (
    booking.therapist.therapistProfile?.displayName?.trim() ||
    getUserName(booking.therapist)
  );
}

function getMeetingLink(booking: TransactionalEmailBooking) {
  return (
    booking.session?.meetingUrl?.trim() ||
    booking.session?.googleCalendarEventHtmlLink?.trim() ||
    null
  );
}

function getClientRecipient(booking: TransactionalEmailBooking): EmailRecipient {
  return {
    userId: booking.client.id,
    email: booking.client.email,
    name: getUserName(booking.client),
    workspaceUrl: buildAppUrl(`/client/bookings/${booking.id}`),
  };
}

function getTherapistRecipient(booking: TransactionalEmailBooking): EmailRecipient {
  return {
    userId: booking.therapist.id,
    email: booking.therapist.email,
    name: getTherapistName(booking),
    workspaceUrl: buildAppUrl(`/therapist/requests/${booking.id}`),
  };
}

function getBookingTemplateInput(
  booking: TransactionalEmailBooking,
  recipient: EmailRecipient,
) {
  return {
    recipientName: recipient.name,
    clientName: getUserName(booking.client),
    therapistName: getTherapistName(booking),
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    bookingStatus: booking.bookingStatus,
    meetingLink: getMeetingLink(booking),
    sessionUrl: recipient.workspaceUrl,
    dashboardUrl: recipient.workspaceUrl,
  };
}

function getPaymentTemplateInput(
  booking: TransactionalEmailBooking,
  recipient: EmailRecipient,
  options?: BookingEventOptions,
) {
  return {
    ...getBookingTemplateInput(booking, recipient),
    paymentStatus: booking.payment?.paymentStatus ?? null,
    amount: booking.payment
      ? {
          amountMinor: booking.payment.amount,
          currency: booking.payment.currency,
        }
      : null,
    failedReason: options?.reason ?? booking.payment?.failedReason ?? null,
  };
}

async function getBookingForTransactionalEmail(bookingId: string) {
  return prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: transactionalEmailBookingSelect,
  });
}

async function sendEmailTemplateBestEffort(input: SendEmailTemplateInput) {
  try {
    await sendTransactionalEmail({
      userId: input.recipient.userId,
      email: input.recipient.email,
      template: input.email.template,
      subject: input.email.subject,
      text: input.email.text,
      html: input.email.html,
      actionUrl: input.email.actionUrl,
    });
  } catch (error) {
    logDiagnosticEvent("transactional-email-events", "Email delivery failed.", {
      template: input.email.template,
      userId: input.recipient.userId,
      email: input.recipient.email,
      error,
    });
  }
}

async function sendBookingEmailsBestEffort(
  bookingId: string,
  sender: (booking: TransactionalEmailBooking) => Promise<void>,
) {
  try {
    const booking = await getBookingForTransactionalEmail(bookingId);

    if (!booking) {
      logDiagnosticEvent("transactional-email-events", "Booking not found for email event.", {
        bookingId,
      });
      return;
    }

    await sender(booking);
  } catch (error) {
    logDiagnosticEvent("transactional-email-events", "Booking email event failed.", {
      bookingId,
      error,
    });
  }
}

export async function sendBookingRequestCreatedEmailsBestEffort(bookingId: string) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);
    const therapist = getTherapistRecipient(booking);

    await Promise.all([
      sendEmailTemplateBestEffort({
        recipient: client,
        email: buildBookingRequestCreatedEmail(
          getBookingTemplateInput(booking, client),
        ),
      }),
      sendEmailTemplateBestEffort({
        recipient: therapist,
        email: buildBookingRequestCreatedEmail(
          getBookingTemplateInput(booking, therapist),
        ),
      }),
    ]);
  });
}

export async function sendBookingConfirmedEmailBestEffort(bookingId: string) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);

    await sendEmailTemplateBestEffort({
      recipient: client,
      email: buildBookingConfirmedEmail(getBookingTemplateInput(booking, client)),
    });
  });
}

export async function sendBookingRejectedEmailBestEffort(
  bookingId: string,
  options: BookingEventOptions = {},
) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);

    await sendEmailTemplateBestEffort({
      recipient: client,
      email: buildBookingRejectedEmail({
        ...getBookingTemplateInput(booking, client),
        rejectionReason: options.reason ?? booking.notes ?? null,
      }),
    });
  });
}

export async function sendBookingCancelledEmailsBestEffort(
  bookingId: string,
  options: BookingEventOptions = {},
) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);
    const therapist = getTherapistRecipient(booking);
    const cancelledByName = booking.cancelledBy
      ? getUserName(booking.cancelledBy)
      : null;

    await Promise.all([
      sendEmailTemplateBestEffort({
        recipient: client,
        email: buildBookingCancelledEmail({
          ...getBookingTemplateInput(booking, client),
          cancelledByName,
          cancellationReason: options.reason ?? null,
        }),
      }),
      sendEmailTemplateBestEffort({
        recipient: therapist,
        email: buildBookingCancelledEmail({
          ...getBookingTemplateInput(booking, therapist),
          cancelledByName,
          cancellationReason: options.reason ?? null,
        }),
      }),
    ]);
  });
}

export async function sendPaymentSuccessfulEmailBestEffort(bookingId: string) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);

    await sendEmailTemplateBestEffort({
      recipient: client,
      email: buildPaymentSuccessfulEmail(getPaymentTemplateInput(booking, client)),
    });
  });
}

export async function sendPaymentFailedEmailBestEffort(
  bookingId: string,
  options: BookingEventOptions = {},
) {
  await sendBookingEmailsBestEffort(bookingId, async (booking) => {
    const client = getClientRecipient(booking);

    await sendEmailTemplateBestEffort({
      recipient: client,
      email: buildPaymentFailedEmail(getPaymentTemplateInput(booking, client, options)),
    });
  });
}
