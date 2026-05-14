import fs from "node:fs";
import path from "node:path";

type CheckResult = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string[];
};

const rootDir = process.cwd();

const requiredEnvKeys = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "NEXTAUTH_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_CERTIFICATES_FOLDER",
  "CERTIFICATE_STORAGE_PROVIDER",
  "ERROR_MONITORING_PROVIDER",
  "SENTRY_DSN",
] as const;

const exampleEnvFiles = [".env.example", ".env.production.local.example"] as const;

const criticalFiles: Array<{
  file: string;
  patterns: string[];
}> = [
  {
    file: "src/app/api/stripe/checkout/route.ts",
    patterns: [
      "requireCurrentActionRole",
      "paymentCheckoutRequestSchema",
      "checkRateLimitPreset",
      "NextResponse.json",
    ],
  },
  {
    file: "src/app/api/stripe/webhook/route.ts",
    patterns: [
      "stripe-signature",
      "constructEvent",
      "StripeSignatureVerificationError",
      "processStripeWebhookEventBestEffort",
    ],
  },
  {
    file: "src/app/api/integrations/google/connect/route.ts",
    patterns: [
      "requireActionActiveTherapistFeatures",
      "checkRateLimitPreset",
      "buildTherapistGoogleCalendarConnectUrl",
    ],
  },
  {
    file: "src/app/api/integrations/google/callback/route.ts",
    patterns: [
      "requireActionActiveTherapistFeatures",
      "parseGoogleOAuthState",
      "parsedState.therapistUserId",
      "checkRateLimitPreset",
    ],
  },
  {
    file: "src/app/api/cron/booking-rules/route.ts",
    patterns: [
      "CRON_SECRET",
      "timingSafeEqual",
      "checkRateLimitPreset",
      "runCronBookingRules",
    ],
  },
  {
    file: "src/lib/permissions.ts",
    patterns: [
      "requireActionRole",
      "requireCurrentActionRole",
      "requireActionActiveTherapistFeatures",
    ],
  },
  {
    file: "src/server/services/monitoring.service.ts",
    patterns: [
      "sanitizeDiagnosticMetadata",
      "REDACTED",
      "SENSITIVE_KEY_PARTS",
      "captureDiagnosticEvent",
    ],
  },
];

const validationCoverageFiles: Array<{
  file: string;
  patterns: string[];
}> = [
  {
    file: "src/app/client/book/actions.ts",
    patterns: ["bookingRequestSchema", "safeParse"],
  },
  {
    file: "src/app/client/bookings/actions.ts",
    patterns: ["bookingIdPayloadSchema", "clientCompensationPayloadSchema", "safeParse"],
  },
  {
    file: "src/app/therapist/requests/actions.ts",
    patterns: ["therapistRequestDecisionPayloadSchema", "therapistCancelSessionPayloadSchema", "safeParse"],
  },
  {
    file: "src/app/admin/bookings/actions.ts",
    patterns: ["adminCancelBookingPayloadSchema", "safeParse"],
  },
  {
    file: "src/app/admin/therapists/actions.ts",
    patterns: ["therapistReviewPayloadSchema", "therapistRejectReviewPayloadSchema", "safeParse"],
  },
  {
    file: "src/app/therapist/onboarding/actions.ts",
    patterns: ["therapistOnboardingDraftSchema", "therapistOnboardingSubmitSchema", "safeParse"],
  },
  {
    file: "src/app/therapist/payout-details/actions.ts",
    patterns: ["therapistPayoutDetailsPayloadSchema", "googleCalendarSelectionPayloadSchema", "safeParse"],
  },
];

const sourceScanRoots = ["src", "scripts", "prisma"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".prisma", ".json"]);

const hardcodedSecretPatterns: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "Stripe secret key", pattern: /\bsk_(live|test)_[A-Za-z0-9_]{12,}\b/ },
  { label: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9_]{12,}\b/ },
  { label: "Google OAuth secret", pattern: /\bGOCSPX-[A-Za-z0-9_-]{8,}\b/ },
  { label: "Google access token", pattern: /\bya29\.[A-Za-z0-9_-]{20,}\b/ },
  { label: "Bearer token literal", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i },
  { label: "Long hex secret assignment", pattern: /\b(?:AUTH_SECRET|CRON_SECRET)\s*[:=]\s*["'][a-f0-9]{48,}["']/i },
];

const dangerousPatterns: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "eval()", pattern: /\beval\s*\(/ },
  { label: "new Function()", pattern: /\bnew\s+Function\s*\(/ },
  { label: "Prisma unsafe raw query", pattern: /\.\$queryRawUnsafe\s*\(|\.\$executeRawUnsafe\s*\(/ },
  { label: "Hardcoded localhost callback in source", pattern: /http:\/\/localhost:3000\/api\/integrations\/google\/callback/ },
];

function relativePath(filePath: string) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function readText(file: string) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function fileExists(file: string) {
  return fs.existsSync(path.join(rootDir, file));
}

function listFiles(dir: string): string[] {
  const absoluteDir = path.join(rootDir, dir);

  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) {
        continue;
      }

      files.push(...listFiles(relativePath(absolutePath)));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(relativePath(absolutePath));
    }
  }

  return files;
}

function parseEnvKeys(content: string) {
  const keys = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);

    if (match?.[1]) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function hasPlaceholderValue(content: string, key: string) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]*)["']?`, "m"));
  const value = match?.[1]?.trim() ?? "";

  if (!value) {
    return true;
  }

  return value.includes("<") || value.includes("example.com") || value.includes("localhost");
}

function checkEnvExamples(): CheckResult {
  const details: string[] = [];

  for (const file of exampleEnvFiles) {
    if (!fileExists(file)) {
      details.push(`${file}: missing`);
      continue;
    }

    const content = readText(file);
    const keys = parseEnvKeys(content);
    const missing = requiredEnvKeys.filter((key) => !keys.has(key));

    if (missing.length) {
      details.push(`${file}: missing ${missing.join(", ")}`);
    }

    for (const key of [
      "AUTH_SECRET",
      "CRON_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "SMTP_PASS",
      "CLOUDINARY_API_SECRET",
    ]) {
      if (keys.has(key) && !hasPlaceholderValue(content, key)) {
        details.push(`${file}: ${key} should be a placeholder, not a real secret`);
      }
    }
  }

  return {
    name: "Env examples contain required keys and placeholders",
    status: details.length ? "fail" : "pass",
    details,
  };
}

function checkHardcodedSecrets(): CheckResult {
  const findings: string[] = [];
  const files = sourceScanRoots.flatMap(listFiles).concat([...exampleEnvFiles]);

  for (const file of files) {
    if (!fileExists(file)) {
      continue;
    }

    const content = readText(file);

    for (const { label, pattern } of hardcodedSecretPatterns) {
      if (pattern.test(content)) {
        findings.push(`${file}: ${label}`);
      }
    }
  }

  return {
    name: "No hardcoded secrets in source/example files",
    status: findings.length ? "fail" : "pass",
    details: findings,
  };
}

function checkCriticalFiles(): CheckResult {
  const details: string[] = [];

  for (const item of criticalFiles) {
    if (!fileExists(item.file)) {
      details.push(`${item.file}: missing`);
      continue;
    }

    const content = readText(item.file);
    const missingPatterns = item.patterns.filter((pattern) => !content.includes(pattern));

    if (missingPatterns.length) {
      details.push(`${item.file}: missing ${missingPatterns.join(", ")}`);
    }
  }

  return {
    name: "Critical route/security files are present and guarded",
    status: details.length ? "fail" : "pass",
    details,
  };
}

function checkDangerousPatterns(): CheckResult {
  const details: string[] = [];
  const files = sourceScanRoots
    .flatMap(listFiles)
    .filter((file) => file !== "scripts/verify-security.ts");

  for (const file of files) {
    const content = readText(file);

    for (const { label, pattern } of dangerousPatterns) {
      if (pattern.test(content)) {
        details.push(`${file}: ${label}`);
      }
    }
  }

  return {
    name: "No dangerous source patterns detected",
    status: details.length ? "fail" : "pass",
    details,
  };
}

function checkValidationCoverage(): CheckResult {
  const details: string[] = [];

  for (const item of validationCoverageFiles) {
    if (!fileExists(item.file)) {
      details.push(`${item.file}: missing`);
      continue;
    }

    const content = readText(item.file);
    const missingPatterns = item.patterns.filter((pattern) => !content.includes(pattern));

    if (missingPatterns.length) {
      details.push(`${item.file}: missing ${missingPatterns.join(", ")}`);
    }
  }

  return {
    name: "Sensitive actions have basic schema validation coverage",
    status: details.length ? "fail" : "pass",
    details,
  };
}

function checkMonitoringSanitization(): CheckResult {
  const file = "src/server/services/monitoring.service.ts";

  if (!fileExists(file)) {
    return {
      name: "Monitoring layer exists with redaction",
      status: "fail",
      details: [`${file}: missing`],
    };
  }

  const content = readText(file);
  const requiredPatterns = [
    "SENSITIVE_KEY_PARTS",
    "SENSITIVE_VALUE_PATTERNS",
    "sanitizeDiagnosticMetadata",
    "REDACTED",
  ];
  const missing = requiredPatterns.filter((pattern) => !content.includes(pattern));

  return {
    name: "Monitoring layer exists with redaction",
    status: missing.length ? "fail" : "pass",
    details: missing.map((pattern) => `${file}: missing ${pattern}`),
  };
}

function printResult(result: CheckResult) {
  const icon = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
  console.log(`[${icon}] ${result.name}`);

  for (const detail of result.details ?? []) {
    console.log(`  - ${detail}`);
  }
}

function main() {
  const results = [
    checkEnvExamples(),
    checkHardcodedSecrets(),
    checkCriticalFiles(),
    checkDangerousPatterns(),
    checkValidationCoverage(),
    checkMonitoringSanitization(),
  ];

  console.log("Theraply security verification\n");

  for (const result of results) {
    printResult(result);
  }

  const failed = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");

  console.log(
    `\nSummary: ${results.length - failed.length - warnings.length} passed, ${warnings.length} warnings, ${failed.length} failed.`,
  );

  if (failed.length) {
    process.exitCode = 1;
  }
}

main();
