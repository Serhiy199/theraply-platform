import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createGoogleOAuthState, validateGoogleOAuthState, safeGoogleReturnTo, GOOGLE_RETURN_FALLBACK } from "@/lib/google/google-oauth-state";
import { consumeGoogleOAuthState, issueGoogleOAuthState } from "@/server/services/google-oauth-state.service";

const claim = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: claim } } }));
const ctx = { userId: "therapist", session: "unit-session", secret: "unit-test-only-signing-key-not-a-real-secret", now: 1000000 };
beforeEach(() => { vi.stubEnv("AUTH_SECRET", ctx.secret); claim.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("Google OAuth signed state", () => {
  it("accepts a signed state with the matching browser, session and user", () => {
    const { state, nonce } = createGoogleOAuthState(ctx, "/therapist/dashboard");
    expect(validateGoogleOAuthState(state, nonce, ctx)).toEqual({ therapistUserId: ctx.userId, returnTo: "/therapist/dashboard" });
    expect(createGoogleOAuthState(ctx).nonce).not.toBe(nonce);
    expect(nonce).toHaveLength(43);
    expect(state).not.toContain(ctx.session);
  });
  it.each([null, "", "garbage", "e30.invalid", "a.b.c"])("rejects malformed/missing state %s", state => {
    expect(() => validateGoogleOAuthState(state, "nonce", ctx)).toThrow();
  });
  it("rejects tampering, expiration, other user/session, missing/mismatched nonce", () => {
    const { state, nonce } = createGoogleOAuthState(ctx);
    expect(() => validateGoogleOAuthState(state + "a", nonce, ctx)).toThrow();
    expect(() => validateGoogleOAuthState(state, nonce, { ...ctx, now: ctx.now + 600000 })).toThrow();
    expect(() => validateGoogleOAuthState(state, nonce, { ...ctx, userId: "other" })).toThrow();
    expect(() => validateGoogleOAuthState(state, nonce, { ...ctx, session: "other" })).toThrow();
    expect(() => validateGoogleOAuthState(state, "other", ctx)).toThrow();
    expect(() => validateGoogleOAuthState(state, undefined, ctx)).toThrow();
    expect(() => createGoogleOAuthState({ ...ctx, session: "" })).toThrow();
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example", "/%5cevil.example", "/%252f%252fevil.example", "/%2fevil.example", "javascript:alert(1)", "data:text/html,x", "/\nevil.example", " /therapist/dashboard"])("blocks return path %s", value => {
    expect(safeGoogleReturnTo(value)).toBe(GOOGLE_RETURN_FALLBACK);
  });
  it("preserves safe internal paths and normalizes dot segments", () => {
    expect(safeGoogleReturnTo("/therapist/dashboard?tab=profile#bio")).toBe("/therapist/dashboard?tab=profile#bio");
    expect(safeGoogleReturnTo("/therapist/../therapist/dashboard")).toBe("/therapist/dashboard");
  });
  it("atomically allows one concurrent claim and stores no raw state/session/nonce", async () => {
    const issued = createGoogleOAuthState({ ...ctx, now: Date.now() });
    const ids = new Set<string>();
    claim.mockImplementation(async ({ data }) => {
      if (ids.has(data.id)) throw new Error("Unique constraint");
      ids.add(data.id);
    });
    const request = new NextRequest(`https://app.test/callback?state=${issued.state}`, { headers: {
      cookie: `next-auth.session-token=${ctx.session}; theraply-google-state=${issued.nonce}`,
    } });
    const results = await Promise.allSettled([consumeGoogleOAuthState(request, ctx.userId), consumeGoogleOAuthState(request, ctx.userId)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const stored = JSON.stringify(claim.mock.calls);
    for (const value of [issued.state, issued.nonce, ctx.session]) expect(stored).not.toContain(value);
  });
  it("fails closed if replay persistence is unavailable", async () => {
    claim.mockRejectedValue(new Error("unavailable"));
    const issued = createGoogleOAuthState({ ...ctx, now: Date.now() });
    const request = new NextRequest(`https://app.test/callback?state=${issued.state}`, { headers: {
      cookie: `next-auth.session-token=${ctx.session}; theraply-google-state=${issued.nonce}`,
    } });
    await expect(consumeGoogleOAuthState(request, ctx.userId)).rejects.toThrow("Please reconnect");
  });
  it("supports production secure chunked session cookies", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest("https://app.test/connect", { headers: {
      cookie: "__Secure-next-auth.session-token.1=session; __Secure-next-auth.session-token.0=unit-",
    } });
    const issued = issueGoogleOAuthState(request, ctx.userId, "/therapist/dashboard");
    expect(validateGoogleOAuthState(issued.state, issued.nonce, { ...ctx, now: Date.now() }).therapistUserId).toBe(ctx.userId);
  });
});
