// Layout view — canvas with cabinets/shelves/boxes, pan/zoom, drag-and-drop,
// solver overlay, status bar, right-hand panel.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useStore, selectActiveLayout, selectPreviousLayout } from "../state/store";
import { Icons } from "../components/Icons";
import {
  PX_PER_MM_BASE,
  CABINET_FRAME_PADDING_MM,
  SHELF_VGAP_MM,
  buildScene,
  shelfLargestGap,
  type Scene,
  type SceneShelf,
} from "../components/canvas";
import type { Box, Placement, Shelf, ValidationError } from "../lib/shared-types";
import { api } from "../api/client";
import { RightPane } from "../components/RightPane";

interface HoverInfo {
  shelfId: string;
  valid: boolean;
  reason?: string;
  targetMode?: "standing" | "stacked";
  positionMm?: number;
  positionPx?: number;
  width?: number;
  height?: number;
  stackYMm?: number;
  stackYPx?: number;
  stackXPx?: number;
  stackWPx?: number;
  indicatorOrientation?: "vertical" | "horizontal";
  parentBoxId?: string | null;
  tray?: boolean;
}

export const LayoutView: React.FC = () => {
  const state = useStore();
  const layout = useStore(selectActiveLayout);
  const previous = useStore(selectPreviousLayout);
  const cabinets = state.cabinets;
  const shelves = state.shelves;
  const boxes = state.boxes;

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const fitDone = useRef(false);

  const scene = useMemo(() => buildScene({ cabinets, shelves }), [cabinets, shelves]);

  // Initial fit-to-viewport
  useLayoutEffect(() => {
    if (fitDone.current) return;
    const el = canvasRef.current;
    if (!el) return;
    const cr = el.getBoundingClientRect();
    if (cr.width < 50 || cr.height < 50) return;
    const sceneWpx = scene.totalW * PX_PER_MM_BASE;
    const sceneHpx = scene.totalH * PX_PER_MM_BASE;
    if (sceneWpx === 0) return;
    const z = Math.max(0.4, Math.min(1.2, Math.min((cr.width - 48) / sceneWpx, (cr.height - 48) / sceneHpx)));
    setZoom(z);
    setPan({ x: Math.max(24, (cr.width - sceneWpx * z) / 2), y: 16 });
    fitDone.current = true;
  }, [scene.totalW, scene.totalH]);

  // Pan with background drag
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return;
      setPan({ x: panRef.current.panX + (e.clientX - panRef.current.startX), y: panRef.current.panY + (e.clientY - panRef.current.startY) });
    };
    const onUp = () => {
      panRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest(".box-rect") || t.closest(".zoom-indicator") || t.closest(".room-to-grow-label")) return;
    if (e.button !== 0 && e.button !== 1) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    document.body.style.cursor = "grabbing";
    state.selectBox(null);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.3, Math.min(3, zoom * factor));
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const sceneX = (mx - pan.x) / zoom;
      const sceneY = (my - pan.y) / zoom;
      setZoom(newZoom);
      setPan({ x: mx - sceneX * newZoom, y: my - sceneY * newZoom });
    } else {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Solver overlay
  const [solveProgress, setSolveProgress] = useState<number | null>(null);
  const [solvePhase, setSolvePhase] = useState(0);
  const solveStartRef = useRef<number>(0);
  useEffect(() => {
    if (!state.pendingSolve) {
      setSolveProgress(null);
      return;
    }
    setSolvePhase(0);
    setSolveProgress(0);
    solveStartRef.current = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - solveStartRef.current;
      const p = Math.min(0.95, elapsed / 1500);
      setSolveProgress(p);
      setSolvePhase(p < 0.33 ? 0 : p < 0.66 ? 1 : 2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.pendingSolve]);

  // Drag state
  const [drag, setDrag] = useState<{ box: Box; source: Placement | null; hover: HoverInfo | null } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragMouseRef = useRef<{ x: number; y: number } | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { box: Box; placement: Placement | null } | undefined;
    if (!data) return;
    setDrag({ box: data.box, source: data.placement, hover: null });
    state.selectBox(data.box.id);
  };

  const onDragMove = (e: DragMoveEvent) => {
    const activator = e.activatorEvent as PointerEvent | undefined;
    if (!activator) return;
    const x = activator.clientX + e.delta.x;
    const y = activator.clientY + e.delta.y;
    dragMouseRef.current = { x, y };
    const hover = computeHoverAtClient(x, y, drag, scene, layout, state.settings, boxes);
    setDrag((d) => (d ? { ...d, hover } : d));
  };

  const onDragEnd = async (_e: DragEndEvent) => {
    if (!drag) return;
    const h = drag.hover;
    if (h?.tray && drag.source) {
      await state.removeBoxFromShelf(drag.box.id);
      state.showToast("info", `Moved “${drag.box.name}” to the unplaced tray.`);
    } else if (h?.valid && h.targetMode && h.positionMm != null) {
      const placement: Placement = {
        boxId: drag.box.id,
        shelfId: h.shelfId,
        positionMm: h.positionMm,
        orientation: h.targetMode,
        forwardFace: drag.source?.forwardFace ?? "wh",
        widthMm: h.width ?? 0,
        heightMm: h.height ?? 0,
        stackYMm: h.targetMode === "stacked" ? h.stackYMm : undefined,
        stackParentBoxId: h.parentBoxId ?? null,
        pinned: true,
      };
      try {
        const { layout: l, rejected } = await api.patchPlacements([placement]);
        if (rejected.length > 0) {
          state.showToast("error", rejected[0].error.message);
        } else {
          state.applyLayout(l);
        }
      } catch (e) {
        state.showToast("error", String(e));
      }
    } else if (h && !h.valid) {
      state.showToast("error", h.reason ?? "Cannot drop here.");
    }
    setDrag(null);
  };

  // Selected box and expansion siblings (for sibling highlight)
  const selectedBox = state.selectedBoxId ? boxes.find((b) => b.id === state.selectedBoxId) ?? null : null;
  const expansionSiblingIds = useMemo(() => {
    if (!selectedBox) return new Set<string>();
    const baseId = selectedBox.expansionOfBoxId ?? selectedBox.id;
    const ids = new Set<string>();
    for (const b of boxes) {
      if (b.id === selectedBox.id) continue;
      if (b.id === baseId || b.expansionOfBoxId === baseId) ids.add(b.id);
    }
    return ids;
  }, [selectedBox, boxes]);

  // Room-to-grow analysis
  const roomToGrow = useMemo(() => {
    const map: Record<string, { start: number; width: number }> = {};
    let best = { width: 0, shelfId: "" };
    if (!layout) return { byShelf: map, best };
    for (const sh of shelves) {
      const placements = layout.placements.filter((p) => p.shelfId === sh.id);
      const g = shelfLargestGap(sh, placements);
      map[sh.id] = g;
      if (g.width > best.width) best = { width: g.width, shelfId: sh.id };
    }
    return { byShelf: map, best };
  }, [layout, shelves]);

  const missingDimGames = boxes.filter((b) => !b.dimensions || b.dimensions.w === 0);
  const hasPins = !!layout?.placements.some((p) => p.pinned);
  const lgp = layout?.metrics;
  const lgpShelf = lgp ? shelves.find((s) => s.id === lgp.largestGapShelfId) : null;
  const lgpCabinet = lgpShelf ? cabinets.find((c) => c.id === lgpShelf.cabinetId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
      <div className={"layout-view density-" + state.tweaks.density}>
        <div className="main" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Toolbar */}
          <div className="toolbar">
            <button
              className="btn primary"
              disabled={hasPins}
              onClick={async () => {
                if (hasPins) return;
                await state.solve();
              }}
              title={hasPins ? "Disable pins or use Re-solve around pins" : "Run a fresh solve"}
            >
              <Icons.Play size={11} /> Solve
            </button>
            <button className="btn" disabled={!hasPins} onClick={() => state.solveAroundPins()}>
              <Icons.Refresh size={12} /> Re-solve around pins
            </button>
            <div className="toolbar-divider" />
            <LayoutNamePicker />
            {layout?.stale && (
              <span
                title="Stacks in this layout violate the current pyramid rule (upper box must fit within the lower's W and D). Re-solve to fix."
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 3,
                  background: "var(--warning, #b85c00)",
                  color: "white",
                  fontWeight: 500,
                  marginLeft: 4,
                }}
              >
                Needs re-solve
              </span>
            )}
            <div className="toolbar-spacer" />
            <button className="btn ghost" disabled={!hasPins} onClick={() => state.resetPins()}>
              Reset all pins
            </button>
            {previous && (
              <button
                className={"btn " + (state.compareMode ? "accent" : "")}
                onClick={() => useStore.setState({ compareMode: !state.compareMode })}
              >
                {state.compareMode ? "Hide changes" : "Compare with previous"}
              </button>
            )}
          </div>

          {missingDimGames.length > 0 && (
            <div className="banner">
              <span className="icon">
                <Icons.Warning size={14} />
              </span>
              <span>
                <strong>{missingDimGames.length}</strong> games are missing dimensions and are excluded from the solve.
              </span>
              <button
                onClick={() => {
                  state.setLibraryFilter("missing-dims");
                  state.setView("library");
                }}
              >
                Review in Library →
              </button>
            </div>
          )}

          {/* Canvas */}
          <div className="canvas-wrap" ref={canvasRef} onWheel={onWheel} onMouseDown={onCanvasMouseDown}>
            <div
              className="canvas-scene"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              {scene.cabinets.map((cab) => (
                <div
                  key={cab.cab.id}
                  className="cabinet"
                  style={{
                    left: cab.x * PX_PER_MM_BASE,
                    top: cab.y * PX_PER_MM_BASE,
                    width: cab.w * PX_PER_MM_BASE,
                    height: cab.h * PX_PER_MM_BASE,
                  }}
                >
                  <div className="cabinet-label">
                    {cab.cab.name}
                    <span className="sub">
                      {shelves.filter((s) => s.cabinetId === cab.cab.id).length} shelves ·{" "}
                      {cab.shelves.reduce((a, s) => a + s.w, 0)} mm
                    </span>
                  </div>
                  <div
                    className="cabinet-frame"
                    style={{
                      width: cab.frame.w * PX_PER_MM_BASE,
                      height: cab.frame.h * PX_PER_MM_BASE,
                      padding: CABINET_FRAME_PADDING_MM * PX_PER_MM_BASE,
                      gap: SHELF_VGAP_MM * PX_PER_MM_BASE,
                    }}
                  >
                    {cab.shelves.map((sh) => {
                      const placements = layout?.placements.filter((p) => p.shelfId === sh.shelf.id) ?? [];
                      const isDropTarget = drag?.hover?.shelfId === sh.shelf.id;
                      const gap = roomToGrow.byShelf[sh.shelf.id];
                      const isBestGap = roomToGrow.best.shelfId === sh.shelf.id;
                      return (
                        <ShelfRender
                          key={sh.shelf.id}
                          sh={sh}
                          placements={placements}
                          boxesById={new Map(boxes.map((b) => [b.id, b]))}
                          selectedBoxId={state.selectedBoxId}
                          expansionSiblingIds={expansionSiblingIds}
                          isDropTarget={isDropTarget}
                          dropIndicator={isDropTarget ? drag!.hover! : null}
                          gap={gap}
                          isBestGap={isBestGap}
                          roomToGrowMode={state.tweaks.roomToGrow}
                          labelMode={state.tweaks.labelMode}
                          draggingBoxId={drag?.box?.id}
                          compareMode={state.compareMode}
                          isInvalidDrop={isDropTarget && !drag!.hover!.valid}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="zoom-indicator">
              <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} title="Zoom out">
                <Icons.ZoomOut size={11} />
              </button>
              <span style={{ minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} title="Zoom in">
                <Icons.ZoomIn size={11} />
              </button>
              <button
                onClick={() => {
                  fitDone.current = false;
                  setZoom(1);
                  setPan({ x: 24, y: 16 });
                }}
                title="Fit"
              >
                <Icons.Maximize size={11} />
              </button>
            </div>

            {solveProgress != null && <SolverOverlay phase={solvePhase} progress={solveProgress} />}
          </div>

          <div className="status-bar">
            <div className="status-metric">
              <span className="label">Largest gap</span>
              <span className="value">{lgp ? `${lgp.largestGapMm} mm` : "—"}</span>
              {lgpCabinet && lgpShelf && (
                <span className="sub">
                  · {lgpCabinet.name}, shelf {lgpShelf.position + 1}
                </span>
              )}
            </div>
            <div className="status-metric">
              <span className="label">Placed</span>
              <span className="value">
                {lgp ? `${lgp.placedCount} / ${lgp.placedCount + lgp.unplacedCount}` : "—"}
              </span>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 11 }}>
              Hold ⌘/Ctrl + scroll to zoom · drag the background to pan
            </div>
          </div>
        </div>

        <RightPane />

        <DragOverlay>
          {drag && (
            <div
              className="drag-ghost box-rect"
              style={{
                width: (drag.source?.widthMm ?? 30) * PX_PER_MM_BASE * zoom,
                height: (drag.source?.heightMm ?? 100) * PX_PER_MM_BASE * zoom,
                ["--hue" as never]: hashHue(drag.box.name),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div className="box-label-standing">{drag.box.name}</div>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

// ─── Shelf rendering ────────────────────────────────────────────────────────

const ShelfRender: React.FC<{
  sh: SceneShelf;
  placements: Placement[];
  boxesById: Map<string, Box>;
  selectedBoxId: string | null;
  expansionSiblingIds: Set<string>;
  isDropTarget: boolean;
  isInvalidDrop: boolean;
  dropIndicator: HoverInfo | null;
  gap: { start: number; width: number } | undefined;
  isBestGap: boolean;
  roomToGrowMode: "subtle" | "soft" | "off";
  labelMode: "rotated" | "horizontal" | "none";
  draggingBoxId?: string;
  compareMode: boolean;
}> = ({
  sh,
  placements,
  boxesById,
  selectedBoxId,
  expansionSiblingIds,
  isDropTarget,
  isInvalidDrop,
  dropIndicator,
  gap,
  isBestGap,
  roomToGrowMode,
  labelMode,
  draggingBoxId,
  compareMode,
}) => {
  const shelf = sh.shelf;
  const w = shelf.widthMm * PX_PER_MM_BASE;
  const h = shelf.heightMm * PX_PER_MM_BASE;
  const showRoomToGrow = isBestGap && gap && gap.width > 50;

  return (
    <div
      className={"shelf" + (isInvalidDrop ? " drop-invalid" : "")}
      style={{ width: w, height: h, position: "relative", flexShrink: 0 }}
      data-shelf-id={shelf.id}
    >
      {shelf.orientation === "mixed" &&
        (() => {
          const standing = placements.filter((p) => p.orientation === "standing");
          if (standing.length === 0) return null;
          const rightmost = Math.max(...standing.map((p) => p.positionMm + p.widthMm));
          return <div className="shelf-divider" style={{ left: (rightmost + 12) * PX_PER_MM_BASE }} />;
        })()}

      {showRoomToGrow && roomToGrowMode !== "off" && gap && (
        <div
          className="room-to-grow"
          style={{
            left: gap.start * PX_PER_MM_BASE,
            top: 0,
            width: gap.width * PX_PER_MM_BASE,
            height: "100%",
            opacity: roomToGrowMode === "subtle" ? 0.5 : 1,
          }}
        >
          {gap.width * PX_PER_MM_BASE > 100 && (
            <div className="room-to-grow-label">room to grow · {gap.width} mm</div>
          )}
        </div>
      )}

      {placements.map((p) => {
        const box = boxesById.get(p.boxId);
        if (!box) return null;
        return (
          <DraggableBox
            key={p.boxId}
            placement={p}
            box={box}
            shelfBox={sh}
            isSelected={selectedBoxId === box.id}
            isExpansionSelected={expansionSiblingIds.has(box.id)}
            isDraggingSource={draggingBoxId === box.id}
            isCompareChanged={compareMode && !!p.changed}
            labelMode={labelMode}
          />
        );
      })}

      {dropIndicator?.valid && dropIndicator.indicatorOrientation === "vertical" && dropIndicator.positionPx != null && (
        <div className="drop-indicator vertical" style={{ left: dropIndicator.positionPx, top: 0, bottom: 0 }} />
      )}
      {dropIndicator?.valid && dropIndicator.indicatorOrientation === "horizontal" && (
        <div
          className="drop-indicator horizontal"
          style={{ left: dropIndicator.stackXPx, top: dropIndicator.stackYPx, width: dropIndicator.stackWPx }}
        />
      )}

      <div className="shelf-meta">
        #{shelf.position + 1} · {shelf.widthMm}×{shelf.heightMm}×{shelf.depthMm} · {shelf.orientation}
      </div>
    </div>
  );
};

const DraggableBox: React.FC<{
  placement: Placement;
  box: Box;
  shelfBox: SceneShelf;
  isSelected: boolean;
  isExpansionSelected: boolean;
  isDraggingSource: boolean;
  isCompareChanged: boolean;
  labelMode: "rotated" | "horizontal" | "none";
}> = ({ placement, box, shelfBox, isSelected, isExpansionSelected, isDraggingSource, isCompareChanged, labelMode }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "box-" + box.id,
    data: { box, placement },
  });
  const selectBox = useStore((s) => s.selectBox);

  const x = placement.positionMm;
  const yFromBottom = placement.orientation === "standing" ? 0 : placement.stackYMm ?? 0;
  const y = shelfBox.h - placement.heightMm - yFromBottom;
  const pxW = placement.widthMm * PX_PER_MM_BASE;
  const pxH = placement.heightMm * PX_PER_MM_BASE;

  let label: React.ReactNode = null;
  if (labelMode !== "none") {
    if (placement.orientation === "standing") {
      if (pxW > 6 && pxH > 30) {
        label =
          labelMode === "horizontal" && pxW > 32 ? (
            <div className="box-label-stacked" style={{ fontSize: 9, padding: "0 2px" }}>
              {box.name}
            </div>
          ) : (
            <div className="box-label-standing">{box.name}</div>
          );
      }
    } else if (pxW > 24 && pxH > 8) {
      label = <div className="box-label-stacked">{box.name}</div>;
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={
        "box-rect " +
        placement.orientation +
        (isSelected ? " selected" : "") +
        (isExpansionSelected ? " expansion-of-selected" : "") +
        (isDraggingSource ? " dragging-source" : "") +
        (isCompareChanged ? " compare-changed" : "")
      }
      style={{
        left: x * PX_PER_MM_BASE,
        top: y * PX_PER_MM_BASE,
        width: pxW,
        height: pxH,
        ["--hue" as never]: hashHue(box.name),
      }}
      title={`${box.name} — ${box.dimensions.w}×${box.dimensions.h}×${box.dimensions.d} mm`}
      onClick={(e) => {
        e.stopPropagation();
        selectBox(box.id);
      }}
      {...listeners}
      {...attributes}
    >
      {label}
      {placement.pinned && <Icons.LockSmall className="box-pin-icon" />}
      {box.dimensionsSource === "override" && <div className="box-override-dot" />}
    </div>
  );
};

// ─── Hover/drop computation ─────────────────────────────────────────────────

function computeHoverAtClient(
  clientX: number,
  clientY: number,
  drag: { box: Box; source: Placement | null; hover: HoverInfo | null } | null,
  scene: Scene,
  layout: ReturnType<typeof selectActiveLayout>,
  settings: { defaultMaxStackCount: number | null; defaultMaxStackHeightMm: number | null },
  boxes: Box[],
): HoverInfo | null {
  if (!drag) return null;

  // Tray drop?
  const tray = document.querySelector(".unplaced-tray-drop");
  if (tray) {
    const tr = tray.getBoundingClientRect();
    if (clientX >= tr.left && clientX <= tr.right && clientY >= tr.top && clientY <= tr.bottom) {
      return { shelfId: "", valid: true, reason: "Send to unplaced", tray: true };
    }
  }

  const canvas = document.querySelector(".canvas-wrap") as HTMLElement | null;
  if (!canvas) return null;
  const cr = canvas.getBoundingClientRect();
  const scenePane = canvas.querySelector(".canvas-scene") as HTMLElement | null;
  if (!scenePane) return null;
  const matrix = window.getComputedStyle(scenePane).transform;
  // Derive zoom + pan from the transform matrix: matrix(a,b,c,d,e,f) where a=d=zoom, e=panX, f=panY.
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  if (matrix && matrix !== "none") {
    const m = matrix.match(/matrix\(([^)]+)\)/);
    if (m) {
      const v = m[1].split(",").map(parseFloat);
      zoom = v[0] || 1;
      panX = v[4] || 0;
      panY = v[5] || 0;
    }
  }
  const sceneX = (clientX - cr.left - panX) / zoom / PX_PER_MM_BASE;
  const sceneY = (clientY - cr.top - panY) / zoom / PX_PER_MM_BASE;

  for (const cab of scene.cabinets) {
    for (const sh of cab.shelves) {
      if (sceneX >= sh.x && sceneX <= sh.x + sh.w && sceneY >= sh.y && sceneY <= sh.y + sh.h) {
        return computeHoverOnShelf(drag.box, drag.source, sh, sceneX - sh.x, sceneY - sh.y, layout, settings, boxes);
      }
    }
  }
  return null;
}

function computeHoverOnShelf(
  box: Box,
  source: Placement | null,
  sh: SceneShelf,
  xMm: number,
  yMmFromTop: number,
  layout: ReturnType<typeof selectActiveLayout>,
  settings: { defaultMaxStackCount: number | null; defaultMaxStackHeightMm: number | null },
  boxes: Box[],
): HoverInfo {
  const shelf = sh.shelf;
  const placements = (layout?.placements ?? []).filter((p) => p.shelfId === shelf.id && p.boxId !== box.id);
  if (!box.dimensions || box.dimensions.w === 0) {
    return { shelfId: shelf.id, valid: false, reason: "Game is missing dimensions." };
  }

  // Decide target mode from shelf orientation + cursor position.
  let targetMode: "standing" | "stacked";
  if (shelf.orientation === "vertical") targetMode = "standing";
  else if (shelf.orientation === "horizontal") targetMode = "stacked";
  else {
    targetMode = yMmFromTop > shelf.heightMm * 0.5 ? "standing" : "stacked";
    const standing = placements.filter((p) => p.orientation === "standing");
    const standingRight = standing.length ? Math.max(...standing.map((p) => p.positionMm + p.widthMm)) : 0;
    if (xMm < standingRight + 24 && standingRight > 0) targetMode = "standing";
    else if (xMm > standingRight + 24) targetMode = "stacked";
  }

  // Resolve dims for this orientation.
  const sorted = [box.dimensions.w, box.dimensions.h, box.dimensions.d].sort((a, b) => b - a);
  const r =
    targetMode === "standing"
      ? { widthOnShelf: sorted[2], heightOnShelf: sorted[0], depthOnShelf: sorted[1], faceArea: sorted[0] * sorted[1] }
      : { widthOnShelf: sorted[0], heightOnShelf: sorted[2], depthOnShelf: sorted[1], faceArea: sorted[0] * sorted[1] };

  if (r.heightOnShelf > shelf.heightMm)
    return { shelfId: shelf.id, valid: false, reason: `Box too tall (${r.heightOnShelf} > ${shelf.heightMm} mm).` };
  if (r.depthOnShelf > shelf.depthMm)
    return { shelfId: shelf.id, valid: false, reason: `Box too deep (${r.depthOnShelf} > ${shelf.depthMm} mm).` };

  if (targetMode === "standing") {
    const sorted = placements.filter((p) => p.orientation === "standing").sort((a, b) => a.positionMm - b.positionMm);
    let idx = 0;
    for (const p of sorted) {
      if (xMm < p.positionMm + p.widthMm / 2) break;
      idx++;
    }
    let insertX = 0;
    if (idx < sorted.length) insertX = sorted[idx].positionMm;
    else if (sorted.length > 0) insertX = sorted[sorted.length - 1].positionMm + sorted[sorted.length - 1].widthMm;
    const usedW = sorted.reduce((acc, p) => acc + p.widthMm, 0);
    if (usedW + r.widthOnShelf > shelf.widthMm - shelf.paddingReserveMm) {
      return { shelfId: shelf.id, valid: false, reason: "Would consume the padding reserve." };
    }
    return {
      shelfId: shelf.id,
      valid: true,
      targetMode,
      positionMm: insertX,
      positionPx: insertX * PX_PER_MM_BASE,
      indicatorOrientation: "vertical",
      width: r.widthOnShelf,
      height: r.heightOnShelf,
    };
  } else {
    // Find nearest stack base by x.
    const stackBases = new Map<number, Placement[]>();
    for (const p of placements.filter((p) => p.orientation === "stacked")) {
      const arr = stackBases.get(p.positionMm) ?? [];
      arr.push(p);
      stackBases.set(p.positionMm, arr);
    }
    let bestX: number | null = null;
    let bestDist = Infinity;
    for (const [k, arr] of stackBases) {
      const cx = k + arr[0].widthMm / 2;
      const d = Math.abs(xMm - cx);
      if (d < bestDist) {
        bestDist = d;
        bestX = k;
      }
    }
    if (bestX == null || bestDist > 200) {
      const proposed = Math.max(0, Math.min(shelf.widthMm - r.widthOnShelf, xMm - r.widthOnShelf / 2));
      return {
        shelfId: shelf.id,
        valid: true,
        targetMode: "stacked",
        positionMm: proposed,
        stackXPx: proposed * PX_PER_MM_BASE,
        stackYPx: (shelf.heightMm - r.heightOnShelf) * PX_PER_MM_BASE,
        stackWPx: r.widthOnShelf * PX_PER_MM_BASE,
        indicatorOrientation: "horizontal",
        parentBoxId: null,
        stackYMm: 0,
        width: r.widthOnShelf,
        height: r.heightOnShelf,
      };
    }
    const stack = stackBases.get(bestX)!;
    const top = stack.reduce((a, b) => ((a.stackYMm ?? 0) + a.heightMm > (b.stackYMm ?? 0) + b.heightMm ? a : b));
    const topY = (top.stackYMm ?? 0) + top.heightMm;
    const topBox = boxes.find((b) => b.id === top.boxId);
    if (topBox) {
      const sortedT = [topBox.dimensions.w, topBox.dimensions.h, topBox.dimensions.d].sort((a, b) => b - a);
      const parentW = sortedT[0];
      const parentD = sortedT[1];
      if (r.widthOnShelf > parentW || r.depthOnShelf > parentD) {
        return { shelfId: shelf.id, valid: false, reason: "Pyramid rule: upper box wouldn't fit on top (W or D too large)." };
      }
    }
    const limit = shelf.maxStackCount ?? settings.defaultMaxStackCount;
    if (limit != null && stack.length >= limit) {
      return { shelfId: shelf.id, valid: false, reason: `Stack limit reached: max ${limit} boxes.` };
    }
    if (r.widthOnShelf > stack[0].widthMm) {
      return { shelfId: shelf.id, valid: false, reason: "Box is wider than the stack base." };
    }
    return {
      shelfId: shelf.id,
      valid: true,
      targetMode: "stacked",
      positionMm: bestX,
      parentBoxId: top.boxId,
      stackYMm: topY,
      stackXPx: bestX * PX_PER_MM_BASE,
      stackYPx: (shelf.heightMm - topY - r.heightOnShelf) * PX_PER_MM_BASE,
      stackWPx: r.widthOnShelf * PX_PER_MM_BASE,
      indicatorOrientation: "horizontal",
      width: r.widthOnShelf,
      height: r.heightOnShelf,
    };
  }
}

// ─── Misc ───────────────────────────────────────────────────────────────────

const HUES = [30, 50, 65, 80, 100, 120, 200, 230, 260];
export function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

const SolverOverlay: React.FC<{ phase: number; progress: number }> = ({ phase, progress }) => {
  const phases = ["Assigning boxes to shelves", "Packing each shelf", "Local search refinement"];
  return (
    <div className="solver-overlay">
      <div className="panel">
        <div style={{ fontSize: 13, fontWeight: 600 }}>Solving layout…</div>
        <div className="solver-phases">
          {phases.map((p, i) => (
            <div key={p} className={"solver-phase " + (i < phase ? "done" : i === phase ? "active" : "")}>
              <span className="phase-marker">{i < phase && <Icons.Check size={9} strokeWidth={2.4} />}</span>
              {p}
            </div>
          ))}
        </div>
        <div className="solver-progress">
          <div className="solver-progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

const LayoutNamePicker: React.FC = () => {
  const layout = useStore(selectActiveLayout);
  const layouts = useStore((s) => s.layouts);
  const saveAs = useStore((s) => s.saveLayoutAs);
  const activate = useStore((s) => s.activateLayout);
  const del = useStore((s) => s.deleteLayout);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button className="btn ghost" onClick={() => setOpen((v) => !v)} style={{ fontWeight: 500 }}>
        {layout?.name ?? "Untitled"}
        <Icons.ChevronDown size={10} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            zIndex: 100,
            minWidth: 220,
            padding: 4,
          }}
          onClick={() => setOpen(false)}
        >
          <DropdownItem
            label="Save as…"
            icon={<Icons.Save size={12} />}
            onClick={() => {
              const name = window.prompt("Save current layout as:");
              if (name) void saveAs(name);
            }}
          />
          {layouts
            .filter((l) => l.name !== "Current arrangement")
            .map((l) => (
              <div
                key={l.id}
                style={{
                  padding: "5px 8px",
                  fontSize: 12,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  cursor: "pointer",
                  color: layout?.id === l.id ? "var(--accent)" : "var(--text-1)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => activate(l.id)}
              >
                <span>{l.name}</span>
                <button
                  className="btn ghost icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete layout "${l.name}"?`)) void del(l.id);
                  }}
                >
                  <Icons.Trash size={10} />
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const DropdownItem: React.FC<{ label: string; icon?: React.ReactNode; onClick?: () => void }> = ({
  label,
  icon,
  onClick,
}) => (
  <div
    style={{
      padding: "5px 8px",
      fontSize: 12,
      borderRadius: 3,
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      color: "var(--text-1)",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    onClick={onClick}
  >
    {icon}
    {label}
  </div>
);
