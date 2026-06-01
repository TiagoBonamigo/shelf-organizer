import { describe, expect, it } from "vitest";
import { Box, DEFAULT_SETTINGS, Placement, Settings, Shelf, UUID } from "../types.js";
import { validatePlacement } from "./validate.js";

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

function ctx(shelf: Shelf, box: Box, others: Placement[], boxesById: Map<UUID, Box>, settings?: Partial<Settings>) {
  return {
    shelf,
    box,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    others,
    boxesById,
  };
}

describe("validatePlacement: tightened pyramid rule (W/D containment)", () => {
  const shelf = makeShelf();

  it("accepts a topper whose W and D both fit within the parent", () => {
    const parent = makeBox("p", { w: 200, h: 50, d: 200 });
    const child = makeBox("c", { w: 100, h: 30, d: 100 });
    const boxesById = new Map([["p", parent], ["c", child]]);
    const parentPlacement: Placement = {
      boxId: "p", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 200, heightMm: 50, stackYMm: 0,
      stackParentBoxId: null, pinned: false,
    };
    const childPlacement: Placement = {
      boxId: "c", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 100, heightMm: 30, stackYMm: 50,
      stackParentBoxId: "p", pinned: false,
    };
    expect(validatePlacement(childPlacement, ctx(shelf, child, [parentPlacement], boxesById))).toBeNull();
  });

  it("accepts equal-size containment (≤, not <)", () => {
    const parent = makeBox("p", { w: 200, h: 50, d: 200 });
    const child = makeBox("c", { w: 200, h: 30, d: 200 });
    const boxesById = new Map([["p", parent], ["c", child]]);
    const parentPlacement: Placement = {
      boxId: "p", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 200, heightMm: 50, stackYMm: 0,
      stackParentBoxId: null, pinned: false,
    };
    const childPlacement: Placement = {
      boxId: "c", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 200, heightMm: 30, stackYMm: 50,
      stackParentBoxId: "p", pinned: false,
    };
    expect(validatePlacement(childPlacement, ctx(shelf, child, [parentPlacement], boxesById))).toBeNull();
  });

  it("rejects when child width exceeds parent width", () => {
    // Old (face-area) rule would have allowed this: parent 200×200=40000,
    // child 250×150=37500. New rule rejects on W: 250 > 200.
    const parent = makeBox("p", { w: 200, h: 50, d: 200 });
    const child = makeBox("c", { w: 250, h: 30, d: 150 });
    const boxesById = new Map([["p", parent], ["c", child]]);
    const parentPlacement: Placement = {
      boxId: "p", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 200, heightMm: 50, stackYMm: 0,
      stackParentBoxId: null, pinned: false,
    };
    const childPlacement: Placement = {
      boxId: "c", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 250, heightMm: 30, stackYMm: 50,
      stackParentBoxId: "p", pinned: false,
    };
    const err = validatePlacement(childPlacement, ctx(shelf, child, [parentPlacement], boxesById));
    expect(err?.code).toBe("pyramid");
  });

  it("rejects when child depth exceeds parent depth", () => {
    // Parent face wh: across=300 height=10 depth=100 → stacked w=300 h=10 d=100.
    // Child  face wh: across=250 height=200 depth=50 → stacked w=250 h=50 d=200.
    // W ok (250 ≤ 300) but D fails (200 > 100).
    const parent = makeBox("p", { w: 300, h: 10, d: 100 });
    const child = makeBox("c", { w: 250, h: 200, d: 50 });
    const boxesById = new Map([["p", parent], ["c", child]]);
    const parentPlacement: Placement = {
      boxId: "p", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 300, heightMm: 10, stackYMm: 0,
      stackParentBoxId: null, pinned: false,
    };
    const childPlacement: Placement = {
      boxId: "c", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 250, heightMm: 50, stackYMm: 10,
      stackParentBoxId: "p", pinned: false,
    };
    const err = validatePlacement(childPlacement, ctx(shelf, child, [parentPlacement], boxesById));
    expect(err?.code).toBe("pyramid");
  });

  it("errors when stackParentBoxId references an unknown box", () => {
    const child = makeBox("c", { w: 100, h: 30, d: 100 });
    const boxesById = new Map([["c", child]]);
    const childPlacement: Placement = {
      boxId: "c", shelfId: shelf.id, positionMm: 0,
      orientation: "stacked", forwardFace: "wh",
      widthMm: 100, heightMm: 30, stackYMm: 50,
      stackParentBoxId: "ghost", pinned: false,
    };
    const err = validatePlacement(childPlacement, ctx(shelf, child, [], boxesById));
    expect(err?.code).toBe("missing-parent");
  });
});
