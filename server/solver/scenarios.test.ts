// End-to-end solver scenarios for the base+knapsack horizontal stacking
// algorithm. Each test drives `solve()` against a hand-crafted AppState and
// asserts both the legality of every placement and the qualitative outcome
// (boxes are actually stacked, density is sensible, the pyramid rule holds).

import { describe, expect, it } from "vitest";
import {
  AppState,
  Box,
  Cabinet,
  DEFAULT_SETTINGS,
  Placement,
  Settings,
  Shelf,
  UUID,
} from "../types.js";
import { maxAllowedChildDepth, resolveDims } from "./geometry.js";
import { solve } from "./index.js";
import { validatePlacement } from "./validate.js";

function makeBox(
  id: string,
  dims: { w: number; h: number; d: number },
  overrides: Partial<Box> = {},
): Box {
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

function makeShelf(id: string, overrides: Partial<Shelf> = {}): Shelf {
  return {
    id,
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

function makeState(args: {
  shelves: Shelf[];
  boxes: Box[];
  settings?: Partial<Settings>;
}): AppState {
  const cabinet: Cabinet = {
    id: "cab-1",
    name: "Test",
    position: 0,
    shelfIds: args.shelves.map((s) => s.id),
  };
  return {
    cabinets: [cabinet],
    shelves: args.shelves,
    boxes: args.boxes,
    layouts: [],
    activeLayoutId: null,
    settings: { ...DEFAULT_SETTINGS, ...(args.settings ?? {}) },
  };
}

// Assert that every placement in a layout is valid when re-checked against the
// same shelf and its co-placements. This catches: bounds violations, overlap,
// stale parent links, pyramid-rule violations, etc.
function assertLayoutIsValid(state: AppState, placements: Placement[]) {
  const boxesById = new Map<UUID, Box>();
  for (const b of state.boxes) boxesById.set(b.id, b);
  for (const sh of state.shelves) {
    const onShelf = placements.filter((p) => p.shelfId === sh.id);
    for (const p of onShelf) {
      const box = boxesById.get(p.boxId);
      expect(box, `placement references unknown box ${p.boxId}`).toBeDefined();
      const err = validatePlacement(p, {
        shelf: sh,
        box: box!,
        settings: state.settings,
        others: onShelf.filter((o) => o.boxId !== p.boxId),
        boxesById,
      });
      expect(err, `placement ${p.boxId} on shelf ${sh.id} failed validation: ${err?.message}`).toBeNull();
    }
  }
}

describe("solve(): horizontal shelf — basic stacking", () => {
  it("places ten small boxes on a single 1000mm-wide horizontal shelf by stacking", () => {
    // A horizontal shelf 1000mm × 400mm × 300mm. Ten identical 200×40×200 boxes.
    // Placed side-by-side they take 10 × 200 + 9 × 12 (gaps) = 2108 mm — won't fit.
    // Stacked, ten 40mm boxes in one column = 400 mm — fits in one stack.
    // Across the shelf width we can fit 4–5 columns. The packer must NOT leave
    // 5+ boxes unplaced just because they wouldn't fit edge-to-edge.
    const shelf = makeShelf("shelf", {
      widthMm: 1000,
      heightMm: 400,
      depthMm: 300,
    });
    const boxes = Array.from({ length: 10 }, (_, i) =>
      makeBox(`b${i}`, { w: 200, h: 40, d: 200 }),
    );
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    expect(layout.placements.length).toBe(10);
    expect(layout.unplaced.length).toBe(0);

    // At least one stack must contain ≥ 2 boxes — otherwise we're not actually
    // stacking, we're just packing edge-to-edge (which wouldn't fit 10 boxes).
    const byX = new Map<number, number>();
    for (const p of layout.placements) {
      byX.set(p.positionMm, (byX.get(p.positionMm) ?? 0) + 1);
    }
    const tallestStack = Math.max(...byX.values());
    expect(tallestStack, "expected ≥ 2 boxes in at least one stack").toBeGreaterThanOrEqual(2);
  });

  it("respects shelf height when picking toppers (no stack exceeds shelf height)", () => {
    const shelf = makeShelf("shelf", { widthMm: 600, heightMm: 200, depthMm: 300 });
    // Base 200×60×200 plus toppers that — if all stacked — exceed 200.
    const boxes = [
      makeBox("base", { w: 200, h: 60, d: 200 }),
      makeBox("t1", { w: 150, h: 80, d: 150 }),
      makeBox("t2", { w: 120, h: 70, d: 120 }),
      makeBox("t3", { w: 100, h: 50, d: 100 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    // Top of every stack ≤ shelf height.
    const stacks = new Map<number, Placement[]>();
    for (const p of layout.placements) {
      const arr = stacks.get(p.positionMm) ?? [];
      arr.push(p);
      stacks.set(p.positionMm, arr);
    }
    for (const arr of stacks.values()) {
      const top = Math.max(...arr.map((p) => (p.stackYMm ?? 0) + p.heightMm));
      expect(top).toBeLessThanOrEqual(shelf.heightMm);
    }
  });
});

describe("solve(): horizontal shelf — pyramid rule", () => {
  it("never emits a child→parent stack that violates W/D containment", () => {
    // Build a deliberately tricky set: same face area but different W/D, plus
    // wider-but-shallower toppers that the old face-area rule would have allowed.
    const shelf = makeShelf("shelf", {
      widthMm: 1200,
      heightMm: 300,
      depthMm: 300,
    });
    const boxes = [
      makeBox("A", { w: 280, h: 40, d: 280 }), // big square base
      makeBox("B", { w: 250, h: 40, d: 250 }),
      makeBox("C", { w: 200, h: 40, d: 200 }),
      makeBox("D", { w: 150, h: 40, d: 150 }),
      // E has area 200·150 = 30000, smaller than A — but W=200 ok, D=150 ok.
      makeBox("E", { w: 200, h: 40, d: 150 }),
      // F: would slip past the old face-area rule if stacked under A (160·160=25600).
      // Under W/D rule, anything below 280 W AND 280 D is legal.
      makeBox("F", { w: 160, h: 40, d: 160 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 50 });
    assertLayoutIsValid(state, layout.placements);

    // Cross-check every parent → child pair in the result.
    const byBox = new Map<UUID, Box>();
    for (const b of state.boxes) byBox.set(b.id, b);
    const placementByBox = new Map<UUID, Placement>();
    for (const p of layout.placements) placementByBox.set(p.boxId, p);
    for (const p of layout.placements) {
      if (!p.stackParentBoxId) continue;
      const parent = placementByBox.get(p.stackParentBoxId);
      expect(parent, `dangling stack parent for ${p.boxId}`).toBeDefined();
      const childR = resolveDims(byBox.get(p.boxId)!, "stacked", p.forwardFace);
      const parentR = resolveDims(byBox.get(parent!.boxId)!, "stacked", parent!.forwardFace);
      expect(childR!.widthOnShelf).toBeLessThanOrEqual(parentR!.widthOnShelf);
      expect(childR!.depthOnShelf).toBeLessThanOrEqual(maxAllowedChildDepth(parentR!.depthOnShelf));
    }
  });

  it("does NOT stack a wider-but-shorter box on a deeper-but-narrower base", () => {
    // Old face-area rule would have allowed this; the new W/D rule must reject.
    // A: stacked auto → w=200 d=150 h=40. B: w=180 d=180 h=40. Neither contains
    // the other (B.D=180 > A.D=150 and A.W=200 > B.W=180). So they cannot share
    // a stack — must be two separate stacks.
    const shelf = makeShelf("shelf", {
      widthMm: 1000,
      heightMm: 400,
      depthMm: 300,
    });
    const boxes = [
      makeBox("A", { w: 200, h: 40, d: 150 }),
      makeBox("B", { w: 180, h: 40, d: 180 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const a = layout.placements.find((p) => p.boxId === "A");
    const b = layout.placements.find((p) => p.boxId === "B");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Different x-positions ⇒ separate stacks.
    expect(a!.positionMm).not.toBe(b!.positionMm);
    // Neither stacks on the other.
    expect(a!.stackParentBoxId).toBeNull();
    expect(b!.stackParentBoxId).toBeNull();
  });
});

describe("solve(): horizontal shelf — knapsack fill quality", () => {
  it("picks an exact-height subset when one exists", () => {
    // Shelf 200mm tall. Base 50mm. Available height for toppers = 150mm.
    // Toppers all share the same 100×100 footprint so pyramid containment is
    // trivially satisfied — that isolates the property under test (knapsack
    // finds an exact-fit subset) from interactions with the pyramid rule.
    // Heights: 30, 40, 60, 80, 90. Exact-fit subsets summing to 150:
    //   {90, 60}, {80, 40, 30}, {60, 60+anything?} → multiple options.
    const shelf = makeShelf("shelf", {
      widthMm: 500,
      heightMm: 200,
      depthMm: 300,
    });
    const boxes = [
      makeBox("base", { w: 200, h: 50, d: 200 }),
      makeBox("t30", { w: 100, h: 30, d: 100 }),
      makeBox("t40", { w: 100, h: 40, d: 100 }),
      makeBox("t60", { w: 100, h: 60, d: 100 }),
      makeBox("t80", { w: 100, h: 80, d: 100 }),
      makeBox("t90", { w: 100, h: 90, d: 100 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    // Find the stack rooted at "base" and confirm its top reaches exactly 200.
    const baseP = layout.placements.find((p) => p.boxId === "base");
    expect(baseP).toBeDefined();
    const onSameStack = layout.placements.filter((p) => p.positionMm === baseP!.positionMm);
    const top = Math.max(...onSameStack.map((p) => (p.stackYMm ?? 0) + p.heightMm));
    expect(top).toBe(200);
  });

  it("places at least one topper when one would fit", () => {
    // Smoke test: with a base 200×40×200 and one topper 100×30×100, the topper
    // MUST get stacked on the base (not left side-by-side or unplaced).
    const shelf = makeShelf("shelf", {
      widthMm: 1000,
      heightMm: 100,
      depthMm: 300,
    });
    const boxes = [
      makeBox("base", { w: 200, h: 40, d: 200 }),
      makeBox("top", { w: 100, h: 30, d: 100 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const baseP = layout.placements.find((p) => p.boxId === "base");
    const topP = layout.placements.find((p) => p.boxId === "top");
    expect(baseP).toBeDefined();
    expect(topP).toBeDefined();
    expect(topP!.stackParentBoxId).toBe("base");
    expect(topP!.positionMm).toBe(baseP!.positionMm);
  });
});

describe("solve(): horizontal shelf — multi-stack layout", () => {
  it("produces multiple stacks when no single base can contain everything", () => {
    // Two bases that can't contain each other; smaller toppers should split
    // between them rather than all piling onto one.
    const shelf = makeShelf("shelf", {
      widthMm: 1000,
      heightMm: 200,
      depthMm: 300,
    });
    const boxes = [
      makeBox("baseA", { w: 250, h: 40, d: 200 }),
      makeBox("baseB", { w: 230, h: 40, d: 220 }), // neither contains the other
      makeBox("t1", { w: 150, h: 50, d: 150 }),
      makeBox("t2", { w: 140, h: 50, d: 140 }),
      makeBox("t3", { w: 130, h: 50, d: 130 }),
      makeBox("t4", { w: 120, h: 50, d: 120 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const baseXs = new Set(
      layout.placements.filter((p) => p.stackParentBoxId === null).map((p) => p.positionMm),
    );
    expect(baseXs.size, "expected at least two distinct stack bases").toBeGreaterThanOrEqual(2);
  });
});

describe("solve(): horizontal shelf — assignment density", () => {
  it("does not leave a stackable box unplaced when one shelf could hold all by stacking", () => {
    // REGRESSION GUARD for the assignment-phase under-counting bug:
    // Phase 1 sums widthOnShelf greedily; if it treats horizontal shelves as
    // edge-to-edge it will refuse to assign boxes that would happily stack.
    //
    // Shelf 800mm × 400mm × 300mm. Six boxes 250×40×250 each. Edge-to-edge
    // they're 6×250 + 5×12 = 1560 mm — won't fit horizontally. Stacked, all
    // 6 fit in one column 240 mm tall × 250 mm wide.
    const shelf = makeShelf("shelf", {
      widthMm: 800,
      heightMm: 400,
      depthMm: 300,
    });
    const boxes = Array.from({ length: 6 }, (_, i) =>
      makeBox(`b${i}`, { w: 250, h: 40, d: 250 }),
    );
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    expect(layout.unplaced.map((u) => u.boxId)).toEqual([]);
    expect(layout.placements.length).toBe(6);
  });
});

describe("solve(): horizontal vs vertical shelf routing", () => {
  it("never stacks anything on a vertical shelf", () => {
    const shelf = makeShelf("shelf", {
      orientation: "vertical",
      widthMm: 1000,
      heightMm: 350,
      depthMm: 300,
    });
    const boxes = [
      makeBox("a", { w: 150, h: 300, d: 200 }),
      makeBox("b", { w: 150, h: 300, d: 200 }),
      makeBox("c", { w: 150, h: 300, d: 200 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    for (const p of layout.placements) {
      expect(p.orientation).toBe("standing");
      expect(p.stackParentBoxId).toBeNull();
    }
  });
});

describe("solve(): horizontal-stacks fixture", () => {
  it("places every box and builds at least one multi-box stack on the demo fixture", async () => {
    // Lock the demo fixture's behavior: every box must be placed (nothing
    // unplaced) and the solver must actually stack — at least one column with
    // ≥ 3 boxes — so the fixture stays a meaningful demonstration of the
    // stacking algorithm.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(
      path.join(here, "..", "..", "fixtures", "horizontal-stacks.json"),
      "utf8",
    );
    const fixture = JSON.parse(raw) as { state: AppState };
    const layout = solve(fixture.state, { preservePins: false, searchIterations: 50 });
    assertLayoutIsValid(fixture.state, layout.placements);
    expect(layout.unplaced).toEqual([]);
    expect(layout.placements.length).toBe(fixture.state.boxes.length);
    const perColumn = new Map<number, number>();
    for (const p of layout.placements) {
      perColumn.set(p.positionMm, (perColumn.get(p.positionMm) ?? 0) + 1);
    }
    const tallest = Math.max(...perColumn.values());
    expect(tallest, "expected at least one stack of 3+ boxes").toBeGreaterThanOrEqual(3);
  });
});

describe("solve(): 10% depth overhang tolerance", () => {
  it("stacks a topper whose depth is exactly 10% over the parent's", () => {
    // Base 400×40×200 → stacked: width=400, depth=200, height=40.
    // Topper 350×40×220 → stacked: width=350, depth=220, height=40.
    // depth 220 = floor(200 × 1.10) = exactly the tolerance limit.
    // Base width (400) > topper width (350) so role-assignment is unambiguous.
    const shelf = makeShelf("shelf", { widthMm: 1000, heightMm: 200, depthMm: 300 });
    const boxes = [
      makeBox("base", { w: 400, h: 40, d: 200 }),
      makeBox("topper", { w: 350, h: 40, d: 220 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const topper = layout.placements.find((p) => p.boxId === "topper");
    expect(topper).toBeDefined();
    expect(topper!.stackParentBoxId).toBe("base");
  });

  it("refuses to stack a topper whose depth exceeds the 10% tolerance", () => {
    // Same setup, but topper depth 221 > floor(200 × 1.10) = 220 → rejected.
    // Topper ends up in a separate column.
    const shelf = makeShelf("shelf", { widthMm: 1000, heightMm: 200, depthMm: 300 });
    const boxes = [
      makeBox("base", { w: 400, h: 40, d: 200 }),
      makeBox("topper", { w: 350, h: 40, d: 221 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const base = layout.placements.find((p) => p.boxId === "base");
    const topper = layout.placements.find((p) => p.boxId === "topper");
    expect(base).toBeDefined();
    expect(topper).toBeDefined();
    expect(topper!.stackParentBoxId).toBeNull();
    expect(topper!.positionMm).not.toBe(base!.positionMm);
  });
});

describe("solve(): stack migration consolidates non-empty shelves", () => {
  it("relocates a sparse shelf's stack onto a partially-used shelf with room", () => {
    // Genuine consolidation: A and B both end up non-empty after Phase 2;
    // A's single small stack can fit in B's free width gap. Migration must
    // empty A by moving that stack to B, reducing non-empty count 2 → 1.
    //
    // Use box dims tuned so Phase 1 assigns the small stuff to the narrow
    // shelf and the big stuff to the wide shelf — otherwise everything piles
    // onto whichever shelf the concentrate-fill heuristic prefers.
    const cabinet: Cabinet = {
      id: "cab-1",
      name: "Test",
      position: 0,
      shelfIds: ["A", "B"],
    };
    const shelfA = makeShelf("A", { widthMm: 300, heightMm: 100, depthMm: 300, position: 0 });
    const shelfB = makeShelf("B", { widthMm: 1500, heightMm: 100, depthMm: 300, position: 1 });
    const boxes = [
      // Two boxes that only fit on B (too tall for A's 100mm height when stacked
      // alongside each other in any combination above this).
      makeBox("bigB1", { w: 400, h: 80, d: 280 }),
      makeBox("bigB2", { w: 380, h: 80, d: 260 }),
      // Small stack that fits on either shelf. Phase 1's concentrate-fill will
      // route it to A (smaller remaining width). Migration should consolidate
      // it onto B since B has ample free space.
      makeBox("small", { w: 200, h: 40, d: 200 }),
    ];
    const state: AppState = {
      cabinets: [cabinet],
      shelves: [shelfA, shelfB],
      boxes,
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS },
    };

    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    expect(layout.unplaced).toEqual([]);
    expect(layout.placements.length).toBe(3);
    // A must be empty after migration.
    const onA = layout.placements.filter((p) => p.shelfId === "A");
    expect(onA, "expected shelf A to be emptied by the migration pass").toEqual([]);
    // All three boxes should be on B.
    const onB = layout.placements.filter((p) => p.shelfId === "B");
    expect(onB.length).toBe(3);
  });

  it("does not move stacks when there is no other shelf with room", () => {
    // Single shelf — nothing to migrate to. Pass must be a no-op.
    const shelf = makeShelf("only", { widthMm: 600, heightMm: 200, depthMm: 300 });
    const boxes = [
      makeBox("a", { w: 200, h: 40, d: 200 }),
      makeBox("b", { w: 150, h: 40, d: 150 }),
    ];
    const state = makeState({ shelves: [shelf], boxes });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);
    expect(layout.placements.length).toBe(2);
  });

  it("stacks a source stack on top of an existing target stack when no floor slot fits", () => {
    // A is narrow + shallow (only the small stack fits); B is packed wall-to-wall
    // with a 2-item stack so migration's floor-slot search fails. Stack-on-stack
    // should kick in and attach `small1` on top of B's `big_top`.
    const cabinet: Cabinet = {
      id: "cab-1",
      name: "Test",
      position: 0,
      shelfIds: ["A", "B"],
    };
    const shelfA = makeShelf("A", { widthMm: 200, heightMm: 300, depthMm: 140, position: 0 });
    const shelfB = makeShelf("B", { widthMm: 480, heightMm: 300, depthMm: 300, position: 1 });
    const boxes = [
      // big_base stacked → W=480 D=200 H=40 (W is always max of dims). Fills B's
      // full width; A's depth=140 < 200 so big stuff is forced onto B.
      makeBox("big_base", { w: 480, h: 40, d: 200 }),
      // big_top stacked → W=400 D=180 H=40. Pyramid-fits on big_base.
      makeBox("big_top", { w: 400, h: 40, d: 180 }),
      // small1 stacked → W=150 D=130 H=30. Routes to A (concentrate-fill);
      // can't fit B's wall-to-wall floor; pyramid-fits on top of big_top.
      makeBox("small1", { w: 150, h: 30, d: 130 }),
    ];
    const state: AppState = {
      cabinets: [cabinet],
      shelves: [shelfA, shelfB],
      boxes,
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS },
    };
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    expect(layout.unplaced).toEqual([]);
    const onA = layout.placements.filter((p) => p.shelfId === "A");
    expect(onA, "expected shelf A to be emptied by stack-on-stack migration").toEqual([]);
    const small1 = layout.placements.find((p) => p.boxId === "small1");
    expect(small1).toBeDefined();
    expect(small1!.shelfId).toBe("B");
    expect(small1!.stackParentBoxId).toBe("big_top");
    expect(small1!.stackYMm).toBe(80); // big_base h=40 + big_top h=40
    // small1 keeps stack alignment with the underlying stack base.
    const bigBase = layout.placements.find((p) => p.boxId === "big_base");
    expect(small1!.positionMm).toBe(bigBase!.positionMm);
  });

  it("respects maxStackCount when merging a source stack onto an existing one", () => {
    // Same wall-to-wall setup as above, but cap stacks at 2 items. Merging
    // small1 onto B's existing 2-item stack would produce a 3-item stack, so
    // the migration must refuse and leave small1 on A.
    const cabinet: Cabinet = {
      id: "cab-1",
      name: "Test",
      position: 0,
      shelfIds: ["A", "B"],
    };
    const shelfA = makeShelf("A", { widthMm: 200, heightMm: 300, depthMm: 181, position: 0 });
    const shelfB = makeShelf("B", { widthMm: 200, heightMm: 300, depthMm: 300, position: 1 });
    const boxes = [
      makeBox("big_base", { w: 200, h: 40, d: 280 }),
      makeBox("big_top", { w: 180, h: 40, d: 260 }),
      makeBox("small1", { w: 150, h: 30, d: 180 }),
    ];
    const state: AppState = {
      cabinets: [cabinet],
      shelves: [shelfA, shelfB],
      boxes,
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS, defaultMaxStackCount: 2 },
    };
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const small1 = layout.placements.find((p) => p.boxId === "small1");
    expect(small1).toBeDefined();
    expect(small1!.shelfId).toBe("A");
    expect(small1!.stackParentBoxId).toBeNull();
  });

  it("does not move a stack when consolidating would just swap empty shelves", () => {
    // Two shelves of similar capacity, only one is occupied. Moving the stack
    // to the other shelf doesn't reduce the non-empty count (still 1) — the
    // migration must be a no-op rather than thrashing the stack back and forth.
    const cabinet: Cabinet = {
      id: "cab-1",
      name: "Test",
      position: 0,
      shelfIds: ["A", "B"],
    };
    const shelfA = makeShelf("A", { widthMm: 800, heightMm: 200, depthMm: 300, position: 0 });
    const shelfB = makeShelf("B", { widthMm: 800, heightMm: 200, depthMm: 300, position: 1 });
    const boxes = [makeBox("only", { w: 200, h: 40, d: 200 })];
    const state: AppState = {
      cabinets: [cabinet],
      shelves: [shelfA, shelfB],
      boxes,
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS },
    };
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);
    expect(layout.placements.length).toBe(1);
    // Whichever shelf got it, the count of non-empty shelves must be 1.
    const nonEmpty = [shelfA, shelfB].filter(
      (s) => layout.placements.some((p) => p.shelfId === s.id),
    );
    expect(nonEmpty.length).toBe(1);
  });
});

describe("solve(): determinism", () => {
  it("produces identical placements when called twice on the same state", async () => {
    // Load the horizontal-stacks fixture (the one the user reported as flaky)
    // and run solve() twice with the default SA iteration budget. Same input
    // ⇒ same seed ⇒ same PRNG sequence ⇒ identical layout.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(
      path.join(here, "..", "..", "fixtures", "horizontal-stacks.json"),
      "utf8",
    );
    const fixture = JSON.parse(raw) as { state: AppState };
    const a = solve(fixture.state, { preservePins: false });
    const b = solve(fixture.state, { preservePins: false });
    // Compare placements field-by-field; ignore generated layout `id`/timestamps.
    const stripId = (p: Placement) => ({
      boxId: p.boxId,
      shelfId: p.shelfId,
      positionMm: p.positionMm,
      orientation: p.orientation,
      forwardFace: p.forwardFace,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      stackParentBoxId: p.stackParentBoxId,
      stackYMm: p.stackYMm,
      pinned: p.pinned,
    });
    expect(a.placements.map(stripId)).toEqual(b.placements.map(stripId));
  });
});

describe("solve(): no inter-stack overlap on horizontal shelves", () => {
  it("never produces two stacks whose x-ranges overlap on the same shelf", async () => {
    // Pack the fixture, then check every pair of stack bases on the same shelf
    // to confirm their [x, x+width] intervals are disjoint. This is the
    // visual-corruption regression — the screenshot showed stacks sitting on
    // top of empty space because a SA move had relocated a base out from
    // under its toppers, and a second stack's base then overlapped the
    // orphans' x-range.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(
      path.join(here, "..", "..", "fixtures", "horizontal-stacks.json"),
      "utf8",
    );
    const fixture = JSON.parse(raw) as { state: AppState };
    const layout = solve(fixture.state, { preservePins: false });
    assertLayoutIsValid(fixture.state, layout.placements);

    for (const sh of fixture.state.shelves) {
      const bases = layout.placements.filter(
        (p) => p.shelfId === sh.id && p.stackParentBoxId === null,
      );
      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          const a = bases[i];
          const b = bases[j];
          const a0 = a.positionMm;
          const a1 = a.positionMm + a.widthMm;
          const b0 = b.positionMm;
          const b1 = b.positionMm + b.widthMm;
          const overlap = a0 < b1 && b0 < a1;
          expect(
            overlap,
            `stacks ${a.boxId} [${a0}..${a1}] and ${b.boxId} [${b0}..${b1}] overlap on shelf ${sh.id}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("solve(): horizontal shelf — maxStackCount cap", () => {
  it("never builds a stack taller than settings.defaultMaxStackCount items", () => {
    const shelf = makeShelf("shelf", {
      widthMm: 500,
      heightMm: 1000,
      depthMm: 300,
    });
    const boxes = [
      makeBox("base", { w: 250, h: 50, d: 250 }),
      ...Array.from({ length: 10 }, (_, i) =>
        makeBox(`t${i}`, { w: 200, h: 50, d: 200 }),
      ),
    ];
    const state = makeState({
      shelves: [shelf],
      boxes,
      settings: { defaultMaxStackCount: 3 },
    });
    const layout = solve(state, { preservePins: false, searchIterations: 0 });
    assertLayoutIsValid(state, layout.placements);

    const stacks = new Map<number, number>();
    for (const p of layout.placements) {
      stacks.set(p.positionMm, (stacks.get(p.positionMm) ?? 0) + 1);
    }
    for (const count of stacks.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});
