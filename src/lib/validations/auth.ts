import { z } from "zod";
import { AUTH_MESSAGES, PASSWORD_MESSAGES, PASSWORD_RULES } from "@/lib/constants/auth";

const emailSchema = z
  .string()
  .trim()
  .min(1, AUTH_MESSAGES.emailRequired)
  .email(AUTH_MESSAGES.emailInvalid)
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, PASSWORD_MESSAGES.minLength)
  .max(PASSWORD_RULES.maxLength, PASSWORD_MESSAGES.maxLength)
  .regex(/[A-Z]/, PASSWORD_MESSAGES.uppercase)
  .regex(/[a-z]/, PASSWORD_MESSAGES.lowercase)
  .regex(/[0-9]/, PASSWORD_MESSAGES.number)
  .regex(/[^A-Za-z0-9]/, PASSWORD_MESSAGES.special);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, PASSWORD_MESSAGES.required),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, AUTH_MESSAGES.firstNameRequired),
    lastName: z.string().trim().min(1, AUTH_MESSAGES.lastNameRequired),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, PASSWORD_MESSAGES.required),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORD_MESSAGES.mismatch,
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, AUTH_MESSAGES.resetTokenRequired),
    password: passwordSchema,
    confirmPassword: z.string().min(1, PASSWORD_MESSAGES.required),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORD_MESSAGES.mismatch,
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
