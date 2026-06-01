// Right pane: Unplaced tray + Action panel.
function RightPane({ onDragStart, drag }) {
  const { state, dispatch } = useApp();
  const selectedBox = state.selectedBoxId ? findBox(state, state.selectedBoxId) : null;
  const selectedPlacement = state.selectedBoxId ? findPlacement(state, state.selectedBoxId) : null;
  const unplaced = state.activeLayout?.unplaced || [];
  const isDragTargetTray = drag?.threshold && drag?.hover?.tray;

  return (
    <div className="right-pane">
      <div
        className="pane-section unplaced-tray-drop"
        style={{
          minHeight: 180,
          flex: "0 1 38%",
          background: isDragTargetTray ? "var(--accent-soft)" : undefined,
          transition: "background 100ms",
        }}
      >
        <div className="pane-section-header">
          <span>Unplaced tray</span>
          <span className="count">{unplaced.length}</span>
        </div>
        <div className="pane-section-body">
          {unplaced.length === 0 ? (
            <div className="tray-empty">All games placed.</div>
          ) : (
            unplaced.map((u) => {
              const b = findBox(state, u.boxId);
              if (!b) return null;
              return (
                <div
                  key={u.boxId}
                  className="tray-item"
                  onMouseDown={(e) => onDragStart(e, b, null)}
                  onClick={() => dispatch({ type: "SELECT_BOX", id: b.id })}
                >
                  <div className="name">
                    <Icons.Tray size={11} className="lib-icon-tray" />
                    {b.name}
                  </div>
                  <div className="dims">
                    {b.dimensions.w > 0
                      ? `${b.dimensions.w} × ${b.dimensions.h} × ${b.dimensions.d} mm`
                      : "no dimensions"}
                  </div>
                  <div className="reason">{u.reason}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pane-section" style={{ flex: "1 1 auto", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="pane-section-header">
          <span>{selectedBox ? "Selected box" : "Action panel"}</span>
          {selectedBox && (
            <button
              className="btn ghost sm"
              onClick={() => dispatch({ type: "SELECT_BOX", id: null })}
              title="Deselect"
            >
              <Icons.X size={10} />
            </button>
          )}
        </div>
        <div className="pane-section-body" style={{ padding: 0 }}>
          {!selectedBox ? (
            <div className="action-panel-empty">
              <Icons.Sliders size={20} />
              <div>Select a box to act on it.</div>
              <div style={{ fontSize: 10, color: "var(--text-4)" }}>
                Click any box on the canvas, or pick from the tray.
              </div>
            </div>
          ) : (
            <ActionPanel box={selectedBox} placement={selectedPlacement} />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPanel({ box, placement }) {
  const { state, dispatch } = useApp();
  const shelf = placement ? findShelf(state, placement.shelfId) : null;
  const cabinet = shelf ? findCabinet(state, shelf.cabinetId) : null;
  const expansionOf = box.expansionOfBoxId ? findBox(state, box.expansionOfBoxId) : null;
  const expansions = state.boxes.filter((b) => b.expansionOfBoxId === box.id);

  const faces = ["wh", "wd", "hd"];
  const currentFace = placement?.forwardFace || box.preferredForwardFace;

  const cycleFace = () => {
    if (!placement) return;
    const idx = faces.indexOf(currentFace);
    const next = faces[(idx + 1) % faces.length];
    const newPlacements = state.activeLayout.placements.map((p) =>
      p.boxId === box.id ? { ...p, forwardFace: next, pinned: true } : p
    );
    dispatch({ type: "UPDATE_PLACEMENTS", placements: newPlacements });
    dispatch({ type: "SHOW_TOAST", toast: { kind: "info", message: `Rotated to ${faceLabel(next)}` } });
  };

  return (
    <div className="action-panel">
      <div className="action-game-name">{box.name}</div>
      <div className="action-meta">
        <div className="action-meta-row">
          <span className="label">Dimensions</span>
          <span className="value">{box.dimensions.w} × {box.dimensions.h} × {box.dimensions.d} mm</span>
        </div>
        <div className="action-meta-row">
          <span className="label">Source</span>
          <span><span className={"tag " + box.dimensionsSource}>{box.dimensionsSource}</span></span>
        </div>
        {expansionOf && (
          <div className="action-meta-row">
            <span className="label">Expansion of</span>
            <span style={{ fontSize: 11, color: "var(--text-2)" }}>{expansionOf.name}</span>
          </div>
        )}
        {expansions.length > 0 && (
          <div className="action-meta-row">
            <span className="label">Expansions</span>
            <span style={{ fontSize: 11, color: "var(--text-2)" }}>{expansions.length}</span>
          </div>
        )}
        {placement && (
          <Fragment>
            <div className="action-meta-row">
              <span className="label">Placement</span>
              <span style={{ fontSize: 11 }}>
                {cabinet?.name}, #{shelf.position + 1}
              </span>
            </div>
            <div className="action-meta-row">
              <span className="label">Orientation</span>
              <span className="value">{placement.orientation}</span>
            </div>
            <div className="action-meta-row">
              <span className="label">Pinned</span>
              <span>
                {placement.pinned ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-1)", fontSize: 11 }}>
                    <Icons.LockSmall /> yes
                  </span>
                ) : (
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>no</span>
                )}
              </span>
            </div>
          </Fragment>
        )}
        {!placement && (
          <div className="action-meta-row">
            <span className="label">Status</span>
            <span style={{ color: "var(--warning)", fontSize: 11 }}>Unplaced</span>
          </div>
        )}
      </div>

      {placement && (
        <div>
          <div className="detail-section-title" style={{ marginBottom: 6 }}>Forward face</div>
          <div className="face-picker">
            {faces.map((f) => (
              <div
                key={f}
                className={"face-option " + (f === currentFace ? "active" : "")}
                onClick={() => {
                  const newPlacements = state.activeLayout.placements.map((p) =>
                    p.boxId === box.id ? { ...p, forwardFace: f, pinned: true } : p
                  );
                  dispatch({ type: "UPDATE_PLACEMENTS", placements: newPlacements });
                }}
              >
                <FaceSvg face={f} dims={box.dimensions} />
                <span className="label">{faceLabel(f).toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="action-buttons">
        {placement && (
          <button className="btn" onClick={cycleFace}>
            <Icons.Rotate size={11} /> Rotate forward face
          </button>
        )}
        {placement && (
          <button
            className="btn"
            onClick={() => {
              dispatch({ type: "SET_PIN", boxId: box.id, pinned: !placement.pinned });
              dispatch({ type: "SHOW_TOAST", toast: { kind: "info", message: placement.pinned ? "Unpinned." : "Pinned." } });
            }}
          >
            {placement.pinned ? <><Icons.Unlock size={11} /> Unpin</> : <><Icons.Lock size={11} /> Pin</>}
          </button>
        )}
        {placement && (
          <button
            className="btn danger"
            onClick={() => dispatch({ type: "REMOVE_FROM_SHELF", boxId: box.id })}
          >
            <Icons.Tray size={11} /> Remove from shelf
          </button>
        )}
        {box.bggId && (
          <button className="btn ghost" onClick={() => dispatch({ type: "SHOW_TOAST", toast: { kind: "info", message: `Would open boardgamegeek.com/boardgame/${box.bggId}` } })}>
            <Icons.External size={11} /> Open in BGG
          </button>
        )}
      </div>
    </div>
  );
}

function faceLabel(f) {
  return { wh: "W × H", wd: "W × D", hd: "H × D" }[f] || f;
}

// Stylized SVG of a box with the given face forward.
function FaceSvg({ face, dims }) {
  const big = Math.max(dims.w, dims.h, dims.d);
  const wp = ((dims.w / big) * 16).toFixed(1);
  const hp = ((dims.h / big) * 16).toFixed(1);
  const dp = ((dims.d / big) * 16).toFixed(1);
  // simple 3-face isometric box
  // we vary which face is "front" by swapping which is the largest visible
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {face === "wh" && (
          <>
            <rect x="4" y="5" width={wp} height={hp} fill="oklch(0.92 0.02 250)" />
            <path d={`M${4 + +wp},5 L${4 + +wp + 3},2 L${4 + +wp + 3},${2 + +hp} L${4 + +wp},${5 + +hp} Z`} fill="oklch(0.88 0.02 250)" />
            <path d={`M4,5 L7,2 L${4 + +wp + 3},2 L${4 + +wp},5 Z`} fill="oklch(0.96 0.02 250)" />
          </>
        )}
        {face === "wd" && (
          <>
            <rect x="4" y="11" width={wp} height={dp} fill="oklch(0.92 0.02 250)" />
            <path d={`M${4 + +wp},11 L${4 + +wp + 3},8 L${4 + +wp + 3},${8 + +dp} L${4 + +wp},${11 + +dp} Z`} fill="oklch(0.88 0.02 250)" />
            <path d={`M4,11 L7,8 L${4 + +wp + 3},8 L${4 + +wp},11 Z`} fill="oklch(0.96 0.02 250)" />
          </>
        )}
        {face === "hd" && (
          <>
            <rect x="4" y="5" width={dp} height={hp} fill="oklch(0.92 0.02 250)" />
            <path d={`M${4 + +dp},5 L${4 + +dp + 3},2 L${4 + +dp + 3},${2 + +hp} L${4 + +dp},${5 + +hp} Z`} fill="oklch(0.88 0.02 250)" />
            <path d={`M4,5 L7,2 L${4 + +dp + 3},2 L${4 + +dp},5 Z`} fill="oklch(0.96 0.02 250)" />
          </>
        )}
      </g>
    </svg>
  );
}

window.RightPane = RightPane;
window.ActionPanel = ActionPanel;
