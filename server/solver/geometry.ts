// Dimension resolution. The mapping from real-world (w,h,d) to placement-relative
// (widthOnShelf, heightOnShelf, depthOnShelf) is centralized here so the client
// never re-implements it. Standing = spine-out (smallest along the shelf width,
// largest as height). Stacked = largest face down.

import { Box, ForwardFace, ForwardFacePref, PlacementOrientation } from "../types.js";

export interface ResolvedDims {
  widthOnShelf: number;
  heightOnShelf: number;
  depthOnShelf: number;
  /** Area of the visible front face when shelved this way. */
  faceArea: number;
  forwardFace: ForwardFace;
}

export function hasDims(box: Box): boolean {
  const d = box.dimensions;
  return !!d && d.w > 0 && d.h > 0 && d.d > 0;
}

/** Sorted descending. */
function sortedDims(box: Box): [number, number, number] {
  const { w, h, d } = box.dimensions;
  const a = [w, h, d].sort((x, y) => y - x);
  return [a[0], a[1], a[2]];
}

/** Resolve dims for a given orientation; respects preferredForwardFace when set. */
export function resolveDims(
  box: Box,
  orientation: PlacementOrientation,
  preferredFace?: ForwardFacePref,
): ResolvedDims | null {
  if (!hasDims(box)) return null;
  const pref = preferredFace ?? box.preferredForwardFace ?? "auto";

  // For "auto", default to spine-out: standing → smallest along shelf, largest height.
  if (pref === "auto") {
    const [big, mid, small] = sortedDims(box);
    if (orientation === "standing") {
      return {
        widthOnShelf: small,
        heightOnShelf: big,
        depthOnShelf: mid,
        faceArea: big * mid,
        // The label must encode the actual (across, height) axes used here —
        // small × big — so that re-resolving with this face reproduces the
        // same projection.
        forwardFace: faceFromAxes(box, small, big),
      };
    }
    return {
      widthOnShelf: big,
      heightOnShelf: small,
      depthOnShelf: mid,
      faceArea: big * mid,
      forwardFace: faceFromAxes(box, big, small),
    };
  }

  // Explicit face: wh, wd, hd. The pair the user wants visible is the "front face".
  // For standing: visible-front = (widthAcrossShelf, heightAboveFloor); depth = the unused axis.
  // For stacked: visible-front = (widthAcrossShelf, heightAboveFloor) (still the side facing the viewer).
  const { w, h, d } = box.dimensions;
  const pairs: Record<ForwardFace, [number, number, number]> = {
    // [acrossShelfStanding, heightStanding, depth]
    wh: [w, h, d],
    wd: [w, d, h],
    hd: [h, d, w],
  };
  const [across, height, depth] = pairs[pref];

  if (orientation === "standing") {
    return {
      widthOnShelf: across,
      heightOnShelf: height,
      depthOnShelf: depth,
      faceArea: across * height,
      forwardFace: pref,
    };
  }
  // For stacked, the "face area" used by the pyramid rule is the down-facing area
  // (i.e. the footprint on the box below). We still report the visible front face
  // as forwardFace so the UI is consistent with the user's pick.
  return {
    widthOnShelf: Math.max(across, height),
    heightOnShelf: Math.min(across, height, depth),
    depthOnShelf: middleOf(across, height, depth),
    faceArea: Math.max(across, height) * middleOf(across, height, depth),
    forwardFace: pref,
  };
}

function middleOf(a: number, b: number, c: number): number {
  return [a, b, c].sort((x, y) => x - y)[1];
}

function faceFromAxes(box: Box, across: number, height: number): ForwardFace {
  const { w, h, d } = box.dimensions;
  // Find which pair of original axes match (across, height).
  const matches = (a: number, b: number) =>
    (a === across && b === height) || (a === height && b === across);
  if (matches(w, h)) return "wh";
  if (matches(w, d)) return "wd";
  return "hd";
}

/** Area of the two largest dimensions (used by the pyramid rule). */
export function faceAreaLargestTwo(box: Box): number {
  const [big, mid] = sortedDims(box);
  return big * mid;
}

/**
 * Stack containment tolerates a small depth overhang at every parent→child link.
 * Width remains strict (overhang would look wrong from the front); a topper may
 * extend up to STACK_DEPTH_OVERHANG_RATIO − 1 = 10% beyond its parent's depth.
 */
export const STACK_DEPTH_OVERHANG_RATIO = 1.10;

export function maxAllowedChildDepth(parentDepthMm: number): number {
  return Math.floor(parentDepthMm * STACK_DEPTH_OVERHANG_RATIO);
}
