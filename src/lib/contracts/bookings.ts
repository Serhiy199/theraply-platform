import { Prisma } from "@prisma/client";

const bookingParticipantSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const therapistProfileMiniSelect = {
  displayName: true,
  specialization: true,
} satisfies Prisma.TherapistProfileSelect;

const clientProfileMiniSelect = {
  createdAt: true,
} satisfies Prisma.ClientProfileSelect;

const sessionMiniSelect = {
  id: true,
  sessionStatus: true,
  meetingUrl: true,
  completedAt: true,
} satisfies Prisma.SessionSelect;

const paymentMiniSelect = {
  id: true,
  amount: true,
  currency: true,
  paymentStatus: true,
  paidAt: true,
  failedAt: true,
  refundedAt: true,
} satisfies Prisma.PaymentSelect;

export const bookingListSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingStatus: true,
  createdAt: true,
  updatedAt: true,
  therapist: {
    select: {
      ...bookingParticipantSelect,
      therapistProfile: {
        select: therapistProfileMiniSelect,
      },
    },
  },
  session: {
    select: sessionMiniSelect,
  },
  payment: {
    select: paymentMiniSelect,
  },
} satisfies Prisma.BookingSelect;

export const bookingDetailsSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingStatus: true,
  notes: true,
  cancelledAt: true,
  cancelledByUserId: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: {
      ...bookingParticipantSelect,
      clientProfile: {
        select: clientProfileMiniSelect,
      },
    },
  },
  therapist: {
    select: {
      ...bookingParticipantSelect,
      therapistProfile: {
        select: {
          displayName: true,
          specialization: true,
          bio: true,
          googleCalendarEmail: true,
        },
      },
    },
  },
  cancelledBy: {
    select: bookingParticipantSelect,
  },
  session: {
    select: {
      id: true,
      sessionStatus: true,
      meetingUrl: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  payment: {
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      paidAt: true,
      failedAt: true,
      refundedAt: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.BookingSelect;

export const paymentSummarySelect = {
  id: true,
  amount: true,
  currency: true,
  paymentStatus: true,
  paidAt: true,
  failedAt: true,
  refundedAt: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      bookingStatus: true,
      therapist: {
        select: {
          ...bookingParticipantSelect,
          therapistProfile: {
            select: therapistProfileMiniSelect,
          },
        },
      },
      session: {
        select: sessionMiniSelect,
      },
    },
  },
} satisfies Prisma.PaymentSelect;

export const therapistRequestItemSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingStatus: true,
  notes: true,
  createdAt: true,
  client: {
    select: {
      ...bookingParticipantSelect,
      clientProfile: {
        select: clientProfileMiniSelect,
      },
    },
  },
  payment: {
    select: paymentMiniSelect,
  },
  session: {
    select: sessionMiniSelect,
  },
} satisfies Prisma.BookingSelect;

export const adminBookingRowSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  bookingStatus: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: bookingParticipantSelect,
  },
  therapist: {
    select: {
      ...bookingParticipantSelect,
      therapistProfile: {
        select: therapistProfileMiniSelect,
      },
    },
  },
  cancelledBy: {
    select: bookingParticipantSelect,
  },
  session: {
    select: sessionMiniSelect,
  },
  payment: {
    select: paymentMiniSelect,
  },
} satisfies Prisma.BookingSelect;

export type BookingListItem = Prisma.BookingGetPayload<{
  select: typeof bookingListSelect;
}>;

export type BookingDetailsItem = Prisma.BookingGetPayload<{
  select: typeof bookingDetailsSelect;
}>;

export type PaymentSummaryItem = Prisma.PaymentGetPayload<{
  select: typeof paymentSummarySelect;
}>;

export type TherapistRequestItem = Prisma.BookingGetPayload<{
  select: typeof therapistRequestItemSelect;
}>;

export type AdminBookingRow = Prisma.BookingGetPayload<{
  select: typeof adminBookingRowSelect;
}>;
