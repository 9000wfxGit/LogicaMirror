const messages = {
  en: {
    correct: {
      label: "Logic consistent",
      detail: "Your reasoning matches the hidden source passage.",
      expanded: "The prediction preserves the main relation in the checkpoint source."
    },
    partial: {
      label: "Partial",
      detail: "Your reasoning matches the target idea, but misses one condition.",
      expanded: "The prediction overlaps with the source, but it does not yet capture enough of the constraint."
    },
    inconsistent: {
      label: "Inconsistent",
      detail: "Your claim conflicts with or misses the hidden source.",
      expanded: "Try naming the relation, condition, or consequence that the source passage is likely to introduce."
    }
  },
  de: {
    correct: {
      label: "Logik stimmig",
      detail: "Deine Begruendung passt zur verdeckten Quellstelle.",
      expanded: "Die Vorhersage bewahrt die zentrale Relation der Checkpoint-Quelle."
    },
    partial: {
      label: "Teilweise",
      detail: "Deine Begruendung trifft die Zielidee, aber eine Bedingung fehlt.",
      expanded: "Die Vorhersage ueberschneidet sich mit der Quelle, erfasst aber die Einschraenkung noch nicht genau genug."
    },
    inconsistent: {
      label: "Widerspruechlich",
      detail: "Deine Aussage widerspricht der verdeckten Quelle oder verfehlt sie.",
      expanded: "Versuche die Relation, Bedingung oder Folge zu benennen, die die Quelle wahrscheinlich einfuehrt."
    }
  },
  es: {
    correct: {
      label: "Logica consistente",
      detail: "Tu razonamiento coincide con la fuente oculta.",
      expanded: "La prediccion conserva la relacion principal del pasaje de control."
    },
    partial: {
      label: "Parcial",
      detail: "Tu razonamiento coincide con la idea central, pero falta una condicion.",
      expanded: "La prediccion se solapa con la fuente, pero todavia no captura toda la restriccion."
    },
    inconsistent: {
      label: "Inconsistente",
      detail: "Tu afirmacion contradice o no alcanza la fuente oculta.",
      expanded: "Intenta nombrar la relacion, condicion o consecuencia que el pasaje probablemente introduce."
    }
  }
};

const stopWords = new Set([
  "the",
  "and",
  "that",
  "with",
  "this",
  "from",
  "into",
  "your",
  "eine",
  "einer",
  "einem",
  "einen",
  "eines",
  "ein",
  "zu",
  "zur",
  "zum",
  "von",
  "vom",
  "vor",
  "mit",
  "für",
  "fuer",
  "als",
  "so",
  "sich",
  "sehr",
  "dann",
  "auch",
  "wie",
  "war",
  "ist",
  "hat",
  "den",
  "dem",
  "des",
  "dass",
  "zwischen",
  "und",
  "oder",
  "der",
  "die",
  "das",
  "ist",
  "con",
  "una",
  "uno",
  "que",
  "los",
  "las",
  "para"
]);

const causalCueTokens = new Set([
  "because",
  "therefore",
  "cause",
  "causes",
  "consequence",
  "consequences",
  "leads",
  "leading",
  "trigger",
  "triggers",
  "results",
  "due",
  "hence",
  "thus",
  "implies",
  "imply",
  "follows",
  "conflict",
  "tension",
  "describe",
  "describes",
  "weil",
  "deshalb",
  "daher",
  "dadurch",
  "folge",
  "folgt",
  "fuehrt",
  "ergibt",
  "bewirkt",
  "verursacht",
  "auslosen",
  "ausloesen",
  "ausloest",
  "ausgebrochen",
  "zugespitzt",
  "beschreibt",
  "porque",
  "entonces",
  "causa",
  "provoca",
  "implica",
  "lleva",
  "produce"
]);

export function verifyPrediction({ prediction, sourceText, language = "en", target = "", prompt = "" }) {
  const trimmedPrediction = String(prediction || "").trim();
  const sourceTokens = tokenize(sourceText);
  const predictionTokens = tokenize(trimmedPrediction);
  const targetTokens = tokenize(target);
  const promptTokens = tokenize(prompt);

  if (!trimmedPrediction || predictionTokens.length < 3) {
    return buildResult("inconsistent", language);
  }

  const uniquePredictionTokens = [...new Set(predictionTokens)];
  const sourceOverlap = countTokenMatches(uniquePredictionTokens, sourceTokens);
  const targetOverlap = countTokenMatches(uniquePredictionTokens, targetTokens);
  const promptOverlap = countTokenMatches(uniquePredictionTokens, promptTokens);
  const sourceRatio = sourceOverlap / Math.max(1, Math.min(uniquePredictionTokens.length, sourceTokens.length));
  const targetRatio = targetOverlap / Math.max(1, targetTokens.length);
  const hasCausalCue = uniquePredictionTokens.some((token) => causalCueTokens.has(token));
  const hasCheckpointAnchor = sourceOverlap >= 2 || targetOverlap >= 2 || promptOverlap >= 3;

  if (
    (sourceOverlap >= 4 && sourceRatio >= 0.22) ||
    (targetTokens.length > 0 && targetRatio >= 0.55 && hasCausalCue && hasCheckpointAnchor) ||
    (sourceOverlap >= 3 && targetOverlap >= 1 && hasCausalCue)
  ) {
    return buildResult("correct", language);
  }

  if (
    (sourceOverlap >= 2 && sourceRatio >= 0.12) ||
    (targetTokens.length > 0 && targetRatio >= 0.35) ||
    (promptOverlap >= 2 && sourceOverlap >= 1)
  ) {
    return buildResult("partial", language);
  }

  return buildResult("inconsistent", language);
}

function buildResult(kind, language) {
  const localized = messages[language] || messages.en;

  return {
    kind,
    label: localized[kind].label,
    detail: localized[kind].detail,
    expanded: localized[kind].expanded
  };
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => stemToken(token.trim()))
    .filter((token) => token.length > 3 && !stopWords.has(token));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token) {
  if (token.length <= 6) {
    return token;
  }

  return token
    .replace(/(ungen|licher|lichen|ische|ischen|ischem|igkeit)$/i, "")
    .replace(/(ungen|heit|keit|schaft)$/i, "")
    .replace(/(ende|ender|endes|ern|er|en|es|e|s)$/i, "");
}

function countTokenMatches(predictionTokens, sourceTokens) {
  const remaining = [...new Set(sourceTokens)];
  let matches = 0;

  for (const predictionToken of predictionTokens) {
    const matchIndex = remaining.findIndex((sourceToken) => tokensMatch(predictionToken, sourceToken));

    if (matchIndex >= 0) {
      matches += 1;
      remaining.splice(matchIndex, 1);
    }
  }

  return matches;
}

function tokensMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) {
    return true;
  }

  const longest = Math.max(left.length, right.length);
  const allowedDistance = longest >= 10 ? 2 : 1;

  return levenshteinDistance(left, right, allowedDistance) <= allowedDistance;
}

function levenshteinDistance(left, right, maxDistance) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}
