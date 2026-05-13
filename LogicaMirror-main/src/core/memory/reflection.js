export const memoryStatuses = ["understood", "partial", "misunderstood"];

export function createMemoryReflection({ checkpointId, status = "partial", note = "" }) {
  return {
    checkpointId,
    status: memoryStatuses.includes(status) ? status : "partial",
    note,
    updatedAt: new Date().toISOString()
  };
}
