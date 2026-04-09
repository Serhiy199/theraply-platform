import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/auth";

export type CurrentUser = Session["user"];

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export function getUserDisplayName(user: Pick<CurrentUser, "email" | "firstName" | "lastName">) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  return user.email ?? "Theraply user";
}

export function getUserInitials(user: Pick<CurrentUser, "email" | "firstName" | "lastName">) {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((value) => value!.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  if (initials) {
    return initials;
  }

  return (user.email ?? "TU").slice(0, 2).toUpperCase();
}
