import { describe, expect, it } from "vitest";
import { formatSessionPricePerHour, formatYearsOfExperience } from "@/lib/therapist-display";

describe("therapist presentation only", () => {
  it.each([
    [1, "1 year of experience"],
    [5, "5 years of experience"],
    [11, "11 years of experience"],
    [0, "0 years of experience"],
    [" 1 ", "1 year of experience"],
    ["5", "5 years of experience"],
    [" 5+ years ", "5+ years"],
    ["5 years of experience", "5 years of experience"],
    ["Over ten years in practice", "Over ten years in practice"],
  ])("formats experience %s without inventing or duplicating units", (input, expected) => {
    expect(formatYearsOfExperience(input)).toBe(expected);
  });

  it.each([null, undefined, "", "   ", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "-2", "1.5"])(
    "does not invent experience for absent/invalid numeric input %s", (input) => {
      expect(formatYearsOfExperience(input)).toBeNull();
    },
  );

  it.each([
    [6000, "\u00a360/hour"],
    [8500, "\u00a385/hour"],
    [6050, "\u00a360.50/hour"],
    [6001, "\u00a360.01/hour"],
    [1, "\u00a30.01/hour"],
  ])("formats integer pence %i", (input, expected) => {
    expect(formatSessionPricePerHour(input)).toBe(expected);
  });

  it.each([null, undefined, 0, -1, 10.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "returns no price for unsupported input %s", (input) => {
      expect(formatSessionPricePerHour(input)).toBeNull();
    },
  );
});
