import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const failureCodes = new Set([
  "UNKNOWN", "FILESYSTEM_OR_CONFIG_GATE", "RELEASE_HEALTH_FAILED", "HTTP_STATUS_NOT_OK",
  "HTTP_REQUEST_FAILED", "PM2_PROCESS_COUNT_MISMATCH", "PM2_PROCESS_NOT_ONLINE", "PM2_CWD_MISMATCH",
  "PM2_INSPECTION_FAILED", "PM2_DELETE_FAILED", "PM2_START_FAILED", "PM2_SAVE_FAILED", "PM2_COMMAND_FAILED",
  "DEPENDENCY_INSTALL_FAILED", "DB_IDENTITY_PROBE_FAILED", "BACKUP_LIST_FAILED", "COMMAND_FAILED",
  "PRISMA_GENERATE_FAILED", "PRISMA_MIGRATION_FAILED", "PRISMA_STATUS_FAILED",
  "INVALID_RELEASE_ID", "INVALID_DEPLOY_TARGET", "RELEASE_PATH_MISMATCH", "ENV_PROTECTION_GATE",
  "CURRENT_NOT_SYMLINK", "PREVIOUS_RELEASE_OUTSIDE_ROOT", "CANDIDATE_ALREADY_ACTIVE",
  "FRESH_BACKUP_REQUIRED", "ARTIFACT_SHA_MISMATCH", "ENV_IN_ARTIFACT", "PERSISTENT_DIRECTORY_GATE",
  "RELEASE_FAILED_RECOVERY_FAILED", "RELEASE_FAILED_PREVIOUS_CODE_RESTORED",
]);

export function safeFailureCode(error) {
  const code = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN";
  return failureCodes.has(code) ? code : "FILESYSTEM_OR_CONFIG_GATE";
}

export async function replacePm2Release(run, dir) {
  const apps = JSON.parse((await run("pm2", ["jlist"], dir)).stdout).filter((app) => app.name === "theraply");
  if (apps.length > 1) throw new Error("PM2_PROCESS_COUNT_MISMATCH");
  // Existing-process reload does not re-resolve pm_cwd from ecosystem cwd.
  if (apps.length === 1) await run("pm2", ["delete", "theraply"], dir);
  await run("pm2", ["start", path.join(dir, "ecosystem.config.js"), "--only", "theraply", "--env", "production"], dir);
}

export async function inspectPm2Release(run, expected) {
  const apps = JSON.parse((await run("pm2", ["jlist"], expected)).stdout).filter((app) => app.name === "theraply");
  if (apps.length !== 1) throw new Error("PM2_PROCESS_COUNT_MISMATCH");
  if (apps[0].pm2_env.status !== "online") throw new Error("PM2_PROCESS_NOT_ONLINE");
  if (await fs.realpath(apps[0].pm2_env.pm_cwd) !== expected) throw new Error("PM2_CWD_MISMATCH");
}

export async function verifyRelease(run, dir, { attempts = 15, delayMs = 2000 } = {}) {
  let gate = "RELEASE_HEALTH_FAILED";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await inspectPm2Release(run, dir);
      const { stdout } = await run("curl", ["--silent", "--show-error", "--output", "/dev/null", "--write-out", "%{http_code}", "--max-time", "5", "http://127.0.0.1:3000/login"], dir);
      if (stdout === "200") return;
      gate = "HTTP_STATUS_NOT_OK";
    } catch (error) { gate = safeFailureCode(error); }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(gate);
}

// The same ordering is exercised with isolated mock operations in unit tests.
export async function deployRelease(ops) {
  await ops.preflight();
  await ops.prepare();
  await ops.migrate();
  await ops.activate();
  try {
    await ops.restart();
    await ops.verify();
    await ops.save();
  } catch (error) {
    console.error(`RELEASE_FAILURE_GATE=${safeFailureCode(error)}`);
    try {
      await ops.restore();
    } catch (recoveryError) {
      console.error(`RECOVERY_FAILURE_GATE=${safeFailureCode(recoveryError)}`);
      throw new Error("RELEASE_FAILED_RECOVERY_FAILED: operator intervention required; no DB rollback attempted");
    }
    throw new Error("RELEASE_FAILED_PREVIOUS_CODE_RESTORED: database remains migrated");
  }
}

export function validateReleaseName(name, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha) || !new RegExp(`^${sha}-[0-9]+-[0-9]+$`).test(name)) {
    throw new Error("INVALID_RELEASE_ID");
  }
}

export async function productionOperations(root, name, sha) {
  if (process.platform !== "linux" || root !== "/var/www/theraply") throw new Error("INVALID_DEPLOY_TARGET");
  validateReleaseName(name, sha);
  const releases = path.join(root, "releases");
  const candidate = path.join(releases, name);
  const current = path.join(root, "current");
  const backup = `/var/backups/theraply/theraply-before-release-${sha}.dump`;
  let previous;
  let hadCurrent = false;
  const run = async (command, args, cwd = candidate) => {
    try {
      return await exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
    } catch {
      // Child output can include environment values or database connection strings.
      const name = path.basename(command);
      const gates = { npm: "DEPENDENCY_INSTALL_FAILED", node: "DB_IDENTITY_PROBE_FAILED", pg_restore: "BACKUP_LIST_FAILED", curl: "HTTP_REQUEST_FAILED" };
      if (name === "pm2") {
        const pm2Gates = { jlist: "PM2_INSPECTION_FAILED", delete: "PM2_DELETE_FAILED", start: "PM2_START_FAILED", save: "PM2_SAVE_FAILED" };
        throw new Error(pm2Gates[args[0]] ?? "PM2_COMMAND_FAILED");
      }
      if (name === "prisma") throw new Error(args[0] === "generate" ? "PRISMA_GENERATE_FAILED" : args[1] === "deploy" ? "PRISMA_MIGRATION_FAILED" : "PRISMA_STATUS_FAILED");
      throw new Error(gates[name] ?? "COMMAND_FAILED");
    }
  };
  const switchTo = async (target) => {
    const temp = `${current}.${name}.tmp`;
    await fs.symlink(target, temp);
    try {
      await fs.rename(temp, current);
    } catch (error) {
      await fs.unlink(temp);
      throw error;
    }
  };
  const restartAt = (dir) => replacePm2Release(run, dir);
  const verifyAt = (dir) => verifyRelease(run, dir);
  return {
    async preflight() {
      if (await fs.realpath(root) !== root || await fs.realpath(releases) !== releases ||
          await fs.realpath(candidate) !== candidate) throw new Error("RELEASE_PATH_MISMATCH");
      const env = await fs.lstat(path.join(root, ".env"));
      if (!env.isFile() || (env.mode & 0o777) !== 0o600 || env.uid !== process.getuid()) throw new Error("ENV_PROTECTION_GATE");
      let link;
      try { link = await fs.lstat(current); } catch (error) { if (error.code !== "ENOENT") throw error; }
      hadCurrent = !!link;
      if (link && !link.isSymbolicLink()) throw new Error("CURRENT_NOT_SYMLINK");
      previous = link ? await fs.realpath(current) : root;
      if (previous !== root && path.dirname(previous) !== releases) throw new Error("PREVIOUS_RELEASE_OUTSIDE_ROOT");
      if (previous === candidate) throw new Error("CANDIDATE_ALREADY_ACTIVE");
      await inspectPm2Release(run, previous);
      const dump = await fs.lstat(backup);
      const age = Date.now() - dump.mtimeMs;
      if (!dump.isFile() || dump.size === 0 || dump.uid !== process.getuid() ||
          (dump.mode & 0o777) !== 0o600 || age < 0 || age > 6 * 60 * 60 * 1000) throw new Error("FRESH_BACKUP_REQUIRED");
      await run("pg_restore", ["--list", backup]);
      for (const file of ["package.json", "package-lock.json", "ecosystem.config.js", "prisma.config.ts", "prisma/schema.prisma", "prisma/migrations/migration_lock.toml", ".next/BUILD_ID", ".next/server", "build/wix-cms/reconcile.cjs"]) {
        await fs.access(path.join(candidate, file));
      }
      if ((await fs.readFile(path.join(candidate, "RELEASE_SHA"), "utf8")).trim() !== sha) throw new Error("ARTIFACT_SHA_MISMATCH");
      if ((await fs.readdir(candidate)).some((entry) => entry.startsWith(".env"))) throw new Error("ENV_IN_ARTIFACT");
      console.log("PREFLIGHT_PASS: backup verified; active release unchanged");
    },
    async prepare() {
      await fs.symlink(path.join(root, ".env"), path.join(candidate, ".env"));
      for (const dir of ["logs", "uploads", "storage"]) {
        let stat;
        try { stat = await fs.lstat(path.join(root, dir)); } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (stat) {
          if (!stat.isDirectory()) throw new Error("PERSISTENT_DIRECTORY_GATE");
          await fs.symlink(path.join(root, dir), path.join(candidate, dir));
        }
      }
      await run("npm", ["ci", "--include=dev"]);
      await run(path.join(candidate, "node_modules/.bin/prisma"), ["generate"]);
      const probe = "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{try{const u=new URL(process.env.DATABASE_URL);if(u.pathname!=='/theraply_db'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error();const [r]=await p.$queryRaw`SELECT current_database() AS db,current_schema() AS schema`;if(r.db!=='theraply_db'||r.schema!=='public')throw Error();}catch{process.exitCode=1}finally{await p.$disconnect()}})()";
      await run("node", ["--env-file=.env", "-e", probe]);
      console.log("CANDIDATE_PREPARED: production DB identity verified");
    },
    async migrate() {
      await run(path.join(candidate, "node_modules/.bin/prisma"), ["migrate", "deploy"]);
      await run(path.join(candidate, "node_modules/.bin/prisma"), ["migrate", "status"]);
      console.log("MIGRATION_PASS");
    },
    async activate() {
      await fs.writeFile(path.join(candidate, "PREVIOUS_RELEASE"), `${previous}\n`, { flag: "wx", mode: 0o600 });
      await switchTo(candidate);
      console.log("RELEASE_ACTIVATED");
    },
    restart: () => restartAt(candidate),
    verify: () => verifyAt(candidate),
    save: () => run("pm2", ["save"]),
    async restore() {
      if (hadCurrent) await switchTo(previous);
      else await fs.unlink(current);
      await restartAt(previous);
      await verifyAt(previous);
      await run("pm2", ["save"], previous);
      console.log("PREVIOUS_CODE_RESTORED: no database rollback");
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [root, release, sha] = process.argv.slice(2);
    await deployRelease(await productionOperations(root, release, sha));
    console.log("PRODUCTION_RELEASE_HEALTHY");
  } catch (error) {
    console.error(`PRODUCTION_RELEASE_FAILED: ${safeFailureCode(error)}; no DB rollback attempted`);
    process.exitCode = 1;
  }
}
