import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runWixCmsAutomationBackstop } from "@/server/services/wix-cms-automation.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Cron unavailable." }, { status: 503 });
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runWixCmsAutomationBackstop();
    return NextResponse.json(result, { status: result.status === "RETRY_REQUIRED" ? 503 : 200 });
  } catch {
    console.error("[wix-cms-automation] Backstop blocked; inspect configuration and CMS contract.");
    return NextResponse.json({ error: "Wix CMS backstop blocked." }, { status: 503 });
  }
}
