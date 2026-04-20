import { UserRole } from "@prisma/client";
import { TherapistPayoutForm } from "@/components/dashboard/therapist/therapist-payout-form";
import { requireRole } from "@/lib/permissions";
import { getTherapistPayoutDetails } from "@/server/services/therapist-bookings.service";
import { getTherapistSelectableGoogleCalendars } from "@/server/services/google-calendar.service";

type TherapistPayoutDetailsPageProps = {
  searchParams: Promise<{
    gc_status?: string;
    gc_message?: string;
  }>;
};

export default async function TherapistPayoutDetailsPage({
  searchParams,
}: TherapistPayoutDetailsPageProps) {
  const user = await requireRole([UserRole.THERAPIST]);
  const [data, googleCalendars] = await Promise.all([
    getTherapistPayoutDetails(user.id),
    getTherapistSelectableGoogleCalendars(user.id).catch(() => []),
  ]);
  const params = await searchParams;
  let googleCalendarFlash: { status: "success" | "error"; message: string } | null = null;

  if (params.gc_status === "success" || params.gc_status === "error") {
    googleCalendarFlash = {
      status: params.gc_status,
      message:
        params.gc_message ??
        (params.gc_status === "success"
          ? "Google Calendar connected successfully."
          : "Google Calendar connection failed."),
    };
  }

  return (
    <TherapistPayoutForm
      data={data}
      googleCalendars={googleCalendars}
      googleCalendarFlash={googleCalendarFlash}
    />
  );
}
