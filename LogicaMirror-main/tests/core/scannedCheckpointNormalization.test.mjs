import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScannedCheckpoints } from "../../src/infrastructure/ai/normalizeScannedCheckpoints.js";

const segments = [
  {
    index: 0,
    kind: "paragraph",
    text:
      "Open market operations are central bank purchases or sales of securities that change bank reserves and influence short-term interest rates."
  },
  {
    index: 1,
    kind: "paragraph",
    text: "Inflation is mentioned here, but the paragraph does not explain it."
  }
];

test("normalizes exact anchor and hidden explanation quotes", () => {
  const checkpoints = normalizeScannedCheckpoints(
    [
      {
        segmentIndex: 0,
        kind: "definition",
        anchorQuote: "Open market operations",
        hiddenQuote:
          "central bank purchases or sales of securities that change bank reserves and influence short-term interest rates",
        prompt: "What are open market operations in this context?",
        reason: "The segment defines the anchor concept."
      }
    ],
    segments
  );

  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].anchorQuote, "Open market operations");
  assert.equal(
    segments[0].text.slice(checkpoints[0].hiddenRange.start, checkpoints[0].hiddenRange.end),
    "central bank purchases or sales of securities that change bank reserves and influence short-term interest rates"
  );
});

test("rejects missing or paraphrased quotes", () => {
  assert.throws(
    () =>
      normalizeScannedCheckpoints(
        [
          {
            segmentIndex: 0,
            kind: "definition",
            anchorQuote: "open-market operations",
            hiddenQuote: "central bank buying and selling that affects rates",
            prompt: "What are open market operations?",
            reason: "Paraphrased instead of copied."
          }
        ],
        segments
      ),
    /no usable checkpoints/i
  );
});

test("rejects overlapping anchor and hidden spans", () => {
  assert.throws(
    () =>
      normalizeScannedCheckpoints(
        [
          {
            segmentIndex: 0,
            kind: "definition",
            anchorQuote: "Open market operations",
            hiddenQuote:
              "Open market operations are central bank purchases or sales of securities that change bank reserves",
            prompt: "What are open market operations?",
            reason: "Hidden quote includes the visible anchor."
          }
        ],
        segments
      ),
    /no usable checkpoints/i
  );
});

test("skips terms without explanatory hidden text", () => {
  assert.throws(
    () =>
      normalizeScannedCheckpoints(
        [
          {
            segmentIndex: 1,
            kind: "concept",
            anchorQuote: "Inflation",
            hiddenQuote: "mentioned here",
            prompt: "What is inflation?",
            reason: "The segment names the term without a real explanation."
          }
        ],
        segments
      ),
    /no usable checkpoints/i
  );
});

test("does not expand hidden text beyond the exact model quote", () => {
  const checkpoints = normalizeScannedCheckpoints(
    [
      {
        segmentIndex: 0,
        kind: "mechanism",
        anchorQuote: "bank reserves",
        hiddenQuote: "influence short-term interest rates",
        prompt: "What do bank reserves influence here?",
        reason: "The quoted span states the effect."
      }
    ],
    segments
  );

  assert.equal(
    segments[0].text.slice(checkpoints[0].hiddenRange.start, checkpoints[0].hiddenRange.end),
    "influence short-term interest rates"
  );
});
