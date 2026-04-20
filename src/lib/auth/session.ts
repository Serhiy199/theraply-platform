import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/auth";
export { getUserDisplayName, getUserInitials } from "@/lib/auth/user-display";

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
