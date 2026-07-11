import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { BOOKING_FLOW_MESSAGES } from "@/lib/constants/booking-flow";
import { CERTIFICATE_FILE_TOO_LARGE_MESSAGE } from "@/lib/constants/certificate-upload";

export const SAFE_ERROR_MESSAGES = {
  permissionDenied: "You do not have permission to perform this action.",
  genericAction: "Something went wrong. Please try again.",
  genericBooking: "Something went wrong while updating the booking.",
  genericPayment: "Something went wrong while starting payment.",
  genericGoogleCalendar: "Unable to complete Google Calendar connection.",
  genericWebhook: "Unable to process this webhook safely.",
} as const;

export function getSafeAuthErrorMessage(code: string) {
  switch (code) {
    case "EMAIL_TAKEN":
      return AUTH_MESSAGES.registerEmailTaken;
    case "INVALID_CREDENTIALS":
      return AUTH_MESSAGES.loginInvalid;
    case "PASSWORD_RESET_INVALID_TOKEN":
      return AUTH_MESSAGES.resetPasswordInvalidToken;
    case "PASSWORD_RESET_REQUEST_FAILED":
      return AUTH_MESSAGES.forgotPasswordGenericError;
    case "PASSWORD_RESET_FAILED":
      return AUTH_MESSAGES.resetPasswordGenericError;
    case "CREATE_FAILED":
    default:
      return AUTH_MESSAGES.registerGenericError;
  }
}

export function getSafeBookingFlowErrorMessage(code: string) {
  switch (code) {
    case "BOOKING_NOT_FOUND":
      return "We could not find that booking.";
    case "BOOKING_NOT_CANCELLABLE":
      return "This booking cannot be cancelled now.";
    case "BOOKING_NOT_PENDING":
      return "This booking request is no longer waiting for a decision.";
    case "BOOKING_LEAD_TIME":
      return BOOKING_FLOW_MESSAGES.slotTooSoon;
    case "CLIENT_NOT_ELIGIBLE":
      return "This booking is not available for the signed-in client.";
    case "INVALID_DATE_RANGE":
      return BOOKING_FLOW_MESSAGES.invalidRange;
    case "INVALID_MEETING_URL":
      return "The session meeting link could not be prepared.";
    case "PAYMENT_NOT_SETTLED":
      return "This session must be paid before it can be completed or marked no-show.";
    case "REFUND_FAILED":
      return "The automatic refund could not be completed right now. Please contact support.";
    case "SESSION_NOT_SETTLEABLE":
      return "This session cannot be completed or marked no-show yet.";
    case "SLOT_CONFLICT":
      return BOOKING_FLOW_MESSAGES.slotConflict;
    case "THERAPIST_NOT_BOOKABLE":
      return "This therapist is not available for booking right now.";
    case "GOOGLE_CALENDAR_SYNC_FAILED":
      return "Google Calendar could not be updated right now. Please try again.";
    default:
      return SAFE_ERROR_MESSAGES.genericBooking;
  }
}

export function getSafeClientBookingErrorMessage(code: string) {
  switch (code) {
    case "BOOKING_NOT_FOUND":
      return "We could not find that booking.";
    case "BOOKING_NOT_CANCELLABLE":
      return "This booking cannot be cancelled now.";
    case "COMPENSATION_ALREADY_RESOLVED":
      return "Compensation for this booking has already been resolved.";
    case "COMPENSATION_NOT_ELIGIBLE":
      return "This booking is not eligible for compensation.";
    case "GOOGLE_CALENDAR_SYNC_FAILED":
      return "Google Calendar could not be updated right now. Please try again.";
    case "REFUND_FAILED":
      return "The refund could not be completed right now. Please contact support.";
    default:
      return SAFE_ERROR_MESSAGES.genericBooking;
  }
}

export function getSafeAdminOperationErrorMessage(code: string) {
  switch (code) {
    case "BOOKING_NOT_FOUND":
      return "We could not find that booking.";
    case "BOOKING_NOT_CANCELLABLE":
      return "This booking cannot be cancelled now.";
    case "ADMIN_NOT_FOUND":
      return "Admin account could not be verified.";
    case "THERAPIST_PROFILE_NOT_FOUND":
      return "Therapist profile could not be found.";
    case "THERAPIST_PROFILE_NOT_PENDING_REVIEW":
      return "This therapist profile is no longer pending review.";
    case "THERAPIST_REVIEW_MESSAGE_REQUIRED":
      return "Please describe the changes required before sending this request.";
    case "THERAPIST_REVIEW_MESSAGE_INVALID":
      return "The update request must be between 10 and 2000 characters.";
    case "THERAPIST_REJECTION_REASON_REQUIRED":
      return "Add a rejection reason before rejecting this profile.";
    case "GOOGLE_CALENDAR_SYNC_FAILED":
      return "Google Calendar could not be updated right now. Please try again.";
    case "REFUND_FAILED":
      return "The refund could not be completed right now. Please contact support.";
    default:
      return SAFE_ERROR_MESSAGES.genericAction;
  }
}

export function getSafeGoogleCalendarErrorMessage(code: string) {
  switch (code) {
    case "GOOGLE_CALENDAR_NOT_CONFIGURED":
      return "Google Calendar connection is not configured yet.";
    case "THERAPIST_PROFILE_NOT_FOUND":
      return "Therapist profile could not be found.";
    case "GOOGLE_CALENDAR_NOT_CONNECTED":
      return "Connect Google Calendar first.";
    case "GOOGLE_REFRESH_TOKEN_MISSING":
      return "Reconnect Google Calendar before continuing.";
    case "GOOGLE_CALENDAR_SELECTION_INVALID":
      return "Choose a calendar from the connected Google account.";
    case "GOOGLE_CALENDAR_TARGET_MISSING":
      return "Choose a target Google Calendar first.";
    case "GOOGLE_CALENDAR_EVENT_CREATE_FAILED":
      return "Google Calendar event could not be created right now.";
    default:
      return SAFE_ERROR_MESSAGES.genericGoogleCalendar;
  }
}

export function getSafeGoogleAvailabilityErrorMessage(code: string) {
  switch (code) {
    case "INVALID_DATE_RANGE":
      return BOOKING_FLOW_MESSAGES.invalidRange;
    case "GOOGLE_CALENDAR_NOT_CONNECTED":
      return "This therapist has not connected Google Calendar yet.";
    case "GOOGLE_CALENDAR_UNAVAILABLE":
      return "This therapist's calendar is currently unavailable. Please choose another therapist or try again later.";
    case "GOOGLE_CALENDAR_TARGET_MISSING":
      return "This therapist has not selected a booking calendar yet.";
    default:
      return "Availability could not be loaded right now.";
  }
}

export function getSafePaymentFlowErrorMessage(code: string) {
  switch (code) {
    case "BOOKING_NOT_FOUND":
      return "We could not find that booking.";
    case "PAYMENT_NOT_ELIGIBLE":
      return "This booking is not eligible for payment right now.";
    case "STRIPE_NOT_CONFIGURED":
      return "Payments are not configured yet.";
    case "CHECKOUT_SESSION_CREATE_FAILED":
      return "Stripe Checkout could not be started right now.";
    case "PAYMENT_RECORD_NOT_FOUND":
      return "Payment record could not be found.";
    default:
      return SAFE_ERROR_MESSAGES.genericPayment;
  }
}

export function getSafeTherapistOnboardingErrorMessage(code: string) {
  switch (code) {
    case "THERAPIST_PROFILE_NOT_FOUND":
      return "Therapist profile could not be found.";
    case "THERAPIST_ONBOARDING_LOCKED":
      return "This onboarding profile cannot be edited right now.";
    case "THERAPIST_ONBOARDING_INVALID_DRAFT":
      return "Please fix the highlighted onboarding fields.";
    default:
      return SAFE_ERROR_MESSAGES.genericAction;
  }
}

export function getSafeCertificateStorageErrorMessage(code: string) {
  switch (code) {
    case "THERAPIST_PROFILE_NOT_FOUND":
      return "Therapist profile could not be found.";
    case "THERAPIST_CERTIFICATE_UPLOAD_LOCKED":
      return "Certificates can only be uploaded while onboarding is editable.";
    case "THERAPIST_CERTIFICATE_FILE_REQUIRED":
      return "Choose at least one certificate file to upload.";
    case "THERAPIST_CERTIFICATE_FILE_TOO_LARGE":
      return CERTIFICATE_FILE_TOO_LARGE_MESSAGE;
    case "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED":
      return "Certificate files must be JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, or TXT.";
    case "THERAPIST_CERTIFICATE_METADATA_INVALID":
      return "Certificate upload details are invalid.";
    case "THERAPIST_CERTIFICATE_ASSET_VERIFICATION_FAILED":
      return "Could not verify the uploaded certificate. Please try again.";
    case "THERAPIST_CERTIFICATE_STORAGE_NOT_CONFIGURED":
      return "Certificate upload is not configured yet.";
    default:
      return "Something went wrong while uploading certificates.";
  }
}

export function getSafeTherapistBookingsErrorMessage(code: string) {
  switch (code) {
    case "BOOKING_NOT_FOUND":
      return "We could not find that booking.";
    case "BOOKING_NOT_PENDING":
      return "This booking request is no longer waiting for a decision.";
    case "THERAPIST_PROFILE_NOT_FOUND":
      return "Therapist profile could not be found.";
    default:
      return SAFE_ERROR_MESSAGES.genericAction;
  }
}
