export const RATE_LIMIT_SCOPES = {
  authLogin: "auth:login",
  authRegister: "auth:register",
  authForgotPassword: "auth:forgot-password",
  authResetPassword: "auth:reset-password",
  authResendVerification: "auth:resend-verification",
  stripeCheckout: "stripe:checkout",
  therapistCertificateUpload: "therapist:certificate-upload",
  therapistCertificateConfirmUpload: "therapist:certificate-confirm-upload",
  googleCalendarConnect: "google-calendar:connect",
  cronBookingRules: "cron:booking-rules",
} as const;

export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[keyof typeof RATE_LIMIT_SCOPES];

export type RateLimitPreset = {
  scope: RateLimitScope;
  limit: number;
  windowMs: number;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const RATE_LIMIT_PRESETS = {
  authLogin: {
    scope: RATE_LIMIT_SCOPES.authLogin,
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  authRegister: {
    scope: RATE_LIMIT_SCOPES.authRegister,
    limit: 5,
    windowMs: HOUR,
  },
  authForgotPassword: {
    scope: RATE_LIMIT_SCOPES.authForgotPassword,
    limit: 3,
    windowMs: 15 * MINUTE,
  },
  authResetPassword: {
    scope: RATE_LIMIT_SCOPES.authResetPassword,
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  authResendVerification: {
    scope: RATE_LIMIT_SCOPES.authResendVerification,
    limit: 3,
    windowMs: 15 * MINUTE,
  },
  stripeCheckout: {
    scope: RATE_LIMIT_SCOPES.stripeCheckout,
    limit: 10,
    windowMs: 5 * MINUTE,
  },
  therapistCertificateUpload: {
    scope: RATE_LIMIT_SCOPES.therapistCertificateUpload,
    limit: 10,
    windowMs: HOUR,
  },
  therapistCertificateConfirmUpload: {
    scope: RATE_LIMIT_SCOPES.therapistCertificateConfirmUpload,
    limit: 10,
    windowMs: HOUR,
  },
  googleCalendarConnect: {
    scope: RATE_LIMIT_SCOPES.googleCalendarConnect,
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  cronBookingRules: {
    scope: RATE_LIMIT_SCOPES.cronBookingRules,
    limit: 30,
    windowMs: 15 * MINUTE,
  },
} as const satisfies Record<string, RateLimitPreset>;
