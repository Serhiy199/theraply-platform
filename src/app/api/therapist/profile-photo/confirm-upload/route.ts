import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import {
  SAFE_ERROR_MESSAGES,
  getSafeTherapistProfilePhotoErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import { therapistProfilePhotoUploadConfirmationSchema } from "@/lib/validations/therapist-profile-photo";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  CloudinaryProfilePhotoAssetVerificationError,
  CloudinaryProfilePhotoStorageConfigError,
  verifyUploadedProfilePhotoAsset,
} from "@/server/services/cloudinary-profile-photo-storage.provider";
import {
  TherapistProfilePhotoServiceError,
  getTherapistProfileForPhotoUpload,
  updateTherapistProfilePhotoFromCloudinaryUpload,
} from "@/server/services/therapist-profile-photo.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  }

  let user: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    user = await requireCurrentActionRole(
      currentUser,
      [UserRole.THERAPIST],
      "Only therapist accounts can confirm profile photo uploads.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json({ success: false, error: SAFE_ERROR_MESSAGES.permissionDenied }, { status: 403 });
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.therapistProfilePhotoConfirmUpload,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  const parsed = therapistProfilePhotoUploadConfirmationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getSafeTherapistProfilePhotoErrorMessage("THERAPIST_PROFILE_PHOTO_METADATA_INVALID") },
      { status: 400, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const profile = await getTherapistProfileForPhotoUpload(user.id);
    const verifiedAsset = await verifyUploadedProfilePhotoAsset(profile.id, {
      publicId: parsed.data.publicId,
      version: parsed.data.version,
      signature: parsed.data.signature,
      resourceType: parsed.data.resourceType,
    });
    const photo = await updateTherapistProfilePhotoFromCloudinaryUpload(user.id, {
      fileName: parsed.data.fileName,
      fileUrl: verifiedAsset.fileUrl,
      publicId: verifiedAsset.publicId,
      mimeType: parsed.data.mimeType,
      size: verifiedAsset.size,
    });

    return NextResponse.json(
      { success: true, photo },
      { status: 200, headers: getRateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    if (error instanceof TherapistProfilePhotoServiceError) {
      const status = error.code === "THERAPIST_PROFILE_NOT_FOUND" ? 404 : 409;

      return NextResponse.json(
        { success: false, error: getSafeTherapistProfilePhotoErrorMessage(error.code) },
        { status, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    logDiagnosticEvent(
      "profile-photo-confirm-upload-route",
      "Unable to confirm a Cloudinary profile photo upload.",
      {
        therapistUserId: user.id,
        publicId: parsed.data.publicId,
        error,
      },
    );

    if (error instanceof CloudinaryProfilePhotoStorageConfigError) {
      return NextResponse.json(
        { success: false, error: getSafeTherapistProfilePhotoErrorMessage("THERAPIST_PROFILE_PHOTO_STORAGE_NOT_CONFIGURED") },
        { status: 503, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    if (error instanceof CloudinaryProfilePhotoAssetVerificationError) {
      return NextResponse.json(
        { success: false, error: getSafeTherapistProfilePhotoErrorMessage("THERAPIST_PROFILE_PHOTO_ASSET_VERIFICATION_FAILED") },
        { status: 409, headers: getRateLimitHeaders(rateLimit) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Something went wrong while confirming profile photo upload." },
      { status: 500, headers: getRateLimitHeaders(rateLimit) },
    );
  }
}
