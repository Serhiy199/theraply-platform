/** Legacy onboarding stores free-text experience; never append a unit to that text. */
export function formatYearsOfExperience(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim() : null;
  if (text === "") return null;
  const years = typeof value === "number" ? value : Number(text);
  if (text !== null && Number.isNaN(years)) return text;
  if (!Number.isSafeInteger(years) || years < 0) return null;
  return `${years} ${years === 1 ? "year" : "years"} of experience`;
}

export function formatSessionPricePerHour(pence: number | null | undefined): string | null {
  if (typeof pence !== "number" || !Number.isSafeInteger(pence) || pence <= 0) return null;
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
  return `${amount}/hour`;
}
