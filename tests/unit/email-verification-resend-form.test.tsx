import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailVerificationForm } from "@/components/forms/resend-email-verification-form";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/verify-email/actions", () => ({ resendEmailVerificationAction: action }));
afterEach(() => vi.clearAllMocks());

describe("native resend form rendering", () => {
  it.each(["initial open", "refresh", "navigation"])("renders one native form and no action calls on %s", () => {
    const html = renderToStaticMarkup(createElement(ResendEmailVerificationForm));
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toContain('type="submit"');
    expect(html).toContain("Resend verification email");
    expect(html).toContain("ant-btn-primary");
    expect(html).toContain("w-full");
    expect(html).not.toContain('name="email"');
    expect(action).not.toHaveBeenCalled();
  });
  it("places email name on the native input in optional public mode", () => {
    const html = renderToStaticMarkup(createElement(ResendEmailVerificationForm, { showEmailField: true }));
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toMatch(/<input\b[^>]*name="email"/);
    expect(html).toContain('autoComplete="email"');
    expect(action).not.toHaveBeenCalled();
  });
});
