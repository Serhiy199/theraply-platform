import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RateLimitPreset, RateLimitScope } from "@/lib/constants/rate-limit";

type RateLimitStoreEntry = {
  count: number;
  resetAt: number;
};

type RateLimitCheckInput = {
  scope: RateLimitScope;
  identifier: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

type HeaderLike = Pick<Headers, "get">;

const FALLBACK_CLIENT_IDENTIFIER = "anonymous";
const MEMORY_STORE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

declare global {
  var __theraplyRateLimitStore:
    | {
        entries: Map<string, RateLimitStoreEntry>;
        lastCleanupAt: number;
      }
    | undefined;
}

function getStore() {
  if (!globalThis.__theraplyRateLimitStore) {
    globalThis.__theraplyRateLimitStore = {
      entries: new Map<string, RateLimitStoreEntry>(),
      lastCleanupAt: 0,
    };
  }

  return globalThis.__theraplyRateLimitStore;
}

function normalizeIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized || FALLBACK_CLIENT_IDENTIFIER;
}

function hashRateLimitKey(scope: RateLimitScope, identifier: string) {
  const hash = createHash("sha256")
    .update(`${scope}:${normalizeIdentifier(identifier)}`)
    .digest("hex");

  return `${scope}:${hash}`;
}

function cleanupExpiredEntries(now: number) {
  const store = getStore();

  if (now - store.lastCleanupAt < MEMORY_STORE_CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, entry] of store.entries.entries()) {
    if (entry.resetAt <= now) {
      store.entries.delete(key);
    }
  }

  store.lastCleanupAt = now;
}

function getRetryAfterSeconds(resetAt: number, now: number) {
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

export async function checkRateLimit(input: RateLimitCheckInput): Promise<RateLimitResult> {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const store = getStore();
  const key = hashRateLimitKey(input.scope, input.identifier);
  const existing = store.entries.get(key);
  const current =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + input.windowMs,
        };

  current.count += 1;
  store.entries.set(key, current);

  const allowed = current.count <= input.limit;
  const remaining = Math.max(0, input.limit - current.count);

  return {
    allowed,
    limit: input.limit,
    remaining,
    resetAt: new Date(current.resetAt),
    retryAfterSeconds: allowed ? 0 : getRetryAfterSeconds(current.resetAt, now),
  };
}

export async function checkRateLimitPreset(
  preset: RateLimitPreset,
  identifier: string,
): Promise<RateLimitResult> {
  return checkRateLimit({
    scope: preset.scope,
    identifier,
    limit: preset.limit,
    windowMs: preset.windowMs,
  });
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

function getForwardedIp(headers: HeaderLike) {
  const forwardedFor = headers.get("x-forwarded-for");

  if (!forwardedFor) {
    return null;
  }

  return forwardedFor.split(",")[0]?.trim() || null;
}

export function getClientIpFromHeaders(headers: HeaderLike) {
  return (
    getForwardedIp(headers) ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("true-client-ip")?.trim() ||
    headers.get("fly-client-ip")?.trim() ||
    FALLBACK_CLIENT_IDENTIFIER
  );
}

export function getClientIpFromRequest(request: NextRequest) {
  return getClientIpFromHeaders(request.headers);
}

export function buildUserRateLimitIdentifier(input: {
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
}) {
  if (input.userId?.trim()) {
    return `user:${input.userId.trim()}`;
  }

  if (input.email?.trim()) {
    return `email:${input.email.trim().toLowerCase()}`;
  }

  if (input.ip?.trim()) {
    return `ip:${input.ip.trim()}`;
  }

  return FALLBACK_CLIENT_IDENTIFIER;
}
