import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS,
  THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants/therapist-profile-photo";

type CloudinaryResourceResponse = {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  version?: number;
  resource_type?: string;
  type?: string;
  format?: string;
};

export class CloudinaryProfilePhotoStorageConfigError extends Error {
  constructor(message = "Cloudinary profile photo storage is not configured.") {
    super(message);
    this.name = "CloudinaryProfilePhotoStorageConfigError";
  }
}

export class CloudinaryProfilePhotoAssetVerificationError extends Error {
  constructor(message = "Cloudinary profile photo asset could not be verified.") {
    super(message);
    this.name = "CloudinaryProfilePhotoAssetVerificationError";
  }
}

export type CloudinarySignedProfilePhotoUploadParameters = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  allowedFormats: string;
  uploadUrl: string;
};

export type CloudinaryProfilePhotoUploadConfirmationInput = {
  publicId: string;
  version: number;
  signature: string;
  resourceType: "image";
};

export type CloudinaryVerifiedProfilePhotoAsset = {
  fileUrl: string;
  publicId: string;
  size: number;
  format: string;
};

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

function getCloudinaryConfig() {
  const cloudName = normalizeEnvValue(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeEnvValue(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeEnvValue(process.env.CLOUDINARY_API_SECRET);
  const folder = (
    normalizeEnvValue(process.env.CLOUDINARY_THERAPIST_PHOTOS_FOLDER) ??
    "theraply/therapist-photos"
  ).replace(/\/+$/, "");

  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryProfilePhotoStorageConfigError();
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
  };
}

function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
}

function getTherapistProfilePhotoFolder(baseFolder: string, therapistProfileId: string) {
  return `${baseFolder}/${therapistProfileId}`;
}

export function createSignedProfilePhotoUploadParameters(
  therapistProfileId: string,
): CloudinarySignedProfilePhotoUploadParameters {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${getTherapistProfilePhotoFolder(config.folder, therapistProfileId)}/${randomUUID()}`;
  const allowedFormats = THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS.join(",");
  const signature = signCloudinaryParams(
    {
      allowed_formats: allowedFormats,
      public_id: publicId,
      timestamp: String(timestamp),
    },
    config.apiSecret,
  );

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    publicId,
    allowedFormats,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
  };
}

function hasExpectedSignature(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function assertVerifiedResourceResponse(
  response: CloudinaryResourceResponse,
  input: CloudinaryProfilePhotoUploadConfirmationInput,
): asserts response is CloudinaryResourceResponse & {
  public_id: string;
  secure_url: string;
  bytes: number;
  version: number;
  format: string;
} {
  if (
    response.public_id !== input.publicId ||
    response.version !== input.version ||
    response.resource_type !== input.resourceType ||
    response.type !== "upload" ||
    typeof response.secure_url !== "string" ||
    typeof response.bytes !== "number" ||
    !Number.isSafeInteger(response.bytes) ||
    response.bytes <= 0 ||
    typeof response.format !== "string"
  ) {
    throw new CloudinaryProfilePhotoAssetVerificationError();
  }
}

export async function verifyUploadedProfilePhotoAsset(
  therapistProfileId: string,
  input: CloudinaryProfilePhotoUploadConfirmationInput,
): Promise<CloudinaryVerifiedProfilePhotoAsset> {
  const config = getCloudinaryConfig();
  const folderPrefix = `${getTherapistProfilePhotoFolder(config.folder, therapistProfileId)}/`;

  if (!input.publicId.startsWith(folderPrefix)) {
    throw new CloudinaryProfilePhotoAssetVerificationError(
      "Cloudinary profile photo asset does not belong to this therapist.",
    );
  }

  const expectedSignature = signCloudinaryParams(
    {
      public_id: input.publicId,
      version: String(input.version),
    },
    config.apiSecret,
  );

  if (!hasExpectedSignature(input.signature, expectedSignature)) {
    throw new CloudinaryProfilePhotoAssetVerificationError(
      "Cloudinary upload response signature is invalid.",
    );
  }

  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload/${encodeURIComponent(input.publicId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authorization}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new CloudinaryProfilePhotoAssetVerificationError(
      "Cloudinary profile photo asset lookup failed.",
    );
  }

  const resource = (await response.json()) as CloudinaryResourceResponse;
  assertVerifiedResourceResponse(resource, input);

  const format = resource.format.toLowerCase();

  if (
    !THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS.includes(
      format as (typeof THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS)[number],
    ) ||
    resource.bytes > THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES
  ) {
    throw new CloudinaryProfilePhotoAssetVerificationError(
      "Cloudinary profile photo asset failed validation.",
    );
  }

  return {
    fileUrl: resource.secure_url,
    publicId: resource.public_id,
    size: resource.bytes,
    format,
  };
}
