import {
  Box,
  Placement,
  Settings,
  Shelf,
  UUID,
  ValidationError,
} from "../types.js";
import { maxAllowedChildDepth, resolveDims } from "./geometry.js";

export interface ValidationContext {
  shelf: Shelf;
  box: Box;
  settings: Settings;
  others: Placement[]; // placements already on this shelf, excluding the one under test
  boxesById: Map<UUID, Box>;
}

export function validatePlacement(
  placement: Placement,
  ctx: ValidationContext,
): ValidationError | null {
  const { shelf, box, settings, others, boxesById } = ctx;
  const resolved = resolveDims(box, placement.orientation, placement.forwardFace);
  if (!resolved) {
    return { code: "missing-dimensions", message: "Game is missing dimensions." };
  }

  // bounds
  if (resolved.widthOnShelf > shelf.widthMm) {
    return { code: "too-wide", message: `Box too wide for shelf (${resolved.widthOnShelf} > ${shelf.widthMm} mm).` };
  }
  if (resolved.heightOnShelf > shelf.heightMm) {
    return { code: "too-tall", message: `Box too tall for shelf (${resolved.heightOnShelf} > ${shelf.heightMm} mm).` };
  }
  if (resolved.depthOnShelf > shelf.depthMm) {
    return { code: "too-deep", message: `Box too deep for shelf (${resolved.depthOnShelf} > ${shelf.depthMm} mm).` };
  }
  if (placement.positionMm < 0) {
    return { code: "negative-position", message: "Negative position is not allowed." };
  }
  if (placement.positionMm + resolved.widthOnShelf > shelf.widthMm) {
    return { code: "past-right-edge", message: "Box extends past the shelf right edge." };
  }

  // orientation mode
  if (shelf.orientation === "vertical" && placement.orientation !== "standing") {
    return { code: "orientation-mismatch", message: "This shelf only accepts standing boxes." };
  }
  if (shelf.orientation === "horizontal" && placement.orientation !== "stacked") {
    return { code: "orientation-mismatch", message: "This shelf only accepts stacked boxes." };
  }

  // overlap with same-orientation neighbours.
  // For stacked placements, two different stacks must not overlap in x on
  // the same shelf — they share the floor, so their footprints would collide.
  // Within a single stack, parent and child share the same positionMm, so
  // we skip same-stack pairs (their alignment is enforced by the pyramid
  // rule and stack-x check below).
  const byIdForStack = new Map<string, Placement>();
  for (const o of others) byIdForStack.set(o.boxId, o);
  byIdForStack.set(placement.boxId, placement);
  const myStackBase = findStackBaseId(placement, byIdForStack);
  for (const other of others) {
    if (other.orientation !== placement.orientation) continue;
    if (other.orientation === "stacked") {
      const otherStackBase = findStackBaseId(other, byIdForStack);
      if (otherStackBase === myStackBase) continue; // same stack chain
    }
    const a0 = placement.positionMm;
    const a1 = a0 + resolved.widthOnShelf;
    const b0 = other.positionMm;
    const b1 = b0 + other.widthMm;
    if (a0 < b1 && b0 < a1) {
      return { code: "overlap", message: "This area is already occupied." };
    }
  }

  // pyramid rule (stacked only, with a parent): the upper box's footprint
  // (W × D on the shelf) must fit within the lower box's footprint.
  if (placement.orientation === "stacked" && placement.stackParentBoxId) {
    const parent = boxesById.get(placement.stackParentBoxId);
    if (!parent) {
      return { code: "missing-parent", message: "Parent box for stack not found." };
    }
    const parentPlacement = others.find((o) => o.boxId === placement.stackParentBoxId);
    if (!parentPlacement) {
      return { code: "missing-parent", message: "Parent box is not on this shelf." };
    }
    if (parentPlacement.positionMm !== placement.positionMm) {
      return { code: "stack-x", message: "Stacked box must align with its parent's x position." };
    }
    const expectedY = (parentPlacement.stackYMm ?? 0) + parentPlacement.heightMm;
    if ((placement.stackYMm ?? 0) !== expectedY) {
      return { code: "stack-y", message: "Stacked box must sit directly on top of its parent." };
    }
    const parentResolved = resolveDims(
      parent,
      "stacked",
      parentPlacement.forwardFace ?? parent.preferredForwardFace,
    );
    if (!parentResolved) {
      return { code: "missing-parent", message: "Parent box is missing dimensions." };
    }
    if (
      resolved.widthOnShelf > parentResolved.widthOnShelf ||
      resolved.depthOnShelf > maxAllowedChildDepth(parentResolved.depthOnShelf)
    ) {
      return {
        code: "pyramid",
        message: "Stacking rule: upper box must fit within the lower box's footprint (W and D within 10%).",
      };
    }
  }

  // stack limits (walk the stack chain)
  if (placement.orientation === "stacked") {
    const chain = walkStackChain(placement, others);
    const countLimit = shelf.maxStackCount ?? settings.defaultMaxStackCount;
    if (countLimit != null && chain.length > countLimit) {
      return {
        code: "stack-count",
        message: `Stack count limit reached: max ${countLimit} boxes per stack.`,
      };
    }
    const heightLimit = shelf.maxStackHeightMm ?? settings.defaultMaxStackHeightMm;
    if (heightLimit != null) {
      const sum = chain.reduce((acc, p) => acc + p.heightMm, 0);
      if (sum > heightLimit) {
        return {
          code: "stack-height",
          message: `Stack height limit reached: ${sum} > ${heightLimit} mm.`,
        };
      }
    }
  }

  // padding reserve (vertical / mixed only)
  if (shelf.orientation === "vertical" || shelf.orientation === "mixed") {
    let totalUsed = resolved.widthOnShelf;
    for (const other of others) {
      if (other.orientation === "standing") totalUsed += other.widthMm;
    }
    if (totalUsed > shelf.widthMm - shelf.paddingReserveMm) {
      return {
        code: "padding",
        message: "Adding this box would consume the shelf's padding reserve.",
      };
    }
  }

  return null;
}

function findStackBaseId(p: Placement, byId: Map<string, Placement>): string {
  let cur: Placement = p;
  while (cur.stackParentBoxId) {
    const parent = byId.get(cur.stackParentBoxId);
    if (!parent) break;
    cur = parent;
  }
  return cur.boxId;
}

function walkStackChain(placement: Placement, others: Placement[]): Placement[] {
  // Build chain from floor up that includes `placement`. We need lookups in
  // both directions: by id (walk down to the base) and by parent id (walk up
  // to the top). Building the parent→child map once keeps the chain walk O(K)
  // overall — the prior `[...byId.values()].find(...)` per step made it O(K²).
  const byId = new Map<string, Placement>();
  const childByParentId = new Map<string, Placement>();
  for (const o of others) {
    byId.set(o.boxId, o);
    if (o.stackParentBoxId) childByParentId.set(o.stackParentBoxId, o);
  }
  byId.set(placement.boxId, placement);
  if (placement.stackParentBoxId) childByParentId.set(placement.stackParentBoxId, placement);

  // Find floor of this stack: walk down via stackParentBoxId.
  let cur: Placement | undefined = placement;
  while (cur?.stackParentBoxId) {
    const parent = byId.get(cur.stackParentBoxId);
    if (!parent) break;
    cur = parent;
  }
  // Walk up using O(1) lookup per step.
  const chain: Placement[] = [];
  let next: Placement | undefined = cur;
  while (next) {
    chain.push(next);
    next = childByParentId.get(next.boxId);
  }
  return chain;
}
