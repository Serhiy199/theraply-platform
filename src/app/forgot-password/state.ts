export type ForgotPasswordActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialForgotPasswordActionState: ForgotPasswordActionState = {
  status: "idle",
};
