import assert from "node:assert/strict";
import test from "node:test";
import { getCheckpointSource, splitSegmentByCheckpoint } from "../../src/core/checkpoints/gating.js";
import { createStudyDocument } from "../../src/core/documents/documentModel.js";
import { segmentDocument } from "../../src/core/documents/segmentDocument.js";
import { verifyPrediction } from "../../src/core/verification/verifyPrediction.js";

test("segments source material into readable units", () => {
  const segments = segmentDocument("# Heading\n\nA definition is a rule.\n\nAnother paragraph.");

  assert.equal(segments.length, 3);
  assert.equal(segments[0].kind, "heading");
  assert.equal(segments[1].kind, "paragraph");
});

test("creates documents without local fallback checkpoints before remote scan", () => {
  const document = createStudyDocument({
    title: "Definitions",
    text: "A structure is defined as a collection of objects with relations."
  });

  assert.equal(document.checkpoints.length, 0);
  assert.equal(document.segments.length, 1);
});

test("splits only the checkpoint source range", () => {
  const segment = {
    index: 0,
    kind: "paragraph",
    text: "Visible setup. Hidden target. Visible continuation."
  };
  const checkpoint = {
    id: "checkpoint-0-1",
    segmentIndex: 0,
    kind: "definition",
    anchorQuote: "Visible setup",
    target: "Visible setup",
    prompt: "Predict it.",
    hiddenRange: {
      start: 15,
      end: 29
    }
  };

  const parts = splitSegmentByCheckpoint(segment, checkpoint);

  assert.equal(parts.before, "Visible setup. ");
  assert.equal(parts.gated, "Hidden target.");
  assert.equal(parts.after, " Visible continuation.");
  assert.equal(getCheckpointSource(segment, checkpoint), "Hidden target.");
});

test("verification returns constrained structured feedback", () => {
  const result = verifyPrediction({
    prediction: "A structure preserves objects and relations through rules.",
    sourceText: "A structure is defined as a collection of objects together with relations and operations.",
    language: "en"
  });

  assert.ok(["correct", "partial", "inconsistent"].includes(result.kind));
  assert.equal(typeof result.label, "string");
  assert.equal(typeof result.detail, "string");
});

test("verification accepts a correct German paraphrase with typos", () => {
  const result = verifyPrediction({
    prediction:
      "Die Pulverfass Metapher fuer Europa vor 1914 beschreibt, dass die europaeischen Staaten untereinander in einer angespannten Lage waren. Deutschland, Frankreich, Russland, Oesterreich und der Balkan waren so zugespitzt, dass ein Mord in Sarajevo einen Weltkrieg ausloesen konnte.",
    sourceText:
      "Nationalismus, Imperialismus, militaerische Aufruestung und komplizierte Buendnissysteme sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte.",
    target: "Das Pulverfass-Metapher fuer Europa vor 1914",
    prompt: "Welche Metapher beschreibt die angespannte Lage in Europa vor dem Ersten Weltkrieg?",
    language: "de"
  });

  assert.notEqual(result.kind, "inconsistent");
});
