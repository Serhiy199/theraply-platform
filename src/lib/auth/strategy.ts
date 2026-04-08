export const AUTH_ROUTES = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
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
