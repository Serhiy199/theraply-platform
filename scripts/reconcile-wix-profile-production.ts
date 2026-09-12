import { prisma } from "@/lib/prisma";
import { parseTargetedDepublishArgs, runTargetedWixDepublication } from "@/server/services/wix-cms-targeted-depublication.service";

Promise.resolve().then(() => runTargetedWixDepublication(parseTargetedDepublishArgs(process.argv.slice(2))))
  .then((report) => console.info(JSON.stringify(report)))
  .catch(() => { console.error("TARGETED_WIX_DEPUBLISH_BLOCKED"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
