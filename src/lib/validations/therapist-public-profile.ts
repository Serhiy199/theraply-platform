import { z } from "zod";

export const therapistPublicProfileSchema = z.object({
  bio: z.string().trim().min(1, "Bio is required.").max(10000),
  specialization: z.string().trim().min(1, "Specialization is required.").max(1000),
  therapyServicesProvided: z.string().trim().min(1, "Therapy services are required.").max(3000),
  yearsOfExperience: z.string().trim().regex(/^(0|[1-9]\d?)$/, "Enter whole years from 0 to 80.")
    .refine(value => Number(value) <= 80, "Enter whole years from 0 to 80."),
}).strict();

export type TherapistPublicProfileInput = z.infer<typeof therapistPublicProfileSchema>;
export type PublicProfileActionState = { status: "idle" | "success" | "error"; message?: string };
