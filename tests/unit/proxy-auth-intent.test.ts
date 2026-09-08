import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

import { proxy } from "@/proxy";

describe("protected route auth intent", () => {
  beforeEach(() => {
    getTokenMock.mockResolvedValue(null);
  });

  it("carries the complete guest booking route into login", async () => {
    const response = await proxy(
      new NextRequest(
        "https://staging.theraply.example/client/book/therapist-1?source=wix&campaign=summer",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/client/book/therapist-1?source=wix&campaign=summer",
    );
  });

  it("does not redirect an authenticated client away from the booking route", async () => {
    getTokenMock.mockResolvedValue({ role: "CLIENT" });

    const response = await proxy(
      new NextRequest("https://staging.theraply.example/client/book/therapist-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
