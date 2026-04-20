import { Prisma } from "@prisma/client";

export const bookableTherapistContractSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  therapistProfile: {
    select: {
      id: true,
      displayName: true,
      specialization: true,
      bio: true,
      googleCalendarId: true,
      googleCalendarEmail: true,
      isGoogleCalendarConnected: true,
      approvalStatus: true,
      isApproved: true,
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
};

export type CreateBookingRequestInput = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
};
