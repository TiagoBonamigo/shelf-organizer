import { describe, expect, it } from "vitest";
import { Box } from "../types.js";
import { faceAreaLargestTwo, hasDims, resolveDims } from "./geometry.js";

function makeBox(overrides: Partial<Box> = {}): Box {
  return {
    id: "b1",
    bggId: null,
    name: "Test",
    dimensions: { w: 100, h: 300, d: 200 },
    dimensionsFromBgg: null,
    dimensionsSource: "manual",
    preferredForwardFace: "auto",
    expansionOfBoxId: null,
    bggLastFetchedAt: null,
    ...overrides,
  };
}

describe("hasDims", () => {
  it("returns true when all dimensions are positive", () => {
    expect(hasDims(makeBox())).toBe(true);
  });

  it("returns false when any dimension is zero", () => {
    expect(hasDims(makeBox({ dimensions: { w: 0, h: 100, d: 100 } }))).toBe(false);
    expect(hasDims(makeBox({ dimensions: { w: 100, h: 0, d: 100 } }))).toBe(false);
    expect(hasDims(makeBox({ dimensions: { w: 100, h: 100, d: 0 } }))).toBe(false);
  });
});

describe("faceAreaLargestTwo", () => {
  it("multiplies the two largest dimensions regardless of axis order", () => {
    expect(faceAreaLargestTwo(makeBox({ dimensions: { w: 100, h: 300, d: 200 } }))).toBe(60000);
    expect(faceAreaLargestTwo(makeBox({ dimensions: { w: 300, h: 100, d: 200 } }))).toBe(60000);
    expect(faceAreaLargestTwo(makeBox({ dimensions: { w: 200, h: 100, d: 300 } }))).toBe(60000);
  });
});

describe("resolveDims", () => {
  it("returns null when the box is missing dimensions", () => {
    const box = makeBox({ dimensions: { w: 0, h: 0, d: 0 } });
    expect(resolveDims(box, "standing")).toBeNull();
  });

  it("for auto + standing puts the smallest dim across the shelf and largest as height", () => {
    const box = makeBox({ dimensions: { w: 100, h: 300, d: 200 } });
    const resolved = resolveDims(box, "standing");
    expect(resolved).toMatchObject({
      widthOnShelf: 100,
      heightOnShelf: 300,
      depthOnShelf: 200,
    });
    expect(resolved!.faceArea).toBe(300 * 200);
  });

  it("for auto + stacked puts the largest dim across the shelf and smallest as height", () => {
    const box = makeBox({ dimensions: { w: 100, h: 300, d: 200 } });
    const resolved = resolveDims(box, "stacked");
    expect(resolved).toMatchObject({
      widthOnShelf: 300,
      heightOnShelf: 100,
      depthOnShelf: 200,
    });
  });

  it("respects an explicit forward face for standing", () => {
    const box = makeBox({ dimensions: { w: 100, h: 300, d: 200 } });
    const resolved = resolveDims(box, "standing", "wh");
    expect(resolved).toMatchObject({
      widthOnShelf: 100,
      heightOnShelf: 300,
      depthOnShelf: 200,
      forwardFace: "wh",
    });
  });

  it("forwards through the preferredForwardFace on the box when no override is given", () => {
    const box = makeBox({
      dimensions: { w: 100, h: 300, d: 200 },
      preferredForwardFace: "hd",
    });
    const resolved = resolveDims(box, "standing");
    expect(resolved?.forwardFace).toBe("hd");
    expect(resolved?.widthOnShelf).toBe(300);
    expect(resolved?.heightOnShelf).toBe(200);
    expect(resolved?.depthOnShelf).toBe(100);
  });

  it("preserves total volume for standing and auto-stacked", () => {
    const box = makeBox({ dimensions: { w: 100, h: 300, d: 200 } });
    const volume = 100 * 300 * 200;
    for (const face of ["auto", "wh", "wd", "hd"] as const) {
      const r = resolveDims(box, "standing", face);
      expect(r!.widthOnShelf * r!.heightOnShelf * r!.depthOnShelf).toBe(volume);
    }
    const stackedAuto = resolveDims(box, "stacked", "auto");
    expect(
      stackedAuto!.widthOnShelf * stackedAuto!.heightOnShelf * stackedAuto!.depthOnShelf,
    ).toBe(volume);
  });

  it("for stacked + explicit face, lays the largest face down regardless of choice", () => {
    // Intentional: pyramid rule keeps the down-facing area as the largest two dims.
    // Only the reported forwardFace echoes the user's pick.
    const box = makeBox({ dimensions: { w: 100, h: 300, d: 200 } });
    const stacked = resolveDims(box, "stacked", "wh");
    expect(stacked?.forwardFace).toBe("wh");
    expect(stacked?.heightOnShelf).toBeLessThanOrEqual(stacked!.widthOnShelf);
    expect(stacked?.heightOnShelf).toBeLessThanOrEqual(stacked!.depthOnShelf);
  });
});
