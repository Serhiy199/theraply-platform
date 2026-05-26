import "server-only";

type DiagnosticLevel = "error" | "warning" | "info";

export type DiagnosticMetadata = Record<string, unknown>;

export type DiagnosticEventInput = {
  scope: string;
  message: string;
  level?: DiagnosticLevel;
  metadata?: DiagnosticMetadata;
};

const REDACTED = "[REDACTED]";
const MAX_METADATA_DEPTH = 6;

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "cookie",
  "secret",
  "password",
  "pass",
  "token",
  "refresh",
  "access",
  "api_key",
  "apikey",
  "key",
  "signature",
  "webhook",
  "credential",
  "dsn",
  "smtp_pass",
];

const SENSITIVE_VALUE_PATTERNS = [
  /\bsk_(live|test)_[A-Za-z0-9_]+\b/g,
  /\bpk_(live|test)_[A-Za-z0-9_]+\b/g,
  /\bwhsec_[A-Za-z0-9_]+\b/g,
  /\bGOCSPX-[A-Za-z0-9_-]+\b/g,
  /\bya29\.[A-Za-z0-9_-]+\b/g,
  /\bIST\.[A-Za-z0-9._-]{30,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\bBasic\s+[A-Za-z0-9._~+/=-]+\b/gi,
];

function getMonitoringProvider() {
  return (process.env.ERROR_MONITORING_PROVIDER ?? "console").trim().toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function redactSensitiveString(value: string) {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    value,
  );
}

function sanitizeDiagnosticValue(value: unknown, depth: number): unknown {
  if (depth > MAX_METADATA_DEPTH) {
    return "[MaxDepth]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
    };
  }

  if (typeof value === "string") {
    return redactSensitiveString(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? REDACTED : sanitizeDiagnosticValue(nestedValue, depth + 1),
      ]),
    );
  }

  if (typeof value === "object") {
    return {
      type: value?.constructor?.name ?? "Object",
      value: redactSensitiveString(String(value)),
    };
  }

  return undefined;
}

export function sanitizeDiagnosticMetadata(metadata?: DiagnosticMetadata) {
  if (!metadata) {
    return {};
  }

  return sanitizeDiagnosticValue(metadata, 0) as DiagnosticMetadata;
}

function writeConsoleDiagnostic(input: Required<DiagnosticEventInput>) {
  const sanitizedMetadata = sanitizeDiagnosticMetadata(input.metadata);
  const prefix = `[${input.scope}] ${input.message}`;

  if (input.level === "info") {
    console.info(prefix, sanitizedMetadata);
    return;
  }

  if (input.level === "warning") {
    console.warn(prefix, sanitizedMetadata);
    return;
  }

  console.error(prefix, sanitizedMetadata);
}

export function captureDiagnosticEvent(input: DiagnosticEventInput) {
  const normalizedInput: Required<DiagnosticEventInput> = {
    level: input.level ?? "error",
    metadata: input.metadata ?? {},
    scope: input.scope,
    message: input.message,
  };

  const provider = getMonitoringProvider();

  // Sentry or another provider can be wired here in a separate approved slice.
  if (provider === "console" || provider === "sentry") {
    writeConsoleDiagnostic(normalizedInput);
    return;
  }

  writeConsoleDiagnostic({
    ...normalizedInput,
    metadata: {
      ...normalizedInput.metadata,
      monitoringProvider: provider,
      monitoringProviderStatus: "unsupported",
    },
  });
}
