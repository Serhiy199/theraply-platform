"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS,
  THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES,
  THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_LABEL,
} from "@/lib/constants/therapist-profile-photo";

type TherapistProfilePhotoUploaderProps = {
  currentPhotoUrl: string | null;
  displayName: string;
};

type ProfilePhotoUploadSignatureResponse = {
  success: true;
  upload: {
    apiKey: string;
    timestamp: number;
    signature: string;
    publicId: string;
    allowedFormats: string;
    uploadUrl: string;
  };
};

type CloudinaryDirectUploadResponse = {
  public_id?: unknown;
  version?: unknown;
  signature?: unknown;
  resource_type?: unknown;
};

type UploadStatus = {
  tone: "success" | "error";
  message: string;
};

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "T") + (parts[1]?.[0] ?? "");
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() ?? "";
}

function hasAllowedProfilePhotoFileType(file: File) {
  const extension = getFileExtension(file.name);

  return (
    THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS.some((format) => format === extension) &&
    THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES.some((mimeType) => mimeType === file.type)
  );
}

function getProfilePhotoMimeType(file: File) {
  if (file.type.trim()) {
    return file.type;
  }

  switch (getFileExtension(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
}

async function getUploadResponseError(response: Response, fallbackMessage: string) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof body?.error === "string" ? body.error : fallbackMessage;
}

export function TherapistProfilePhotoUploader({
  currentPhotoUrl,
  displayName,
}: TherapistProfilePhotoUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl);
  const [objectPreviewUrl, setObjectPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  useEffect(() => {
    if (objectPreviewUrl) {
      return () => URL.revokeObjectURL(objectPreviewUrl);
    }

    setPreviewUrl(currentPhotoUrl);
  }, [currentPhotoUrl, objectPreviewUrl]);

  async function uploadProfilePhoto(file: File) {
    const signatureResponse = await fetch("/api/therapist/profile-photo/upload-signature", {
      method: "POST",
    });

    if (!signatureResponse.ok) {
      throw new Error(
        await getUploadResponseError(
          signatureResponse,
          "Could not prepare profile photo upload. Please try again.",
        ),
      );
    }

    const signaturePayload = (await signatureResponse.json()) as ProfilePhotoUploadSignatureResponse;
    const cloudinaryPayload = new FormData();

    cloudinaryPayload.append("file", file);
    cloudinaryPayload.append("api_key", signaturePayload.upload.apiKey);
    cloudinaryPayload.append("timestamp", String(signaturePayload.upload.timestamp));
    cloudinaryPayload.append("public_id", signaturePayload.upload.publicId);
    cloudinaryPayload.append("allowed_formats", signaturePayload.upload.allowedFormats);
    cloudinaryPayload.append("signature", signaturePayload.upload.signature);

    const cloudinaryResponse = await fetch(signaturePayload.upload.uploadUrl, {
      method: "POST",
      body: cloudinaryPayload,
    });

    if (!cloudinaryResponse.ok) {
      throw new Error("Profile photo upload failed. Please try again.");
    }

    const cloudinaryResult = (await cloudinaryResponse.json()) as CloudinaryDirectUploadResponse;

    if (
      typeof cloudinaryResult.public_id !== "string" ||
      typeof cloudinaryResult.version !== "number" ||
      typeof cloudinaryResult.signature !== "string" ||
      cloudinaryResult.resource_type !== "image"
    ) {
      throw new Error("Could not verify the uploaded profile photo. Please try again.");
    }

    const confirmResponse = await fetch("/api/therapist/profile-photo/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: getProfilePhotoMimeType(file),
        publicId: cloudinaryResult.public_id,
        version: cloudinaryResult.version,
        signature: cloudinaryResult.signature,
        resourceType: "image",
      }),
    });

    if (!confirmResponse.ok) {
      throw new Error(
        await getUploadResponseError(
          confirmResponse,
          "Could not confirm profile photo upload. Please try again.",
        ),
      );
    }
  }

  async function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];

    setStatus(null);

    if (!file) {
      setObjectPreviewUrl(null);
      setPreviewUrl(currentPhotoUrl);
      return;
    }

    if (file.size > THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES) {
      setStatus({ tone: "error", message: THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE });
      setObjectPreviewUrl(null);
      setPreviewUrl(currentPhotoUrl);
      return;
    }

    if (!hasAllowedProfilePhotoFileType(file)) {
      setStatus({ tone: "error", message: "Profile photo must be JPG, JPEG, PNG, or WEBP." });
      setObjectPreviewUrl(null);
      setPreviewUrl(currentPhotoUrl);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    setObjectPreviewUrl(nextPreviewUrl);
    setPreviewUrl(nextPreviewUrl);
    setUploading(true);

    try {
      await uploadProfilePhoto(file);
      setStatus({ tone: "success", message: "Profile photo updated successfully." });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while uploading the profile photo.",
      });
      setObjectPreviewUrl(null);
      setPreviewUrl(currentPhotoUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-5 rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 text-xl font-semibold text-slate-700">
          {previewUrl ? (
            <span
              role="img"
              aria-label={`${displayName || "Therapist"} profile photo`}
              className="block h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url("${previewUrl}")` }}
            />
          ) : (
            <span aria-hidden="true">{getInitials(displayName)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{displayName || "Pending profile"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {previewUrl
              ? "Profile photo is visible on approved client-facing cards."
              : "Add a professional photo so clients can recognize your profile."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            JPG, PNG or WEBP up to {THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_LABEL}.
          </p>
        </div>

        <div className="sm:shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Choose therapist profile photo"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            loading={uploading}
            loadingText="Uploading..."
            onClick={() => fileInputRef.current?.click()}
          >
            {currentPhotoUrl ? "Change photo" : "Upload photo"}
          </Button>
        </div>
      </div>

      {status ? (
        <p
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
