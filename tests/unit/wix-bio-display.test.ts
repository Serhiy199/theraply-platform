import { describe, expect, it } from "vitest";
import { formatWixBioDisplay } from "@/lib/wix/wix-bio-display";
import { planWixBioDisplayField, WIX_CMS_REQUIRED_FIELDS } from "@/lib/wix/wix-cms-schema";

describe("Wix card plain-text bio", () => {
  it.each([
    ["  Plain  biography\n\nSecond paragraph  ", "Plain  biography\n\nSecond paragraph"],
    ["<p>Hello <strong>there</strong>.</p><p>Next<br>line</p>", "Hello there.\n\nNext\nline"],
    ['<p style="color:red">A &amp; B&nbsp;&#163;60</p>', "A & B \u00a360"],
    ['<h2>About me</h2><p><a href="https://example.com">Experience</a></p>', "About me\n\nExperience"],
    ['<script>alert(1)</script><style>body{color:red}</style><!-- hidden --><p>Visible</p>', "Visible"],
    ['<img src="x" onerror="alert(1)"><iframe>Hidden</iframe><template>Hidden</template>', ""],
    ["<p>Unclosed <b>emphasis", "Unclosed emphasis"],
    ["I support people < 30 and > 18.", "I support people < 30 and > 18."],
    [null, ""], [undefined, ""], ["   ", ""], ["<p><br></p>", ""],
  ])("converts %s without markup or invented content", (source, expected) => {
    expect(formatWixBioDisplay(source)).toBe(expected);
  });
});

describe("additive bioDisplay schema plan", () => {
  const fields = [{ key: "bio", type: "RICH_TEXT" }, { key: "displayName", type: "TEXT" }];
  it("adds only Bio Display TEXT without mutating existing fields", () => {
    const before = structuredClone(fields);
    expect(planWixBioDisplayField(fields)).toEqual({
      dataCollectionId: "Therapists",
      field: { key: "bioDisplay", displayName: "Bio Display", type: "TEXT" },
    });
    expect(fields).toEqual(before);
    expect(WIX_CMS_REQUIRED_FIELDS.bioDisplay).toEqual(["TEXT"]);
  });
  it("is idempotent when TEXT bioDisplay exists", () => {
    expect(planWixBioDisplayField([...fields, { key: "bioDisplay", type: "TEXT" }])).toBeNull();
  });
  it("rejects an incompatible existing display field", () => {
    expect(() => planWixBioDisplayField([...fields, { key: "bioDisplay", type: "RICH_TEXT" }])).toThrow();
  });
  it("never replaces a missing or differently typed rich bio", () => {
    expect(() => planWixBioDisplayField([])).toThrow();
    expect(() => planWixBioDisplayField([{ key: "bio", type: "TEXT" }])).toThrow();
  });
});
