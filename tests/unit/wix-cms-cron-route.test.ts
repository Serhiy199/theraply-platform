import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/server/services/wix-cms-automation.service", () => ({ runWixCmsAutomationBackstop: mocks.run }));
import { GET } from "@/app/api/cron/wix-cms/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Wix CMS cron authorization", () => {
  it.each([undefined, "wrong"])("does not run for missing/invalid authorization %s", async value => {
    vi.stubEnv("CRON_SECRET", "mock-cron");
    const request = new NextRequest("https://staging.example/api/cron/wix-cms", { headers: value ? { authorization: value } : {} });
    expect((await GET(request)).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("fails closed if no cron secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new NextRequest("https://staging.example/api/cron/wix-cms"))).status).toBe(503);
  });
  it("runs only with the exact secret and signals retry failure", async () => {
    vi.stubEnv("CRON_SECRET", "mock-cron");
    mocks.run.mockResolvedValue({ status: "RETRY_REQUIRED" });
    expect((await GET(new NextRequest("https://staging.example/api/cron/wix-cms", { headers: { authorization: "Bearer mock-cron" } }))).status).toBe(503);
  });
});
