// Cabinets view — two-pane editor with schematic.
const CabinetsView = () => {
  const { state, dispatch } = useApp();
  const activeId = state.activeCabinetId;
  const activeCab = findCabinet(state, activeId);
  const shelves = state.shelves
    .filter((s) => s.cabinetId === activeId)
    .sort((a, b) => a.position - b.position);
  const [selectedShelfId, setSelectedShelfId] = useState(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupCount, setDupCount] = useState(2);

  const totalShelfH = shelves.reduce((acc, s) => acc + s.heightMm, 0);
  const placedCount = state.activeLayout?.placements.filter((p) => {
    const sh = findShelf(state, p.shelfId);
    return sh?.cabinetId === activeId;
  }).length || 0;

  // Schematic scale: ensure fits in panel of ~200px height
  const schemMaxH = 460;
  const schemScale = totalShelfH > 0 ? Math.min(schemMaxH / totalShelfH, 0.36) : 0.36;

  return (
    <div className="cabinets-view">
      <div className="cabinet-list">
        <div className="cabinet-list-header">
          <span>Cabinets · {state.cabinets.length}</span>
        </div>
        <div className="cabinet-list-items">
          {[...state.cabinets].sort((a, b) => a.position - b.position).map((cab) => {
            const cabShelves = state.shelves.filter((s) => s.cabinetId === cab.id);
            return (
              <div
                key={cab.id}
                className={"cabinet-list-item" + (cab.id === activeId ? " active" : "")}
                onClick={() => { dispatch({ type: "SET_ACTIVE_CABINET", id: cab.id }); setSelectedShelfId(null); }}
              >
                <span className="drag-handle"><Icons.Drag /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cab.name}</div>
                  <div className="meta">
                    {cabShelves.length} {cabShelves.length === 1 ? "shelf" : "shelves"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="cabinet-list-add">
          <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }}>
            <Icons.Plus size={11} /> Add cabinet
          </button>
        </div>
      </div>

      <div className="cabinet-editor">
        <div className="cabinet-editor-main">
          <div className="cabinet-editor-header">
            <input
              className="cabinet-name-edit"
              defaultValue={activeCab?.name || ""}
              onBlur={(e) => dispatch({ type: "PATCH_CABINET", id: activeId, patch: { name: e.target.value } })}
            />
            <div className="cabinet-header-meta">
              <span className="stat">
                <span className="num">{shelves.length}</span>{" "}
                <span style={{ color: "var(--text-3)" }}>shelves</span>
              </span>
              <span className="stat">
                <span className="num">{Math.max(...shelves.map((s) => s.widthMm), 0)}</span>{" "}
                <span style={{ color: "var(--text-3)" }}>mm widest</span>
              </span>
              <span className="stat">
                <span className="num">{totalShelfH}</span>{" "}
                <span style={{ color: "var(--text-3)" }}>mm total stacked height</span>
              </span>
              <span className="stat">
                <span className="num">{placedCount}</span>{" "}
                <span style={{ color: "var(--text-3)" }}>boxes currently placed</span>
              </span>
            </div>
          </div>

          <div className="shelves-table-wrap">
            <table className="shelves-table">
              <thead>
                <tr>
                  <th></th>
                  <th>#</th>
                  <th className="num">Width</th>
                  <th className="num">Height</th>
                  <th className="num">Depth</th>
                  <th>Orientation</th>
                  <th className="num">Padding</th>
                  <th className="num">Stack n</th>
                  <th className="num">Stack mm</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shelves.map((s) => {
                  const isError = s.widthMm <= 0 || s.heightMm <= 0 || s.depthMm <= 0;
                  return (
                    <tr
                      key={s.id}
                      className={(isError ? "error " : "") + (s.id === selectedShelfId ? "selected" : "")}
                      onClick={() => setSelectedShelfId(s.id)}
                    >
                      <td className="row-handle"><Icons.Drag /></td>
                      <td className="row-pos">{s.position + 1}</td>
                      <td>
                        <NumInput value={s.widthMm} onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { widthMm: v } })} />
                      </td>
                      <td>
                        <NumInput value={s.heightMm} onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { heightMm: v } })} />
                      </td>
                      <td>
                        <NumInput value={s.depthMm} onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { depthMm: v } })} />
                      </td>
                      <td>
                        <div className="cell-segmented">
                          {["vertical", "horizontal", "mixed"].map((o) => (
                            <button
                              key={o}
                              className={s.orientation === o ? "active" : ""}
                              onClick={(e) => { e.stopPropagation(); dispatch({ type: "PATCH_SHELF", id: s.id, patch: { orientation: o } }); }}
                            >
                              {o.charAt(0).toUpperCase()}{o.slice(1, 3)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <NumInput value={s.paddingReserveMm ?? 0} onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { paddingReserveMm: v } })} />
                      </td>
                      <td>
                        <NumInput
                          value={s.maxStackCount}
                          placeholder="default"
                          onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { maxStackCount: v } })}
                        />
                      </td>
                      <td>
                        <NumInput
                          value={s.maxStackHeightMm}
                          placeholder="default"
                          onChange={(v) => dispatch({ type: "PATCH_SHELF", id: s.id, patch: { maxStackHeightMm: v } })}
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn ghost icon"
                          title="Delete shelf"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete shelf #${s.position + 1}? This cannot be undone.`)) {
                              dispatch({ type: "DELETE_SHELF", id: s.id });
                              if (selectedShelfId === s.id) setSelectedShelfId(null);
                            }
                          }}
                        >
                          <Icons.Trash size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="shelves-actions">
              <button className="btn" onClick={() => dispatch({ type: "ADD_SHELF", cabinetId: activeId })}>
                <Icons.Plus size={11} /> Add row
              </button>
              <button
                className="btn"
                disabled={!selectedShelfId}
                onClick={() => setDupOpen(true)}
              >
                Duplicate row × N
              </button>
              <button className="btn" onClick={() => setCsvOpen(true)}>
                Paste CSV
              </button>
              <div style={{ flex: 1 }}></div>
              <button
                className="btn danger ghost"
                disabled={!activeCab}
                onClick={() => {
                  if (window.confirm(`Delete cabinet “${activeCab?.name}”? All shelves will be removed.`)) {
                    // For prototype simplicity, just clear shelves
                    for (const s of shelves) dispatch({ type: "DELETE_SHELF", id: s.id });
                  }
                }}
              >
                <Icons.Trash size={11} /> Delete cabinet
              </button>
            </div>
          </div>
        </div>

        <div className="schematic-pane">
          <div className="schematic-title">Schematic preview</div>
          <div
            className="schematic-box"
            style={{
              width: (Math.max(...shelves.map((s) => s.widthMm), 600) * schemScale) + 8,
              alignSelf: "flex-start",
            }}
          >
            {shelves.map((s) => {
              const isError = s.widthMm <= 0 || s.heightMm <= 0 || s.depthMm <= 0;
              const w = s.widthMm * schemScale;
              const h = Math.max(14, s.heightMm * schemScale);
              return (
                <div
                  key={s.id}
                  className={
                    "schematic-shelf" + (isError ? " error" : "") + (selectedShelfId === s.id ? " selected" : "")
                  }
                  style={{ width: w, height: h, alignSelf: "center" }}
                  onClick={() => setSelectedShelfId(s.id)}
                >
                  <span className="pos">#{s.position + 1}</span>
                  <span>{s.widthMm}×{s.heightMm} mm</span>
                  <span className="orient">{s.orientation.slice(0, 1).toUpperCase()}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            Proportional preview of the cabinet, top-to-bottom. Click a shelf to highlight it in the table.
          </div>
        </div>
      </div>

      {csvOpen && <PasteCsvModal cabinetId={activeId} onClose={() => setCsvOpen(false)} />}
      {dupOpen && <DuplicateModal shelfId={selectedShelfId} count={dupCount} setCount={setDupCount} onClose={() => setDupOpen(false)} />}
    </div>
  );
};

function NumInput({ value, onChange, placeholder }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => { setV(value == null ? "" : String(value)); }, [value]);
  const isErr = v !== "" && (isNaN(parseFloat(v)) || parseFloat(v) < 0);
  return (
    <input
      type="text"
      inputMode="numeric"
      className={"row-input" + (isErr ? " error" : "")}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v === "") return onChange(null);
        const n = parseFloat(v);
        if (!isNaN(n)) onChange(Math.round(n));
        else setV(value == null ? "" : String(value));
      }}
    />
  );
}

function PasteCsvModal({ cabinetId, onClose }) {
  const { dispatch } = useApp();
  const [text, setText] = useState("width,height,depth,orientation\n800,320,300,vertical\n800,320,300,vertical");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Paste CSV — Shelf dimensions
          <button className="btn ghost icon" onClick={onClose}><Icons.X size={11} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>
            Columns: <code style={{ fontFamily: "var(--font-mono)" }}>width, height, depth, orientation, padding, stackCount, stackHeight</code>. First row is the header; values in mm.
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 160,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: 8,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              resize: "vertical",
              outline: 0,
            }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => {
            const lines = text.trim().split("\n");
            const cols = lines[0].split(",").map((s) => s.trim().toLowerCase());
            const rows = lines.slice(1);
            for (const r of rows) {
              const cells = r.split(",").map((s) => s.trim());
              const get = (name) => {
                const i = cols.indexOf(name);
                return i >= 0 ? cells[i] : null;
              };
              dispatch({ type: "ADD_SHELF", cabinetId });
            }
            onClose();
          }}>Add {Math.max(0, text.trim().split("\n").length - 1)} shelves</button>
        </div>
      </div>
    </div>
  );
}

function DuplicateModal({ shelfId, count, setCount, onClose }) {
  const { state, dispatch } = useApp();
  const shelf = findShelf(state, shelfId);
  if (!shelf) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Duplicate shelf × N
          <button className="btn ghost icon" onClick={onClose}><Icons.X size={11} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, marginBottom: 12 }}>
            Duplicate shelf #{shelf.position + 1} ({shelf.widthMm} × {shelf.heightMm} × {shelf.depthMm} mm, {shelf.orientation}) by:
          </div>
          <input
            type="number"
            className="input"
            value={count}
            min={1}
            max={20}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            style={{ width: 80 }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => {
            for (let i = 0; i < count; i++) dispatch({ type: "ADD_SHELF", cabinetId: shelf.cabinetId });
            onClose();
          }}>Add {count} duplicates</button>
        </div>
      </div>
    </div>
  );
}

window.CabinetsView = CabinetsView;
