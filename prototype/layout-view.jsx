// Layout view — the centerpiece.
const LayoutView = () => {
  const { state, dispatch } = useApp();
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);

  // Pan + zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const panState = useRef(null);
  const fitDoneRef = useRef(false);

  // Drag state
  const [drag, setDrag] = useState(null);
  // drag: { box, sourcePlacement, mouse: {x,y}, offsetInBoxPx: {dx,dy}, hover: {shelfId, position, valid, reason} | null }

  // Make tweaks available globally to BoxRect
  useEffect(() => {
    window.__tweaks = state.tweaks;
  }, [state.tweaks]);

  // Scene math
  const scene = useMemo(() => {
    const built = buildSceneLayout(state);
    const shelfMap = {};
    for (const cab of built.cabinetBoxes) {
      for (const sh of cab.shelves) shelfMap[sh.shelf.id] = sh;
    }
    return { ...built, shelves: shelfMap };
  }, [state.cabinets, state.shelves]);

  const scale = PX_PER_MM_BASE * zoom;

  // Initial fit-to-viewport once the canvas knows its size.
  useLayoutEffect(() => {
    if (fitDoneRef.current) return;
    if (!canvasRef.current) return;
    const cr = canvasRef.current.getBoundingClientRect();
    if (cr.width < 50 || cr.height < 50) return;
    const sceneWpx = scene.totalW * PX_PER_MM_BASE;
    const sceneHpx = scene.totalH * PX_PER_MM_BASE;
    if (sceneWpx === 0) return;
    const zx = (cr.width - 48) / sceneWpx;
    const zy = (cr.height - 48) / sceneHpx;
    const z = Math.max(0.4, Math.min(1.2, Math.min(zx, zy)));
    setZoom(z);
    // Center horizontally
    const x = Math.max(24, (cr.width - sceneWpx * z) / 2);
    setPan({ x, y: 16 });
    fitDoneRef.current = true;
  }, [scene.totalW, scene.totalH]);

  // Wheel: zoom around mouse position
  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && e.deltaY !== 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
      // horizontal scroll — pan
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.3, Math.min(3, zoom * factor));
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const sceneX = (mx - pan.x) / zoom;
      const sceneY = (my - pan.y) / zoom;
      setZoom(newZoom);
      setPan({ x: mx - sceneX * newZoom, y: my - sceneY * newZoom });
      e.preventDefault();
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      e.preventDefault();
    }
  };

  // Mouse-down on canvas background → start panning
  const onCanvasMouseDown = (e) => {
    if (e.target.closest(".box-rect")) return;
    if (e.target.closest(".room-to-grow-label")) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest(".zoom-indicator")) return;
    panState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    document.body.style.cursor = "grabbing";
    dispatch({ type: "SELECT_BOX", id: null });
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!panState.current) return;
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setPan({ x: panState.current.panX + dx, y: panState.current.panY + dy });
    };
    const onUp = () => {
      panState.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // === Drag handling ===
  const startBoxDrag = (e, box, placement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const offsetDx = e.clientX - rect.left;
    const offsetDy = e.clientY - rect.top;
    const initialMouse = { x: e.clientX, y: e.clientY };
    setDrag({
      box,
      sourcePlacement: placement, // may be null for tray drags
      mouse: { x: e.clientX, y: e.clientY },
      initialMouse,
      offset: { dx: offsetDx, dy: offsetDy },
      sourceSize: { w: rect.width, h: rect.height },
      threshold: false,
      hover: null,
    });
  };

  // Drag move + drop
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dx = e.clientX - drag.initialMouse.x;
      const dy = e.clientY - drag.initialMouse.y;
      const threshold = drag.threshold || Math.hypot(dx, dy) > 5;
      const mouse = { x: e.clientX, y: e.clientY };
      let hover = null;
      if (threshold && canvasRef.current) {
        const cr = canvasRef.current.getBoundingClientRect();
        const sceneX = (e.clientX - cr.left - pan.x) / zoom / PX_PER_MM_BASE; // mm in scene
        const sceneY = (e.clientY - cr.top - pan.y) / zoom / PX_PER_MM_BASE;
        // find shelf under cursor
        for (const cab of scene.cabinetBoxes) {
          for (const sh of cab.shelves) {
            if (sceneX >= sh.x && sceneX <= sh.x + sh.w && sceneY >= sh.y && sceneY <= sh.y + sh.h) {
              hover = computeHover(state, drag.box, drag.sourcePlacement, sh, sceneX - sh.x, sceneY - sh.y);
              break;
            }
          }
          if (hover) break;
        }
        // check tray drop area (right pane)
        const trayEl = document.querySelector(".unplaced-tray-drop");
        if (trayEl) {
          const tr = trayEl.getBoundingClientRect();
          if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
            hover = { tray: true, valid: true, reason: "Send to unplaced" };
          }
        }
      }
      setDrag((d) => d ? { ...d, mouse, threshold, hover } : null);
    };
    const onUp = (e) => {
      if (drag.threshold) {
        // attempt drop
        if (drag.hover && drag.hover.valid) {
          if (drag.hover.tray) {
            // remove from layout
            if (drag.sourcePlacement) {
              dispatch({ type: "REMOVE_FROM_SHELF", boxId: drag.box.id });
              dispatch({ type: "SHOW_TOAST", toast: { kind: "info", message: `Moved “${drag.box.name}” to the unplaced tray.` } });
            }
          } else {
            applyDrop(state, dispatch, drag);
          }
        } else if (drag.hover && !drag.hover.valid) {
          dispatch({ type: "SHOW_TOAST", toast: { kind: "error", message: drag.hover.reason || "Cannot drop here." } });
        } else if (drag.threshold) {
          // dropped over empty space — snap back, no toast
        }
      } else {
        // didn't pass threshold = click — select
        dispatch({ type: "SELECT_BOX", id: drag.box.id });
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  // Run a new solve with phase animation
  const [solving, setSolving] = useState(null); // {phase, progress}
  const runSolve = (preservePins = false) => {
    setSolving({ phase: 0, progress: 0 });
    const phases = ["Assigning to shelves", "Packing shelves", "Local search"];
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const p = Math.min(1, elapsed / 1600);
      const phase = Math.min(2, Math.floor(p * 3));
      setSolving({ phase, progress: p });
      if (p < 1) requestAnimationFrame(tick);
      else {
        const newLayout = window.SOLVER.solve({
          cabinets: state.cabinets,
          shelves: state.shelves,
          boxes: state.boxes,
        });
        // tag changed placements vs previous layout
        const prev = state.activeLayout;
        if (prev) {
          const prevByBox = {};
          for (const p of prev.placements) prevByBox[p.boxId] = p;
          for (const p of newLayout.placements) {
            const old = prevByBox[p.boxId];
            p.changed = !old || old.shelfId !== p.shelfId || Math.abs(old.positionMm - p.positionMm) > 5;
          }
        }
        dispatch({ type: "SET_LAYOUT", layout: newLayout, compare: !!preservePins });
        setSolving(null);
      }
    };
    requestAnimationFrame(tick);
  };

  const selectedBox = state.selectedBoxId ? findBox(state, state.selectedBoxId) : null;
  const selectedPlacement = state.selectedBoxId ? findPlacement(state, state.selectedBoxId) : null;
  const hasPins = state.activeLayout?.placements.some((p) => p.pinned);
  const expansionSiblingIds = new Set();
  if (selectedBox) {
    for (const sib of getSibling(state, selectedBox.id)) {
      if (sib.id !== selectedBox.id) expansionSiblingIds.add(sib.id);
    }
  }

  // Missing-dimensions banner
  const missingDimGames = state.boxes.filter((b) => !b.dimensions || b.dimensions.w === 0);

  // Largest gap meta
  const lgp = state.activeLayout?.metrics;
  const lgpShelf = lgp ? findShelf(state, lgp.largestGapShelfId) : null;
  const lgpCabinet = lgpShelf ? findCabinet(state, lgpShelf.cabinetId) : null;

  // Compute drop indicator position (in mm) for rendering
  const dropIndicator = drag?.hover && !drag.hover.tray && drag.hover.shelfId ? drag.hover : null;

  // Bucket placements by shelf for room-to-grow rendering
  const roomToGrowByShelf = useMemo(() => {
    const map = {};
    if (!state.activeLayout) return map;
    let globalBest = { width: 0 };
    for (const sh of state.shelves) {
      const placements = state.activeLayout.placements.filter((p) => p.shelfId === sh.id);
      const [start, w] = shelfLargestGap(sh, placements);
      map[sh.id] = { start, width: w };
      if (w > globalBest.width) globalBest = { shelfId: sh.id, start, width: w };
    }
    return { byShelf: map, best: globalBest };
  }, [state.activeLayout, state.shelves]);

  return (
    <div className={"layout-view density-" + state.tweaks.density}>
      <div className="main" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div className="toolbar">
          <button
            className="btn primary"
            disabled={hasPins}
            onClick={() => {
              if (state.activeLayoutDirty) {
                if (!window.confirm("Replace the current unsaved arrangement?")) return;
              }
              dispatch({ type: "RESET_PINS" });
              runSolve(false);
            }}
            title={hasPins ? "Disable pins or use Re-solve around pins" : "Run a fresh solve"}
          >
            <Icons.Play size={11} /> Solve
          </button>
          <button
            className="btn"
            disabled={!hasPins}
            onClick={() => runSolve(true)}
          >
            <Icons.Refresh size={12} /> Re-solve around pins
          </button>
          <div className="toolbar-divider"></div>
          <div className="slider-wrap" title="Proximity weight: 0 = ignore grouping, 1 = strict grouping">
            <span className="input-label">Proximity</span>
            <input
              className="slider"
              type="range"
              min="0" max="1" step="0.05"
              value={state.proximityWeight}
              onChange={(e) => dispatch({ type: "SET_PROXIMITY", value: parseFloat(e.target.value) })}
            />
            <span className="input-label" style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", minWidth: 24 }}>
              {state.proximityWeight.toFixed(2)}
            </span>
          </div>
          <div className="toolbar-divider"></div>
          <LayoutNamePicker />
          <div className="toolbar-spacer"></div>
          <button
            className="btn ghost"
            disabled={!hasPins}
            onClick={() => {
              dispatch({ type: "RESET_PINS" });
              dispatch({ type: "SHOW_TOAST", toast: { kind: "info", message: "All pins removed." } });
            }}
          >
            Reset all pins
          </button>
          {state.previousLayout && (
            <button
              className={"btn " + (state.compareMode ? "accent" : "")}
              onClick={() => dispatch({ type: "SET_COMPARE", value: !state.compareMode })}
            >
              {state.compareMode ? "Hide changes" : "Compare with previous"}
            </button>
          )}
        </div>

        {missingDimGames.length > 0 && (
          <div className="banner">
            <span className="icon"><Icons.Warning size={14} /></span>
            <span>
              <strong>{missingDimGames.length}</strong> games are missing dimensions and are excluded from the solve.
            </span>
            <button onClick={() => { dispatch({ type: "SET_LIBRARY_FILTER", value: "missing-dims" }); dispatch({ type: "SET_VIEW", view: "library" }); }}>
              Review in Library →
            </button>
          </div>
        )}

        {/* Canvas */}
        <div
          className="canvas-wrap"
          ref={canvasRef}
          onWheel={onWheel}
          onMouseDown={onCanvasMouseDown}
        >
          <div
            ref={sceneRef}
            className="canvas-scene"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {scene.cabinetBoxes.map((cab) => (
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
                    {state.shelves.filter((s) => s.cabinetId === cab.cab.id).length} shelves · {cab.shelves.reduce((a, s) => a + s.w, 0)} mm
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
                    const placements = state.activeLayout?.placements.filter((p) => p.shelfId === sh.shelf.id) || [];
                    const isDropTarget = drag?.hover?.shelfId === sh.shelf.id;
                    const isInvalidDrop = drag?.threshold && drag?.hover?.shelfId === sh.shelf.id && !drag.hover.valid;
                    const isHoverInvalidGlobal = drag?.threshold && !drag?.hover?.valid && drag?.hover?.shelfId === sh.shelf.id;
                    const gap = roomToGrowByShelf.byShelf?.[sh.shelf.id];
                    const isBestGap = roomToGrowByShelf.best?.shelfId === sh.shelf.id;
                    return (
                      <ShelfRender
                        key={sh.shelf.id}
                        sh={sh}
                        scene={scene}
                        placements={placements}
                        state={state}
                        dispatch={dispatch}
                        onDragStart={startBoxDrag}
                        selectedBoxId={state.selectedBoxId}
                        expansionSiblingIds={expansionSiblingIds}
                        isDropTarget={isDropTarget}
                        isInvalidDrop={isHoverInvalidGlobal}
                        dropIndicator={isDropTarget ? drag.hover : null}
                        gap={gap}
                        isBestGap={isBestGap}
                        roomToGrowMode={state.tweaks.roomToGrow}
                        draggingBoxId={drag?.box?.id}
                        compareMode={state.compareMode}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Zoom indicator */}
          <div className="zoom-indicator">
            <button onClick={() => { const n = Math.max(0.3, zoom / 1.2); setZoom(n); }} title="Zoom out"><Icons.ZoomOut size={11} /></button>
            <span style={{ minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => { const n = Math.min(3, zoom * 1.2); setZoom(n); }} title="Zoom in"><Icons.ZoomIn size={11} /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 24, y: 24 }); }} title="Fit"><Icons.Maximize size={11} /></button>
          </div>

          {solving && <SolverOverlay solving={solving} />}
        </div>

        {/* Status bar */}
        <div className="status-bar">
          <div className="status-metric">
            <span className="label">Largest gap</span>
            <span className="value">{lgp ? `${lgp.largestGapMm} mm` : "—"}</span>
            {lgpCabinet && (
              <span className="sub">
                · {lgpCabinet.name}, shelf {(lgpShelf.position || 0) + 1}
              </span>
            )}
          </div>
          <div className="status-metric">
            <span className="label">Proximity</span>
            <span className="value">{lgp ? lgp.proximityScore : "—"}</span>
            <svg className="spark" viewBox="0 0 60 16">
              <path d="M0,12 L10,10 L20,11 L30,7 L40,8 L50,4 L60,5" />
            </svg>
          </div>
          <div className="status-metric">
            <span className="label">Placed</span>
            <span className="value">
              {lgp ? `${lgp.placedCount} / ${lgp.placedCount + lgp.unplacedCount}` : "—"}
            </span>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "11px" }}>
            Hold ⌘/Ctrl + scroll to zoom · drag the background to pan
          </div>
        </div>
      </div>

      {/* Right pane */}
      <RightPane onDragStart={startBoxDrag} drag={drag} />

      {/* Drag ghost */}
      {drag && drag.threshold && (
        <div
          className="drag-ghost box-rect"
          style={{
            left: drag.mouse.x - drag.offset.dx,
            top: drag.mouse.y - drag.offset.dy,
            width: drag.sourceSize.w,
            height: drag.sourceSize.h,
            "--hue": drag.box.hue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {drag.sourceSize.w < 24 ? (
            <div className="box-label-standing">{drag.box.name}</div>
          ) : (
            <div className="box-label-stacked">{drag.box.name}</div>
          )}
        </div>
      )}

      {/* Toast(s) */}
      {state.toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind === "error" ? "error" : "")}>
          {t.kind === "error" ? <Icons.Warning size={13} /> : <Icons.Info size={13} />}
          <span>{t.message}</span>
          <span className="close" onClick={() => dispatch({ type: "DISMISS_TOAST", id: t.id })}><Icons.X size={11} /></span>
        </div>
      ))}
    </div>
  );
};

// === ShelfRender ===
function ShelfRender({ sh, scene, placements, state, dispatch, onDragStart, selectedBoxId, expansionSiblingIds, isDropTarget, isInvalidDrop, dropIndicator, gap, isBestGap, roomToGrowMode, draggingBoxId, compareMode }) {
  const shelf = sh.shelf;
  const w = shelf.widthMm * PX_PER_MM_BASE;
  const h = shelf.heightMm * PX_PER_MM_BASE;

  const showRoomToGrow = isBestGap && gap?.width > 50;

  return (
    <div
      className={"shelf" + (isInvalidDrop ? " drop-invalid" : "")}
      style={{ width: w, height: h, position: "relative", flexShrink: 0 }}
      data-shelf-id={shelf.id}
    >
      {/* Mixed mode divider */}
      {shelf.orientation === "mixed" && (() => {
        const standing = placements.filter((p) => p.orientation === "standing");
        if (standing.length === 0) return null;
        const rightmost = Math.max(...standing.map((p) => p.positionMm + p.widthMm));
        return <div className="shelf-divider" style={{ left: (rightmost + 12) * PX_PER_MM_BASE }} />;
      })()}

      {/* Room to grow */}
      {showRoomToGrow && roomToGrowMode !== "off" && (
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

      {/* Boxes */}
      {placements.map((p) => {
        const box = findBox(state, p.boxId);
        if (!box) return null;
        return (
          <BoxRectInline
            key={p.boxId}
            placement={p}
            box={box}
            shelfBox={sh}
            isSelected={selectedBoxId === box.id}
            isExpansionSelected={expansionSiblingIds.has(box.id)}
            isDraggingSource={draggingBoxId === box.id}
            isCompareChanged={compareMode && p.changed}
            onDragStart={onDragStart}
            onSelect={(id) => dispatch({ type: "SELECT_BOX", id })}
          />
        );
      })}

      {/* Drop indicator */}
      {dropIndicator?.valid && dropIndicator?.indicatorOrientation === "vertical" && (
        <div
          className="drop-indicator vertical"
          style={{ left: dropIndicator.positionPx, top: 0, bottom: 0 }}
        />
      )}
      {dropIndicator?.valid && dropIndicator?.indicatorOrientation === "horizontal" && (
        <div
          className="drop-indicator horizontal"
          style={{ left: dropIndicator.stackXPx, top: dropIndicator.stackYPx, width: dropIndicator.stackWPx }}
        />
      )}

      {/* Shelf meta */}
      <div className="shelf-meta">
        #{shelf.position + 1} · {shelf.widthMm}×{shelf.heightMm}×{shelf.depthMm} · {shelf.orientation}
      </div>
    </div>
  );
}

// Inline version of BoxRect that uses shelfBox-relative coordinates
function BoxRectInline({ placement, box, shelfBox, isSelected, isExpansionSelected, isDraggingSource, isCompareChanged, onDragStart, onSelect }) {
  let x = placement.positionMm;
  let yFromBottom; // mm from shelf floor
  if (placement.orientation === "standing") yFromBottom = 0;
  else yFromBottom = placement.stackYMm || 0;
  const y = shelfBox.h - placement.heightMm - yFromBottom;

  const labelMode = window.__tweaks?.labelMode || "rotated";
  const pxW = placement.widthMm * PX_PER_MM_BASE;
  const pxH = placement.heightMm * PX_PER_MM_BASE;

  let label = null;
  if (labelMode !== "none") {
    if (placement.orientation === "standing") {
      if (pxW > 6 && pxH > 30) {
        if (labelMode === "horizontal" && pxW > 32) {
          label = <div className="box-label-stacked" style={{ fontSize: "9px", padding: "0 2px" }}>{box.name}</div>;
        } else {
          label = <div className="box-label-standing">{box.name}</div>;
        }
      }
    } else if (pxW > 24 && pxH > 8) {
      label = <div className="box-label-stacked">{box.name}</div>;
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
        left: x * PX_PER_MM_BASE,
        top: y * PX_PER_MM_BASE,
        width: pxW,
        height: pxH,
        "--hue": box.hue,
      }}
      onMouseDown={(e) => onDragStart?.(e, box, placement)}
      onClick={(e) => { e.stopPropagation(); onSelect?.(box.id); }}
      title={`${box.name} — ${box.dimensions.w}×${box.dimensions.h}×${box.dimensions.d} mm`}
    >
      {label}
      {placement.pinned && <Icons.LockSmall className="box-pin-icon" />}
      {box.dimensionsSource === "override" && <div className="box-override-dot" />}
    </div>
  );
}

// Drop validation and hover computation
function computeHover(state, draggedBox, sourcePlacement, shelfBox, xMm, yMmFromTop) {
  const shelf = shelfBox.shelf;
  const placements = state.activeLayout?.placements.filter((p) => p.shelfId === shelf.id && p.boxId !== draggedBox.id) || [];
  const dims = draggedBox.dimensions;
  if (!dims || dims.w === 0) return { shelfId: shelf.id, valid: false, reason: "Game is missing dimensions." };

  // Mode mismatch check first
  // Decide which mode the user is targeting based on cursor position:
  // If cursor y is in lower 30% of shelf and shelf accepts vertical, treat as standing.
  // For horizontal shelf -> stacked. For mixed -> based on cursor x.
  let targetMode;
  if (shelf.orientation === "vertical") targetMode = "standing";
  else if (shelf.orientation === "horizontal") targetMode = "stacked";
  else {
    // Mixed: cursor y > 50% from top OR cursor over standing zone
    targetMode = yMmFromTop > shelf.heightMm * 0.5 ? "standing" : "stacked";
    // Better: standing zone is generally left part of shelf
    const standing = placements.filter((p) => p.orientation === "standing");
    const standingRight = standing.length ? Math.max(...standing.map((p) => p.positionMm + p.widthMm)) : 0;
    if (xMm < standingRight + 24 && standingRight > 0) targetMode = "standing";
    else if (xMm > standingRight + 24) targetMode = "stacked";
  }

  const r = window.SOLVER.resolveDims(draggedBox, targetMode);
  if (!r) return { shelfId: shelf.id, valid: false, reason: "Cannot resolve dimensions." };

  // Size checks
  if (r.heightOnShelf > shelf.heightMm) return { shelfId: shelf.id, valid: false, reason: `Box is taller than the shelf (${r.heightOnShelf} > ${shelf.heightMm} mm).` };
  if (r.depthOnShelf > shelf.depthMm) return { shelfId: shelf.id, valid: false, reason: `Box is deeper than the shelf (${r.depthOnShelf} > ${shelf.depthMm} mm).` };

  if (targetMode === "standing") {
    // Find insertion point along width
    const sorted = placements.filter((p) => p.orientation === "standing").sort((a, b) => a.positionMm - b.positionMm);
    let insertIndex = 0;
    for (const p of sorted) {
      if (xMm < p.positionMm + p.widthMm / 2) break;
      insertIndex++;
    }
    // Determine drop start position
    let insertX = 0;
    if (insertIndex < sorted.length) {
      insertX = sorted[insertIndex].positionMm;
    } else if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      insertX = last.positionMm + last.widthMm;
    }
    // Check it would fit considering existing total
    const usedW = sorted.reduce((acc, p) => acc + p.widthMm, 0);
    const padding = shelf.paddingReserveMm ?? 20;
    if (usedW + r.widthOnShelf > shelf.widthMm - padding) {
      return { shelfId: shelf.id, valid: false, reason: "Adding this box would consume the padding reserve." };
    }
    return {
      shelfId: shelf.id,
      valid: true,
      targetMode,
      insertIndex,
      positionMm: insertX,
      positionPx: insertX * PX_PER_MM_BASE,
      indicatorOrientation: "vertical",
      width: r.widthOnShelf,
      height: r.heightOnShelf,
    };
  } else {
    // Stacked: find which stack we're aiming for, and the top
    const stackBases = {};
    for (const p of placements.filter((pp) => pp.orientation === "stacked")) {
      const key = p.positionMm;
      if (!stackBases[key]) stackBases[key] = [];
      stackBases[key].push(p);
    }
    // pick closest stack
    let bestStackX = null;
    let bestDist = Infinity;
    for (const key of Object.keys(stackBases)) {
      const stack = stackBases[key];
      const bw = stack[0].widthMm;
      const cx = parseFloat(key) + bw / 2;
      const d = Math.abs(xMm - cx);
      if (d < bestDist) {
        bestDist = d;
        bestStackX = parseFloat(key);
      }
    }
    if (bestStackX === null || bestDist > 200) {
      // start a new stack at this position
      const proposedX = Math.max(0, Math.min(shelf.widthMm - r.widthOnShelf, xMm - r.widthOnShelf / 2));
      // Validate no overlap
      const padding = shelf.paddingReserveMm ?? 20;
      const totalW = placements.filter((p) => p.orientation === "stacked").reduce((acc, p) => {
        // use base width only once per stack
        return acc;
      }, 0);
      return {
        shelfId: shelf.id,
        valid: true,
        targetMode: "stacked",
        positionMm: proposedX,
        stackXPx: proposedX * PX_PER_MM_BASE,
        stackYPx: (shelf.heightMm - r.heightOnShelf - 0) * PX_PER_MM_BASE,
        stackWPx: r.widthOnShelf * PX_PER_MM_BASE,
        indicatorOrientation: "horizontal",
        parentBoxId: null,
        stackYMm: 0,
        width: r.widthOnShelf,
        height: r.heightOnShelf,
      };
    }
    // Place on top of stack at bestStackX
    const stack = stackBases[bestStackX];
    const top = stack.reduce((a, b) => ((a.stackYMm || 0) + a.heightMm > (b.stackYMm || 0) + b.heightMm ? a : b));
    const topY = (top.stackYMm || 0) + top.heightMm;
    const topBox = findBox(state, top.boxId);
    // Pyramid rule
    if (topBox) {
      const sorted = [topBox.dimensions.w, topBox.dimensions.h, topBox.dimensions.d].sort((a, b) => b - a);
      const parentFaceArea = sorted[0] * sorted[1];
      if (parentFaceArea <= r.faceArea) {
        return { shelfId: shelf.id, valid: false, reason: "Pyramid rule: lower box must be larger by face area." };
      }
    }
    // Stack limit
    const limit = shelf.maxStackCount ?? state.settings.defaultMaxStackCount;
    if (limit != null && stack.length >= limit) {
      return { shelfId: shelf.id, valid: false, reason: `Stack limit reached: max ${limit} boxes per stack.` };
    }
    // Width fit
    if (r.widthOnShelf > stack[0].widthMm) {
      return { shelfId: shelf.id, valid: false, reason: "Box is wider than the stack base." };
    }
    return {
      shelfId: shelf.id,
      valid: true,
      targetMode: "stacked",
      positionMm: bestStackX,
      parentBoxId: top.boxId,
      stackYMm: topY,
      stackXPx: bestStackX * PX_PER_MM_BASE,
      stackYPx: (shelf.heightMm - topY - r.heightOnShelf) * PX_PER_MM_BASE,
      stackWPx: r.widthOnShelf * PX_PER_MM_BASE,
      indicatorOrientation: "horizontal",
      width: r.widthOnShelf,
      height: r.heightOnShelf,
    };
  }
}

// Apply a valid drop
function applyDrop(state, dispatch, drag) {
  const h = drag.hover;
  const box = drag.box;
  const placements = (state.activeLayout?.placements || []).filter((p) => p.boxId !== box.id);
  const newPlacement = {
    boxId: box.id,
    shelfId: h.shelfId,
    positionMm: h.positionMm,
    widthMm: h.width,
    heightMm: h.height,
    stackYMm: h.targetMode === "stacked" ? h.stackYMm : undefined,
    orientation: h.targetMode,
    forwardFace: drag.sourcePlacement?.forwardFace || "wh",
    stackParentBoxId: h.targetMode === "stacked" ? h.parentBoxId : null,
    pinned: true,
  };
  placements.push(newPlacement);
  const unplaced = (state.activeLayout?.unplaced || []).filter((u) => u.boxId !== box.id);
  dispatch({
    type: "UPDATE_PLACEMENTS",
    placements,
    unplaced,
    metrics: {
      ...state.activeLayout.metrics,
      placedCount: placements.length,
      unplacedCount: unplaced.length,
    },
  });
  dispatch({ type: "SELECT_BOX", id: box.id });
}

// === SolverOverlay ===
function SolverOverlay({ solving }) {
  const phases = [
    "Assigning boxes to shelves",
    "Packing each shelf",
    "Local search refinement",
  ];
  return (
    <div className="solver-overlay">
      <div className="panel">
        <div style={{ fontSize: 13, fontWeight: 600 }}>Solving layout…</div>
        <div className="solver-phases">
          {phases.map((p, i) => (
            <div
              key={p}
              className={
                "solver-phase " +
                (i < solving.phase ? "done" : i === solving.phase ? "active" : "")
              }
            >
              <span className="phase-marker">
                {i < solving.phase && <Icons.Check size={9} strokeWidth={2.4} />}
              </span>
              {p}
            </div>
          ))}
        </div>
        <div className="solver-progress">
          <div className="solver-progress-bar" style={{ width: `${solving.progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// === Layout name picker ===
function LayoutNamePicker() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button className="btn ghost" onClick={() => setOpen((v) => !v)} style={{ fontWeight: 500 }}>
        {state.activeLayoutName || "Untitled"}
        {state.activeLayoutDirty && <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)", display: "inline-block", marginLeft: 4 }}></span>}
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
            minWidth: 200,
            padding: 4,
          }}
          onClick={() => setOpen(false)}
        >
          <DropdownItem label="Save as…" icon={<Icons.Save size={12} />} />
          <DropdownItem label="Save" disabled={!state.activeLayoutDirty} />
          <DropdownItem label="Load…" />
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <DropdownItem label="Delete this layout" danger />
        </div>
      )}
    </div>
  );
}

function DropdownItem({ label, icon, disabled, danger, onClick }) {
  return (
    <div
      style={{
        padding: "5px 8px",
        fontSize: 12,
        borderRadius: 3,
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: disabled ? "var(--text-4)" : danger ? "var(--danger)" : "var(--text-1)",
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={disabled ? undefined : onClick}
    >
      {icon}
      {label}
    </div>
  );
}

window.LayoutView = LayoutView;
