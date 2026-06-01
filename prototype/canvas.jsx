// Canvas rendering for the Layout view.
// Renders cabinets / shelves / boxes / room-to-grow / drop indicators / drag ghost.

const PX_PER_MM_BASE = 0.55; // base scale
const CABINET_GAP_MM = 80;
const CABINET_FRAME_PADDING_MM = 8;
const SHELF_VGAP_MM = 6;
const CABINET_LABEL_HEIGHT_MM = 28;

function shelfHeightContrib(shelf) {
  // visual height of a single shelf row inside cabinet frame
  return shelf.heightMm;
}

function buildSceneLayout(state) {
  // returns { cabinetBoxes: [{cab, x, y, w, h, shelves:[{shelf, x, y, w, h}]}], totalW, totalH }
  const cabinets = [...state.cabinets].sort((a, b) => a.position - b.position);
  let cursorX = 0;
  const cabinetBoxes = [];
  for (const cab of cabinets) {
    const shelves = state.shelves
      .filter((s) => s.cabinetId === cab.id)
      .sort((a, b) => a.position - b.position);

    const maxShelfW = Math.max(...shelves.map((s) => s.widthMm), 0);
    const totalShelfH =
      shelves.reduce((acc, s) => acc + shelfHeightContrib(s), 0) +
      Math.max(shelves.length - 1, 0) * SHELF_VGAP_MM;
    const frameW = maxShelfW + CABINET_FRAME_PADDING_MM * 2;
    const frameH = totalShelfH + CABINET_FRAME_PADDING_MM * 2;
    const totalH = frameH + CABINET_LABEL_HEIGHT_MM;

    // place shelves
    let sy = CABINET_LABEL_HEIGHT_MM + CABINET_FRAME_PADDING_MM;
    const shelfBoxes = shelves.map((s) => {
      const sx = CABINET_FRAME_PADDING_MM + (maxShelfW - s.widthMm) / 2;
      const box = {
        shelf: s,
        x: cursorX + sx,
        y: sy,
        w: s.widthMm,
        h: s.heightMm,
      };
      sy += s.heightMm + SHELF_VGAP_MM;
      return box;
    });

    cabinetBoxes.push({
      cab,
      x: cursorX,
      y: 0,
      w: frameW,
      h: totalH,
      shelves: shelfBoxes,
      frame: { x: cursorX, y: CABINET_LABEL_HEIGHT_MM, w: frameW, h: frameH },
    });
    cursorX += frameW + CABINET_GAP_MM;
  }
  const totalW = cursorX - CABINET_GAP_MM;
  const totalH = Math.max(...cabinetBoxes.map((c) => c.h), 0);
  return { cabinetBoxes, totalW, totalH };
}

// Find the largest empty contiguous region on a shelf, return [startMm, widthMm].
function shelfLargestGap(shelf, placements) {
  if (shelf.orientation === "horizontal") {
    // For stacked shelves, gap = space at the right of all stacks
    let rightEdge = 0;
    const stacks = [...new Set(placements.map((p) => p.positionMm))];
    for (const p of placements) rightEdge = Math.max(rightEdge, p.positionMm + p.widthMm);
    return [rightEdge, shelf.widthMm - rightEdge];
  }
  // For vertical / mixed: gather standing placements as intervals
  const intervals = placements
    .filter((p) => p.orientation === "standing")
    .map((p) => [p.positionMm, p.positionMm + p.widthMm])
    .sort((a, b) => a[0] - b[0]);
  let largest = { start: 0, width: 0 };
  let cursor = 0;
  for (const [a, b] of intervals) {
    if (a - cursor > largest.width) largest = { start: cursor, width: a - cursor };
    cursor = Math.max(cursor, b);
  }
  if (shelf.widthMm - cursor > largest.width)
    largest = { start: cursor, width: shelf.widthMm - cursor };
  return [largest.start, largest.width];
}

// === BoxRect — one rendered placement ===
function BoxRect({ placement, box, shelf, scene, scale, isSelected, isExpansionSelected, onSelect, isDraggingSource, onDragStart, isHighlighted, isCompareChanged }) {
  const shelfBox = scene.shelves[placement.shelfId];
  if (!shelfBox) return null;
  // x: shelf x + positionMm
  let x = shelfBox.x + placement.positionMm;
  let y;
  if (placement.orientation === "standing") {
    y = shelfBox.y + shelfBox.h - placement.heightMm; // sit on floor
  } else {
    y = shelfBox.y + shelfBox.h - placement.heightMm - (placement.stackYMm || 0);
  }
  const w = placement.widthMm;
  const h = placement.heightMm;

  const pxW = w * scale;
  const pxH = h * scale;

  const labelMode = window.__tweaks?.labelMode || "rotated";

  let label = null;
  if (labelMode !== "none") {
    if (placement.orientation === "standing") {
      const useRotated = labelMode === "rotated" && pxW < 18;
      const showLabel = pxW > 6 && pxH > 30;
      if (showLabel) {
        if (useRotated) {
          label = <div className="box-label-standing">{box.name}</div>;
        } else if (labelMode === "horizontal" && pxW > 32) {
          label = <div className="box-label-stacked" style={{ fontSize: "9px", padding: "0 2px" }}>{box.name}</div>;
        } else {
          label = <div className="box-label-standing">{box.name}</div>;
        }
      }
    } else {
      if (pxW > 24 && pxH > 8) {
        label = <div className="box-label-stacked">{box.name}</div>;
      }
    }
  }

  return (
    <div
      className={
        "box-rect " + placement.orientation +
        (isSelected ? " selected" : "") +
        (isExpansionSelected ? " expansion-of-selected" : "") +
        (isDraggingSource ? " dragging-source" : "") +
        (isCompareChanged ? " compare-changed" : "")
      }
      style={{
        left: x * scale,
        top: y * scale,
        width: pxW,
        height: pxH,
        "--hue": box.hue,
      }}
      data-box-id={box.id}
      onMouseDown={(e) => onDragStart?.(e, box, placement)}
      onClick={(e) => { e.stopPropagation(); onSelect?.(box.id); }}
      title={box.name}
    >
      {label}
      {placement.pinned && (
        <window.Icons.LockSmall className="box-pin-icon" />
      )}
      {box.dimensionsSource === "override" && <div className="box-override-dot" />}
    </div>
  );
}

window.BoxRect = BoxRect;
window.buildSceneLayout = buildSceneLayout;
window.shelfLargestGap = shelfLargestGap;
window.PX_PER_MM_BASE = PX_PER_MM_BASE;
window.CABINET_GAP_MM = CABINET_GAP_MM;
window.CABINET_FRAME_PADDING_MM = CABINET_FRAME_PADDING_MM;
window.SHELF_VGAP_MM = SHELF_VGAP_MM;
window.CABINET_LABEL_HEIGHT_MM = CABINET_LABEL_HEIGHT_MM;
