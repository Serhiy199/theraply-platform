import { z } from "zod";
import {
  BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION,
  BOOKING_FLOW_MESSAGES,
  BOOKING_FLOW_SLOT_DURATION_MINUTES,
} from "@/lib/constants/booking-flow";

const isoDateSchema = z.coerce.date();
const minimumLeadTimeMs = BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION * 60 * 60 * 1000;

export const bookingRequestSchema = z
  .object({
    therapistId: z.string().trim().min(1, BOOKING_FLOW_MESSAGES.therapistRequired),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: BOOKING_FLOW_MESSAGES.invalidRange,
    path: ["endsAt"],
  })
  .refine((data) => data.startsAt > new Date(), {
    message: BOOKING_FLOW_MESSAGES.futureOnly,
    path: ["startsAt"],
  })
  .refine((data) => data.startsAt.getTime() - Date.now() >= minimumLeadTimeMs, {
    message: BOOKING_FLOW_MESSAGES.minimumLeadTime,
    path: ["startsAt"],
  })
  .refine(
    (data) =>
      data.endsAt.getTime() - data.startsAt.getTime() ===
      BOOKING_FLOW_SLOT_DURATION_MINUTES * 60 * 1000,
    {
      message: BOOKING_FLOW_MESSAGES.slotDurationMismatch,
      path: ["endsAt"],
    },
  )
  .transform((data) => ({
    ...data,
    notes: data.notes?.trim() ? data.notes.trim() : undefined,
  }));

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
