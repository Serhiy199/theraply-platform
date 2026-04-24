import { z } from "zod";

export const paymentCheckoutRequestSchema = z.object({
  bookingId: z.string().trim().min(1, "Booking identifier is required."),
});

export type PaymentCheckoutRequestInput = z.infer<typeof paymentCheckoutRequestSchema>;
