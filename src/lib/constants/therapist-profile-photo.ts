export const THERAPIST_PROFILE_PHOTO_ALLOWED_FORMATS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export const THERAPIST_PROFILE_PHOTO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const THERAPIST_PROFILE_PHOTO_MAX_FILE_SIZE_LABEL = "5MB";
export const THERAPIST_PROFILE_PHOTO_FILE_TOO_LARGE_MESSAGE =
  "Profile photo must be 5MB or smaller.";
