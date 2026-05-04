export type RegisterActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialRegisterActionState: RegisterActionState = {
  status: "idle",
};
