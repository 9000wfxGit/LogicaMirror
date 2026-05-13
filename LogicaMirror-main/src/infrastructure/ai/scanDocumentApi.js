export async function scanDocumentWithProvider({ document, providerConfig }) {
  const parsedConfig = parseProviderConfig(providerConfig);
  const validation = validateParsedConfig(parsedConfig, "scan-material");

  if (!validation.ok) {
    return validation;
  }

  const response = await fetch("/api/scan-document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      providerConfig: parsedConfig,
      document: {
        id: document.id,
        title: document.title,
        language: document.language,
        segments: document.segments
      }
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: "error",
      message: payload?.error || `Scan failed with HTTP ${response.status}.`,
      providerMeta: payload?.providerMeta || null
    };
  }

  return {
    ok: true,
    status: "connected",
    message: `API connected. ${payload.checkpoints.length} checkpoints scanned.`,
    checkpoints: payload.checkpoints,
    providerMeta: payload.providerMeta || null
  };
}

export async function verifyPredictionWithProvider({ prediction, sourceText, segmentText, target, prompt, language, providerConfig }) {
  const parsedConfig = parseProviderConfig(providerConfig);
  const validation = validateParsedConfig(parsedConfig, "verify-prediction");

  if (!validation.ok) {
    return validation;
  }

  const response = await fetch("/api/verify-prediction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      providerConfig: parsedConfig,
      verification: {
        prediction,
        sourceText,
        segmentText: segmentText || "",
        target,
        prompt,
        language
      }
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: "error",
      message: payload?.error || `Verification failed with HTTP ${response.status}.`,
      providerMeta: payload?.providerMeta || null
    };
  }

  return {
    ok: true,
    status: "connected",
    message: "Remote verification completed.",
    verification: payload.verification,
    providerMeta: payload.providerMeta || null
  };
}

export async function testProviderConnection(providerConfig) {
  const parsedConfig = parseProviderConfig(providerConfig);
  const validation = validateParsedConfig(parsedConfig, "scan-material");

  if (!validation.ok) {
    return validation;
  }

  const response = await fetch("/api/test-connection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      providerConfig: parsedConfig
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: "error",
      message: payload?.error || `Connection test failed with HTTP ${response.status}.`,
      providerMeta: payload?.providerMeta || null
    };
  }

  return {
    ok: true,
    status: "connected",
    message: "API connection verified by provider response.",
    providerMeta: payload.providerMeta || null
  };
}

export function parseProviderConfig(providerConfig) {
  const rawValue = providerConfig?.value || "";
  let parsed = {};

  if (providerConfig?.format === "json" || rawValue.trim().startsWith("{")) {
    parsed = JSON.parse(rawValue);
  }

  return {
    provider: parsed.provider || "openai",
    apiKey: parsed.apiKey || "",
    baseUrl: normalizeBaseUrl(parsed.baseUrl || ""),
    models: parsed.models || {},
    maxTokens: parsed.maxTokens || {},
    features: parsed.features || {}
  };
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function validateParsedConfig(parsedConfig, taskName) {
  if (!parsedConfig.apiKey) {
    return {
      ok: false,
      status: "not-configured",
      message: "Add an API key in AI Configuration before using remote AI."
    };
  }

  if (!parsedConfig.baseUrl) {
    return {
      ok: false,
      status: "not-configured",
      message: "Add a baseUrl in AI Configuration before using remote AI."
    };
  }

  if (!chooseModel(parsedConfig, taskName)) {
    return {
      ok: false,
      status: "not-configured",
      message: `Add a ${taskName} model in AI Configuration before using this API task.`
    };
  }

  return {
    ok: true
  };
}

function chooseModel(parsedConfig, taskName) {
  return (
    parsedConfig.models?.[taskName] ||
    parsedConfig.models?.["deep-assist"] ||
    parsedConfig.models?.["scan-material"] ||
    parsedConfig.models?.["verify-prediction"] ||
    ""
  );
}
