import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const result = await build({
  entryPoints: ["scripts/reconcile-wix-cms-production.ts"],
  outfile: "build/wix-cms/reconcile.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  tsconfig: "tsconfig.json",
  external: ["@prisma/client"],
  metafile: true,
});

const imports = Object.values(result.metafile.outputs).flatMap((file) => file.imports);
if (imports.some((item) => item.path !== "@prisma/client" && !item.path.startsWith("node:"))) {
  throw new Error("Unexpected external CLI dependency.");
}

await mkdir("build/wix-cms", { recursive: true });
await writeFile("build/wix-cms/dependencies.json", JSON.stringify({
  sources: Object.keys(result.metafile.inputs).sort(),
  external: [...new Set(imports.map((item) => item.path))].sort(),
}, null, 2));
console.info("Wix CMS CLI bundled for Node 24; no environment values embedded.");
