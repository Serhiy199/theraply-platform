import { prisma } from "@/lib/prisma";
import {
  runWixCmsProductionReconciliation,
  WIX_PRODUCTION_RECONCILIATION_CONFIRMATION,
  type WixProductionReconciliationOptions,
} from "@/server/services/wix-cms-production-reconciliation.service";

function readOptionValue(args: string[], index: number, name: string) {
  const argument = args[index] ?? "";
  const inlinePrefix = `${name}=`;

  if (argument.startsWith(inlinePrefix)) {
    return { value: argument.slice(inlinePrefix.length), consumed: 0 };
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return { value, consumed: 1 };
}

export function parseWixProductionReconciliationArgs(
  args: string[],
): WixProductionReconciliationOptions {
  const options: WixProductionReconciliationOptions = {
    write: false,
    allowProfileIds: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--write") {
      options.write = true;
      continue;
    }

    if (argument === "--expected-count" || argument.startsWith("--expected-count=")) {
      const parsed = readOptionValue(args, index, "--expected-count");
      const expectedCount = Number(parsed.value);
      if (!Number.isInteger(expectedCount) || expectedCount < 0) {
        throw new Error("--expected-count must be a non-negative integer.");
      }
      options.expectedCount = expectedCount;
      index += parsed.consumed;
      continue;
    }

    if (
      argument === "--allow-profile-id" ||
      argument.startsWith("--allow-profile-id=")
    ) {
      const parsed = readOptionValue(args, index, "--allow-profile-id");
      options.allowProfileIds?.push(parsed.value);
      index += parsed.consumed;
      continue;
    }

    if (
      argument === "--confirm-production" ||
      argument.startsWith("--confirm-production=")
    ) {
      const parsed = readOptionValue(args, index, "--confirm-production");
      options.confirmation = parsed.value;
      index += parsed.consumed;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function main() {
  const options = parseWixProductionReconciliationArgs(process.argv.slice(2));

  if (options.write) {
    const preflight = await runWixCmsProductionReconciliation({
      ...options,
      write: false,
      confirmation: undefined,
    });
    console.info("THERAPLY_WIX_PRODUCTION_PREFLIGHT");
    console.info(`CMS token source: ${preflight.cmsTokenSource}`);
    console.info(JSON.stringify(preflight, null, 2));
  }

  const report = await runWixCmsProductionReconciliation(options);
  console.info("THERAPLY_WIX_PRODUCTION_RECONCILIATION");
  console.info(`CMS token source: ${report.cmsTokenSource}`);
  console.info(JSON.stringify(report, null, 2));

  if (!options.write) {
    console.info(
      `DRY_RUN_ONLY: rerun with --write, --expected-count, repeated --allow-profile-id, and --confirm-production=${WIX_PRODUCTION_RECONCILIATION_CONFIRMATION} only after explicit approval.`,
    );
  }
}

main()
  .catch((error: unknown) => {
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message, code: "code" in error ? error.code : null }
        : { name: "UnknownError", message: "Unknown reconciliation failure.", code: null };
    console.error(JSON.stringify(safeError));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
