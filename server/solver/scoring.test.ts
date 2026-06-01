import { describe, expect, it } from "vitest";
import { Placement, Shelf } from "../types.js";
import { largestGapMm } from "./scoring.js";

function makeShelf(overrides: Partial<Shelf> = {}): Shelf {
  return {
    id: "shelf-1",
    cabinetId: "cab-1",
    position: 0,
    widthMm: 1000,
    heightMm: 400,
    depthMm: 300,
    orientation: "vertical",
    paddingReserveMm: 0,
    maxStackCount: null,
    maxStackHeightMm: null,
    ...overrides,
  };
}

function placeStanding(boxId: string, shelfId: string, positionMm: number, widthMm: number): Placement {
  return {
    boxId,
    shelfId,
    positionMm,
    orientation: "standing",
    forwardFace: "wh",
    widthMm,
    heightMm: 200,
    stackParentBoxId: null,
    pinned: false,
  };
}

describe("largestGapMm", () => {
  it("returns trailing space when only one box is placed at the start", () => {
    const shelf = makeShelf({ widthMm: 1000 });
    const result = largestGapMm([placeStanding("b1", shelf.id, 0, 100)], [shelf]);
    expect(result.largest).toBe(900);
    expect(result.shelfId).toBe(shelf.id);
  });

  it("finds an interior gap larger than the trailing one", () => {
    const shelf = makeShelf({ widthMm: 1000 });
    const placements = [
      placeStanding("b1", shelf.id, 0, 100),
      placeStanding("b2", shelf.id, 600, 100),
      placeStanding("b3", shelf.id, 750, 100),
    ];
    const result = largestGapMm(placements, [shelf]);
    expect(result.largest).toBe(500);
  });

  it("ignores overlapping intervals — cursor advances to the max end seen", () => {
    const shelf = makeShelf({ widthMm: 1000 });
    const placements = [
      placeStanding("b1", shelf.id, 0, 600),
      placeStanding("b2", shelf.id, 100, 400),
    ];
    const result = largestGapMm(placements, [shelf]);
    expect(result.largest).toBe(400);
  });

  it("collapses a stack to its base width for the gap calculation", () => {
    const shelf = makeShelf({ widthMm: 1000 });
    const placements: Placement[] = [
      {
        boxId: "a",
        shelfId: shelf.id,
        positionMm: 200,
        orientation: "stacked",
        forwardFace: "wh",
        widthMm: 200,
        heightMm: 100,
        stackParentBoxId: null,
        pinned: false,
      },
      {
        boxId: "b",
        shelfId: shelf.id,
        positionMm: 200,
        orientation: "stacked",
        forwardFace: "wh",
        widthMm: 150,
        heightMm: 100,
        stackParentBoxId: "a",
        pinned: false,
      },
    ];
    const result = largestGapMm(placements, [shelf]);
    expect(result.largest).toBe(600);
  });

  it("reports the entire shelf width when there are no placements", () => {
    const shelf = makeShelf({ widthMm: 800 });
    const result = largestGapMm([], [shelf]);
    expect(result.largest).toBe(800);
    expect(result.shelfId).toBe(shelf.id);
  });
});

