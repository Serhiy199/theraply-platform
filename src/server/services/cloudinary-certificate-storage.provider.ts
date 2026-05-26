import "server-only";

import { createHash } from "node:crypto";

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

export class CloudinaryCertificateStorageConfigError extends Error {
  constructor(message = "Cloudinary certificate storage is not configured.") {
    super(message);
    this.name = "CloudinaryCertificateStorageConfigError";
  }
}

export type CloudinarySignedCertificateUploadParameters = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
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

export function createSignedCertificateUploadParameters(
  therapistProfileId: string,
): CloudinarySignedCertificateUploadParameters {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${config.folder}/${therapistProfileId}`;
  const signature = signCloudinaryParams(
    {
      folder,
      timestamp: String(timestamp),
    },
    config.apiSecret,
  );

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
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
