import { z } from "zod";

export const therapistProfilePhotoUploadConfirmationSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  publicId: z.string().trim().min(1).max(512),
  version: z.number().int().positive(),
  signature: z.string().trim().regex(/^[a-f0-9]{40}$/i),
  resourceType: z.literal("image"),
});

export type TherapistProfilePhotoUploadConfirmationInput = z.infer<
  typeof therapistProfilePhotoUploadConfirmationSchema
>;
