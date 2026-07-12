export const AUTH_ROUTES = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  changePassword: "/change-password",
  resetPasswordBase: "/reset-password",
  verifyEmailBase: "/verify-email",
} as const;

export const DASHBOARD_ROUTES = {
  client: "/client/dashboard",
  therapist: "/therapist/dashboard",
  admin: "/admin/dashboard",
} as const;

export const AUTH_STRATEGY = {
  provider: "credentials",
  session: "jwt",
  selfSignupRole: "CLIENT",
} as const;

export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 72,
} as const;

export const PASSWORD_RESET_RULES = {
  tokenTtlHours: 1,
} as const;

export const EMAIL_VERIFICATION_RULES = {
  tokenTtlHours: 24,
} as const;

export const EMAIL_TEMPLATES = {
  verification: "EMAIL_VERIFICATION",
  therapistOnboardingPendingReview: "THERAPIST_ONBOARDING_PENDING_REVIEW",
  therapistOnboardingApproved: "THERAPIST_ONBOARDING_APPROVED",
  therapistOnboardingChangesRequested: "THERAPIST_ONBOARDING_CHANGES_REQUESTED",
  therapistOnboardingRejected: "THERAPIST_ONBOARDING_REJECTED",
  bookingRequestCreated: "BOOKING_REQUEST_CREATED",
  bookingConfirmed: "BOOKING_CONFIRMED",
  bookingRejected: "BOOKING_REJECTED",
  bookingCancelled: "BOOKING_CANCELLED",
  paymentSuccessful: "PAYMENT_SUCCESSFUL",
  paymentFailed: "PAYMENT_FAILED",
  passwordReset: "PASSWORD_RESET",
} as const;

export const PASSWORD_MESSAGES = {
  required: "Password is required.",
  minLength: `Password must be at least ${PASSWORD_RULES.minLength} characters long.`,
  maxLength: `Password must be no longer than ${PASSWORD_RULES.maxLength} characters.`,
  uppercase: "Password must include at least one uppercase letter.",
  lowercase: "Password must include at least one lowercase letter.",
  number: "Password must include at least one number.",
  special: "Password must include at least one special character.",
  mismatch: "Passwords do not match.",
  sameAsCurrent: "New password must be different from your current password.",
} as const;

export const AUTH_MESSAGES = {
  emailRequired: "Email is required.",
  emailInvalid: "Enter a valid email address.",
  firstNameRequired: "First name is required.",
  lastNameRequired: "Last name is required.",
  resetTokenRequired: "Reset token is required.",
  loginInvalid: "Invalid email or password.",
  registerSuccess:
    "Verification email sent. Please confirm your email address to activate your account.",
  registerSuccessModalTitle: "Check your email",
  registerSuccessModalBody:
    "We sent a verification link to your email address. Open that email and confirm your address to verify your account.",
  registerSuccessClientNext:
    "After verification, client accounts can continue to the client dashboard.",
  registerSuccessTherapistNext:
    "After verification, therapist accounts continue to onboarding before admin review.",
  registerEmailTaken: "An account with this email already exists.",
  registerGenericError: "Unable to create your account right now.",
  emailVerificationInvalidToken: "This email verification link is invalid.",
  emailVerificationExpiredToken: "This email verification link has expired.",
  emailVerificationUsedToken: "This email verification link has already been used.",
  emailVerificationSuccess: "Email verified successfully.",
  emailVerificationResendSuccess:
    "If your account still needs verification, we sent a new verification email.",
  emailVerificationResendGenericError: "Unable to resend verification email right now.",
  emailVerificationGenericError: "Unable to verify your email right now.",
  forgotPasswordSuccess:
    "If an account with that email exists, we will send password reset instructions.",
  forgotPasswordGenericError: "Unable to start password recovery right now.",
  resetPasswordSuccess: "Password updated successfully. You can now sign in.",
  resetPasswordInvalidToken: "This reset link is invalid or has expired.",
  resetPasswordGenericError: "Unable to reset your password right now.",
  changePasswordSuccess: "Password changed successfully.",
  changePasswordInvalidCurrent: "Current password is incorrect.",
  changePasswordSameAsCurrent: PASSWORD_MESSAGES.sameAsCurrent,
  changePasswordGenericError: "Unable to change your password right now.",
  rateLimited: "Too many attempts. Please wait a little and try again.",
} as const;
