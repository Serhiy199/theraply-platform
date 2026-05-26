export const CERTIFICATE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const CERTIFICATE_MAX_FILE_SIZE_LABEL = "10MB";
export const CERTIFICATE_FILE_TOO_LARGE_MESSAGE =
  `Certificate files must be ${CERTIFICATE_MAX_FILE_SIZE_LABEL} or smaller.`;
export const CERTIFICATE_ALLOWED_FORMATS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
  "txt",
] as const;
