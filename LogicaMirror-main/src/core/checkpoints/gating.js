export function findCheckpointForSegment(checkpoints, segmentIndex) {
  return checkpoints.find((checkpoint) => checkpoint.segmentIndex === segmentIndex) || null;
}

export function splitSegmentByCheckpoint(segment, checkpoint) {
  if (!checkpoint) {
    return {
      before: segment.text,
      gated: "",
      after: ""
    };
  }

  const start = clamp(checkpoint.sourceRange.start, 0, segment.text.length);
  const end = clamp(checkpoint.sourceRange.end, start, segment.text.length);

  return {
    before: segment.text.slice(0, start),
    gated: segment.text.slice(start, end),
    after: segment.text.slice(end)
  };
}

export function getCheckpointSource(segment, checkpoint) {
  return splitSegmentByCheckpoint(segment, checkpoint).gated;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}
