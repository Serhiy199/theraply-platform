import type { ReactElement } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationStartForm } from "@/components/dashboard/therapist/integration-start-form";

const mocks = vi.hoisted(() => ({ ref: { current: false }, pending: vi.fn(), effect: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useRef: () => mocks.ref, useState: () => [false, mocks.pending], useEffect: mocks.effect,
}));

beforeEach(() => {
  mocks.ref.current = false;
  vi.stubGlobal("window", { addEventListener: mocks.add, removeEventListener: mocks.remove });
});
afterEach(() => vi.unstubAllGlobals());

function form() {
  return IntegrationStartForm({ action: "/api/stripe/connect/account-link", intent: "stripe-connect",
    requestId: "11111111-1111-4111-8111-111111111111", children: "Connect Stripe account" }) as ReactElement<{
      method: string; onSubmit: (event: { preventDefault: () => void }) => void; children: ReactElement<Record<string, unknown>>[];
    }>;
}

describe("explicit connection form client interactions (mocked hooks)", () => {
  it("submits once, blocks a second click, and preserves hidden form fields", () => {
    const rendered = form();
    const event = { preventDefault: vi.fn() };
    expect(rendered.props.method).toBe("post");
    rendered.props.onSubmit(event);
    rendered.props.onSubmit(event);
    expect(mocks.pending).toHaveBeenCalledExactlyOnceWith(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(rendered.props.children[0].props).toMatchObject({ type: "hidden", name: "intent", value: "stripe-connect" });
    expect(rendered.props.children[1].props).toMatchObject({ type: "hidden", name: "requestId" });
    expect(rendered.props.children[2].props.loadingText).toBe("Opening connection...");
  });
  it("restores button availability on browser back/pageshow without starting any flow", () => {
    form();
    const cleanup = mocks.effect.mock.calls[0][0]();
    expect(mocks.add).toHaveBeenCalledWith("pageshow", expect.any(Function));
    mocks.ref.current = true;
    mocks.add.mock.calls[0][1]();
    expect(mocks.ref.current).toBe(false);
    expect(mocks.pending).toHaveBeenCalledWith(false);
    cleanup();
    expect(mocks.remove).toHaveBeenCalledWith("pageshow", mocks.add.mock.calls[0][1]);
  });
});
