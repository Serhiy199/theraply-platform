export type ResendEmailVerificationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialResendEmailVerificationActionState: ResendEmailVerificationActionState = {
  status: "idle",
};
