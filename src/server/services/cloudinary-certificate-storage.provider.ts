import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export type CloudinaryCertificateUploadInput = {
  file: File;
};

export type CloudinaryCertificateUploadResult = {
  fileName: string;
  fileUrl: string;
  publicId: string;
  storageProvider: "cloudinary";
  mimeType: string;
  size: number;
  uploadedAt: Date;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  url?: string;
  public_id?: string;
  bytes?: number;
};

type CloudinaryResourceResponse = {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  version?: number;
  resource_type?: string;
  type?: string;
  format?: string;
};

export class CloudinaryCertificateStorageConfigError extends Error {
  constructor(message = "Cloudinary certificate storage is not configured.") {
    super(message);
    this.name = "CloudinaryCertificateStorageConfigError";
  }
}

export class CloudinaryCertificateAssetVerificationError extends Error {
  constructor(message = "Cloudinary certificate asset could not be verified.") {
    super(message);
    this.name = "CloudinaryCertificateAssetVerificationError";
  }
}

export type CloudinarySignedCertificateUploadParameters = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  uploadUrl: string;
};

export type CloudinaryCertificateUploadConfirmationInput = {
  publicId: string;
  version: number;
  signature: string;
  resourceType: "image" | "raw";
};

export type CloudinaryVerifiedCertificateAsset = {
  fileUrl: string;
  publicId: string;
  size: number;
  resourceType: "image" | "raw";
  format: string | null;
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
    normalizeEnvValue(process.env.CLOUDINARY_CERTIFICATES_FOLDER) ??
    "theraply/therapist-certificates"
  ).replace(/\/+$/, "");

  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryCertificateStorageConfigError();
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
  };
}

export function isCloudinaryCertificateStorageConfigured() {
  return Boolean(
    normalizeEnvValue(process.env.CLOUDINARY_CLOUD_NAME) &&
      normalizeEnvValue(process.env.CLOUDINARY_API_KEY) &&
      normalizeEnvValue(process.env.CLOUDINARY_API_SECRET),
  );
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

function getTherapistCertificateFolder(baseFolder: string, therapistProfileId: string) {
  return `${baseFolder}/${therapistProfileId}`;
}

export function createSignedCertificateUploadParameters(
  therapistProfileId: string,
): CloudinarySignedCertificateUploadParameters {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${getTherapistCertificateFolder(config.folder, therapistProfileId)}/${randomUUID()}`;
  const signature = signCloudinaryParams(
    {
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
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
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
  input: CloudinaryCertificateUploadConfirmationInput,
): asserts response is CloudinaryResourceResponse & {
  public_id: string;
  secure_url: string;
  bytes: number;
  version: number;
} {
  if (
    response.public_id !== input.publicId ||
    response.version !== input.version ||
    response.resource_type !== input.resourceType ||
    response.type !== "upload" ||
    typeof response.secure_url !== "string" ||
    typeof response.bytes !== "number" ||
    !Number.isSafeInteger(response.bytes) ||
    response.bytes <= 0
  ) {
    throw new CloudinaryCertificateAssetVerificationError();
  }
}

export async function verifyUploadedCertificateAsset(
  therapistProfileId: string,
  input: CloudinaryCertificateUploadConfirmationInput,
): Promise<CloudinaryVerifiedCertificateAsset> {
  const config = getCloudinaryConfig();
  const folderPrefix = `${getTherapistCertificateFolder(config.folder, therapistProfileId)}/`;

  if (!input.publicId.startsWith(folderPrefix)) {
    throw new CloudinaryCertificateAssetVerificationError(
      "Cloudinary certificate asset does not belong to this therapist.",
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
    throw new CloudinaryCertificateAssetVerificationError(
      "Cloudinary upload response signature is invalid.",
    );
  }

  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${input.resourceType}/upload/${encodeURIComponent(input.publicId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authorization}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new CloudinaryCertificateAssetVerificationError(
      "Cloudinary certificate asset lookup failed.",
    );
  }

  const resource = (await response.json()) as CloudinaryResourceResponse;
  assertVerifiedResourceResponse(resource, input);

  return {
    fileUrl: resource.secure_url,
    publicId: resource.public_id,
    size: resource.bytes,
    resourceType: input.resourceType,
    format: resource.format ?? null,
  };
}

function assertUploadResponse(
  response: CloudinaryUploadResponse,
): asserts response is CloudinaryUploadResponse & {
  secure_url: string;
  public_id: string;
} {
  if (!response.secure_url || !response.public_id) {
    throw new Error("Cloudinary upload response is missing file metadata.");
  }
}

export async function uploadCertificateToCloudinary({
  file,
}: CloudinaryCertificateUploadInput): Promise<CloudinaryCertificateUploadResult> {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedParams = {
    folder: config.folder,
    timestamp,
  };
  const signature = signCloudinaryParams(signedParams, config.apiSecret);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const formData = new FormData();

  formData.append("file", new Blob([fileBuffer], { type: file.type }), file.name);
  formData.append("api_key", config.apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", config.folder);
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Cloudinary upload failed with status ${response.status}${body ? `: ${body}` : ""}`,
    );
  }

  const result = (await response.json()) as CloudinaryUploadResponse;

  assertUploadResponse(result);

  return {
    fileName: file.name,
    fileUrl: result.secure_url,
    publicId: result.public_id,
    storageProvider: "cloudinary",
    mimeType: file.type || "application/octet-stream",
    size: result.bytes ?? file.size,
    uploadedAt: new Date(),
  };
}
