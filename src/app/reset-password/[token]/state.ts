export type ResetPasswordActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialResetPasswordActionState: ResetPasswordActionState = {
  status: "idle",
};
