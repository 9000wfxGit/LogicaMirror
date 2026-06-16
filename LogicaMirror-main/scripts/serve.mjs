import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkpointKinds, normalizeScannedCheckpoints } from "../src/infrastructure/ai/normalizeScannedCheckpoints.js";

const VERY_HIGH_SCAN_MAX_TOKENS = 64000;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const portArgIndex = process.argv.indexOf("--port");
const port = Number(portArgIndex >= 0 ? process.argv[portArgIndex + 1] : process.env.PORT) || 4173;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fullPath = normalize(join(root, requested));

  if (!fullPath.startsWith(root)) {
    return null;
  }

  return fullPath;
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url?.startsWith("/api/test-connection")) {
    await handleTestConnection(request, response);
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/api/verify-prediction")) {
    await handleVerifyPrediction(request, response);
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/api/scan-document")) {
    await handleScanDocument(request, response);
    return;
  }

  const fullPath = resolveRequestPath(request.url || "/");

  if (!fullPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const contents = await readFile(fullPath);
    const contentType = mimeTypes[extname(fullPath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(contents);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

async function handleTestConnection(request, response) {
  let providerMeta = {
    requestAttempted: false
  };

  try {
    const body = await readJsonBody(request);
    const providerConfig = body.providerConfig || {};

    validateProviderConfig(providerConfig);

    const model = providerConfig.models?.["scan-material"] || providerConfig.models?.["verify-prediction"];
    providerMeta = {
      requestAttempted: true,
      model,
      baseUrl: providerConfig.baseUrl
    };

    const apiResponse = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(buildChatBody(providerConfig, {
        model,
        messages: [
          {
            role: "system",
            content: "Return only JSON between <json> and </json> tags. No other text."
          },
          {
            role: "user",
            content: "Return <json>{\"ok\":true}</json> to confirm connectivity."
          }
        ],
        maxTokens: 64,
        temperature: 0
      }))
    });

    const apiPayload = await apiResponse.json().catch(() => null);
    providerMeta = {
      ...providerMeta,
      status: apiResponse.status,
      requestId:
        apiResponse.headers.get("x-request-id") ||
        apiResponse.headers.get("x-ds-request-id") ||
        apiResponse.headers.get("cf-ray") ||
        null
    };

    if (!apiResponse.ok) {
      writeJson(response, apiResponse.status, {
        ok: false,
        error: apiPayload?.error?.message || `Provider returned HTTP ${apiResponse.status}.`,
        providerMeta
      });
      return;
    }

    writeJson(response, 200, {
      ok: true,
      providerMeta
    });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: error.message || "Could not test API connection.",
      providerMeta
    });
  }
}

async function handleVerifyPrediction(request, response) {
  let providerMeta = {
    requestAttempted: false
  };

  try {
    const body = await readJsonBody(request);
    const providerConfig = body.providerConfig || {};
    const verification = body.verification || {};

    validateProviderTaskConfig(providerConfig, "verify-prediction");
    validateVerificationRequest(verification);

    const model = chooseModel(providerConfig, "verify-prediction");
    providerMeta = {
      requestAttempted: true,
      model,
      baseUrl: providerConfig.baseUrl
    };

    const apiResponse = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(buildChatBody(providerConfig, {
        model,
        messages: buildVerificationMessages(verification),
        maxTokens: providerConfig.maxTokens?.["verify-prediction"] || 800,
        temperature: 0
      }))
    });

    const apiPayload = await apiResponse.json().catch(() => null);
    providerMeta = {
      ...providerMeta,
      status: apiResponse.status,
      requestId:
        apiResponse.headers.get("x-request-id") ||
        apiResponse.headers.get("x-ds-request-id") ||
        apiResponse.headers.get("cf-ray") ||
        null
    };

    if (!apiResponse.ok) {
      writeJson(response, apiResponse.status, {
        ok: false,
        error: apiPayload?.error?.message || `Provider returned HTTP ${apiResponse.status}.`,
        providerMeta
      });
      return;
    }

    const content = apiPayload?.choices?.[0]?.message?.content || "";
    const parsed = parseModelJson(content);
    const result = normalizeVerificationResult(parsed, verification.language);

    writeJson(response, 200, {
      ok: true,
      verification: result,
      providerMeta
    });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: error.message || "Could not verify prediction.",
      providerMeta
    });
  }
}

async function handleScanDocument(request, response) {
  let providerMeta = {
    requestAttempted: false
  };

  try {
    const body = await readJsonBody(request);
    const providerConfig = body.providerConfig || {};
    const document = body.document || {};

    validateScanRequest(providerConfig, document);

    const model = chooseModel(providerConfig, "scan-material");
    providerMeta = {
      requestAttempted: true,
      model,
      baseUrl: providerConfig.baseUrl
    };

    const segmentsForPrompt = document.segments || [];
    const scanMaxTokens = getConfiguredMaxTokens(providerConfig, "scan-material") || VERY_HIGH_SCAN_MAX_TOKENS;

    const apiResponse = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(buildChatBody(providerConfig, {
        model,
        messages: buildScanMessages({ ...document, segments: segmentsForPrompt }),
        maxTokens: scanMaxTokens,
        temperature: 0
      }))
    });

    const apiPayload = await apiResponse.json().catch(() => null);
    providerMeta = {
      ...providerMeta,
      status: apiResponse.status,
      requestId:
        apiResponse.headers.get("x-request-id") ||
        apiResponse.headers.get("x-ds-request-id") ||
        apiResponse.headers.get("cf-ray") ||
        null
    };

    if (!apiResponse.ok) {
      writeJson(response, apiResponse.status, {
        ok: false,
        error: apiPayload?.error?.message || `Provider returned HTTP ${apiResponse.status}.`,
        providerMeta
      });
      return;
    }

    const content = apiPayload?.choices?.[0]?.message?.content || "";
    const proposed = parseModelJson(content);
    const checkpoints = normalizeScannedCheckpoints(proposed.checkpoints || proposed, document.segments || []);

    writeJson(response, 200, {
      ok: true,
      checkpoints,
      providerMeta
    });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: error.message || "Could not scan document.",
      providerMeta
    });
  }
}

function buildScanMessages(document) {
  const compactSegments = document.segments || [];
  const markedDocument = compactSegments
    .map((segment) => `[segment ${segment.index} | ${segment.kind}]\n${segment.text}`)
    .join("\n\n");

  const maxCheckpoints = Math.max(1, Math.min(12, Math.ceil(compactSegments.length / 3)));

  return [
    {
      role: "system",
      content:
        "LogicaMirror lets a learner read source text, see a term or concept, predict its hidden explanation, then verify against the source. Return only JSON between <json> and </json>. Select anchored term/concept checkpoints, not random important sentences."
    },
    {
      role: "user",
      content: JSON.stringify({
        constraints: {
          maxCheckpoints,
          oneCheckpointPerSegment: true,
          quotesMustBeVerbatim: true,
          anchorRemainsVisible: true,
          hiddenQuoteMustExplainAnchor: true
        },
        allowedKinds: [...checkpointKinds],
        task:
          "Return JSON with a checkpoints array. Each checkpoint must include segmentIndex, kind, anchorQuote, hiddenQuote, prompt, and reason. anchorQuote is the visible term/concept. hiddenQuote is the exact definition, explanation, mechanism, cause, distinction, rule, or process text to blur. Both quotes MUST be exact non-overlapping substrings copied verbatim from the same segment text. Skip a term if the segment does not actually explain it. Do not select headings as checkpoints. At most one checkpoint per segment.",
        outputSchema: {
          checkpoints: [
            {
              segmentIndex: "number from the marked document",
              kind: "definition|concept|mechanism|cause-effect|distinction|rule|process",
              anchorQuote: "exact visible term/concept substring",
              hiddenQuote: "exact hidden answer substring from the same segment",
              prompt: "short question asking what the anchor means or implies in context",
              reason: "short reason this is a valid checkpoint"
            }
          ]
        },
        documentTitle: document.title,
        language: document.language,
        markedDocument
      })
    }
  ];
}

function buildVerificationMessages(verification) {
  return [
    {
      role: "system",
      content:
        "You are a constrained logic mirror for predictive active recall. Compare the learner prediction only with the hidden source passage and the current target concept, using the surrounding paragraph only to resolve pronouns and references. Return ONLY a JSON object between <json> and </json> tags. No prose before or after. Do not teach the full topic. Decide whether the learner's reasoning is correct, partial, or inconsistent. Accept paraphrases, synonyms, and reasoning that captures the same relation even if wording differs. If partial or inconsistent, identify the smallest missing relation, condition, distinction, cause/effect, or contradiction. Keep feedback concise and specific."
    },
    {
      role: "user",
      content: JSON.stringify({
        language: verification.language || "en",
        target: verification.target,
        prompt: verification.prompt,
        hiddenSource: verification.sourceText,
        surroundingParagraph: verification.segmentText || "",
        learnerPrediction: verification.prediction,
        outputSchema: {
          kind: "correct|partial|inconsistent",
          label: "short status in the selected language",
          detail: "one short sentence naming what matches or fails",
          expanded: "2-4 short bullets or sentences showing the reasoning comparison without giving unrelated teaching"
        }
      })
    }
  ];
}

function validateScanRequest(providerConfig, document) {
  validateProviderConfig(providerConfig);

  if (!Array.isArray(document.segments) || document.segments.length === 0) {
    throw new Error("No document segments available to scan.");
  }
}

function validateProviderConfig(providerConfig) {
  if (!providerConfig.apiKey) {
    throw new Error("Missing API key.");
  }

  if (!providerConfig.baseUrl) {
    throw new Error("Missing base URL.");
  }

  if (!chooseModel(providerConfig, "scan-material")) {
    throw new Error("Missing usable model.");
  }
}

function validateProviderTaskConfig(providerConfig, taskName) {
  if (!providerConfig.apiKey) {
    throw new Error("Missing API key.");
  }

  if (!providerConfig.baseUrl) {
    throw new Error("Missing base URL.");
  }

  if (!chooseModel(providerConfig, taskName)) {
    throw new Error(`Missing ${taskName} model.`);
  }
}

function chooseModel(providerConfig, taskName) {
  return (
    providerConfig.models?.[taskName] ||
    providerConfig.models?.["deep-assist"] ||
    providerConfig.models?.["scan-material"] ||
    providerConfig.models?.["verify-prediction"] ||
    ""
  );
}

function getConfiguredMaxTokens(providerConfig, taskName) {
  const value = providerConfig.maxTokens?.[taskName];
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function validateVerificationRequest(verification) {
  if (!String(verification.prediction || "").trim()) {
    throw new Error("Missing learner prediction.");
  }

  if (!String(verification.sourceText || "").trim()) {
    throw new Error("Missing hidden source text.");
  }
}

function normalizeVerificationResult(parsed, language = "en") {
  const allowedKinds = new Set(["correct", "partial", "inconsistent"]);
  const kind = allowedKinds.has(parsed.kind) ? parsed.kind : "partial";
  const fallbackLabel = {
    en: {
      correct: "Logic consistent",
      partial: "Partial",
      inconsistent: "Inconsistent"
    },
    de: {
      correct: "Logik stimmig",
      partial: "Teilweise",
      inconsistent: "Widerspruechlich"
    },
    es: {
      correct: "Logica consistente",
      partial: "Parcial",
      inconsistent: "Inconsistente"
    }
  };
  const labels = fallbackLabel[language] || fallbackLabel.en;

  return {
    kind,
    label: String(parsed.label || labels[kind]),
    detail: String(parsed.detail || ""),
    expanded: Array.isArray(parsed.expanded) ? parsed.expanded.join("\n") : String(parsed.expanded || "")
  };
}

function parseModelJson(content) {
  const trimmed = String(content || "").trim();

  if (!trimmed) {
    throw new Error("Provider returned empty content.");
  }

  const candidates = [];

  const tagMatch = trimmed.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagMatch) candidates.push(tagMatch[1].trim());

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedBlocks) {
    candidates.push(match[1].trim());
  }

  const balanced = extractBalancedJson(trimmed);
  if (balanced) candidates.push(balanced);

  candidates.push(trimmed);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
      try {
        return JSON.parse(repairJson(candidate));
      } catch (innerError) {
        lastError = innerError;
      }
    }
  }

  throw new Error(`Provider JSON could not be parsed: ${lastError?.message || "unknown error"}.`);
}

function extractBalancedJson(text) {
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let start = -1;
  let opener = "";

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
    opener = "{";
  } else if (firstBracket >= 0) {
    start = firstBracket;
    opener = "[";
  }

  if (start < 0) return null;

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function repairJson(text) {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

function buildChatBody(providerConfig, { model, messages, maxTokens, temperature }) {
  const body = {
    model,
    messages,
    stream: false
  };

  if (typeof maxTokens === "number" && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  if (typeof temperature === "number") {
    body.temperature = temperature;
  }

  const features = providerConfig.features || {};
  const jsonMode = features.jsonMode !== false;

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 2_000_000) {
        rejectBody(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        rejectBody(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", rejectBody);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

server.listen(port, "127.0.0.1", () => {
  console.log(`LogicaMirror running at http://127.0.0.1:${port}`);
});
