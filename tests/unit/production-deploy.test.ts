import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deployRelease, validateReleaseName } = await import(pathToFileURL(path.resolve("scripts/deploy-production-release.mjs")).href);
const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

async function simulation(failure?: string, recoveryFailure = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "theraply-deploy-order-"));
  temporary.push(dir);
  await fs.mkdir(path.join(dir, "old"));
  await fs.mkdir(path.join(dir, "candidate"));
  await fs.writeFile(path.join(dir, "old/runtime"), "old runtime");
  await fs.writeFile(path.join(dir, "active"), "old");
  const events: string[] = [];
  let pm2 = "old";
  let migrated = false;
  const step = async (name: string) => {
    events.push(name);
    if (failure === name) throw new Error(`simulated ${name}`);
  };
  const ops = {
    preflight: () => step("preflight"),
    async prepare() {
      await step("prepare");
      await fs.writeFile(path.join(dir, "candidate/runtime"), "candidate runtime + Prisma + Wix CLI");
    },
    async migrate() {
      expect(await fs.readFile(path.join(dir, "active"), "utf8")).toBe("old");
      expect(pm2).toBe("old");
      await step("migrate");
      migrated = true;
    },
    async activate() {
      expect(migrated).toBe(true);
      await step("activate");
      await fs.writeFile(path.join(dir, "active"), "candidate");
    },
    async restart() {
      expect(await fs.readFile(path.join(dir, "active"), "utf8")).toBe("candidate");
      await step("restart");
      pm2 = "candidate";
    },
    verify: () => step("verify"),
    save: () => step("save"),
    async restore() {
      events.push("restore");
      if (recoveryFailure) throw new Error("simulated recovery failure");
      await fs.writeFile(path.join(dir, "active"), "old");
      pm2 = "old";
    },
  };
  return { ops, events, dir, state: async () => ({ active: await fs.readFile(path.join(dir, "active"), "utf8"), pm2, migrated }) };
}

describe("production schema-before-code ordering (no network or credentials)", () => {
  it("A: prepares and migrates before activation and PM2", async () => {
    const s = await simulation();
    await deployRelease(s.ops);
    expect(s.events).toEqual(["preflight", "prepare", "migrate", "activate", "restart", "verify", "save"]);
    expect(await s.state()).toEqual({ active: "candidate", pm2: "candidate", migrated: true });
    expect(await fs.readFile(path.join(s.dir, "old/runtime"), "utf8")).toBe("old runtime");
  });
  for (const failure of ["preflight", "prepare", "migrate"]) {
    it(`B/C: ${failure} failure leaves old runtime and process untouched`, async () => {
      const s = await simulation(failure);
      await expect(deployRelease(s.ops)).rejects.toThrow(`simulated ${failure}`);
      expect(await s.state()).toEqual({ active: "old", pm2: "old", migrated: false });
      expect(s.events).not.toContain("activate");
      expect(s.events).not.toContain("restart");
      expect(await fs.readFile(path.join(s.dir, "old/runtime"), "utf8")).toBe("old runtime");
    });
  }
  for (const failure of ["restart", "verify", "save"]) {
    it(`${failure} failure restores old code but does not roll back schema`, async () => {
      const s = await simulation(failure);
      await expect(deployRelease(s.ops)).rejects.toThrow("PREVIOUS_CODE_RESTORED");
      expect(await s.state()).toEqual({ active: "old", pm2: "old", migrated: true });
    });
  }
  it("fails loudly when code recovery also fails", async () => {
    const s = await simulation("restart", true);
    await expect(deployRelease(s.ops)).rejects.toThrow("RECOVERY_FAILED");
  });
  it("rejects invalid candidate identifiers", () => {
    const sha = "b".repeat(40);
    expect(() => validateReleaseName(`${sha}-123-1`, sha)).not.toThrow();
    for (const name of ["../current", "current", `${sha}-123-1/..`]) expect(() => validateReleaseName(name, sha)).toThrow();
  });
  it("workflow parses, uploads only to isolated release and preserves Wix packaging", async () => {
    const source = await fs.readFile(".github/workflows/production-deploy.yml", "utf8");
    const workflow = require("js-yaml").load(source);
    expect(workflow.on.push.branches).toEqual(["main"]);
    const steps = workflow.jobs.deploy.steps;
    const upload = steps.find((s: { name: string }) => s.name === "Upload isolated candidate release").run;
    expect(upload).toContain('mkdir /var/www/theraply/releases/$RELEASE');
    expect(upload).toContain(':/var/www/theraply/releases/$RELEASE/');
    expect(upload).not.toContain("--delete");
    expect(source).toContain("cp -R build/wix-cms deploy_artifact/build/");
    expect(source).toContain("flock -n /var/www/theraply/.deploy.lock");
    expect(source).not.toContain("npm run wix:cms:reconcile:production");
  });
  it("Booking Fee migration is additive with no historical money UPDATE", async () => {
    const sql = await fs.readFile("prisma/migrations/20260910220000_add_payment_booking_fee/migration.sql", "utf8");
    expect(sql).toContain('ADD COLUMN "bookingFeeAmount" INTEGER NOT NULL DEFAULT 0');
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/);
  });
});
