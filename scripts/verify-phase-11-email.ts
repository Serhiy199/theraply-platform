import { spawn } from "node:child_process";

type VerificationCommand = {
  label: string;
  command: string;
  args: string[];
};

const commands: VerificationCommand[] = [
  {
    label: "Prisma schema validation",
    command: "npx.cmd",
    args: ["prisma", "validate"],
  },
  {
    label: "Prisma migration status",
    command: "npx.cmd",
    args: ["prisma", "migrate", "status"],
  },
  {
    label: "Email verification DB records",
    command: "npx.cmd",
    args: ["tsx", "scripts/verify-email-verification-records.ts"],
  },
  {
    label: "TypeScript",
    command: "npx.cmd",
    args: ["tsc", "--noEmit", "--incremental", "false"],
  },
];

function runCommand({ label, command, args }: VerificationCommand) {
  return new Promise<void>((resolve, reject) => {
    console.info(`\n[phase11-email] ${label}`);
    console.info(`[phase11-email] > ${command} ${args.join(" ")}`);

    const commandLine = [command, ...args].join(" ");
    const child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function main() {
  for (const command of commands) {
    await runCommand(command);
  }

  console.info("\n[phase11-email] Verification commands completed successfully.");
}

main().catch((error) => {
  console.error("[phase11-email] Verification failed.", error);
  process.exitCode = 1;
});
