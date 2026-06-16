export const checkpointKinds = new Set([
  "definition",
  "concept",
  "mechanism",
  "cause-effect",
  "distinction",
  "rule",
  "process"
]);

export function normalizeScannedCheckpoints(rawCheckpoints, segments) {
  if (!Array.isArray(rawCheckpoints)) {
    throw new Error("Provider response did not include a checkpoints array.");
  }

  const seenSegments = new Set();
  const globalCap = Math.max(1, Math.min(12, Math.ceil(segments.length / 3)));

  const normalized = rawCheckpoints
    .map((checkpoint, index) => normalizeCheckpoint(checkpoint, index, segments))
    .filter(Boolean)
    .filter((checkpoint) => {
      if (seenSegments.has(checkpoint.segmentIndex)) {
        return false;
      }
      seenSegments.add(checkpoint.segmentIndex);
      return true;
    })
    .slice(0, globalCap);

  if (normalized.length === 0) {
    throw new Error("Provider returned no usable checkpoints.");
  }

  return normalized;
}

function normalizeCheckpoint(checkpoint, index, segments) {
  const segmentIndex = Number(checkpoint.segmentIndex);
  const segment = segments.find((candidate) => Number(candidate.index) === segmentIndex);

  if (!Number.isInteger(segmentIndex) || !segment || segment.kind === "heading") {
    return null;
  }

  if (!checkpointKinds.has(checkpoint.kind)) {
    return null;
  }

  const anchorQuote = String(checkpoint.anchorQuote || "").trim();
  const hiddenQuote = String(checkpoint.hiddenQuote || "").trim();

  if (!anchorQuote || !hiddenQuote || !hasExplanatoryWeight(hiddenQuote, anchorQuote)) {
    return null;
  }

  const anchorRange = locateExactQuote(segment.text, anchorQuote);
  const hiddenRange = locateExactQuote(segment.text, hiddenQuote);

  if (!anchorRange || !hiddenRange || rangesOverlap(anchorRange, hiddenRange)) {
    return null;
  }

  const prompt =
    String(checkpoint.prompt || "").trim() ||
    `What does ${anchorQuote} mean or imply in this context?`;

  return {
    id: `ai-checkpoint-${segmentIndex}-${index + 1}`,
    segmentIndex,
    kind: checkpoint.kind,
    anchorQuote,
    target: anchorQuote,
    hiddenQuote,
    prompt,
    reason: String(checkpoint.reason || "").trim(),
    anchorRange,
    hiddenRange
  };
}

function locateExactQuote(text, quote) {
  const start = String(text || "").indexOf(quote);

  if (start < 0) {
    return null;
  }

  return {
    start,
    end: start + quote.length
  };
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function hasExplanatoryWeight(hiddenQuote, anchorQuote) {
  const hiddenTokens = contentTokens(hiddenQuote);
  const anchorTokens = new Set(contentTokens(anchorQuote));
  const hiddenOnlyTokens = hiddenTokens.filter((token) => !anchorTokens.has(token));

  return hiddenQuote.length >= 20 && hiddenTokens.length >= 3 && hiddenOnlyTokens.length >= 2;
}

function contentTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}
