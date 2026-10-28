import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import { assertWix02aRuntime, runWix02a, WIX02A_ORIGIN, Wix02aBlocked } from "@/server/services/wix02a-runtime.service";

export const runtime = "nodejs";
export const maxDuration = 120;
const PATH = "/api/admin/wix02a";
const CONFIRMATION = "WIX02A_HIDE_ONE_COPY_ITEM";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401, headers });
  try {
    await requireCurrentActionRole(user, [UserRole.ADMIN]);
  } catch (error) {
    if (!(error instanceof ActionPermissionError)) throw error;
    return NextResponse.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers });
  }
  return null;
}

function html(body: string) {
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Wix Copy targeted operation</title><body>${body}</body></html>`, {
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  try { assertWix02aRuntime(); } catch {
    return NextResponse.json({ error: "STAGING_RUNTIME_REQUIRED" }, { status: 403, headers });
  }
  return html(`<h1>Wix Copy targeted operation</h1><form method="post" action="${PATH}"><input type="hidden" name="mode" value="preflight"><button type="submit">Read-only preflight</button></form>`);
}

export async function POST(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  const speculative = ["purpose", "sec-purpose"].some(key => /prefetch|prerender/i.test(request.headers.get(key) ?? "")) ||
    ["next-router-prefetch", "next-router-segment-prefetch", "x-middleware-prefetch"].some(key => request.headers.has(key));
  if (request.headers.get("origin") !== WIX02A_ORIGIN ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") ||
    new URL(request.url).origin !== WIX02A_ORIGIN || speculative) {
    return NextResponse.json({ error: "EXPLICIT_SAME_ORIGIN_POST_REQUIRED" }, { status: 403, headers });
  }
  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400, headers });
  }
  const mode = form.get("mode");
  const allowed = mode === "preflight" ? ["mode"] : ["mode", "confirmation", "snapshot"];
  if ((mode !== "preflight" && mode !== "execute") || [...form.keys()].some(key => !allowed.includes(key)) ||
    [...new Set(form.keys())].some(key => form.getAll(key).length !== 1) ||
    (mode === "execute" && (form.get("confirmation") !== CONFIRMATION || !/^[a-f0-9]{64}$/.test(String(form.get("snapshot") ?? ""))))) {
    return NextResponse.json({ error: "PINNED_OPERATION_ONLY" }, { status: 400, headers });
  }
  try {
    const result = await runWix02a(mode, mode === "execute" ? String(form.get("snapshot")) : undefined);
    const execute = mode === "preflight" ? `<form method="post" action="${PATH}"><input type="hidden" name="mode" value="execute"><input type="hidden" name="confirmation" value="${CONFIRMATION}"><input type="hidden" name="snapshot" value="${result.snapshot}"><button type="submit">Hide only approved Wix Copy item</button></form>` : "";
    return html(`<h1>Wix Copy targeted operation</h1><pre>${escape(JSON.stringify(result, null, 2))}</pre>${execute}`);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Wix02aBlocked ? error.code : "OPERATION_BLOCKED",
      writeAttempted: error instanceof Wix02aBlocked && error.writeAttempted }, { status: 409, headers });
  }
}
