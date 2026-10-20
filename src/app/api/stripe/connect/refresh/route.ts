import { NextResponse } from "next/server";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";

export const runtime = "nodejs";

// An expired Stripe link returns here via GET. Starting again requires the form.
export async function GET() {
  const url = buildCanonicalAppUrl("/therapist/payout-details");
  url.searchParams.set("stripe_status", "error");
  url.searchParams.set("stripe_message", "Stripe onboarding link expired. Please continue onboarding again.");
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
