import { Prisma } from "@prisma/client";

export const bookableTherapistContractSelect = {
  id: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  therapistProfile: {
    select: {
      id: true,
      displayName: true,
      specialization: true,
      bio: true,
      sessionPricePence: true,
      googleCalendarId: true,
      googleCalendarEmail: true,
      isGoogleCalendarConnected: true,
      approvalStatus: true,
      isApproved: true,
      onboardingCompleted: true,
    },
  },
} satisfies Prisma.UserSelect;

export type TherapistListItem = Prisma.UserGetPayload<{
  select: typeof bookableTherapistContractSelect;
}>;

export type TherapistSlotItem = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
  timeZone: string;
  unavailableReason?: "conflict" | "lead_time";
};

export type CreateBookingRequestInput = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
};
