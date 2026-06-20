import { redirect } from "next/navigation";

import { AUTH_ROUTES } from "@/lib/constants/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { getPostLoginRedirectForUser } from "@/lib/auth/redirects";

export default async function Home() {
  const user = await getCurrentUser();

  redirect(user ? getPostLoginRedirectForUser(user) : AUTH_ROUTES.login);
}
