import { TherapistPayoutForm } from "@/components/dashboard/therapist/therapist-payout-form";
import { requireActiveTherapistFeatures } from "@/lib/permissions";
import { getTherapistPayoutDetails } from "@/server/services/therapist-bookings.service";
import { getTherapistSelectableGoogleCalendars } from "@/server/services/google-calendar.service";

type TherapistPayoutDetailsPageProps = {
  searchParams: Promise<{
    gc_status?: string;
    gc_message?: string;
    stripe_status?: string;
    stripe_message?: string;
  }>;
};

export default async function TherapistPayoutDetailsPage({
  searchParams,
}: TherapistPayoutDetailsPageProps) {
  const user = await requireActiveTherapistFeatures();
  const [data, googleCalendars] = await Promise.all([
    getTherapistPayoutDetails(user.id),
    getTherapistSelectableGoogleCalendars(user.id).catch(() => []),
  ]);
  const params = await searchParams;
  let googleCalendarFlash: { status: "success" | "error"; message: string } | null = null;
  let stripeConnectFlash: { status: "success" | "error"; message: string } | null = null;

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

  if (params.stripe_status === "success" || params.stripe_status === "error") {
    stripeConnectFlash = {
      status: params.stripe_status,
      message:
        params.stripe_message ??
        (params.stripe_status === "success"
          ? "Stripe account status refreshed successfully."
          : "Stripe account connection failed."),
    };
  }

  return (
    <TherapistPayoutForm
      data={data}
      googleCalendars={googleCalendars}
      googleCalendarFlash={googleCalendarFlash}
      stripeConnectFlash={stripeConnectFlash}
    />
  );
}
