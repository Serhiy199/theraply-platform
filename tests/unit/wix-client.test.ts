import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWixConfig,
  isWixConfigured,
  WixApiRequestError,
  WixConfigError,
  wixRequest,
} from "@/lib/wix/wix-client";

const testToken = "IST.test-header.test-payload-signature";
const testSiteId = "test-site-id";
const testFormId = "test-form-id";

function setRequiredWixEnv() {
  vi.stubEnv("WIX_API_TOKEN", testToken);
  vi.stubEnv("WIX_SITE_ID", testSiteId);
  vi.stubEnv("WIX_THERAPIST_APPLICATION_FORM_ID", testFormId);
  vi.stubEnv("WIX_ACCOUNT_ID", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Wix API client configuration", () => {
  it("reads required Wix config and keeps account context optional", () => {
    setRequiredWixEnv();

    expect(getWixConfig()).toEqual({
      apiToken: testToken,
      siteId: testSiteId,
      therapistApplicationFormId: testFormId,
      accountId: null,
    });
    expect(isWixConfigured()).toBe(true);
  });

  it.each([
    ["WIX_API_TOKEN", "Не налаштовано WIX_API_TOKEN."],
    ["WIX_SITE_ID", "Не налаштовано WIX_SITE_ID."],
    [
      "WIX_THERAPIST_APPLICATION_FORM_ID",
      "Не налаштовано WIX_THERAPIST_APPLICATION_FORM_ID.",
    ],
  ])("returns a controlled error when %s is absent", (name, expectedMessage) => {
    setRequiredWixEnv();
    vi.stubEnv(name, "");

    expect(() => getWixConfig()).toThrowError(
      new WixConfigError(expectedMessage),
    );
  });
});

describe("wixRequest", () => {
  it("adds required Wix headers, optional account context, and JSON body", async () => {
    setRequiredWixEnv();
    vi.stubEnv("WIX_ACCOUNT_ID", "test-account-id");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      wixRequest<{ success: boolean }>("/form-submission-service/v4/submissions", {
        method: "POST",
        body: { test: true },
      }),
    ).resolves.toEqual({ success: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(url).toBe("https://www.wixapis.com/form-submission-service/v4/submissions");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ test: true }));
    expect(headers.get("Authorization")).toBe(testToken);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("wix-site-id")).toBe(testSiteId);
    expect(headers.get("wix-account-id")).toBe("test-account-id");
  });

  it("omits wix-account-id when optional account context is unset", async () => {
    setRequiredWixEnv();
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await wixRequest("/form-schema-service/v4/forms/test/summary", {
      method: "GET",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).has("wix-account-id")).toBe(false);
  });

  it("parses failed responses without exposing the API token in the thrown message", async () => {
    setRequiredWixEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Permission denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    try {
      await wixRequest("/form-schema-service/v4/forms/test/summary", {
        method: "GET",
      });
      throw new Error("Expected Wix request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(WixApiRequestError);
      expect(error).toMatchObject({
        status: 403,
        details: { message: "Permission denied" },
      });
      expect((error as Error).message).not.toContain(testToken);
    }
  });
});
