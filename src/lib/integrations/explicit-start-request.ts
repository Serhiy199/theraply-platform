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
): Promise<NextResponse | { requestId: string }> {
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
    const origin = buildCanonicalAppUrl("/").origin;
    if (request.headers.get("origin") !== origin) return deny();
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") return deny();
    const fetchUser = request.headers.get("sec-fetch-user");
    if (fetchUser && fetchUser !== "?1") return deny();
    const contentType = request.headers.get("content-type")?.split(";")[0].trim();
    if (contentType !== "application/x-www-form-urlencoded" && contentType !== "multipart/form-data") return deny();
    const form = await request.formData();
    const requestId = form.get("requestId");
    if (form.getAll("intent").length !== 1 || form.get("intent") !== intent || form.getAll("requestId").length !== 1 ||
        typeof requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) return deny();
    return { requestId };
  } catch {
    return deny();
  }

}
