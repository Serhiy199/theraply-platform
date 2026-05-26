import "server-only";

import { TherapistApprovalStatus } from "@prisma/client";
import {
  CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
  CERTIFICATE_MAX_FILE_SIZE_BYTES,
  CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE_MESSAGE,
  CERTIFICATE_SERVER_ACTION_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/certificate-upload";
import { prisma } from "@/lib/prisma";
import { canEditTherapistOnboardingDraft } from "@/lib/therapist-lifecycle";
import {
  isCloudinaryCertificateStorageConfigured,
  uploadCertificateToCloudinary,
  type CloudinaryCertificateUploadResult,
} from "@/server/services/cloudinary-certificate-storage.provider";

const CERTIFICATE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const CERTIFICATE_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
  "txt",
]);

export type CertificateStorageUploadResult = CloudinaryCertificateUploadResult;

export type CertificateStorageProvider = {
  upload(input: { file: File }): Promise<CertificateStorageUploadResult>;
};

export type TherapistCertificateCloudinaryUploadMetadata = {
  fileName: string;
  fileUrl: string;
  publicId: string;
  storageProvider: "cloudinary";
  mimeType: string;
  size: number;
};

export class CertificateStorageServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_CERTIFICATE_UPLOAD_LOCKED"
      | "THERAPIST_CERTIFICATE_FILE_REQUIRED"
      | "THERAPIST_CERTIFICATE_FILE_TOO_LARGE"
      | "THERAPIST_CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE"
      | "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED"
      | "THERAPIST_CERTIFICATE_METADATA_INVALID"
      | "THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED"
      | "THERAPIST_CERTIFICATE_UPLOAD_FAILED",
  ) {
    super(message);
    this.name = "CertificateStorageServiceError";
  }
}

function normalizeEnvValue(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (
    (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function getStorageProvider(): CertificateStorageProvider {
  const provider = normalizeEnvValue(process.env.CERTIFICATE_STORAGE_PROVIDER) ?? "cloudinary";

  if (provider !== "cloudinary") {
    throw new CertificateStorageServiceError(
      "Certificate storage provider is not supported.",
      "THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED",
    );
  }

  if (!isCloudinaryCertificateStorageConfigured()) {
    throw new CertificateStorageServiceError(
      "Cloudinary certificate storage is not configured.",
      "THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED",
    );
  }

  return {
    upload: uploadCertificateToCloudinary,
  };
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension || null;
}

function validateCertificateMetadata(
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  if (
    !input.fileName.trim() ||
    !input.publicId.trim() ||
    input.storageProvider !== "cloudinary"
  ) {
    throw new CertificateStorageServiceError(
      "Certificate upload metadata is invalid.",
      "THERAPIST_CERTIFICATE_METADATA_INVALID",
    );
  }

  try {
    const fileUrl = new URL(input.fileUrl);

    if (fileUrl.protocol !== "https:") {
      throw new Error("Invalid certificate URL protocol.");
    }
  } catch {
    throw new CertificateStorageServiceError(
      "Certificate upload metadata is invalid.",
      "THERAPIST_CERTIFICATE_METADATA_INVALID",
    );
  }

  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new CertificateStorageServiceError(
      "Choose at least one certificate file to upload.",
      "THERAPIST_CERTIFICATE_FILE_REQUIRED",
    );
  }

  if (input.size > CERTIFICATE_MAX_FILE_SIZE_BYTES) {
    throw new CertificateStorageServiceError(
      CERTIFICATE_FILE_TOO_LARGE_MESSAGE,
      "THERAPIST_CERTIFICATE_FILE_TOO_LARGE",
    );
  }

  const extension = getFileExtension(input.fileName);
  const isAllowedMime = CERTIFICATE_ALLOWED_MIME_TYPES.has(input.mimeType);
  const isAllowedExtension = extension ? CERTIFICATE_ALLOWED_EXTENSIONS.has(extension) : false;

  if (!isAllowedMime || !isAllowedExtension) {
    throw new CertificateStorageServiceError(
      "Certificate files must be JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT.",
      "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED",
    );
  }
}

function validateServerActionCertificateFile(file: File) {
  validateCertificateMetadata({
    fileName: file.name,
    fileUrl: "https://legacy-upload.local/pending",
    publicId: "legacy-upload-pending",
    storageProvider: "cloudinary",
    mimeType: file.type,
    size: file.size,
  });

  if (file.size > CERTIFICATE_SERVER_ACTION_MAX_FILE_SIZE_BYTES) {
    throw new CertificateStorageServiceError(
      CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE_MESSAGE,
      "THERAPIST_CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE",
    );
  }
}

export async function assertTherapistCanUploadCertificate(userId: string) {
  const profile = await prisma.therapistProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      approvalStatus: true,
    },
  });

  if (!profile) {
    throw new CertificateStorageServiceError(
      "Therapist profile not found for this account.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  if (
    profile.approvalStatus === TherapistApprovalStatus.EMAIL_NOT_VERIFIED ||
    !canEditTherapistOnboardingDraft(profile.approvalStatus)
  ) {
    throw new CertificateStorageServiceError(
      "Certificate files can only be uploaded while the onboarding form is editable.",
      "THERAPIST_CERTIFICATE_UPLOAD_LOCKED",
    );
  }

  return profile;
}

async function createTherapistCertificateRecord(
  therapistProfileId: string,
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  validateCertificateMetadata(input);

  return prisma.therapistCertificate.create({
    data: {
      therapistProfileId,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      publicId: input.publicId,
      storageProvider: input.storageProvider,
      mimeType: input.mimeType,
      size: input.size,
      uploadedAt: new Date(),
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      publicId: true,
      storageProvider: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
    },
  });
}

export async function createTherapistCertificateFromCloudinaryUpload(
  userId: string,
  input: TherapistCertificateCloudinaryUploadMetadata,
) {
  const profile = await assertTherapistCanUploadCertificate(userId);

  return createTherapistCertificateRecord(profile.id, input);
}

export async function uploadTherapistCertificates(userId: string, files: File[]) {
  if (!files.length) {
    throw new CertificateStorageServiceError(
      "Choose at least one certificate file to upload.",
      "THERAPIST_CERTIFICATE_FILE_REQUIRED",
    );
  }

  const profile = await assertTherapistCanUploadCertificate(userId);
  const provider = getStorageProvider();
  const uploadedCertificates = [];

  for (const file of files) {
    validateServerActionCertificateFile(file);

    let uploadResult: CertificateStorageUploadResult;

    try {
      uploadResult = await provider.upload({ file });
    } catch (error) {
      if (error instanceof CertificateStorageServiceError) {
        throw error;
      }

      throw new CertificateStorageServiceError(
        "Certificate upload failed. Please try again.",
        "THERAPIST_CERTIFICATE_UPLOAD_FAILED",
      );
    }

    const certificate = await createTherapistCertificateRecord(profile.id, {
      fileName: uploadResult.fileName,
      fileUrl: uploadResult.fileUrl,
      publicId: uploadResult.publicId,
      storageProvider: uploadResult.storageProvider,
      mimeType: uploadResult.mimeType,
      size: uploadResult.size,
    });

    uploadedCertificates.push(certificate);
  }

  return uploadedCertificates;
}
