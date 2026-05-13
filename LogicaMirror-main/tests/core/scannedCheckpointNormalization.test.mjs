import assert from "node:assert/strict";
import test from "node:test";
import { findExpandedSourceRange, normalizeScannedCheckpoints } from "../../src/infrastructure/ai/normalizeScannedCheckpoints.js";

test("expands tiny AI source quote to the full explanatory sentence", () => {
  const text =
    "Zu Beginn des 20. Jahrhunderts galt Europa als politisches und wirtschaftliches Zentrum der Welt. Gleichzeitig nahmen jedoch Spannungen zwischen den europäischen Großmächten immer weiter zu. Nationalismus, Imperialismus, militärische Aufrüstung und komplizierte Bündnissysteme sorgten dafür, dass Europa zunehmend einem Pulverfass ähnelte. Ein einzelner Konflikt konnte ausreichen, um einen großen Krieg auszulösen.";

  const range = findExpandedSourceRange(text, "Europa zunehmend einem Pulverfass ähnelte");
  const hidden = text.slice(range.start, range.end);

  assert.equal(
    hidden,
    "Nationalismus, Imperialismus, militärische Aufrüstung und komplizierte Bündnissysteme sorgten dafür, dass Europa zunehmend einem Pulverfass ähnelte."
  );
});

test("does not expand a complete source sentence into the next sentence", () => {
  const text =
    "Context sentence. Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte. Ein einzelner Konflikt konnte einen grossen Krieg ausloesen.";

  const range = findExpandedSourceRange(
    text,
    "Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte."
  );
  const hidden = text.slice(range.start, range.end);

  assert.equal(
    hidden,
    "Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte."
  );
});

test("expands a complete source quote without punctuation to the sentence end", () => {
  const text =
    "Context sentence. Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte. Ein einzelner Konflikt konnte einen grossen Krieg ausloesen.";

  const range = findExpandedSourceRange(
    text,
    "Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte"
  );
  const hidden = text.slice(range.start, range.end);

  assert.equal(
    hidden,
    "Nationalismus und Buendnisse sorgten dafuer, dass Europa zunehmend einem Pulverfass aehnelte."
  );
});

test("normalizes scanned checkpoints with expanded source ranges", () => {
  const segments = [
    {
      index: 0,
      kind: "paragraph",
      text:
        "Visible context. The important explanation says the alliance system can turn a local conflict into a wider war. Next idea."
    }
  ];

  const checkpoints = normalizeScannedCheckpoints(
    [
      {
        segmentIndex: 0,
        kind: "event",
        target: "alliance system",
        prompt: "Predict why the alliance system matters.",
        sourceQuote: "local conflict into a wider war"
      }
    ],
    segments
  );

  const hidden = segments[0].text.slice(checkpoints[0].sourceRange.start, checkpoints[0].sourceRange.end);

  assert.equal(hidden, "The important explanation says the alliance system can turn a local conflict into a wider war.");
});
