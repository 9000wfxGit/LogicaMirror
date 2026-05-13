import assert from "node:assert/strict";
import test from "node:test";
import { appendAppLog, clearAppLogs, loadAppLogs, sanitizeLogDetails, serializeAppLogs } from "../../src/infrastructure/logging/appLogStore.js";

test("sanitizes secrets before logs are stored or copied", () => {
  const sanitized = sanitizeLogDetails({
    apiKey: "sk-test",
    baseUrl: "https://api.example.test",
    nested: {
      Authorization: "Bearer secret",
      token: "secret-token",
      status: 200
    }
  });

  assert.equal(sanitized.apiKey, "[redacted]");
  assert.equal(sanitized.baseUrl, "https://api.example.test");
  assert.equal(sanitized.nested.Authorization, "[redacted]");
  assert.equal(sanitized.nested.token, "[redacted]");
  assert.equal(sanitized.nested.status, 200);
});

test("stores newest app logs first in local storage", (t) => {
  installMemoryLocalStorage();
  t.after(() => {
    delete globalThis.window;
  });
  clearAppLogs();

  appendAppLog({
    level: "info",
    area: "api",
    message: "First event",
    details: { status: 200 }
  });
  appendAppLog({
    level: "error",
    area: "scan",
    message: "Second event",
    details: { apiKey: "secret" }
  });

  const logs = loadAppLogs();
  const serialized = serializeAppLogs(logs);

  assert.equal(logs.length, 2);
  assert.equal(logs[0].message, "Second event");
  assert.equal(logs[0].details.apiKey, "[redacted]");
  assert.match(serialized, /ERROR scan: Second event/);
  assert.doesNotMatch(serialized, /secret/);

});

function installMemoryLocalStorage() {
  const values = new Map();

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      }
    }
  };
}
