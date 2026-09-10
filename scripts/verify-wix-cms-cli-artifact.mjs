import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const argument = process.argv.slice(2).find((item) => item.startsWith("--artifact-dir="));
assert(argument, "Pass --artifact-dir pointing to the prepared deployment artifact.");
const source = path.resolve(argument.slice("--artifact-dir=".length));
const root = await mkdtemp(path.join(os.tmpdir(), "theraply-wix-cli-artifact-"));
const artifact = path.join(root, "artifact");
const npmCli = process.env.npm_execpath;
assert(npmCli, "Run this verifier through npm.");

// Do not inherit application credentials or Node module/preload overrides.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(key),
));
env.DATABASE_URL = "postgresql://probe:probe@127.0.0.1:1/probe";
env.NODE_ENV = "production";
env.npm_config_cache = path.join(root, "npm-cache");

function npm(args, extraEnv = {}, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: artifact,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.equal(result.status, expectedStatus, output);
  return output;
}

try {
  await cp(source, artifact, { recursive: true });
  for (const absent of ["src", "tsconfig.json", "node_modules", ".env"]) {
    assert(!existsSync(path.join(artifact, absent)), `Unexpected artifact path: ${absent}`);
  }
  // The deployment orchestrator is shipped, but the source Wix runner is not.
  if (existsSync(path.join(artifact, "scripts"))) {
    assert.deepEqual(await readdir(path.join(artifact, "scripts")), ["deploy-production-release.mjs"]);
  }
  assert(existsSync(path.join(artifact, "build/wix-cms/reconcile.cjs")));
  const manifest = JSON.parse(await readFile(path.join(artifact, "build/wix-cms/dependencies.json"), "utf8"));
  assert.deepEqual(manifest.external, ["@prisma/client"]);

  // Match the deployment's npm ci + Prisma generation, then prove dev tools are unnecessary.
  npm(["ci", "--include=dev", "--no-audit", "--no-fund"]);
  npm(["prune", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]);
  // Peer dependencies may retain TypeScript even with omit=dev. Prove independence explicitly.
  for (const tool of ["tsx", "typescript"]) {
    const target = path.join(artifact, "node_modules", tool);
    assert(path.dirname(target) === path.join(root, "artifact", "node_modules"));
    await rm(target, { recursive: true, force: true });
    assert(!existsSync(target));
  }

  const guard = path.join(root, "deny-network.cjs");
  await writeFile(guard, `
const deny = () => { throw new Error("ARTIFACT_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
require("node:http").request = deny;
require("node:https").request = deny;
require("node:net").Socket.prototype.connect = deny;
`);
  const probeEnv = { NODE_OPTIONS: `--require=${JSON.stringify(guard)}` };
  const missing = npm(["run", "wix:cms:reconcile:production"], probeEnv, 1);
  assert(missing.includes("WIX_CMS_ENVIRONMENT is not configured."), missing);

  await writeFile(path.join(artifact, ".env"), [
    "WIX_CMS_ENVIRONMENT=production",
    "WIX_CMS_SITE_ID=1ce946b1-1bcb-4b89-a1b5-86358d639333",
    "WIX_CMS_API_TOKEN=artifact-probe-not-a-token",
  ].join("\n"));
  const configured = npm(["run", "wix:cms:reconcile:production"], probeEnv, 1);
  assert(configured.includes("WIX_CMS_API_TOKEN_PRODUCTION is not configured."), configured);
  for (const output of [missing, configured]) {
    assert(!/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ARTIFACT_NETWORK_FORBIDDEN/.test(output), output);
  }
  console.info("ARTIFACT_CLI_PASS: isolated artifact, production-only dependencies, env loading, fail-closed config, no network.");
} finally {
  assert(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith("theraply-wix-cli-artifact-"));
  await rm(root, { recursive: true, force: true });
}
