const storageKey = "logicamirror.appLogs.v1";
const maxEntries = 300;
const maxStringLength = 700;
const maxDepth = 6;

export function loadAppLogs() {
  try {
    if (!hasLocalStorage()) {
      return [];
    }

    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeExistingLog).filter(Boolean);
  } catch {
    return [];
  }
}

export function appendAppLog({ level = "info", area = "app", message, details = null }) {
  const entry = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    level: normalizeLevel(level),
    area: String(area || "app"),
    message: String(message || "Log entry"),
    details: sanitizeLogDetails(details)
  };

  const logs = [entry, ...loadAppLogs()].slice(0, maxEntries);
  saveAppLogs(logs);
  return logs;
}

export function clearAppLogs() {
  try {
    if (hasLocalStorage()) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore unavailable local storage.
  }
}

export function serializeAppLogs(logs = loadAppLogs()) {
  const entries = Array.isArray(logs) ? logs : [];

  if (entries.length === 0) {
    return "No LogicaMirror app logs recorded.";
  }

  return entries
    .map((entry) => {
      const detailText = entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : "";
      return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.area}: ${entry.message}${detailText}`;
    })
    .join("\n\n");
}

export function sanitizeLogDetails(value) {
  return sanitizeValue(value, "", 0);
}

function saveAppLogs(logs) {
  try {
    if (hasLocalStorage()) {
      window.localStorage.setItem(storageKey, JSON.stringify(logs));
    }
  } catch {
    // Logging must never interrupt the learning workflow.
  }
}

function normalizeExistingLog(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    id: String(entry.id || createLogId()),
    timestamp: String(entry.timestamp || new Date().toISOString()),
    level: normalizeLevel(entry.level),
    area: String(entry.area || "app"),
    message: String(entry.message || "Log entry"),
    details: sanitizeLogDetails(entry.details ?? null)
  };
}

function sanitizeValue(value, key, depth) {
  if (isSensitiveKey(key)) {
    return "[redacted]";
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (depth >= maxDepth) {
    return "[max depth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, key, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childValue, childKey, depth + 1)
      ])
    );
  }

  if (typeof value === "string") {
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}...[truncated ${value.length - maxStringLength} chars]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value);
}

function isSensitiveKey(key) {
  return /api[-_\s]?key|authorization|bearer|password|secret|token|providerconfig|configdraft|rawconfig/i.test(String(key || ""));
}

function normalizeLevel(level) {
  const value = String(level || "info").toLowerCase();
  return ["debug", "info", "warn", "error"].includes(value) ? value : "info";
}

function createLogId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
