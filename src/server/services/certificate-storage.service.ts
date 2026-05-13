import { TherapistApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditTherapistOnboardingDraft } from "@/lib/therapist-lifecycle";
import {
  isCloudinaryCertificateStorageConfigured,
  uploadCertificateToCloudinary,
  type CloudinaryCertificateUploadResult,
} from "@/server/services/cloudinary-certificate-storage.provider";

const CERTIFICATE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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

export class CertificateStorageServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_CERTIFICATE_UPLOAD_LOCKED"
      | "THERAPIST_CERTIFICATE_FILE_REQUIRED"
      | "THERAPIST_CERTIFICATE_FILE_TOO_LARGE"
      | "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED"
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

function validateCertificateFile(file: File) {
  if (!file.size) {
    throw new CertificateStorageServiceError(
      "Choose at least one certificate file to upload.",
      "THERAPIST_CERTIFICATE_FILE_REQUIRED",
    );
  }

  if (file.size > CERTIFICATE_MAX_FILE_SIZE_BYTES) {
    throw new CertificateStorageServiceError(
      "Certificate files must be 10MB or smaller.",
      "THERAPIST_CERTIFICATE_FILE_TOO_LARGE",
    );
  }

  const extension = getFileExtension(file.name);
  const isAllowedMime = CERTIFICATE_ALLOWED_MIME_TYPES.has(file.type);
  const isAllowedExtension = extension ? CERTIFICATE_ALLOWED_EXTENSIONS.has(extension) : false;

  if (!isAllowedMime || !isAllowedExtension) {
    throw new CertificateStorageServiceError(
      "Certificate files must be JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT.",
      "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED",
    );
  }
}

async function getEditableTherapistProfileOrThrow(userId: string) {
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

export async function uploadTherapistCertificates(userId: string, files: File[]) {
  if (!files.length) {
    throw new CertificateStorageServiceError(
      "Choose at least one certificate file to upload.",
      "THERAPIST_CERTIFICATE_FILE_REQUIRED",
    );
  }

  const profile = await getEditableTherapistProfileOrThrow(userId);
  const provider = getStorageProvider();
  const uploadedCertificates = [];

  for (const file of files) {
    validateCertificateFile(file);

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

    const certificate = await prisma.therapistCertificate.create({
      data: {
        therapistProfileId: profile.id,
        fileName: uploadResult.fileName,
        fileUrl: uploadResult.fileUrl,
        publicId: uploadResult.publicId,
        storageProvider: uploadResult.storageProvider,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        uploadedAt: uploadResult.uploadedAt,
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

    uploadedCertificates.push(certificate);
  }

  return uploadedCertificates;
}
