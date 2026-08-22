import { z } from "zod";

export const paymentCheckoutRequestSchema = z.object({
  bookingId: z.string().trim().min(1, "Booking identifier is required."),
  promoCode: z.string().trim().min(1, "Promo code is required.").optional(),
});

export type PaymentCheckoutRequestInput = z.infer<typeof paymentCheckoutRequestSchema>;

export const promoCodePreviewRequestSchema = z.object({
  bookingId: z.string().trim().min(1, "Booking identifier is required."),
  promoCode: z.string().trim().min(1, "Promo code is required."),
});

export type PromoCodePreviewRequestInput = z.infer<
  typeof promoCodePreviewRequestSchema
>;
