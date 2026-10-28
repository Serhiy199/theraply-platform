import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("completed one-off Wix Copy runtime operation", () => {
  it("does not leave its temporary execution endpoint or service in application source", () => {
    expect(existsSync(resolve("src/app/api/admin/wix02a/route.ts"))).toBe(false);
    expect(existsSync(resolve("src/server/services/wix02a-runtime.service.ts"))).toBe(false);
  });
});
