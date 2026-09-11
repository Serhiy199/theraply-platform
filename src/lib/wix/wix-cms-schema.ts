import { WIX_THERAPISTS_COLLECTION_ID } from "@/lib/wix/wix-cms-config";

export const WIX_BIO_DISPLAY_FIELD = {
  key: "bioDisplay",
  displayName: "Bio Display",
  type: "TEXT",
} as const;

// Shared by schema preflight and additive schema provisioning, never a replacement.
export const WIX_CMS_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  theraplyId: ["TEXT"],
  displayName: ["TEXT"],
  bio: ["RICH_TEXT", "TEXT"],
  [WIX_BIO_DISPLAY_FIELD.key]: [WIX_BIO_DISPLAY_FIELD.type],
  specialization: ["TEXT"],
  therapyServicesProvided: ["TEXT"],
  yearsOfExperience: ["TEXT"],
  profilePhoto: ["IMAGE"],
  sessionPricePence: ["NUMBER"],
  sessionPriceDisplay: ["TEXT"],
  bookingUrl: ["URL"],
  isBookable: ["BOOLEAN"],
  isPublished: ["BOOLEAN"],
};

export function planWixBioDisplayField(fields: ReadonlyArray<{ key: string; type: string }>) {
  if (fields.find((field) => field.key === "bio")?.type !== "RICH_TEXT") {
    throw new Error("Expected existing RICH_TEXT bio; do not change its type.");
  }
  const existing = fields.filter((field) => field.key === WIX_BIO_DISPLAY_FIELD.key);
  if (existing.length > 1 || (existing.length === 1 && existing[0].type !== "TEXT")) {
    throw new Error("Existing bioDisplay conflicts with the TEXT field contract.");
  }
  return existing.length ? null : {
    dataCollectionId: WIX_THERAPISTS_COLLECTION_ID,
    field: { ...WIX_BIO_DISPLAY_FIELD },
  };
}
