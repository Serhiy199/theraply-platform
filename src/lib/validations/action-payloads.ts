import { z } from "zod";

export const bookingIdPayloadSchema = z.object({
  bookingId: z.string().trim().min(1, "Booking identifier is missing."),
});

export const clientCompensationPayloadSchema = bookingIdPayloadSchema.extend({
  resolution: z.enum(["refund", "credit"], {
    message: "Compensation action payload is incomplete.",
  }),
});

export const therapistRequestDecisionPayloadSchema = bookingIdPayloadSchema.extend({
  intent: z.enum(["confirm", "reject"], {
    message: "Request action payload is incomplete.",
  }),
});

export const therapistCancelSessionPayloadSchema = bookingIdPayloadSchema;

export const adminCancelBookingPayloadSchema = bookingIdPayloadSchema;

export const therapistReviewPayloadSchema = z.object({
  therapistProfileId: z
    .string()
    .trim()
    .min(1, "Therapist profile identifier is missing."),
});

export const therapistRejectReviewPayloadSchema = therapistReviewPayloadSchema.extend({
  rejectionReason: z
    .string()
    .trim()
    .min(1, "Rejection reason is required.")
    .max(2000, "Rejection reason must be 2000 characters or fewer."),
});

export const therapistRequestChangesPayloadSchema = therapistReviewPayloadSchema.extend({
  message: z
    .string()
    .trim()
    .min(10, "Update request must be at least 10 characters long.")
    .max(2000, "Update request must be 2000 characters or fewer."),
});

export const googleCalendarSelectionPayloadSchema = z.object({
  googleCalendarId: z.string().trim().min(1, "Choose a Google Calendar first."),
});

export type ClientCompensationPayload = z.infer<typeof clientCompensationPayloadSchema>;
export type TherapistRequestDecisionPayload = z.infer<
  typeof therapistRequestDecisionPayloadSchema
>;
