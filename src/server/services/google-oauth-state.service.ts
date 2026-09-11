import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGoogleOAuthState, validateGoogleOAuthState, GoogleOAuthStateError } from "@/lib/google/google-oauth-state";

export function googleStateCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-theraply-google-state" : "theraply-google-state";
}

function context(request: NextRequest, userId: string) {
  const name = process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  const parts = request.cookies.getAll().filter(c => c.name === name || new RegExp(`^${name.replaceAll(".", "\\.")}\\.\\d+$`).test(c.name));
  if (parts.length > 1 && parts.some(part => part.name === name)) throw new GoogleOAuthStateError();
  parts.sort((a, b) => Number(a.name.slice(name.length + 1)) - Number(b.name.slice(name.length + 1)));
  if (parts.some((part, index) => part.name !== name && part.name !== `${name}.${index}`)) throw new GoogleOAuthStateError();
  return { userId, session: parts.map(p => p.value).join(""), secret: process.env.AUTH_SECRET ?? "" };
}

export function issueGoogleOAuthState(request: NextRequest, userId: string, returnTo: string) {
  return createGoogleOAuthState(context(request, userId), returnTo);
}

export async function consumeGoogleOAuthState(request: NextRequest, userId: string) {
  const state = request.nextUrl.searchParams.get("state");
  const payload = validateGoogleOAuthState(state, request.cookies.get(googleStateCookieName())?.value, context(request, userId));
  // A unique audit ID is an atomic replay claim shared by all runtime instances.
  // Neither the OAuth state nor the session/nonce is persisted.
  try {
    await prisma.auditLog.create({ data: {
      id: `google-oauth-state:${createHash("sha256").update(state!).digest("hex")}`,
      actorUserId: userId, entityType: "GoogleCalendarIntegration", entityId: userId,
      action: "GOOGLE_OAUTH_STATE_CONSUMED",
    } });
  } catch { throw new GoogleOAuthStateError(); }
  return payload;
}
