const checkpointRules = [
  {
    kind: "definition",
    weight: 6,
    pattern: /\b(is defined as|definition|means|is called|is a)\b/i
  },
  {
    kind: "theorem",
    weight: 5,
    pattern: /\b(theorem|states that|forces|cannot be broken|consequence)\b/i
  },
  {
    kind: "proof-step",
    weight: 5,
    pattern: /\b(proof step|minimal counterexample|derive|assumed failure|therefore|hence|expected next move)\b/i
  },
  {
    kind: "principle",
    weight: 4,
    pattern: /\b(principle|invariant|preservation|unchanged|remains fixed)\b/i
  },
  {
    kind: "method",
    weight: 4,
    pattern: /\b(method|algorithm|loop|iteration|initialization|maintenance|termination)\b/i
  },
  {
    kind: "event",
    weight: 3,
    pattern: /\b(treaty|alliance|crisis|conflict|consequence)\b/i
  }
];

const maxLocalCheckpoints = 8;

export function createLocalCheckpoints(segments) {
  const candidates = segments
    .filter((segment) => segment.kind !== "heading" && segment.text.length > 40)
    .map(scoreSegment)
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.segment.index - right.segment.index)
    .slice(0, maxLocalCheckpoints)
    .sort((left, right) => left.segment.index - right.segment.index);

  const source = candidates.length > 0 ? candidates : fallbackCandidates(segments);

  return source.map((candidate, index) => {
    const sourceRange = chooseSourceRange(candidate.segment.text);
    const target = extractTarget(candidate.segment.text, candidate.kind);

    return {
      id: `checkpoint-${candidate.segment.index}-${index + 1}`,
      segmentIndex: candidate.segment.index,
      kind: candidate.kind,
      target,
      prompt: buildPrompt(candidate.kind, target),
      sourceRange
    };
  });
}

function scoreSegment(segment) {
  const matches = checkpointRules.filter((rule) => rule.pattern.test(segment.text));
  const score = matches.reduce((total, rule) => total + rule.weight, 0);
  const primaryRule = matches[0] || { kind: "key-concept" };

  return {
    segment,
    kind: primaryRule.kind,
    score
  };
}

function fallbackCandidates(segments) {
  return segments
    .filter((segment) => segment.kind === "paragraph" && segment.text.length > 40)
    .slice(0, 3)
    .map((segment) => ({
      segment,
      kind: "key-concept",
      score: 1
    }));
}

function chooseSourceRange(text) {
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  const end = sentenceEnd > 60 ? sentenceEnd + 1 : Math.min(text.length, 220);

  return {
    start: 0,
    end
  };
}

function extractTarget(text, kind) {
  const definitionMatch = text.match(/\b([A-Z][A-Za-z -]{2,36})\s+(is defined as|is a|means|is called)\b/);

  if (definitionMatch) {
    return normalizeTarget(definitionMatch[1]);
  }

  const lowerKind = kind.replace("-", " ");
  const words = text
    .replace(/^#+\s*/, "")
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  return normalizeTarget(words || lowerKind);
}

function buildPrompt(kind, target) {
  const readableKind = kind.replace("-", " ");
  return `Predict the key ${readableKind} before reading the source passage about ${target}.`;
}

function normalizeTarget(value) {
  return String(value || "")
    .trim()
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/\s+/g, " ");
}
