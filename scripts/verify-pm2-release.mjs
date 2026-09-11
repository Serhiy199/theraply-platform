import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cli = process.argv.find((arg) => arg.startsWith("--pm2-cli="))?.slice(10);
assert(process.platform === "linux", "Run this isolated real-PM2 test on Linux.");
assert(cli && path.isAbsolute(cli), "Supply an absolute --pm2-cli path to a pinned PM2 installation.");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "theraply-pm2-smoke-"));
const home = path.join(root, "pm2-home");
const env = { PATH: process.env.PATH, HOME: root, PM2_HOME: home, NODE_ENV: "production" };
const server = net.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const run = async (command, args, cwd) => {
  assert.equal(command, "pm2");
  try { return await exec(process.execPath, [cli, ...args], { cwd, env, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }); }
  catch { throw new Error(args[0] === "start" ? "PM2_START_FAILED" : "PM2_COMMAND_FAILED"); }
};
async function fixture(name) {
  const dir = path.join(root, name);
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { start: "node app.cjs" } }));
  await fs.writeFile(path.join(dir, "app.cjs"), `require('http').createServer((q,r)=>{r.end(JSON.stringify({release:${JSON.stringify(name)},cwd:process.cwd()}))}).listen(${port},'127.0.0.1');`);
  await fs.writeFile(path.join(dir, "ecosystem.config.js"), "module.exports={apps:[{name:'theraply',cwd:__dirname,script:'npm',args:'run start',env_production:{NODE_ENV:'production'}}]};");
  return dir;
}
async function list() { return JSON.parse((await run("pm2", ["jlist"], root)).stdout); }
async function health(release) {
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(1000) });
      const data = await r.json();
      if (r.status === 200 && data.release === release) return data;
    } catch { /* Wait only for the isolated fixture. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`HTTP_RELEASE_MISMATCH_${release}`);
}
try {
  const old = await fixture("old");
  const candidate = await fixture("candidate");
  await run("pm2", ["start", path.join(old, "ecosystem.config.js"), "--env", "production"], old);
  await health("old");
  await run("pm2", ["startOrReload", path.join(candidate, "ecosystem.config.js"), "--env", "production", "--update-env"], candidate);
  const app = (await list()).find((p) => p.name === "theraply");
  const data = await health("old");
  assert.equal(app.pm2_env.pm_cwd, old);
  assert.equal(data.cwd, old);
  console.log("REPRODUCED: startOrReload retained old pm_cwd and HTTP runtime");
  if (!process.argv.includes("--reproduce-only")) {
    const { replacePm2Release, deployRelease, inspectPm2Release } = await import("./deploy-production-release.mjs");
    await replacePm2Release(run, candidate);
    assert.equal((await health("candidate")).cwd, candidate);
    assert.equal((await list()).filter((p) => p.name === "theraply").length, 1);
    assert.equal((await list()).find((p) => p.name === "theraply").pm2_env.pm_cwd, candidate);
    await replacePm2Release(run, old);
    assert.equal((await health("old")).cwd, old);
    const current = path.join(root, "current");
    await fs.symlink(old, current);
    const activate = async (dir) => {
      const temp = path.join(root, "next-link");
      await fs.symlink(dir, temp);
      await fs.rename(temp, current);
    };
    await fs.writeFile(path.join(root, "sentinel.cjs"), "setInterval(()=>{},1000);");
    await run("pm2", ["start", path.join(root, "sentinel.cjs"), "--name", "unrelated-sentinel"], root);
    const bad = path.join(root, "missing-ecosystem");
    await fs.mkdir(bad);
    for (const failure of ["http", "start"]) {
      await assert.rejects(deployRelease({
        preflight: async () => {}, prepare: async () => {}, migrate: async () => {},
        activate: () => activate(candidate),
        restart: () => replacePm2Release(run, failure === "start" ? bad : candidate),
        verify: async () => { await health("candidate"); throw new Error("HTTP_STATUS_NOT_OK"); },
        save: async () => {},
        restore: async () => { await activate(old); await replacePm2Release(run, old); await health("old"); await inspectPm2Release(run, old); },
      }), /PREVIOUS_CODE_RESTORED/);
      assert.equal(await fs.realpath(current), old);
      const apps = await list();
      assert.equal(apps.filter((p) => p.name === "theraply").length, 1);
      assert.equal(apps.find((p) => p.name === "unrelated-sentinel").pm2_env.status, "online");
    }
    console.log("REAL_PM2_RELEASE_PASS: candidate cwd/HTTP; automatic start/health failure recovery; symlink restored; unrelated process preserved");
  }
} finally {
  assert(home.startsWith(`${root}${path.sep}`) && path.basename(root).startsWith("theraply-pm2-smoke-"));
  await run("pm2", ["kill"], root);
  await fs.rm(root, { recursive: true, force: true });
  console.log("ISOLATED_PM2_CLEANUP_PASS");
}
