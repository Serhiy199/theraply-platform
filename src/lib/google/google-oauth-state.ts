import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_STATE_TTL_SECONDS = 600;
export const GOOGLE_RETURN_FALLBACK = "/therapist/payout-details";

export function safeGoogleReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return GOOGLE_RETURN_FALLBACK;
  // OAuth needs only a small internal path, not nested URL encodings.
  if (!/^\/(?!\/)/.test(value) || /[\\%\s\u0000-\u001f\u007f]/.test(value)) return GOOGLE_RETURN_FALLBACK;
  const base = "https://theraply.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : GOOGLE_RETURN_FALLBACK;
  } catch {
    return GOOGLE_RETURN_FALLBACK;
  }
}

export class GoogleOAuthStateError extends Error {
  constructor() { super("Google authorization expired or is invalid. Please reconnect."); }
}

type Context = { userId: string; session: string; secret: string; now?: number };
type State = { v: number; userId: string; binding: string; nonce: string; expires: number; returnTo: string };
function mac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function assertContext(context: Context) {
  if (!context.userId || !context.session || context.secret.length < 32) throw new GoogleOAuthStateError();
}
export function createGoogleOAuthState(context: Context, returnTo?: unknown) {
  assertContext(context);
  const nonce = randomBytes(32).toString("base64url");
  const payload: State = {
    v: 1, userId: context.userId, nonce,
    binding: mac(`google-session:${context.session}`, context.secret),
    expires: (context.now ?? Date.now()) + GOOGLE_STATE_TTL_SECONDS * 1000,
    returnTo: safeGoogleReturnTo(returnTo),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: `${body}.${mac(`google-state:${body}`, context.secret)}`, nonce };
}

export function validateGoogleOAuthState(state: string | null, nonce: string | undefined, context: Context) {
  assertContext(context);
  if (!state || state.length > 6000 || !nonce) throw new GoogleOAuthStateError();
  const parts = state.split(".");
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p)) ||
      !equal(parts[1], mac(`google-state:${parts[0]}`, context.secret))) throw new GoogleOAuthStateError();
  let payload: State;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new GoogleOAuthStateError(); }
  const now = context.now ?? Date.now();
  if (!payload || payload.v !== 1 || payload.userId !== context.userId ||
      typeof payload.nonce !== "string" || !equal(payload.nonce, nonce) ||
      typeof payload.binding !== "string" || !equal(payload.binding, mac(`google-session:${context.session}`, context.secret)) ||
      !Number.isSafeInteger(payload.expires) || payload.expires <= now ||
      payload.expires > now + GOOGLE_STATE_TTL_SECONDS * 1000 ||
      payload.returnTo !== safeGoogleReturnTo(payload.returnTo)) throw new GoogleOAuthStateError();
  return { therapistUserId: payload.userId, returnTo: payload.returnTo };
}
