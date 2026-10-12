/** Fractional sort key between two neighbours; null means the list edge.
 * Same rule as slot_task() in SQL, used for the optimistic cache update. */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 1024;
  if (before == null) return after! - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

export function neighbourIds(
  ids: number[],
  index: number,
): { beforeId: number | null; afterId: number | null } {
  return {
    beforeId: index > 0 ? ids[index - 1] : null,
    afterId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}
