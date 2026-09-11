import "server-only";
import { compile } from "html-to-text";

const toText = compile({
  wordwrap: false,
  preserveNewlines: true,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    ...["img", "script", "style", "iframe", "object", "template"].map((selector) => ({ selector, format: "skip" })),
    ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({ selector, options: { uppercase: false } })),
  ],
});

export function formatWixBioDisplay(bio: string | null | undefined): string {
  const text = bio?.trim() ?? "";
  // Preserve plain source whitespace; markup is parsed, never stripped with regex.
  if (!/<[!/a-z]|&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(text)) return text;
  return toText(text).replace(/\u00a0/g, " ").trim();
}
