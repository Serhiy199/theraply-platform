export const BOOKING_FLOW_SLOT_DURATION_MINUTES = 60;
export const BOOKING_FLOW_WINDOW_DAYS = 14;
export const BOOKING_FLOW_BUSINESS_HOURS = {
  start: 9,
  end: 17,
} as const;

export const BOOKING_FLOW_MESSAGES = {
  therapistRequired: "Please choose a therapist before continuing.",
  slotRequired: "Please choose a session slot before sending the request.",
  startsAtRequired: "Session start time is required.",
  endsAtRequired: "Session end time is required.",
  invalidRange: "Session end time must be after the start time.",
  futureOnly: "Bookings can only be created for future time slots.",
  slotDurationMismatch: `Each booking slot must be ${BOOKING_FLOW_SLOT_DURATION_MINUTES} minutes long.`,
  bookingCreated: "Booking request sent. It is now waiting for therapist confirmation.",
  slotConflict: "This slot is no longer available. Please choose another time.",
  noTherapists: "No approved therapists are available for booking right now.",
  noSlots: "No available slots were found for this therapist in the current booking window.",
  pendingLabel: "Pending therapist confirmation",
  availableLabel: "Available",
  unavailableLabel: "Unavailable",
} as const;
