export function segmentDocument(rawText) {
  const normalized = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .trim();

  if (!normalized) {
    return [];
  }

  const rawBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isStandalonePageNumber(block));

  const merged = mergeStrayLineBreaks(rawBlocks);

  return merged.map((text, index) => ({
    index,
    text,
    kind: detectSegmentKind(text)
  }));
}

function mergeStrayLineBreaks(blocks) {
  const merged = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];

    if (previous && shouldMergeWithPrevious(previous, block)) {
      merged[merged.length - 1] = `${previous} ${block}`;
      continue;
    }

    merged.push(block);
  }

  return merged;
}

function shouldMergeWithPrevious(previous, next) {
  if (detectSegmentKind(previous) !== "paragraph") return false;
  if (detectSegmentKind(next) !== "paragraph") return false;

  const trimmedPrevious = previous.trimEnd();
  const lastChar = trimmedPrevious.slice(-1);

  if (/[.!?:;]/.test(lastChar)) return false;
  if (/["')\]]/.test(lastChar)) return false;

  const firstChar = next.trimStart().charAt(0);

  if (!firstChar) return false;
  if (/[A-ZÄÖÜ"'(\[]/.test(firstChar)) return false;

  return true;
}

function isStandalonePageNumber(text) {
  return /^[\s-]*\d{1,4}[\s-]*$/.test(text);
}

export function detectSegmentKind(text) {
  if (/^#{1,6}\s+/.test(text)) {
    return "heading";
  }

  if (/^```/.test(text)) {
    return "code";
  }

  if (looksLikeCodeBlock(text)) {
    return "code";
  }

  if (/^(\s*[-*]\s+|\s*\d+\.\s+)/m.test(text)) {
    return "list";
  }

  if (/^\s*>/.test(text)) {
    return "quote";
  }

  if (looksLikeFormula(text)) {
    return "formula";
  }

  return "paragraph";
}

function looksLikeCodeBlock(text) {
  const lines = text.split("\n");
  const codeLikeLines = lines.filter((line) =>
    /^\s*(function|class|const|let|var|return|import|export|if|else|for|while|switch|case)\b/.test(line) ||
    /[{};]\s*$/.test(line) ||
    /=>/.test(line)
  );

  return codeLikeLines.length >= Math.max(2, Math.ceil(lines.length / 2));
}

function looksLikeFormula(text) {
  if (text.length > 200) return false;
  const formulaPattern = /[=≤≥<>≠]\s*[\d\p{L}]|[\d\p{L}]\s*[=≤≥<>≠]|=>/u;
  if (!formulaPattern.test(text)) return false;
  const letterCount = (text.match(/\p{L}/gu) || []).length;
  const operatorCount = (text.match(/[=+\-*/^()<>≤≥≠]/g) || []).length;
  return operatorCount * 4 >= letterCount;
}
