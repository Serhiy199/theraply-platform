export type ChangePasswordActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    currentPassword?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
};

export const initialChangePasswordActionState: ChangePasswordActionState = {
  status: "idle",
};
