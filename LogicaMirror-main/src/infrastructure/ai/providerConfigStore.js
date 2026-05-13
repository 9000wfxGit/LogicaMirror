const storageKey = "logicamirror.aiProviderConfig.v1";

export function loadProviderConfig() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProviderConfig(rawConfig) {
  const value = String(rawConfig || "").trim();

  if (!value) {
    clearProviderConfig();
    return {
      ok: true,
      config: null
    };
  }

  const format = detectFormat(value);

  if (format === "json") {
    try {
      JSON.parse(value);
    } catch (error) {
      return {
        ok: false,
        error: `Invalid JSON: ${error.message}`
      };
    }
  }

  const config = {
    format,
    value,
    updatedAt: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    return {
      ok: false,
      error: "Could not save API configuration in local storage."
    };
  }

  return {
    ok: true,
    config
  };
}

export function clearProviderConfig() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore unavailable local storage.
  }
}

function detectFormat(value) {
  return value.startsWith("{") || value.startsWith("[") ? "json" : "text";
}
