import { Placement, Shelf, UUID } from "../types.js";

export const UNPLACED_PENALTY = 1e9;

/**
 * Largest contiguous empty width on a single shelf. Builds intervals
 * (standing widths + each stack's base width) in one pass, sorts once,
 * and sweeps for the biggest gap.
 */
export function gapForShelf(shelf: Shelf, placements: Placement[]): number {
  const intervals: Array<[number, number]> = [];
  const stackBases = new Map<number, number>();
  for (const p of placements) {
    if (p.shelfId !== shelf.id) continue;
    if (p.orientation === "standing") {
      intervals.push([p.positionMm, p.positionMm + p.widthMm]);
    } else {
      const cur = stackBases.get(p.positionMm) ?? 0;
      if (p.widthMm > cur) stackBases.set(p.positionMm, p.widthMm);
    }
  }
  for (const [pos, w] of stackBases) intervals.push([pos, pos + w]);
  intervals.sort((a, b) => a[0] - b[0]);

  let best = 0;
  let cursor = 0;
  for (const [a, b] of intervals) {
    if (a > cursor && a - cursor > best) best = a - cursor;
    if (b > cursor) cursor = b;
  }
  const trail = shelf.widthMm - cursor;
  if (trail > best) best = trail;
  return best;
}

/** Per-shelf max gap, keyed by shelfId. */
export function gapsByShelfMm(
  placements: Placement[],
  shelves: Shelf[],
): Map<UUID, number> {
  const out = new Map<UUID, number>();
  for (const sh of shelves) out.set(sh.id, gapForShelf(sh, placements));
  return out;
}

/** Reduce a per-shelf gap map to the global max + the shelf that owns it. */
export function largestGapFromMap(
  gapsByShelf: Map<UUID, number>,
): { largest: number; shelfId: UUID | null } {
  let largest = 0;
  let shelfId: UUID | null = null;
  for (const [id, gap] of gapsByShelf) {
    if (gap > largest) {
      largest = gap;
      shelfId = id;
    }
  }
  return { largest, shelfId };
}

/** Largest contiguous empty width across all shelves. */
export function largestGapMm(
  placements: Placement[],
  shelves: Shelf[],
): { largest: number; shelfId: UUID | null } {
  return largestGapFromMap(gapsByShelfMm(placements, shelves));
}
