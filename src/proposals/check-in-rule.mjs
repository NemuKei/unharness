const dayMs = 24 * 60 * 60 * 1000;
export function checkInDue({ addedAt, tasksSince, now }) {
  const first = Date.parse(addedAt), current = Date.parse(now);
  if (!Number.isFinite(first) || !Number.isFinite(current) || current < first
    || !Number.isSafeInteger(tasksSince) || tasksSince < 0) return false;
  return current - first >= 3 * dayMs || tasksSince >= 5;
}
