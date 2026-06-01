// Solver entry. Three phases per impl spec section 5:
//   1. Assignment — pick a shelf per box by remaining width (concentrate fill).
//   2. Per-shelf packing — vertical / horizontal / mixed.
//   3. Local search — random swap/move with feasibility checks.

import {
  AppState,
  Box,
  Layout,
  Placement,
  Settings,
  Shelf,
  UnplacedEntry,
  UUID,
} from "../types.js";
import { uuid } from "../store/persistence.js";
import { hasDims, maxAllowedChildDepth, resolveDims } from "./geometry.js";
import { packShelf, reorderVerticalShelves } from "./pack.js";
import { gapForShelf, gapsByShelfMm, largestGapFromMap } from "./scoring.js";
import { validatePlacement } from "./validate.js";

export interface SolveOptions {
  preservePins: boolean;
  searchIterations?: number;
  /** Optional seed for the Phase 3 PRNG; defaults to a stable hash of the input. */
  seed?: number;
  /** How many post-SA passes try to consolidate by emptying shelves. Default 10. */
  stackMigrationPasses?: number;
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of input state — same boxes/shelves give the same seed. */
function seedFromState(state: AppState): number {
  let h = 2166136261 >>> 0; // FNV-1a
  const consume = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  const boxIds = state.boxes.map((b) => b.id).sort();
  const shelfIds = state.shelves.map((s) => s.id).sort();
  for (const id of boxIds) consume(id);
  consume("|");
  for (const id of shelfIds) consume(id);
  return h >>> 0;
}

export function solve(state: AppState, opts: SolveOptions): Layout {
  const shelves = [...state.shelves].sort((a, b) => {
    const cabA = state.cabinets.find((c) => c.id === a.cabinetId)?.position ?? 0;
    const cabB = state.cabinets.find((c) => c.id === b.cabinetId)?.position ?? 0;
    if (cabA !== cabB) return cabA - cabB;
    return a.position - b.position;
  });

  const pins: Placement[] = opts.preservePins && state.activeLayoutId
    ? (state.layouts.find((l) => l.id === state.activeLayoutId)?.placements.filter((p) => p.pinned) ?? [])
    : [];
  const pinnedBoxIds = new Set(pins.map((p) => p.boxId));

  // Filter to placeable, non-pinned boxes.
  const placeable = state.boxes.filter((b) => hasDims(b) && !pinnedBoxIds.has(b.id));
  const unplacedOverflow: UnplacedEntry[] = state.boxes
    .filter((b) => !hasDims(b))
    .map((b) => ({ boxId: b.id, reason: "missing dimensions" }));

  // Phase 1 — Assignment.
  const assignment = assignBoxesToShelves(placeable, shelves, pins, state);
  for (const u of assignment.unplaced) unplacedOverflow.push(u);

  // Phase 2 — Per-shelf packing.
  const boxesById = new Map<UUID, Box>();
  for (const b of state.boxes) boxesById.set(b.id, b);
  let placements: Placement[] = [...pins.map((p) => ({ ...p, pinned: true }))];
  const unplaced: UnplacedEntry[] = [...unplacedOverflow];
  for (const sh of shelves) {
    const cands = assignment.byShelf.get(sh.id) ?? [];
    const result = packShelf({
      shelf: sh,
      candidates: cands,
      pinned: pins.filter((p) => p.shelfId === sh.id),
      settings: state.settings,
      boxesById,
    });
    // Don't re-add pinned (packShelf already includes them).
    for (const p of result.placements) {
      if (placements.some((x) => x.boxId === p.boxId)) continue;
      placements.push(p);
    }
    for (const u of result.unplaced) unplaced.push(u);
  }

  // Phase 3 — Simulated Annealing local search.
  // Temperature cools geometrically from SA_T0 to ~1, so the solver explores freely
  // early (escaping local optima) and becomes nearly greedy by the end.
  // Uses a seeded PRNG so the same input always produces the same layout.
  const iters = opts.searchIterations ?? 200;
  const SA_T0 = 500;
  const SA_ALPHA = iters > 1 ? Math.pow(1 / SA_T0, 1 / iters) : 1;
  const rng = mulberry32(opts.seed ?? seedFromState(state));
  const shelvesById = new Map<UUID, Shelf>(shelves.map((s) => [s.id, s]));

  const initial = makeLayout(placements, unplaced, shelves);
  let currentLayout = initial.layout;
  let currentGapsByShelf = initial.gapsByShelf;
  let currentScore = scoreLayout(currentLayout);
  let bestLayout = currentLayout;
  let bestScore = currentScore;
  let T = SA_T0;

  for (let i = 0; i < iters; i++) {
    const candidate = tryLocalMove(
      currentLayout,
      currentGapsByShelf,
      state,
      shelves,
      shelvesById,
      boxesById,
      rng,
    );
    if (!candidate) { T *= SA_ALPHA; continue; }
    const s = scoreLayout(candidate.layout);
    const delta = s - currentScore;
    if (delta > 0 || rng() < Math.exp(delta / T)) {
      currentLayout = candidate.layout;
      currentGapsByShelf = candidate.gapsByShelf;
      currentScore = s;
      if (s > bestScore) {
        bestLayout = candidate.layout;
        bestScore = s;
      }
    }
    T *= SA_ALPHA;
  }

  // Phase 4 — shelf-emptying migration pass. Greedy, deterministic: try to
  // relocate every stack on the most-empty source shelf onto other shelves
  // that have room. Only commits if the source ends up fully empty.
  bestLayout = migrateToEmptyShelves(
    bestLayout,
    state,
    shelves,
    shelvesById,
    boxesById,
    opts.stackMigrationPasses ?? 10,
  );

  // Finalize: on every vertical shelf, reorder non-pinned standing placements
  // so the tallest box sits leftmost. SA may have left intra-shelf ordering
  // arbitrary; this pass restores the height-descending sweep.
  bestLayout = {
    ...bestLayout,
    placements: reorderVerticalShelves(bestLayout.placements, shelves),
  };
  return bestLayout;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1

interface AssignmentResult {
  byShelf: Map<UUID, Box[]>;
  unplaced: UnplacedEntry[];
}

function assignBoxesToShelves(
  boxes: Box[],
  shelves: Shelf[],
  pins: Placement[],
  state: AppState,
): AssignmentResult {
  // sort boxes by face area descending (largest first)
  const sorted = [...boxes].sort((a, b) => {
    const ra = resolveDims(a, "standing");
    const rb = resolveDims(b, "standing");
    const fa = ra?.faceArea ?? 0;
    const fb = rb?.faceArea ?? 0;
    return fb - fa;
  });

  // Track per-shelf used width (from pins) and assigned width.
  const usedBy = new Map<UUID, number>();
  for (const sh of shelves) {
    const pinnedW = pins
      .filter((p) => p.shelfId === sh.id && p.orientation === "standing")
      .reduce((acc, p) => acc + p.widthMm, 0);
    usedBy.set(sh.id, pinnedW);
  }
  const byShelf = new Map<UUID, Box[]>();
  for (const sh of shelves) byShelf.set(sh.id, []);
  const unplaced: UnplacedEntry[] = [];

  for (const box of sorted) {
    let bestShelf: Shelf | null = null;
    let bestScore = -Infinity;
    let bestFit: ReturnType<typeof checkFit> | null = null;
    for (const sh of shelves) {
      const fit = checkFit(box, sh, state.settings, usedBy.get(sh.id) ?? 0);
      if (!fit) continue;
      // Prefer shelves with smaller remaining width (concentrate fill).
      const remaining = sh.widthMm - sh.paddingReserveMm - (usedBy.get(sh.id) ?? 0) - fit.widthOnShelf;
      const candidateScore = -remaining;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestShelf = sh;
        bestFit = fit;
      }
    }
    if (!bestShelf) {
      unplaced.push({ boxId: box.id, reason: "no shelf has enough width" });
      continue;
    }
    byShelf.get(bestShelf.id)!.push(box);
    usedBy.set(bestShelf.id, (usedBy.get(bestShelf.id) ?? 0) + bestFit!.widthOnShelf);
  }

  return { byShelf, unplaced };
}

function checkFit(
  box: Box,
  shelf: Shelf,
  settings: Settings,
  used: number,
): { widthOnShelf: number; heightOnShelf: number; depthOnShelf: number; orientation: "standing" | "stacked" } | null {
  const reserve = shelf.paddingReserveMm;
  if (shelf.orientation === "vertical" || shelf.orientation === "mixed") {
    const r = resolveDims(box, "standing");
    if (r && r.heightOnShelf <= shelf.heightMm && r.depthOnShelf <= shelf.depthMm) {
      if (used + r.widthOnShelf <= shelf.widthMm - reserve) {
        return { ...r, orientation: "standing" };
      }
    }
  }
  if (shelf.orientation === "horizontal" || shelf.orientation === "mixed") {
    const r = resolveDims(box, "stacked");
    // The real widthOnShelf (not the height-scaled effWidth below) must fit
    // the shelf's physical width — a 280 mm-wide base on a 200 mm shelf can
    // never sit anywhere on the floor, regardless of stack-budget bookkeeping.
    if (
      r
      && r.heightOnShelf <= shelf.heightMm
      && r.depthOnShelf <= shelf.depthMm
      && r.widthOnShelf <= shelf.widthMm - reserve
    ) {
      // Horizontal shelves stack vertically, so a 50mm-tall box on a 400mm-tall
      // shelf only takes ~1/8 of a column. Compress widthOnShelf by the height
      // ratio so Phase 1 doesn't refuse stackable boxes. Floor at 1/maxStack
      // to avoid pretending infinite stacking; ceil so a single box still
      // reserves ≥ 1mm of bookkeeping.
      const maxStack = shelf.maxStackCount ?? settings.defaultMaxStackCount ?? 4;
      const ratio = Math.max(r.heightOnShelf / shelf.heightMm, 1 / maxStack);
      const effWidth = Math.max(1, Math.ceil(r.widthOnShelf * ratio));
      if (used + effWidth <= shelf.widthMm - reserve) {
        return {
          widthOnShelf: effWidth,
          heightOnShelf: r.heightOnShelf,
          depthOnShelf: r.depthOnShelf,
          orientation: "stacked",
        };
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3

function tryLocalMove(
  layout: Layout,
  gapsCache: Map<UUID, number>,
  state: AppState,
  shelves: Shelf[],
  shelvesById: Map<UUID, Shelf>,
  boxesById: Map<UUID, Box>,
  rng: () => number,
): FeasibleResult | null {
  // SA only relocates standing, non-pinned placements that have no stacked
  // children — moving a base would orphan its toppers on the old shelf, which
  // validatePlacement would always reject (wasted work).
  const stackParents = new Set(
    layout.placements
      .filter((p) => p.stackParentBoxId !== null)
      .map((p) => p.stackParentBoxId as UUID),
  );
  const placeable = layout.placements.filter(
    (p) => !p.pinned && p.orientation === "standing" && !stackParents.has(p.boxId),
  );
  if (placeable.length < 2) return null;

  const op = rng() < 0.5 ? "swap" : "move";

  if (op === "swap") {
    const a = placeable[Math.floor(rng() * placeable.length)];
    const b = placeable[Math.floor(rng() * placeable.length)];
    if (a.shelfId === b.shelfId || a.boxId === b.boxId) return null;
    const aBox = boxesById.get(a.boxId);
    const bBox = boxesById.get(b.boxId);
    const aShelf = shelvesById.get(a.shelfId);
    const bShelf = shelvesById.get(b.shelfId);
    if (!aBox || !bBox || !aShelf || !bShelf) return null;

    // Quick dimension pre-check: does each box physically fit on the other's shelf?
    const aR = resolveDims(aBox, "standing");
    const bR = resolveDims(bBox, "standing");
    if (!aR || !bR) return null;
    if (aR.heightOnShelf > bShelf.heightMm || aR.depthOnShelf > bShelf.depthMm) return null;
    if (bR.heightOnShelf > aShelf.heightMm || bR.depthOnShelf > aShelf.depthMm) return null;

    const proposed = layout.placements.map((p) => {
      if (p.boxId === a.boxId) return { ...p, shelfId: b.shelfId, positionMm: b.positionMm };
      if (p.boxId === b.boxId) return { ...p, shelfId: a.shelfId, positionMm: a.positionMm };
      return p;
    });
    return feasibleLayout(
      layout,
      proposed,
      new Set([a.shelfId, b.shelfId]),
      shelves,
      shelvesById,
      state,
      boxesById,
      gapsCache,
    );
  } else {
    const c = placeable[Math.floor(rng() * placeable.length)];
    const otherShelves = shelves.filter((s) => s.id !== c.shelfId);
    if (otherShelves.length === 0) return null;
    const target = otherShelves[Math.floor(rng() * otherShelves.length)];

    // Quick dimension pre-check before the more expensive feasibility pass.
    const cBox = boxesById.get(c.boxId);
    if (!cBox) return null;
    const cR = resolveDims(cBox, "standing");
    if (!cR) return null;
    if (cR.heightOnShelf > target.heightMm || cR.depthOnShelf > target.depthMm) return null;

    const targetUsed = layout.placements
      .filter((p) => p.shelfId === target.id && p.orientation === c.orientation)
      .reduce((acc, p) => acc + p.widthMm, 0);
    if (targetUsed + c.widthMm > target.widthMm - target.paddingReserveMm) return null;
    const proposed = layout.placements.map((p) =>
      p.boxId === c.boxId ? { ...p, shelfId: target.id, positionMm: targetUsed } : p,
    );
    return feasibleLayout(
      layout,
      proposed,
      new Set([c.shelfId, target.id]),
      shelves,
      shelvesById,
      state,
      boxesById,
      gapsCache,
    );
  }
}

interface FeasibleResult {
  layout: Layout;
  gapsByShelf: Map<UUID, number>;
}

function feasibleLayout(
  base: Layout,
  proposed: Placement[],
  affectedShelfIds: Set<UUID>,
  shelves: Shelf[],
  shelvesById: Map<UUID, Shelf>,
  state: AppState,
  boxesById: Map<UUID, Box>,
  /** If provided, only the affected shelves' gaps are recomputed; others reuse the cache. */
  gapsCache?: Map<UUID, number>,
): FeasibleResult | null {
  // Re-validate only shelves touched by this move — other shelves are unchanged.
  for (const shelfId of affectedShelfIds) {
    const sh = shelvesById.get(shelfId);
    if (!sh) continue;
    const onShelf = proposed.filter((p) => p.shelfId === shelfId);
    for (const p of onShelf) {
      const box = boxesById.get(p.boxId);
      if (!box) return null;
      const err = validatePlacement(p, {
        shelf: sh,
        box,
        settings: state.settings,
        others: onShelf.filter((o) => o.boxId !== p.boxId),
        boxesById,
      });
      if (err) return null;
    }
  }

  // Update per-shelf gap cache. Hot SA path: only recompute affected shelves.
  // Fallback path (migration phase, no cache): compute every shelf from scratch.
  let gapsByShelf: Map<UUID, number>;
  if (gapsCache) {
    gapsByShelf = new Map(gapsCache);
    for (const shelfId of affectedShelfIds) {
      const sh = shelvesById.get(shelfId);
      if (!sh) continue;
      gapsByShelf.set(shelfId, gapForShelf(sh, proposed));
    }
  } else {
    gapsByShelf = gapsByShelfMm(proposed, shelves);
  }
  const { largest, shelfId: gapShelf } = largestGapFromMap(gapsByShelf);

  return {
    layout: {
      ...base,
      placements: proposed,
      metrics: {
        ...base.metrics,
        largestGapMm: largest,
        largestGapShelfId: gapShelf,
        placedCount: proposed.length,
        unplacedCount: base.unplaced.length,
      },
    },
    gapsByShelf,
  };
}

function scoreLayout(layout: Layout): number {
  return -layout.metrics.largestGapMm - 1e9 * layout.unplaced.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — shelf-emptying migration pass.
//
// For each pass (up to `maxPasses`): walk shelves by ascending occupancy
// (least-occupied first — easiest to drain). For each non-empty, no-pinned
// source shelf, try to relocate every one of its stacks onto another shelf,
// either by (A) finding a free interval on the floor or (B) attaching the
// whole source stack on top of an existing target stack as a new chain of
// toppers. Only commit if every stack on the source finds a home — partial
// drains aren't worth the shuffle. Stops early when a pass moves nothing.
//
// Determinism: no Math.random. Sources sorted by (occupancy, id). Targets
// walked in shelf-position order. Free-interval search picks the leftmost
// gap that fits. Stack-on-stack walks existing target stacks left-to-right
// and takes the first one whose top can host the source's base under the
// pyramid rule (W strict, D within 10%) plus per-shelf stack count/height.

function migrateToEmptyShelves(
  layout: Layout,
  state: AppState,
  shelves: Shelf[],
  shelvesById: Map<UUID, Shelf>,
  boxesById: Map<UUID, Box>,
  maxPasses: number,
): Layout {
  if (maxPasses <= 0) return layout;
  let current = layout;
  for (let pass = 0; pass < maxPasses; pass++) {
    const occupancyOf = (shelfId: UUID) =>
      current.placements.filter((p) => p.shelfId === shelfId).length;
    const sources = shelves
      .filter((s) => occupancyOf(s.id) > 0)
      .filter((s) => !current.placements.some((p) => p.shelfId === s.id && p.pinned))
      .sort((a, b) => {
        const oa = occupancyOf(a.id);
        const ob = occupancyOf(b.id);
        if (oa !== ob) return oa - ob;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

    let didMove = false;
    for (const source of sources) {
      const proposed = tryEmptyShelf(current, source, shelves, shelvesById, state, boxesById);
      if (proposed) {
        current = proposed;
        didMove = true;
        break; // restart pass with refreshed occupancy
      }
    }
    if (!didMove) break;
  }
  return current;
}

function tryEmptyShelf(
  layout: Layout,
  source: Shelf,
  shelves: Shelf[],
  shelvesById: Map<UUID, Shelf>,
  state: AppState,
  boxesById: Map<UUID, Box>,
): Layout | null {
  const sourcePlacements = layout.placements.filter((p) => p.shelfId === source.id);
  if (sourcePlacements.length === 0) return null;

  // A source stack — moves as a single rigid unit (base + toppers).
  // positionMm stays shared across the stack; internal stackYMm/parent links
  // are preserved when relocating to a floor slot, and shifted up uniformly
  // when attaching on top of an existing target stack.
  type SourceStack = {
    baseX: number;
    baseBoxId: UUID;
    baseWidthMm: number;
    baseDepthMm: number;
    depthMm: number;     // max depth across all items (for shelf-fit)
    heightMm: number;    // total height of the stack (top y above floor)
    itemCount: number;
    items: Placement[];
    // Topmost item: where new toppers (or future merged stacks) would attach.
    topBoxId: UUID;
    topWidthMm: number;
    topDepthMm: number;
    allStacked: boolean;
  };
  const sourceStacks = buildSourceStacks(sourcePlacements, boxesById);
  if (sourceStacks == null) return null;
  sourceStacks.sort((a, b) => {
    if (b.baseWidthMm !== a.baseWidthMm) return b.baseWidthMm - a.baseWidthMm;
    return a.baseX - b.baseX;
  });

  // Working state per other shelf: occupied x-intervals AND existing stacks
  // (so stack-on-stack landings can chain within the same pass).
  type TargetStack = {
    positionMm: number;
    baseWidthMm: number;
    topBoxId: UUID;
    topWidthMm: number;
    topDepthMm: number;
    topY: number;
    itemCount: number;
    allStacked: boolean;
  };
  type TargetState = {
    intervals: Array<[number, number]>;
    stacks: TargetStack[];
  };
  // Bucket placements by shelfId in a single O(N) pass so each target state
  // build runs in O(K_target) instead of re-scanning the whole placement list.
  const placementsByShelfId = new Map<UUID, Placement[]>();
  for (const p of layout.placements) {
    const arr = placementsByShelfId.get(p.shelfId);
    if (arr) arr.push(p);
    else placementsByShelfId.set(p.shelfId, [p]);
  }
  const stateByTarget = new Map<UUID, TargetState>();
  for (const sh of shelves) {
    if (sh.id === source.id) continue;
    stateByTarget.set(
      sh.id,
      buildTargetState(placementsByShelfId.get(sh.id) ?? [], boxesById),
    );
  }

  type Move =
    | { kind: "floor"; stack: SourceStack; targetId: UUID; newX: number }
    | {
        kind: "ontop";
        stack: SourceStack;
        targetId: UUID;
        targetStack: TargetStack;
        baseYOffset: number;
        /** Snapshot of the target stack's topBoxId at match time. We can't
         *  read it lazily off targetStack because the working-state mutation
         *  below overwrites it for downstream source-stack matches in the
         *  same pass — and a 1-item source stack with topBoxId === its base
         *  would then make the source base its own stackParentBoxId, creating
         *  a self-loop in validation. */
        targetTopBoxId: UUID;
      };
  const moves: Move[] = [];

  const otherShelves = shelves.filter((s) => s.id !== source.id);
  for (const stack of sourceStacks) {
    let placed = false;
    for (const T of otherShelves) {
      // Orientation gating — shelves only accept compatible items.
      if (T.orientation === "vertical" && stack.items.some((p) => p.orientation === "stacked")) continue;
      if (T.orientation === "horizontal" && stack.items.some((p) => p.orientation === "standing")) continue;
      if (T.depthMm < stack.depthMm) continue;
      const ts = stateByTarget.get(T.id)!;

      // Option A — floor slot.
      if (T.heightMm >= stack.heightMm) {
        const slot = findLeftmostSlot(
          ts.intervals,
          T.paddingReserveMm,
          T.widthMm - T.paddingReserveMm,
          stack.baseWidthMm,
        );
        if (slot != null) {
          moves.push({ kind: "floor", stack, targetId: T.id, newX: slot });
          ts.intervals.push([slot, slot + stack.baseWidthMm]);
          ts.intervals.sort((a, b) => a[0] - b[0]);
          ts.stacks.push({
            positionMm: slot,
            baseWidthMm: stack.baseWidthMm,
            topBoxId: stack.topBoxId,
            topWidthMm: stack.topWidthMm,
            topDepthMm: stack.topDepthMm,
            topY: stack.heightMm,
            itemCount: stack.itemCount,
            allStacked: stack.allStacked,
          });
          ts.stacks.sort((a, b) => a.positionMm - b.positionMm);
          placed = true;
          break;
        }
      }

      // Option B — stack on top of an existing target stack. Source items
      // must all be `stacked`, since the merged column lives in horizontal
      // shelf semantics (toppers stack vertically above a base).
      if (!stack.allStacked) continue;
      const countLimit = T.maxStackCount ?? state.settings.defaultMaxStackCount;
      const heightLimit = T.maxStackHeightMm ?? state.settings.defaultMaxStackHeightMm;
      let ontopMatch: TargetStack | null = null;
      for (const ex of ts.stacks) {
        if (!ex.allStacked) continue;
        if (stack.baseWidthMm > ex.topWidthMm) continue;
        if (stack.baseDepthMm > maxAllowedChildDepth(ex.topDepthMm)) continue;
        const mergedTop = ex.topY + stack.heightMm;
        if (mergedTop > T.heightMm) continue;
        if (heightLimit != null && mergedTop > heightLimit) continue;
        const mergedCount = ex.itemCount + stack.itemCount;
        if (countLimit != null && mergedCount > countLimit) continue;
        ontopMatch = ex;
        break;
      }
      if (ontopMatch) {
        moves.push({
          kind: "ontop",
          stack,
          targetId: T.id,
          targetStack: ontopMatch,
          baseYOffset: ontopMatch.topY,
          targetTopBoxId: ontopMatch.topBoxId,
        });
        // Grow the existing stack in our working state so later source stacks
        // in this pass see the updated top.
        ontopMatch.topY += stack.heightMm;
        ontopMatch.itemCount += stack.itemCount;
        ontopMatch.topBoxId = stack.topBoxId;
        ontopMatch.topWidthMm = stack.topWidthMm;
        ontopMatch.topDepthMm = stack.topDepthMm;
        placed = true;
        break;
      }
    }
    if (!placed) return null; // can't fully empty this source
  }

  // Apply moves to build the proposed placement list.
  type Override = {
    shelfId: UUID;
    positionMm: number;
    stackYMm?: number;
    stackParentBoxId?: UUID | null;
  };
  const overrideByBoxId = new Map<UUID, Override>();
  for (const m of moves) {
    if (m.kind === "floor") {
      for (const it of m.stack.items) {
        overrideByBoxId.set(it.boxId, { shelfId: m.targetId, positionMm: m.newX });
      }
    } else {
      for (const it of m.stack.items) {
        const newY = (it.stackYMm ?? 0) + m.baseYOffset;
        const isBase = it.boxId === m.stack.baseBoxId;
        overrideByBoxId.set(it.boxId, {
          shelfId: m.targetId,
          positionMm: m.targetStack.positionMm,
          stackYMm: newY,
          stackParentBoxId: isBase ? m.targetTopBoxId : it.stackParentBoxId,
        });
      }
    }
  }
  const proposed = layout.placements.map((p) => {
    const o = overrideByBoxId.get(p.boxId);
    if (!o) return p;
    return { ...p, ...o };
  });

  // Only commit if this strictly reduces the count of non-empty shelves —
  // otherwise we'd just swap an empty shelf for a different empty one
  // (or thrash the same stack back and forth between two empties).
  const beforeNonEmpty = countNonEmptyShelves(layout.placements, shelves);
  const afterNonEmpty = countNonEmptyShelves(proposed, shelves);
  if (afterNonEmpty >= beforeNonEmpty) return null;

  const affectedShelfIds = new Set([source.id, ...moves.map((m) => m.targetId)]);
  const result = feasibleLayout(
    layout,
    proposed,
    affectedShelfIds,
    shelves,
    shelvesById,
    state,
    boxesById,
  );
  return result ? result.layout : null;
}

/** Group source-shelf placements into stacks (one per base x position). */
function buildSourceStacks(
  sourcePlacements: Placement[],
  boxesById: Map<UUID, Box>,
): Array<{
  baseX: number;
  baseBoxId: UUID;
  baseWidthMm: number;
  baseDepthMm: number;
  depthMm: number;
  heightMm: number;
  itemCount: number;
  items: Placement[];
  topBoxId: UUID;
  topWidthMm: number;
  topDepthMm: number;
  allStacked: boolean;
}> | null {
  const groupsByX = new Map<number, Placement[]>();
  for (const p of sourcePlacements) {
    const arr = groupsByX.get(p.positionMm) ?? [];
    arr.push(p);
    groupsByX.set(p.positionMm, arr);
  }
  const out = [];
  for (const [baseX, items] of groupsByX.entries()) {
    const base = items.find((p) => p.stackParentBoxId === null);
    if (!base) return null;
    const baseBox = boxesById.get(base.boxId);
    if (!baseBox) return null;
    const baseR = resolveDims(baseBox, base.orientation, base.forwardFace);
    if (!baseR) return null;
    const referenced = new Set(
      items.map((p) => p.stackParentBoxId).filter((x): x is string => !!x),
    );
    const topItem = items.find((p) => !referenced.has(p.boxId)) ?? base;
    const topBox = boxesById.get(topItem.boxId);
    const topR = topBox ? resolveDims(topBox, topItem.orientation, topItem.forwardFace) : null;
    if (!topR) return null;
    let depthMm = 0;
    let heightMm = 0;
    for (const it of items) {
      const box = boxesById.get(it.boxId);
      const r = box ? resolveDims(box, it.orientation, it.forwardFace) : null;
      if (r && r.depthOnShelf > depthMm) depthMm = r.depthOnShelf;
      const top = (it.stackYMm ?? 0) + it.heightMm;
      if (top > heightMm) heightMm = top;
    }
    out.push({
      baseX,
      baseBoxId: base.boxId,
      baseWidthMm: baseR.widthOnShelf,
      baseDepthMm: baseR.depthOnShelf,
      depthMm,
      heightMm,
      itemCount: items.length,
      items,
      topBoxId: topItem.boxId,
      topWidthMm: topR.widthOnShelf,
      topDepthMm: topR.depthOnShelf,
      allStacked: items.every((p) => p.orientation === "stacked"),
    });
  }
  return out;
}

/** Build per-target working state: occupied intervals + existing stacks. */
function buildTargetState(
  shelfPlacements: Placement[],
  boxesById: Map<UUID, Box>,
): {
  intervals: Array<[number, number]>;
  stacks: Array<{
    positionMm: number;
    baseWidthMm: number;
    topBoxId: UUID;
    topWidthMm: number;
    topDepthMm: number;
    topY: number;
    itemCount: number;
    allStacked: boolean;
  }>;
} {
  const intervals: Array<[number, number]> = [];
  const stacks: Array<{
    positionMm: number;
    baseWidthMm: number;
    topBoxId: UUID;
    topWidthMm: number;
    topDepthMm: number;
    topY: number;
    itemCount: number;
    allStacked: boolean;
  }> = [];
  const groupsByX = new Map<number, Placement[]>();
  for (const p of shelfPlacements) {
    const arr = groupsByX.get(p.positionMm) ?? [];
    arr.push(p);
    groupsByX.set(p.positionMm, arr);
  }
  for (const [posX, items] of groupsByX.entries()) {
    const base = items.find((p) => p.stackParentBoxId === null);
    if (!base) continue;
    intervals.push([base.positionMm, base.positionMm + base.widthMm]);
    const referenced = new Set(
      items.map((p) => p.stackParentBoxId).filter((x): x is string => !!x),
    );
    const topItem = items.find((p) => !referenced.has(p.boxId)) ?? base;
    const topBox = boxesById.get(topItem.boxId);
    const topR = topBox ? resolveDims(topBox, topItem.orientation, topItem.forwardFace) : null;
    if (!topR) continue;
    stacks.push({
      positionMm: posX,
      baseWidthMm: base.widthMm,
      topBoxId: topItem.boxId,
      topWidthMm: topR.widthOnShelf,
      topDepthMm: topR.depthOnShelf,
      topY: (topItem.stackYMm ?? 0) + topItem.heightMm,
      itemCount: items.length,
      allStacked: items.every((p) => p.orientation === "stacked"),
    });
  }
  intervals.sort((a, b) => a[0] - b[0]);
  stacks.sort((a, b) => a.positionMm - b.positionMm);
  return { intervals, stacks };
}

function countNonEmptyShelves(placements: Placement[], shelves: Shelf[]): number {
  let n = 0;
  for (const sh of shelves) {
    if (placements.some((p) => p.shelfId === sh.id)) n++;
  }
  return n;
}

/** First-fit slot search: leftmost gap in [lo, hi] wide enough for `width`. */
function findLeftmostSlot(
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

function makeLayout(
  placements: Placement[],
  unplaced: UnplacedEntry[],
  shelves: Shelf[],
): { layout: Layout; gapsByShelf: Map<UUID, number> } {
  const gapsByShelf = gapsByShelfMm(placements, shelves);
  const { largest, shelfId } = largestGapFromMap(gapsByShelf);
  return {
    layout: {
      id: uuid(),
      name: "Current arrangement",
      createdAt: new Date().toISOString(),
      placements,
      unplaced,
      metrics: {
        largestGapMm: largest,
        largestGapShelfId: shelfId,
        placedCount: placements.length,
        unplacedCount: unplaced.length,
      },
    },
    gapsByShelf,
  };
}
