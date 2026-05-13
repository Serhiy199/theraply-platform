import { NextRequest, NextResponse } from "next/server";
import { runCronBookingRules } from "@/server/services/cron-booking-rules.service";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { CRON_BOOKING_RULES_AUDIT_ACTIONS } from "@/lib/constants/cron-booking-rules";

export const runtime = "nodejs";

function getCronSecret() {
  return process.env.CRON_SECRET?.trim() || null;
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim() || null;
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = getCronSecret();

  if (!cronSecret) {
    return false;
  }

  return getBearerToken(request) === cronSecret;
}

function parseBoolean(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function handleCronBookingRulesRequest(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json(
      { error: "Cron endpoint is not configured." },
      { status: 503 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = parseBoolean(request.nextUrl.searchParams.get("dryRun"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const summary = await runCronBookingRules({
      dryRun,
      limit,
    });

    return NextResponse.json(
      {
        ok: true,
        job: "booking-rules",
        summary,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logDiagnosticEvent("cron-booking-rules-route", "Cron booking rules endpoint failed.", {
      error: message,
    });

    await createAuditLogEntryBestEffort({
      entityType: "CronJob",
      entityId: "booking-rules",
      action: CRON_BOOKING_RULES_AUDIT_ACTIONS.runFailed,
      after: {
        error: message,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Cron booking rules failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCronBookingRulesRequest(request);
}

export async function POST(request: NextRequest) {
  return handleCronBookingRulesRequest(request);
}
