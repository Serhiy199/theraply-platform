export type RegisterActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  email?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialRegisterActionState: RegisterActionState = {
  status: "idle",
};
