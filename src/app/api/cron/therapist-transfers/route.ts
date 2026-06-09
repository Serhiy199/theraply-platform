import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  checkRateLimitPreset,
  getClientIpFromRequest,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";
import {
  runTherapistTransfers,
  TherapistTransferServiceError,
} from "@/server/services/therapist-transfer.service";

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

function secretsMatch(providedSecret: string, expectedSecret: string) {
  const providedBuffer = Buffer.from(providedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = getCronSecret();
  const providedSecret = getBearerToken(request);

  if (!cronSecret || !providedSecret) {
    return false;
  }

  return secretsMatch(providedSecret, cronSecret);
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

async function handleCronTherapistTransfersRequest(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json(
      { error: "Cron endpoint is not configured." },
      { status: 503 },
    );
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.cronTherapistTransfers,
    getClientIpFromRequest(request),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = parseBoolean(request.nextUrl.searchParams.get("dryRun"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const summary = await runTherapistTransfers({
      dryRun,
      limit,
    });

    return NextResponse.json(
      {
        ok: true,
        job: "therapist-transfers",
        summary,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logDiagnosticEvent("therapist-transfers-route", "Cron therapist transfers endpoint failed.", {
      error: message,
    });

    await createAuditLogEntryBestEffort({
      entityType: "CronJob",
      entityId: "therapist-transfers",
      action: "CRON_THERAPIST_TRANSFERS_RUN_FAILED",
      after: {
        error: message,
      },
    });

    const status =
      error instanceof TherapistTransferServiceError && error.code === "STRIPE_NOT_CONFIGURED"
        ? 503
        : 500;

    return NextResponse.json(
      {
        ok: false,
        error: "Cron therapist transfers failed.",
      },
      { status },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCronTherapistTransfersRequest(request);
}

export async function POST(request: NextRequest) {
  return handleCronTherapistTransfersRequest(request);
}
