import { segmentDocument } from "./segmentDocument.js";

export const supportedLanguages = ["en", "de", "es"];

export function createStudyDocument({ title, text, language = "en" }) {
  const now = new Date().toISOString();
  const segments = segmentDocument(text);

  return {
    id: createStableId(title, text),
    title: title || "Untitled study material",
    language: supportedLanguages.includes(language) ? language : "en",
    segments,
    checkpoints: [],
    createdAt: now,
    updatedAt: now
  };
}

function createStableId(title, text) {
  const source = `${title || ""}:${text || ""}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return `doc-${Math.abs(hash)}`;
}
