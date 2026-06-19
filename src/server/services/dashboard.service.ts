import {
  BookingStatus,
  PaymentStatus,
  TherapistApprovalStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStripeConnectReady } from "@/server/services/stripe-connect.service";

const upcomingBookingStatuses = [BookingStatus.PENDING_THERAPIST, BookingStatus.CONFIRMED];

type ClientDashboardStat = {
  label: string;
  value: number;
  hint: string;
};

type TherapistDashboardStat = {
  label: string;
  value: number | string;
  hint: string;
};

type AdminDashboardStat = {
  label: string;
  value: number;
  hint: string;
};

type AdminFinanceCase = {
  label: string;
  value: number;
  hint: string;
  tone: "warning" | "danger" | "neutral" | "success";
};

export async function getClientDashboardData(userId: string) {
  const now = new Date();

  const [clientProfile, approvedTherapists, totalBookings, upcomingCount, openPayments, recentBookings] =
    await Promise.all([
      prisma.clientProfile.findUnique({
        where: { userId },
        select: {
          createdAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.therapistProfile.count({
        where: {
          approvalStatus: TherapistApprovalStatus.APPROVED,
          isApproved: true,
        },
      }),
      prisma.booking.count({
        where: { clientId: userId },
      }),
      prisma.booking.count({
        where: {
          clientId: userId,
          bookingStatus: { in: upcomingBookingStatuses },
          startsAt: { gte: now },
        },
      }),
      prisma.payment.count({
        where: {
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
          booking: {
            clientId: userId,
          },
        },
      }),
      prisma.booking.findMany({
        where: { clientId: userId },
        orderBy: { startsAt: "asc" },
        take: 3,
        select: {
          id: true,
          startsAt: true,
          bookingStatus: true,
          therapist: {
            select: {
              firstName: true,
              lastName: true,
              therapistProfile: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      }),
    ]);

  const stats: ClientDashboardStat[] = [
    {
      label: "Approved therapists",
      value: approvedTherapists,
      hint: "Available therapist profiles already prepared in the platform.",
    },
    {
      label: "Upcoming sessions",
      value: upcomingCount,
      hint: "Confirmed or pending bookings scheduled in the future.",
    },
    {
      label: "Payment actions",
      value: openPayments,
      hint: "Unpaid, pending, or failed payments that need attention.",
    },
    {
      label: "Booking records",
      value: totalBookings,
      hint: "All booking requests linked to this client account.",
    },
  ];

  return {
    stats,
    accountSummary: {
      memberSince: clientProfile?.createdAt ?? null,
      displayName:
        [clientProfile?.user.firstName, clientProfile?.user.lastName].filter(Boolean).join(" ") ||
        clientProfile?.user.email ||
        null,
      email: clientProfile?.user.email ?? null,
    },
    paymentSummary: {
      openPayments,
      healthy: openPayments === 0,
      message:
        openPayments === 0
          ? "No outstanding payment actions right now."
          : `${openPayments} payment item${openPayments === 1 ? "" : "s"} still need attention.`,
    },
    quickActions: [
      {
        label: "Book a session",
        href: "/client/book/new",
        description: "Browse approved therapists and start a new booking request.",
      },
      {
        label: "Open bookings",
        href: "/client/bookings",
        description: "Review the next sessions and booking history.",
      },
      {
        label: "Review payments",
        href: "/client/payments",
        description: "Check payment state and resolve open billing items.",
      },
      {
        label: "Reset password",
        href: "/forgot-password",
        description: "Start a password reset flow if account access needs refreshing.",
      },
    ],
    recentBookings: recentBookings.map((booking) => ({
      id: booking.id,
      startsAt: booking.startsAt,
      status: booking.bookingStatus,
      therapistName:
        booking.therapist.therapistProfile?.displayName ||
        [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
        "Therapist",
    })),
  };
}

export async function getTherapistDashboardData(userId: string) {
  const now = new Date();

  const [therapistProfile, pendingRequests, upcomingCount, totalClients, recentRequests] =
    await Promise.all([
      prisma.therapistProfile.findUnique({
        where: { userId },
        select: {
          displayName: true,
          specialization: true,
          approvalStatus: true,
          isApproved: true,
          googleCalendarId: true,
          googleCalendarEmail: true,
          isGoogleCalendarConnected: true,
          stripeAccountId: true,
          stripeOnboardingStatus: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
          payoutDetails: {
            select: {
              isVerified: true,
              country: true,
            },
          },
        },
      }),
      prisma.booking.count({
        where: {
          therapistId: userId,
          bookingStatus: BookingStatus.PENDING_THERAPIST,
        },
      }),
      prisma.booking.count({
        where: {
          therapistId: userId,
          bookingStatus: BookingStatus.CONFIRMED,
          startsAt: { gte: now },
        },
      }),
      prisma.booking
        .findMany({
          where: { therapistId: userId },
          distinct: ["clientId"],
          select: { clientId: true },
        })
        .then((rows) => rows.length),
      prisma.booking.findMany({
        where: {
          therapistId: userId,
          bookingStatus: BookingStatus.PENDING_THERAPIST,
        },
        orderBy: { startsAt: "asc" },
        take: 3,
        select: {
          id: true,
          startsAt: true,
          bookingStatus: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

  const isPayoutReady = isStripeConnectReady(therapistProfile ?? {});

  const stats: TherapistDashboardStat[] = [
    {
      label: "Pending requests",
      value: pendingRequests,
      hint: "Booking requests waiting for therapist confirmation.",
    },
    {
      label: "Upcoming sessions",
      value: upcomingCount,
      hint: "Confirmed sessions already scheduled in the future.",
    },
    {
      label: "Client relationships",
      value: totalClients,
      hint: "Distinct clients already connected to this therapist profile.",
    },
    {
      label: "Payout verified",
      value: isPayoutReady ? "Yes" : "No",
      hint: "Whether Stripe Connect is ready for therapist transfers.",
    },
  ];

  return {
    stats,
    profileSummary: {
      displayName: therapistProfile?.displayName ?? null,
      specialization: therapistProfile?.specialization ?? null,
      approvalStatus: therapistProfile?.approvalStatus ?? null,
      calendarId: therapistProfile?.googleCalendarId ?? null,
      calendarEmail: therapistProfile?.googleCalendarEmail ?? null,
      isGoogleCalendarConnected: therapistProfile?.isGoogleCalendarConnected ?? false,
      isStripePayoutReady: isPayoutReady,
    },
    recentRequests: recentRequests.map((booking) => ({
      id: booking.id,
      startsAt: booking.startsAt,
      status: booking.bookingStatus,
      clientName:
        [booking.client.firstName, booking.client.lastName].filter(Boolean).join(" ") ||
        booking.client.email ||
        "Client",
    })),
  };
}

export async function getAdminDashboardData() {
  const now = new Date();

  const [
    totalUsers,
    totalClients,
    totalTherapists,
    pendingTherapists,
    totalBookings,
    upcomingBookings,
    paymentsNeedingAttention,
    verifiedPayouts,
    recentUsers,
    pendingPayments,
    failedPayments,
    refundedPayments,
    creditBackedPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: UserRole.CLIENT } }),
    prisma.user.count({ where: { role: UserRole.THERAPIST } }),
    prisma.therapistProfile.count({
      where: { approvalStatus: TherapistApprovalStatus.PENDING_REVIEW },
    }),
    prisma.booking.count(),
    prisma.booking.count({
      where: {
        bookingStatus: { in: upcomingBookingStatuses },
        startsAt: { gte: now },
      },
    }),
    prisma.payment.count({
      where: {
        paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
    }),
    prisma.therapistProfile.count({
      where: {
        stripeAccountId: {
          not: null,
        },
        stripeOnboardingStatus: "READY",
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        firstName: true,
        lastName: true,
      },
    }),
    prisma.payment.count({
      where: {
        paymentStatus: PaymentStatus.PENDING,
      },
    }),
    prisma.payment.count({
      where: {
        paymentStatus: PaymentStatus.FAILED,
      },
    }),
    prisma.payment.count({
      where: {
        paymentStatus: PaymentStatus.REFUNDED,
      },
    }),
    prisma.payment.count({
      where: {
        creditAppliedAmount: {
          gt: 0,
        },
      },
    }),
  ]);

  const stats: AdminDashboardStat[] = [
    {
      label: "Users",
      value: totalUsers,
      hint: "All accounts currently stored in the platform.",
    },
    {
      label: "Clients",
      value: totalClients,
      hint: "Client accounts available for booking workflows.",
    },
    {
      label: "Therapists",
      value: totalTherapists,
      hint: "Therapist accounts inside the operations console.",
    },
    {
      label: "Pending approvals",
      value: pendingTherapists,
      hint: "Therapist profiles still waiting for admin approval.",
    },
    {
      label: "Booking records",
      value: totalBookings,
      hint: "All booking rows currently present in the system.",
    },
    {
      label: "Upcoming bookings",
      value: upcomingBookings,
      hint: "Future bookings in pending or confirmed state.",
    },
    {
      label: "Payments to review",
      value: paymentsNeedingAttention,
      hint: "Unpaid, pending, or failed payments needing admin visibility.",
    },
    {
      label: "Verified payouts",
      value: verifiedPayouts,
      hint: "Therapist Stripe accounts that are ready for transfers.",
    },
  ];

  return {
    stats,
    financeCases: [
      {
        label: "Pending checkout",
        value: pendingPayments,
        hint: "Stripe sessions started but not fully settled yet.",
        tone: pendingPayments > 0 ? "warning" : "neutral",
      },
      {
        label: "Failed payments",
        value: failedPayments,
        hint: "Payment attempts that need retry or manual follow-up.",
        tone: failedPayments > 0 ? "danger" : "neutral",
      },
      {
        label: "Refunded payments",
        value: refundedPayments,
        hint: "Bookings where money was returned through Stripe.",
        tone: refundedPayments > 0 ? "warning" : "neutral",
      },
      {
        label: "Credit-backed payments",
        value: creditBackedPayments,
        hint: "Bookings where client credit reduced or covered the charge.",
        tone: creditBackedPayments > 0 ? "success" : "neutral",
      },
    ] satisfies AdminFinanceCase[],
    recentUsers: recentUsers.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    })),
  };
}
