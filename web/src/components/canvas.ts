// Scene layout math for the Layout canvas. All units in mm; pixel conversion
// happens at render time via PX_PER_MM_BASE × zoom.

import type { AppState, Cabinet, Placement, Shelf } from "../lib/shared-types";

export const PX_PER_MM_BASE = 0.55;
export const CABINET_GAP_MM = 80;
export const CABINET_FRAME_PADDING_MM = 8;
export const SHELF_VGAP_MM = 6;
export const CABINET_LABEL_HEIGHT_MM = 28;

export interface SceneShelf {
  shelf: Shelf;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneCabinet {
  cab: Cabinet;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: { x: number; y: number; w: number; h: number };
  shelves: SceneShelf[];
}

export interface Scene {
  cabinets: SceneCabinet[];
  shelves: Record<string, SceneShelf>;
  totalW: number;
  totalH: number;
}

export function buildScene(state: { cabinets: Cabinet[]; shelves: Shelf[] }): Scene {
  const cabinets = [...state.cabinets].sort((a, b) => a.position - b.position);
  let cursorX = 0;
  const out: SceneCabinet[] = [];

  for (const cab of cabinets) {
    const own = state.shelves.filter((s) => s.cabinetId === cab.id).sort((a, b) => a.position - b.position);
    const maxShelfW = own.reduce((m, s) => Math.max(m, s.widthMm), 0);
    const totalShelfH = own.reduce((acc, s) => acc + s.heightMm, 0) + Math.max(own.length - 1, 0) * SHELF_VGAP_MM;
    const frameW = maxShelfW + CABINET_FRAME_PADDING_MM * 2;
    const frameH = totalShelfH + CABINET_FRAME_PADDING_MM * 2;
    const totalH = frameH + CABINET_LABEL_HEIGHT_MM;

    let sy = CABINET_LABEL_HEIGHT_MM + CABINET_FRAME_PADDING_MM;
    const shelfBoxes: SceneShelf[] = own.map((s) => {
      const sx = CABINET_FRAME_PADDING_MM + (maxShelfW - s.widthMm) / 2;
      const box: SceneShelf = {
        shelf: s,
        x: cursorX + sx,
        y: sy,
        w: s.widthMm,
        h: s.heightMm,
      };
      sy += s.heightMm + SHELF_VGAP_MM;
      return box;
    });

    out.push({
      cab,
      x: cursorX,
      y: 0,
      w: frameW,
      h: totalH,
      frame: { x: cursorX, y: CABINET_LABEL_HEIGHT_MM, w: frameW, h: frameH },
      shelves: shelfBoxes,
    });
    cursorX += frameW + CABINET_GAP_MM;
  }
  const map: Record<string, SceneShelf> = {};
  for (const c of out) for (const s of c.shelves) map[s.shelf.id] = s;
  return {
    cabinets: out,
    shelves: map,
    totalW: Math.max(0, cursorX - CABINET_GAP_MM),
    totalH: out.reduce((m, c) => Math.max(m, c.h), 0),
  };
}

export interface GapInfo {
  start: number;
  width: number;
}

export function shelfLargestGap(shelf: Shelf, placements: Placement[]): GapInfo {
  if (shelf.orientation === "horizontal") {
    let rightEdge = 0;
    for (const p of placements) rightEdge = Math.max(rightEdge, p.positionMm + p.widthMm);
    return { start: rightEdge, width: shelf.widthMm - rightEdge };
  }
  const intervals = placements
    .filter((p) => p.orientation === "standing")
    .map((p) => [p.positionMm, p.positionMm + p.widthMm] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let best: GapInfo = { start: 0, width: 0 };
  let cursor = 0;
  for (const [a, b] of intervals) {
    if (a - cursor > best.width) best = { start: cursor, width: a - cursor };
    cursor = Math.max(cursor, b);
  }
  if (shelf.widthMm - cursor > best.width) best = { start: cursor, width: shelf.widthMm - cursor };
  return best;
}
