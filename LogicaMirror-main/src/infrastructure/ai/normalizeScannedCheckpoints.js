export const checkpointKinds = new Set([
  "definition",
  "theorem",
  "principle",
  "event",
  "process",
  "formula",
  "method",
  "code-output",
  "proof-step",
  "key-concept"
]);

const abbreviationsNoBoundary = new Set([
  "dr", "mr", "mrs", "ms", "st", "vs", "etc", "ca", "vgl", "bzw",
  "z", "b", "d", "h", "u", "usw", "ggf", "evtl", "sog", "nr", "jh", "jhd",
  "bsp", "abb", "kap", "art", "pkt", "no", "fig", "eq"
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

  if (!segment || segment.kind === "heading") {
    return null;
  }

  const sourceRange = findExpandedSourceRange(segment.text, checkpoint.sourceQuote);

  if (!sourceRange) {
    return null;
  }

  const kind = checkpointKinds.has(checkpoint.kind) ? checkpoint.kind : "key-concept";
  const target = String(checkpoint.target || "").trim() || "key concept";
  const prompt =
    String(checkpoint.prompt || "").trim() ||
    `Predict the key ${kind.replace("-", " ")} before reading the source passage about ${target}.`;

  return {
    id: `ai-checkpoint-${segmentIndex}-${index + 1}`,
    segmentIndex,
    kind,
    target,
    prompt,
    sourceRange
  };
}

export function findExpandedSourceRange(segmentText, sourceQuote) {
  const text = String(segmentText || "");
  const quote = String(sourceQuote || "").trim();

  if (!text || !quote) {
    return null;
  }

  const located = locateQuote(text, quote);

  if (!located) {
    return null;
  }

  return expandToSentenceRange(text, located.start, located.end);
}

function locateQuote(text, quote) {
  const direct = text.indexOf(quote);

  if (direct >= 0) {
    return { start: direct, end: direct + quote.length };
  }

  const collapsedText = collapseWhitespace(text);
  const collapsedQuote = collapseWhitespace(quote);
  const collapsedIndex = collapsedText.indexOf(collapsedQuote);

  if (collapsedIndex >= 0) {
    const mapped = mapCollapsedRange(text, collapsedIndex, collapsedIndex + collapsedQuote.length);

    if (mapped) {
      return mapped;
    }
  }

  const foldedText = foldText(text);
  const foldedQuote = foldText(quote);
  const foldedIndex = foldedText.indexOf(foldedQuote);

  if (foldedIndex >= 0 && foldedText.length === text.length) {
    return { start: foldedIndex, end: foldedIndex + foldedQuote.length };
  }

  return locateBySentenceOverlap(text, quote);
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function foldText(value) {
  return value
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/ /g, " ");
}

function mapCollapsedRange(originalText, collapsedStart, collapsedEnd) {
  let collapsedCursor = 0;
  let originalStart = -1;
  let originalEnd = -1;
  let lastWasSpace = false;
  let trimmedLeading = false;

  for (let index = 0; index < originalText.length; index += 1) {
    const char = originalText[index];
    const isSpace = /\s/.test(char);

    if (isSpace) {
      if (!trimmedLeading) continue;
      if (lastWasSpace) continue;
      if (collapsedCursor === collapsedStart && originalStart === -1) {
        originalStart = index;
      }
      if (collapsedCursor === collapsedEnd) {
        originalEnd = index;
        break;
      }
      collapsedCursor += 1;
      lastWasSpace = true;
    } else {
      trimmedLeading = true;
      if (collapsedCursor === collapsedStart && originalStart === -1) {
        originalStart = index;
      }
      if (collapsedCursor === collapsedEnd) {
        originalEnd = index;
        break;
      }
      collapsedCursor += 1;
      lastWasSpace = false;
    }
  }

  if (originalStart === -1) return null;
  if (originalEnd === -1) originalEnd = originalText.length;

  return { start: originalStart, end: originalEnd };
}

function locateBySentenceOverlap(text, quote) {
  const quoteTokens = tokenizeForOverlap(quote);

  if (quoteTokens.length < 2) {
    return null;
  }

  const sentences = splitIntoSentences(text);
  let bestScore = 0;
  let bestSentence = null;

  for (const sentence of sentences) {
    const sentenceTokens = new Set(tokenizeForOverlap(sentence.text));
    let matches = 0;
    for (const token of quoteTokens) {
      if (sentenceTokens.has(token)) matches += 1;
    }
    const score = matches / quoteTokens.length;

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  if (bestSentence && bestScore >= 0.5) {
    return { start: bestSentence.start, end: bestSentence.end };
  }

  return null;
}

function tokenizeForOverlap(value) {
  return foldText(String(value).toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function splitIntoSentences(text) {
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (isSentencePunctuation(text, index) && isUsableBoundary(text, index)) {
      const end = index + 1;
      const trimmedText = text.slice(start, end).trim();
      if (trimmedText) {
        const trimmedStart = start + (text.slice(start, end).length - text.slice(start, end).trimStart().length);
        sentences.push({ start: trimmedStart, end, text: trimmedText });
      }
      start = end;
    }
  }

  if (start < text.length) {
    const trimmedText = text.slice(start).trim();
    if (trimmedText) {
      sentences.push({ start, end: text.length, text: trimmedText });
    }
  }

  return sentences;
}

function expandToSentenceRange(text, quoteStart, quoteEnd) {
  const quoteAlreadyEndsAtSentenceBoundary =
    quoteEnd > quoteStart &&
    isSentencePunctuation(text, quoteEnd - 1) &&
    isUsableBoundary(text, quoteEnd - 1);

  return {
    start: findPreviousSentenceBoundary(text, quoteStart),
    end: quoteAlreadyEndsAtSentenceBoundary ? quoteEnd : findNextSentenceBoundary(text, quoteEnd)
  };
}

function findPreviousSentenceBoundary(text, fromIndex) {
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    if (isSentencePunctuation(text, index) && isUsableBoundary(text, index)) {
      return skipWhitespaceForward(text, index + 1);
    }
  }

  return 0;
}

function findNextSentenceBoundary(text, fromIndex) {
  for (let index = fromIndex; index < text.length; index += 1) {
    if (isSentencePunctuation(text, index) && isUsableBoundary(text, index)) {
      return index + 1;
    }
  }

  return text.length;
}

function isSentencePunctuation(text, index) {
  return text[index] === "." || text[index] === "!" || text[index] === "?";
}

function isUsableBoundary(text, index) {
  const previous = text[index - 1] || "";
  const next = text[index + 1] || "";

  if (/\d/.test(previous)) {
    return false;
  }

  if (text[index] === "." && precedingTokenIsAbbreviation(text, index)) {
    return false;
  }

  return !next || /\s/.test(next);
}

function precedingTokenIsAbbreviation(text, periodIndex) {
  let cursor = periodIndex - 1;
  let token = "";

  while (cursor >= 0 && /[\p{L}]/u.test(text[cursor])) {
    token = text[cursor] + token;
    cursor -= 1;
  }

  if (!token) return false;

  return abbreviationsNoBoundary.has(token.toLowerCase());
}

function skipWhitespaceForward(text, index) {
  let cursor = index;

  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }

  return cursor;
}
