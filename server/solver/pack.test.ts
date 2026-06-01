import { describe, expect, it } from "vitest";
import { Box, DEFAULT_SETTINGS, Placement, Settings, Shelf, UUID } from "../types.js";
import { packShelf } from "./pack.js";

function makeShelf(overrides: Partial<Shelf> = {}): Shelf {
  return {
    id: "shelf-1",
    cabinetId: "cab-1",
    position: 0,
    widthMm: 1000,
    heightMm: 400,
    depthMm: 300,
    orientation: "horizontal",
    paddingReserveMm: 0,
    maxStackCount: null,
    maxStackHeightMm: null,
    ...overrides,
  };
}

function makeBox(id: string, dims: { w: number; h: number; d: number }, overrides: Partial<Box> = {}): Box {
  return {
    id,
    bggId: null,
    name: id,
    dimensions: dims,
    dimensionsFromBgg: null,
    dimensionsSource: "manual",
    preferredForwardFace: "auto",
    expansionOfBoxId: null,
    bggLastFetchedAt: null,
    ...overrides,
  };
}

function pack(args: {
  shelf: Shelf;
  candidates: Box[];
  pinned?: Placement[];
  settings?: Partial<Settings>;
}) {
  const boxesById = new Map<UUID, Box>();
  for (const b of args.candidates) boxesById.set(b.id, b);
  for (const p of args.pinned ?? []) {
    if (!boxesById.has(p.boxId)) {
      // pinned placements may refer to boxes not in candidates; create stubs
      boxesById.set(p.boxId, makeBox(p.boxId, { w: p.widthMm, h: p.heightMm, d: 50 }));
    }
  }
  return packShelf({
    shelf: args.shelf,
    candidates: args.candidates,
    pinned: args.pinned ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(args.settings ?? {}) },
    boxesById,
  });
}

describe("packHorizontal: base selection", () => {
  it("picks the widest valid candidate as the base", () => {
    // All boxes have same face area; widths differ on the shelf.
    // Auto stacked dims for w=300,h=20,d=200 → widthOnShelf=300 depth=200 h=20.
    // For w=250,h=20,d=240 → widthOnShelf=250 depth=240 h=20.
    // For w=200,h=20,d=200 → widthOnShelf=200 depth=200 h=20.
    const shelf = makeShelf({ widthMm: 400, heightMm: 100, depthMm: 300 });
    const a = makeBox("a", { w: 300, h: 20, d: 200 });
    const b = makeBox("b", { w: 250, h: 20, d: 240 });
    const c = makeBox("c", { w: 200, h: 20, d: 200 });
    const result = pack({ shelf, candidates: [b, c, a] });
    // Shelf is 400mm wide → only the widest (300) base fits since other widths
    // would themselves fit but the widest must be picked first.
    const baseA = result.placements.find((p) => p.boxId === "a" && p.stackParentBoxId === null);
    expect(baseA).toBeDefined();
    expect(baseA?.widthMm).toBe(300);
    // Remaining width 400-300-12gap = 88 mm → not enough for b (250) or c (200).
    // So b and c may stack on top of a OR be unplaced.
    // Confirm at least the widest got placed first.
  });

  it("tiebreaks widest by deepest", () => {
    const shelf = makeShelf({ widthMm: 500, heightMm: 100, depthMm: 300 });
    // Two boxes with identical widthOnShelf=200. One is deeper (depth=250).
    const wide = makeBox("wide", { w: 200, h: 20, d: 150 }); // stacked: w=200 d=150
    const deep = makeBox("deep", { w: 200, h: 20, d: 250 }); // stacked: w=200 d=250
    const result = pack({ shelf, candidates: [wide, deep] });
    // First base picked should be "deep" (deeper tiebreak).
    const bases = result.placements.filter((p) => p.stackParentBoxId === null).sort((a, b) => a.positionMm - b.positionMm);
    expect(bases[0].boxId).toBe("deep");
  });
});

describe("packHorizontal: knapsack vertical fill", () => {
  it("fills available height exactly when an exact subset exists", () => {
    // Shelf height 100, base height 40 → available 60.
    // Toppers: heights 30, 30, 25, 20. Knapsack should pick 30+30=60 exactly.
    const shelf = makeShelf({ widthMm: 300, heightMm: 100, depthMm: 300 });
    const base = makeBox("base", { w: 200, h: 40, d: 200 }); // stacked: w=200 h=40 d=200
    const t1 = makeBox("t1", { w: 100, h: 30, d: 100 });
    const t2 = makeBox("t2", { w: 90, h: 30, d: 90 });
    const t3 = makeBox("t3", { w: 80, h: 25, d: 80 });
    const t4 = makeBox("t4", { w: 80, h: 20, d: 80 });
    const result = pack({ shelf, candidates: [base, t1, t2, t3, t4] });
    const placed = new Set(result.placements.map((p) => p.boxId));
    expect(placed.has("base")).toBe(true);
    expect(placed.has("t1")).toBe(true);
    expect(placed.has("t2")).toBe(true);
    // Stack heights: base 40 + t1 30 + t2 30 = 100 = shelf height exactly.
    const stackTopY = Math.max(
      ...result.placements
        .filter((p) => placed.has(p.boxId))
        .map((p) => (p.stackYMm ?? 0) + p.heightMm),
    );
    expect(stackTopY).toBe(100);
  });

  it("picks the subset with the smallest waste when no exact fit", () => {
    // Available 50 mm, toppers heights [40, 20]. Best subset = [40] (waste 10).
    const shelf = makeShelf({ widthMm: 300, heightMm: 100, depthMm: 300 });
    const base = makeBox("base", { w: 200, h: 50, d: 200 });
    const big = makeBox("big", { w: 100, h: 40, d: 100 });
    const small = makeBox("small", { w: 100, h: 20, d: 100 });
    const result = pack({ shelf, candidates: [base, big, small] });
    const placed = new Set(result.placements.map((p) => p.boxId));
    expect(placed.has("base")).toBe(true);
    expect(placed.has("big")).toBe(true);
    expect(placed.has("small")).toBe(false);
  });
});

describe("packHorizontal: pyramid containment", () => {
  it("excludes candidates whose stacked W or D exceeds the base from its pool", () => {
    // Shelf is narrow so only "base" qualifies as a base (others' W > remaining
    // width after base is placed). Among the leftover candidates, those with
    // W > base.W or D > base.D must NOT appear above base.
    const shelf = makeShelf({ widthMm: 350, heightMm: 200, depthMm: 300 });
    // base stacked auto: sortedDims [300,200,30] → w=300 h=30 d=200.
    const base = makeBox("base", { w: 300, h: 30, d: 200 });
    // smaller stacked: [100,100,30] → w=100 h=30 d=100. Fits in base pool.
    const smaller = makeBox("smaller", { w: 100, h: 30, d: 100 });
    // tooWide stacked: [380,100,30] → w=380. > base.w=300 → excluded from base pool.
    const tooWide = makeBox("tooWide", { w: 380, h: 30, d: 100 });
    // tooDeep stacked: [250,250,30] → w=250 d=250. d=250 > base.d=200 → excluded.
    const tooDeep = makeBox("tooDeep", { w: 250, h: 30, d: 250 });
    const result = pack({ shelf, candidates: [base, smaller, tooWide, tooDeep] });
    const baseP = result.placements.find((p) => p.boxId === "base");
    expect(baseP).toBeDefined();
    const stackBoxes = result.placements
      .filter((p) => p.positionMm === baseP!.positionMm)
      .map((p) => p.boxId);
    expect(stackBoxes).toContain("base");
    expect(stackBoxes).not.toContain("tooWide");
    expect(stackBoxes).not.toContain("tooDeep");
  });

  it("every emitted parent→child stack satisfies W and D containment", () => {
    // Cross-check: regardless of which boxes get picked where, every placement
    // chain in the result must obey the new pyramid rule.
    const shelf = makeShelf({ widthMm: 400, heightMm: 200, depthMm: 300 });
    const candidates = [
      makeBox("a", { w: 200, h: 30, d: 200 }),
      makeBox("b", { w: 150, h: 30, d: 150 }),
      makeBox("c", { w: 140, h: 30, d: 80 }),
      // "d" dims auto-stack as w=180 d=120 (sortedDims [180,120,30]).
      makeBox("d", { w: 120, h: 30, d: 180 }),
    ];
    const result = pack({ shelf, candidates });
    const byId = new Map(result.placements.map((p) => [p.boxId, p]));
    for (const p of result.placements) {
      if (!p.stackParentBoxId) continue;
      const parent = byId.get(p.stackParentBoxId);
      expect(parent).toBeDefined();
      // Recover parent depth from the box (placement doesn't store it).
      const parentBox = candidates.find((b) => b.id === parent!.boxId)!;
      const childBox = candidates.find((b) => b.id === p.boxId)!;
      const ps = [parentBox.dimensions.w, parentBox.dimensions.h, parentBox.dimensions.d].sort((a, b) => b - a);
      const cs = [childBox.dimensions.w, childBox.dimensions.h, childBox.dimensions.d].sort((a, b) => b - a);
      // stacked auto: w = sorted[0], d = sorted[1].
      expect(cs[0]).toBeLessThanOrEqual(ps[0]); // child W ≤ parent W
      expect(cs[1]).toBeLessThanOrEqual(ps[1]); // child D ≤ parent D
    }
  });
});

describe("packHorizontal: pinned stacks", () => {
  it("preserves a pinned stack's x-position and reserves its width", () => {
    const shelf = makeShelf({ widthMm: 500, heightMm: 200, depthMm: 300 });
    // Pinned base at x=100 with width 150.
    const pinnedBase: Placement = {
      boxId: "pinned",
      shelfId: shelf.id,
      positionMm: 100,
      orientation: "stacked",
      forwardFace: "wh",
      widthMm: 150,
      heightMm: 50,
      stackYMm: 0,
      stackParentBoxId: null,
      pinned: true,
    };
    // Candidate that would want the widest base.
    const a = makeBox("a", { w: 200, h: 40, d: 200 });
    const result = pack({
      shelf,
      candidates: [a],
      pinned: [pinnedBase],
    });
    // Pinned placement preserved.
    const pinned = result.placements.find((p) => p.boxId === "pinned")!;
    expect(pinned.positionMm).toBe(100);
    expect(pinned.pinned).toBe(true);
    // a placed somewhere that doesn't overlap pin (x < 100 or x ≥ 250+gap).
    const aPlaced = result.placements.find((p) => p.boxId === "a");
    expect(aPlaced).toBeDefined();
    const aStart = aPlaced!.positionMm;
    const aEnd = aStart + aPlaced!.widthMm;
    const overlap = aStart < 250 && aEnd > 100;
    expect(overlap).toBe(false);
  });
});

describe("packHorizontal: stack count limit", () => {
  it("caps stack to settings.defaultMaxStackCount (base + toppers)", () => {
    const shelf = makeShelf({ widthMm: 300, heightMm: 500, depthMm: 300 });
    const base = makeBox("base", { w: 200, h: 40, d: 200 });
    const toppers = Array.from({ length: 8 }, (_, i) =>
      makeBox(`t${i}`, { w: 150, h: 30, d: 150 }),
    );
    const result = pack({
      shelf,
      candidates: [base, ...toppers],
      settings: { defaultMaxStackCount: 3 }, // base + 2 toppers max
    });
    const baseP = result.placements.find((p) => p.boxId === "base")!;
    const stackBoxes = result.placements.filter((p) => p.positionMm === baseP.positionMm);
    expect(stackBoxes.length).toBeLessThanOrEqual(3);
  });
});
