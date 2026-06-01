// Per-shelf packers for vertical / horizontal / mixed shelves.
// Each packer takes a shelf, candidate boxes (already assigned by Phase 1),
// and pre-existing pinned placements; returns placements + unplaced.

import {
  Box,
  Placement,
  Settings,
  Shelf,
  UnplacedEntry,
  UUID,
} from "../types.js";
import { maxAllowedChildDepth, resolveDims } from "./geometry.js";

/** Gap between adjacent stacks on a horizontal shelf, in mm. */
const INTER_STACK_GAP_MM = 12;
/** Gap between the standing zone and the stacked zone on a mixed shelf, in mm. */
const ZONE_SEPARATOR_MM = 8;

interface PackArgs {
  shelf: Shelf;
  candidates: Box[];
  pinned: Placement[];
  settings: Settings;
  boxesById: Map<UUID, Box>;
}

interface PackResult {
  placements: Placement[];
  unplaced: UnplacedEntry[];
}

export function packShelf(args: PackArgs): PackResult {
  switch (args.shelf.orientation) {
    case "vertical":
      return packVertical(args, args.shelf.widthMm - args.shelf.paddingReserveMm);
    case "horizontal":
      return packHorizontal(args, args.shelf.widthMm - args.shelf.paddingReserveMm);
    case "mixed":
      return packMixed(args);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertical (standing, spine-out)

function packVertical(args: PackArgs, availWidth: number, xStart = 0): PackResult {
  const { shelf, candidates, pinned } = args;
  const placements: Placement[] = [...pinned.filter((p) => p.orientation === "standing")];
  const unplaced: UnplacedEntry[] = [];

  // Sort by height descending so the tallest box claims the leftmost free slot.
  const sorted = [...candidates].sort((a, b) => {
    const ra = resolveDims(a, "standing");
    const rb = resolveDims(b, "standing");
    if (!ra) return 1;
    if (!rb) return -1;
    return rb.heightOnShelf - ra.heightOnShelf;
  });

  // Build occupancy intervals from pinned standing boxes.
  const occupied: Array<[number, number]> = placements
    .map((p) => [p.positionMm, p.positionMm + p.widthMm] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  for (const box of sorted) {
    const r = resolveDims(box, "standing");
    if (!r) {
      unplaced.push({ boxId: box.id, reason: "missing dimensions" });
      continue;
    }
    if (r.heightOnShelf > shelf.heightMm) {
      unplaced.push({ boxId: box.id, reason: "too tall for this shelf" });
      continue;
    }
    if (r.depthOnShelf > shelf.depthMm) {
      unplaced.push({ boxId: box.id, reason: "too deep for this shelf" });
      continue;
    }
    const slot = firstFit(occupied, xStart, xStart + availWidth, r.widthOnShelf);
    if (slot == null) {
      unplaced.push({ boxId: box.id, reason: "no space on assigned shelf" });
      continue;
    }
    placements.push({
      boxId: box.id,
      shelfId: shelf.id,
      positionMm: slot,
      orientation: "standing",
      forwardFace: r.forwardFace,
      widthMm: r.widthOnShelf,
      heightMm: r.heightOnShelf,
      stackParentBoxId: null,
      pinned: false,
    });
    insertInterval(occupied, [slot, slot + r.widthOnShelf]);
  }

  return { placements, unplaced };
}

/**
 * Post-process pass: on each pure-vertical shelf, repack non-pinned standing
 * placements left-to-right by descending height so the tallest box ends up at
 * the leftmost free slot. Called after the SA local search, which may have
 * reshuffled which boxes sit on which shelf.
 *
 * Mixed and horizontal shelves are passed through untouched.
 */
export function reorderVerticalShelves(placements: Placement[], shelves: Shelf[]): Placement[] {
  const byShelf = new Map<UUID, Placement[]>();
  for (const p of placements) {
    const arr = byShelf.get(p.shelfId) ?? [];
    arr.push(p);
    byShelf.set(p.shelfId, arr);
  }
  const result: Placement[] = [];
  for (const sh of shelves) {
    const onShelf = byShelf.get(sh.id) ?? [];
    if (sh.orientation !== "vertical") {
      result.push(...onShelf);
      continue;
    }
    const pinned = onShelf.filter((p) => p.pinned && p.orientation === "standing");
    const free = onShelf.filter((p) => !p.pinned && p.orientation === "standing");
    const passthrough = onShelf.filter((p) => p.orientation !== "standing");

    free.sort((a, b) => b.heightMm - a.heightMm);

    const occupied: Array<[number, number]> = pinned
      .map((p) => [p.positionMm, p.positionMm + p.widthMm] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    result.push(...pinned, ...passthrough);
    for (const p of free) {
      const slot = firstFit(occupied, 0, sh.widthMm - sh.paddingReserveMm, p.widthMm);
      if (slot == null) {
        result.push(p);
        continue;
      }
      result.push({ ...p, positionMm: slot });
      insertInterval(occupied, [slot, slot + p.widthMm]);
    }
  }
  // Any placements whose shelfId doesn't match a known shelf — preserve them too.
  const knownShelfIds = new Set(shelves.map((s) => s.id));
  for (const p of placements) {
    if (!knownShelfIds.has(p.shelfId)) result.push(p);
  }
  return result;
}

function firstFit(
  occupied: Array<[number, number]>,
  lo: number,
  hi: number,
  width: number,
): number | null {
  let cursor = lo;
  for (const [a, b] of occupied) {
    if (a >= cursor + width) return cursor;
    if (b > cursor) cursor = b;
  }
  if (cursor + width <= hi) return cursor;
  return null;
}

function insertInterval(occupied: Array<[number, number]>, iv: [number, number]) {
  // The array is kept sorted by start position; binary-search the insertion
  // point so each insertion is O(log n) + splice, instead of push + full sort.
  let lo = 0;
  let hi = occupied.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (occupied[mid][0] < iv[0]) lo = mid + 1;
    else hi = mid;
  }
  occupied.splice(lo, 0, iv);
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal (stacked) — base+knapsack composition
//
// Phase 0: reconstruct pinned stacks (fixed x-positions, untouched).
// Phase A: while shelf has room and unplaced candidates exist:
//   • pick the widest candidate that still fits remaining width as the base
//     (tiebreak: deepest, then id)
//   • build a candidate pool of toppers whose W ≤ baseW AND D ≤ baseD
//   • run a 0/1 knapsack on heights to fill the available vertical space
//   • cap to maxStackCount, sort toppers footprint-desc, enforce pairwise
//     pyramid (drop any that don't contain into the previous accepted topper)
//   • compose the StackItems and add to free-stacks
// Phase B: FFD position free stacks (sort by base width desc, first-fit).

type StackItem = {
  boxId: UUID;
  box: Box;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  faceArea: number;
  yMm: number;
  parentId: UUID | null;
  isPinned: boolean;
};

type HStack = {
  baseX: number | null; // null = not yet positioned (free stack)
  baseW: number;
  totalH: number;
  items: StackItem[];
};

function packHorizontal(args: PackArgs, availWidth: number, xStart = 0): PackResult {
  const { shelf, candidates, pinned, settings, boxesById } = args;
  const maxCount = shelf.maxStackCount ?? settings.defaultMaxStackCount;
  const maxStackHeight = shelf.maxStackHeightMm ?? settings.defaultMaxStackHeightMm ?? shelf.heightMm;
  const effectiveStackHeight = Math.min(shelf.heightMm, maxStackHeight);

  // ── Phase 0: reconstruct pinned stacks ──────────────────────────────────────
  const pinnedPlacements = pinned.filter((p) => p.orientation === "stacked");
  const pinnedByX = new Map<number, Placement[]>();
  for (const p of pinnedPlacements) {
    const arr = pinnedByX.get(p.positionMm) ?? [];
    arr.push(p);
    pinnedByX.set(p.positionMm, arr);
  }

  const frozenStacks: HStack[] = [];
  for (const [x, arr] of pinnedByX) {
    arr.sort((a, b) => (a.stackYMm ?? 0) - (b.stackYMm ?? 0));
    const baseW = Math.max(...arr.map((p) => p.widthMm));
    let cumH = 0;
    const items: StackItem[] = arr.map((p, i) => {
      const realBox = boxesById.get(p.boxId);
      const resolved = realBox ? resolveDims(realBox, "stacked", p.forwardFace) : null;
      const faceArea = resolved?.faceArea ?? p.widthMm * p.widthMm;
      const item: StackItem = {
        boxId: p.boxId,
        box: realBox ?? ({ id: p.boxId } as Box),
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        depthMm: resolved?.depthOnShelf ?? 0,
        faceArea,
        yMm: cumH,
        parentId: i === 0 ? null : arr[i - 1].boxId,
        isPinned: true,
      };
      cumH += p.heightMm;
      return item;
    });
    frozenStacks.push({ baseX: x, baseW, totalH: cumH, items });
  }

  // ── Phase A: base + knapsack loop ──────────────────────────────────────────
  // Pre-filter candidates: must have stacked-resolvable dims and fit shelf height/depth.
  const eligible: Array<{ box: Box; r: NonNullable<ReturnType<typeof resolveDims>> }> = [];
  const unplaced: UnplacedEntry[] = [];
  for (const box of candidates) {
    const r = resolveDims(box, "stacked");
    if (!r) {
      unplaced.push({ boxId: box.id, reason: "missing dimensions" });
      continue;
    }
    if (r.heightOnShelf > shelf.heightMm) {
      unplaced.push({ boxId: box.id, reason: "too tall for this shelf" });
      continue;
    }
    if (r.depthOnShelf > shelf.depthMm) {
      unplaced.push({ boxId: box.id, reason: "too deep for this shelf" });
      continue;
    }
    eligible.push({ box, r });
  }

  // Remaining width budget: subtract pinned base widths up front. We don't pre-
  // reserve INTER_STACK_GAP_MM for pin↔free transitions because Phase B handles
  // exact x-positioning; a small over-estimate here at worst loses one trailing
  // free stack to "no space", which SA can recover.
  const consumedByPins = [...pinnedByX.values()].reduce(
    (acc, arr) => acc + Math.max(...arr.map((p) => p.widthMm)),
    0,
  );
  let remainingWidth = Math.max(0, availWidth - consumedByPins);

  const placedIds = new Set<UUID>();
  for (const stk of frozenStacks) for (const it of stk.items) placedIds.add(it.boxId);

  const freeStacks: HStack[] = [];
  let stackCountOnShelf = frozenStacks.length;

  while (remainingWidth > 0) {
    // Find valid bases: not yet placed, width fits remaining budget.
    let bestBase: { box: Box; r: NonNullable<ReturnType<typeof resolveDims>> } | null = null;
    for (const e of eligible) {
      if (placedIds.has(e.box.id)) continue;
      if (e.r.widthOnShelf > remainingWidth) continue;
      if (!bestBase) { bestBase = e; continue; }
      // Widest wins; tiebreak deepest; final tiebreak by id for determinism.
      if (e.r.widthOnShelf > bestBase.r.widthOnShelf) bestBase = e;
      else if (e.r.widthOnShelf === bestBase.r.widthOnShelf) {
        if (e.r.depthOnShelf > bestBase.r.depthOnShelf) bestBase = e;
        else if (e.r.depthOnShelf === bestBase.r.depthOnShelf && e.box.id < bestBase.box.id) bestBase = e;
      }
    }
    if (!bestBase) break;

    const base = bestBase.box;
    const baseR = bestBase.r;
    placedIds.add(base.id);

    // Build topper pool: W ≤ baseW, D ≤ baseD, fits remaining vertical room.
    const availableHeight = effectiveStackHeight - baseR.heightOnShelf;
    const pool: Array<{ box: Box; r: NonNullable<ReturnType<typeof resolveDims>>; h: number }> = [];
    if (availableHeight > 0) {
      for (const e of eligible) {
        if (placedIds.has(e.box.id)) continue;
        if (e.r.widthOnShelf > baseR.widthOnShelf) continue;
        if (e.r.depthOnShelf > maxAllowedChildDepth(baseR.depthOnShelf)) continue;
        if (e.r.heightOnShelf > availableHeight) continue;
        pool.push({ box: e.box, r: e.r, h: e.r.heightOnShelf });
      }
    }

    // Pre-filter the pool to a pyramid-valid chain: sort by footprint area desc
    // (tiebreak W desc, then D desc) and greedily accept each topper whose W AND
    // D fit under the running ceiling. Any subset of this chain — in chain order —
    // is guaranteed to satisfy pairwise W/D containment, so the subsequent
    // knapsack will never pick an item that has to be dropped afterwards.
    pool.sort((a, b) => {
      const areaA = a.r.widthOnShelf * a.r.depthOnShelf;
      const areaB = b.r.widthOnShelf * b.r.depthOnShelf;
      if (areaB !== areaA) return areaB - areaA;
      if (b.r.widthOnShelf !== a.r.widthOnShelf) return b.r.widthOnShelf - a.r.widthOnShelf;
      return b.r.depthOnShelf - a.r.depthOnShelf;
    });
    // The chain tracks the parent (most-recently-accepted) dims. Width must
    // shrink monotonically; depth may grow by up to the configured overhang
    // ratio per link (matches the rule in validate.ts).
    const chain: typeof pool = [];
    let parentW = baseR.widthOnShelf;
    let parentD = baseR.depthOnShelf;
    for (const c of pool) {
      if (c.r.widthOnShelf <= parentW && c.r.depthOnShelf <= maxAllowedChildDepth(parentD)) {
        chain.push(c);
        parentW = c.r.widthOnShelf;
        parentD = c.r.depthOnShelf;
      }
    }

    // 0/1 knapsack over the chain: maximize Σ heights ≤ availableHeight.
    const chosenIdx = knapsackSubset(chain.map((p) => p.h), availableHeight);
    let chosen = chosenIdx.map((i) => chain[i]);

    // maxStackCount cap (base counts as 1): drop shortest toppers until we fit.
    if (maxCount != null) {
      const room = Math.max(0, maxCount - 1);
      if (chosen.length > room) {
        chosen.sort((a, b) => b.h - a.h);
        chosen = chosen.slice(0, room);
      }
    }

    // Place in chain order (footprint area desc). Containment is already
    // guaranteed by the chain filter, so no post-knapsack drop is needed.
    chosen.sort(
      (a, b) =>
        (b.r.widthOnShelf * b.r.depthOnShelf) - (a.r.widthOnShelf * a.r.depthOnShelf),
    );
    const accepted = chosen;

    // Compose StackItems.
    let cumH = baseR.heightOnShelf;
    let parentId: UUID | null = null;
    const items: StackItem[] = [{
      boxId: base.id,
      box: base,
      widthMm: baseR.widthOnShelf,
      heightMm: baseR.heightOnShelf,
      depthMm: baseR.depthOnShelf,
      faceArea: baseR.faceArea,
      yMm: 0,
      parentId: null,
      isPinned: false,
    }];
    parentId = base.id;
    for (const c of accepted) {
      items.push({
        boxId: c.box.id,
        box: c.box,
        widthMm: c.r.widthOnShelf,
        heightMm: c.r.heightOnShelf,
        depthMm: c.r.depthOnShelf,
        faceArea: c.r.faceArea,
        yMm: cumH,
        parentId,
        isPinned: false,
      });
      cumH += c.r.heightOnShelf;
      parentId = c.box.id;
      placedIds.add(c.box.id);
    }

    freeStacks.push({
      baseX: null,
      baseW: baseR.widthOnShelf,
      totalH: cumH,
      items,
    });
    // Consume baseW + one inter-stack gap from the budget (over-conservative by
    // one gap when this is the very first stack on an otherwise-empty shelf).
    remainingWidth -= baseR.widthOnShelf;
    if (stackCountOnShelf > 0) remainingWidth -= INTER_STACK_GAP_MM;
    stackCountOnShelf += 1;
  }

  // Boxes that never got picked or were ineligible for any base/pool → unplaced.
  for (const e of eligible) {
    if (!placedIds.has(e.box.id)) {
      unplaced.push({ boxId: e.box.id, reason: "no space on assigned shelf" });
    }
  }

  // ── Phase B: FFD stack positioning ─────────────────────────────────────────
  const occupied: Array<[number, number]> = frozenStacks
    .map((stk) => [stk.baseX!, stk.baseX! + stk.baseW] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  freeStacks.sort((a, b) => b.baseW - a.baseW);
  const positionedStacks: HStack[] = [...frozenStacks];

  for (const stk of freeStacks) {
    const slot = firstFit(occupied, xStart, xStart + availWidth, stk.baseW);
    if (slot == null) {
      for (const item of stk.items) {
        if (item.isPinned) continue;
        // Don't double-count if it was already marked.
        if (!unplaced.some((u) => u.boxId === item.boxId)) {
          unplaced.push({ boxId: item.boxId, reason: "no space on assigned shelf" });
        }
      }
      continue;
    }
    stk.baseX = slot;
    insertInterval(occupied, [slot, slot + stk.baseW + INTER_STACK_GAP_MM]);
    positionedStacks.push(stk);
  }

  // ── Emit placements ─────────────────────────────────────────────────────────
  const placements: Placement[] = [...pinnedPlacements];
  for (const stk of positionedStacks) {
    if (stk.baseX === null) continue;
    for (const item of stk.items) {
      if (item.isPinned) continue;
      const r = resolveDims(item.box, "stacked");
      placements.push({
        boxId: item.boxId,
        shelfId: shelf.id,
        positionMm: stk.baseX,
        orientation: "stacked",
        forwardFace: r?.forwardFace ?? "wh",
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        stackYMm: item.yMm,
        stackParentBoxId: item.parentId,
        pinned: false,
      });
    }
  }

  return { placements, unplaced };
}

// 0/1 knapsack with value = weight = item height; returns indices of chosen items.
// Capacity is in mm. With ~30 items and capacity ~400 this is ~12k ops + 12KB of
// state — negligible for our workload.
function knapsackSubset(weights: number[], capacity: number): number[] {
  if (capacity <= 0 || weights.length === 0) return [];
  const n = weights.length;
  const dp = new Int32Array(capacity + 1);
  const take: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(capacity + 1));
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    if (w <= 0 || w > capacity) continue;
    for (let c = capacity; c >= w; c--) {
      const candidate = dp[c - w] + w;
      if (candidate > dp[c]) {
        dp[c] = candidate;
        take[i][c] = 1;
      }
    }
  }
  let bestC = 0;
  for (let c = 1; c <= capacity; c++) if (dp[c] > dp[bestC]) bestC = c;
  const chosen: number[] = [];
  let c = bestC;
  for (let i = n - 1; i >= 0; i--) {
    if (take[i][c]) {
      chosen.push(i);
      c -= weights[i];
    }
  }
  return chosen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mixed

function packMixed(args: PackArgs): PackResult {
  const { shelf, candidates, settings } = args;
  const avail = shelf.widthMm - shelf.paddingReserveMm;

  // Partition candidates by best-orientation: those that prefer standing go to standing zone,
  // the rest to stacked.
  const standingCand: Box[] = [];
  const stackedCand: Box[] = [];
  for (const b of candidates) {
    const rs = resolveDims(b, "standing");
    const rh = resolveDims(b, "stacked");
    if (rs && (!rh || rs.faceArea >= rh.faceArea)) standingCand.push(b);
    else if (rh) stackedCand.push(b);
    else standingCand.push(b);
  }

  // Try a few split points; pick the one that minimises wasted space.
  const splits: number[] = [];
  for (let s = Math.round(avail * 0.4); s <= Math.round(avail * 0.7); s += 50) splits.push(s);
  if (splits.length === 0) splits.push(Math.round(avail / 2));

  let best: PackResult | null = null;
  let bestScore = -Infinity;

  for (const split of splits) {
    const standingArgs: PackArgs = { ...args, candidates: standingCand };
    const stackedArgs: PackArgs = { ...args, candidates: stackedCand };
    const standRes = packVertical(standingArgs, split);
    const stackRes = packHorizontal(stackedArgs, avail - split - ZONE_SEPARATOR_MM, split + ZONE_SEPARATOR_MM);

    const standUsed = standRes.placements
      .filter((p) => p.orientation === "standing")
      .reduce((acc, p) => acc + p.widthMm, 0);

    // Collapse stacked placements to one max-width entry per x-position.
    const stackBaseWidths = new Map<number, number>();
    for (const p of stackRes.placements) {
      if (p.orientation !== "stacked") continue;
      stackBaseWidths.set(p.positionMm, Math.max(stackBaseWidths.get(p.positionMm) ?? 0, p.widthMm));
    }
    let stackUsed = 0;
    for (const w of stackBaseWidths.values()) stackUsed += w;
    if (stackBaseWidths.size > 1) stackUsed += (stackBaseWidths.size - 1) * INTER_STACK_GAP_MM;

    const emptyStanding = split - standUsed;
    const emptyStacked = (avail - split) - stackUsed;
    const s = Math.max(emptyStanding, emptyStacked) - 0.2 * Math.abs(emptyStanding - emptyStacked);
    if (s > bestScore) {
      bestScore = s;
      best = {
        placements: [...standRes.placements, ...stackRes.placements],
        unplaced: [...standRes.unplaced, ...stackRes.unplaced],
      };
    }
  }
  return best ?? { placements: [], unplaced: [] };
}
