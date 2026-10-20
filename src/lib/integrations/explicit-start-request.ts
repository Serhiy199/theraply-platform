import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";

export function integrationStartMethodNotAllowed() {
  return NextResponse.json({ error: "An explicit POST action is required." }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}

export async function validateIntegrationStartRequest(
  request: NextRequest,
  intent: "stripe-connect" | "google-connect",
): Promise<NextResponse | null> {
  if (request.method !== "POST") return integrationStartMethodNotAllowed();

  const deny = () => NextResponse.json({ error: "An explicit same-origin form submission is required." }, {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
  const speculative = ["purpose", "sec-purpose"].some((header) =>
    /\b(prefetch|prerender)\b/i.test(request.headers.get(header) ?? ""),
  ) || ["next-router-prefetch", "next-router-segment-prefetch", "x-middleware-prefetch"].some((header) =>
    request.headers.has(header),
  );
  if (speculative) return deny();

  try {
    if (request.headers.get("origin") !== buildCanonicalAppUrl("/").origin) return deny();
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") return deny();
    const fetchUser = request.headers.get("sec-fetch-user");
    if (fetchUser && fetchUser !== "?1") return deny();
    const contentType = request.headers.get("content-type")?.split(";")[0].trim();
    if (contentType !== "application/x-www-form-urlencoded" && contentType !== "multipart/form-data") return deny();
    if ((await request.formData()).get("intent") !== intent) return deny();
  } catch {
    return deny();
  }

  return null;
}
