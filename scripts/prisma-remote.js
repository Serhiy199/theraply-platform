#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.production.local");
const args = process.argv.slice(2);

function printUsage() {
  console.log("Usage: node scripts/prisma-remote.js <command>");
  console.log("");
  console.log("Commands:");
  console.log("  migrate   Run 'prisma migrate deploy' against .env.production.local");
  console.log("  seed      Run 'prisma db seed' against .env.production.local");
}

function parseEnvFile(fileContents) {
  const result = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

if (args.length !== 1 || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(args.length === 1 ? 0 : 1);
}

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath}`);
  console.error("Create it from .env.production.local.example and paste your remote DATABASE_URL there.");
  process.exit(1);
}

const envVars = parseEnvFile(fs.readFileSync(envPath, "utf8"));
const databaseUrl = envVars.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is missing in .env.production.local");
  process.exit(1);
}

const commands = {
  migrate: ["prisma", "migrate", "deploy"],
  seed: ["prisma", "db", "seed"],
};

const selected = commands[args[0]];
if (!selected) {
  printUsage();
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCommand, selected, { stdio: "inherit", env, cwd: rootDir });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
