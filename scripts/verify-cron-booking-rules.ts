import { runCronBookingRules } from "../src/server/services/cron-booking-rules.service";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getOptionValue(name: string) {
  const prefix = `${name}=`;
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix));

  if (inlineValue) {
    return inlineValue.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  return null;
}

function parseLimit() {
  const value = getOptionValue("--limit");

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNow() {
  const value = getOptionValue("--now");

  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --now value: ${value}`);
  }

  return parsed;
}

async function main() {
  const shouldRun = hasFlag("--run");
  const dryRun = !shouldRun;
  const limit = parseLimit();
  const now = parseNow();

  const summary = await runCronBookingRules({
    dryRun,
    limit,
    now,
  });

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "run",
        note: dryRun
          ? "No records were changed. Pass --run to execute the cron rules."
          : "Cron booking rules executed against the configured database.",
        summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[verify-cron-booking-rules] failed", error);
  process.exitCode = 1;
});
