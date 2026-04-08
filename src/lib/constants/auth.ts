export const AUTH_ROUTES = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPasswordBase: "/reset-password",
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
  tokenTtlHours: 2,
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
} as const;

export const AUTH_MESSAGES = {
  emailRequired: "Email is required.",
  emailInvalid: "Enter a valid email address.",
  firstNameRequired: "First name is required.",
  lastNameRequired: "Last name is required.",
  resetTokenRequired: "Reset token is required.",
  loginInvalid: "Invalid email or password.",
  registerSuccess: "Account created successfully. You can now sign in.",
  registerEmailTaken: "An account with this email already exists.",
  registerGenericError: "Unable to create your account right now.",
  forgotPasswordSuccess: "If an account with that email exists, we have generated a password reset link.",
  forgotPasswordGenericError: "Unable to start password recovery right now.",
} as const;
