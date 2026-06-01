import React, { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { Icons } from "../components/Icons";
import type { Orientation, Shelf } from "../lib/shared-types";

export const CabinetsView: React.FC = () => {
  const cabinets = useStore((s) => s.cabinets);
  const shelves = useStore((s) => s.shelves);
  const activeCabinetId = useStore((s) => s.activeCabinetId);
  const setActive = useStore((s) => s.setActiveCabinet);
  const patchCabinet = useStore((s) => s.patchCabinet);
  const patchShelf = useStore((s) => s.patchShelf);
  const addShelf = useStore((s) => s.addShelf);
  const deleteShelf = useStore((s) => s.deleteShelf);
  const addCabinet = useStore((s) => s.addCabinet);
  const deleteCabinet = useStore((s) => s.deleteCabinet);
  const showSchematic = useStore((s) => s.tweaks.showSchematic);
  const activeLayoutId = useStore((s) => s.activeLayoutId);
  const layouts = useStore((s) => s.layouts);

  const activeCab = useMemo(() => cabinets.find((c) => c.id === activeCabinetId), [cabinets, activeCabinetId]);
  const ownShelves = useMemo(
    () => shelves.filter((sh) => sh.cabinetId === activeCabinetId).sort((a, b) => a.position - b.position),
    [shelves, activeCabinetId],
  );
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  const totalShelfH = ownShelves.reduce((acc, s) => acc + s.heightMm, 0);
  const placedCount =
    layouts
      .find((l) => l.id === activeLayoutId)
      ?.placements.filter((p) => ownShelves.some((s) => s.id === p.shelfId)).length ?? 0;
  const schemMaxH = 460;
  const schemScale = totalShelfH > 0 ? Math.min(schemMaxH / totalShelfH, 0.36) : 0.36;

  return (
    <div className="cabinets-view">
      <div className="cabinet-list">
        <div className="cabinet-list-header">
          <span>Cabinets · {cabinets.length}</span>
        </div>
        <div className="cabinet-list-items">
          {[...cabinets]
            .sort((a, b) => a.position - b.position)
            .map((cab) => {
              const own = shelves.filter((sh) => sh.cabinetId === cab.id);
              return (
                <div
                  key={cab.id}
                  className={"cabinet-list-item" + (cab.id === activeCabinetId ? " active" : "")}
                  onClick={() => {
                    setActive(cab.id);
                    setSelectedShelfId(null);
                  }}
                >
                  <span className="drag-handle">
                    <Icons.Drag />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cab.name}
                    </div>
                    <div className="meta">
                      {own.length} {own.length === 1 ? "shelf" : "shelves"}
                    </div>
                  </div>
                  <button
                    className="btn ghost icon"
                    title="Delete cabinet"
                    onClick={(e) => {
                      e.stopPropagation();
                      const shelfWord = own.length === 1 ? "shelf" : "shelves";
                      if (
                        window.confirm(
                          `Delete cabinet "${cab.name}" and its ${own.length} ${shelfWord}? This cannot be undone.`,
                        )
                      ) {
                        void deleteCabinet(cab.id);
                      }
                    }}
                  >
                    <Icons.Trash size={11} />
                  </button>
                </div>
              );
            })}
        </div>
        <div className="cabinet-list-add">
          <button
            className="btn ghost"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => addCabinet("New cabinet")}
          >
            <Icons.Plus size={11} /> Add cabinet
          </button>
        </div>
      </div>

      <div className="cabinet-editor">
        <div className="cabinet-editor-main">
          <div className="cabinet-editor-header">
            <input
              key={activeCab?.id}
              className="cabinet-name-edit"
              defaultValue={activeCab?.name ?? ""}
              onBlur={(e) => {
                if (activeCab && e.target.value !== activeCab.name) {
                  void patchCabinet(activeCab.id, { name: e.target.value });
                }
              }}
            />
            <div className="cabinet-header-meta">
              <span className="stat">
                <span className="num">{ownShelves.length}</span>{" "}
                <span style={{ color: "var(--text-3)" }}>shelves</span>
              </span>
              <span className="stat">
                <span className="num">{Math.max(...ownShelves.map((s) => s.widthMm), 0)}</span>{" "}
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
                  <th />
                  <th>#</th>
                  <th className="num">Width</th>
                  <th className="num">Height</th>
                  <th className="num">Depth</th>
                  <th>Orientation</th>
                  <th className="num">Padding</th>
                  <th className="num">Stack n</th>
                  <th className="num">Stack mm</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ownShelves.map((s) => {
                  const isError = s.widthMm <= 0 || s.heightMm <= 0 || s.depthMm <= 0;
                  return (
                    <tr
                      key={s.id}
                      className={(isError ? "error " : "") + (s.id === selectedShelfId ? "selected" : "")}
                      onClick={() => setSelectedShelfId(s.id)}
                    >
                      <td className="row-handle">
                        <Icons.Drag />
                      </td>
                      <td className="row-pos">{s.position + 1}</td>
                      <td>
                        <NumInput value={s.widthMm} onChange={(v) => patchShelf(s.id, { widthMm: v ?? 0 })} />
                      </td>
                      <td>
                        <NumInput value={s.heightMm} onChange={(v) => patchShelf(s.id, { heightMm: v ?? 0 })} />
                      </td>
                      <td>
                        <NumInput value={s.depthMm} onChange={(v) => patchShelf(s.id, { depthMm: v ?? 0 })} />
                      </td>
                      <td>
                        <div className="cell-segmented">
                          {(["vertical", "horizontal", "mixed"] as Orientation[]).map((o) => (
                            <button
                              key={o}
                              className={s.orientation === o ? "active" : ""}
                              onClick={(e) => {
                                e.stopPropagation();
                                void patchShelf(s.id, { orientation: o });
                              }}
                            >
                              {o.charAt(0).toUpperCase() + o.slice(1, 3)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <NumInput value={s.paddingReserveMm ?? 0} onChange={(v) => patchShelf(s.id, { paddingReserveMm: v ?? 0 })} />
                      </td>
                      <td>
                        <NumInput
                          value={s.maxStackCount}
                          placeholder="default"
                          onChange={(v) => patchShelf(s.id, { maxStackCount: v })}
                        />
                      </td>
                      <td>
                        <NumInput
                          value={s.maxStackHeightMm}
                          placeholder="default"
                          onChange={(v) => patchShelf(s.id, { maxStackHeightMm: v })}
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn ghost icon"
                          title="Delete shelf"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete shelf #${s.position + 1}? This cannot be undone.`)) {
                              void deleteShelf(s.id);
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
              <button className="btn" disabled={!activeCab} onClick={() => activeCab && void addShelf(activeCab.id)}>
                <Icons.Plus size={11} /> Add row
              </button>
              <button className="btn" disabled={!selectedShelfId} onClick={() => setDupOpen(true)}>
                Duplicate row × N
              </button>
              <button className="btn" disabled={!activeCab} onClick={() => setCsvOpen(true)}>
                Paste CSV
              </button>
            </div>
          </div>
        </div>

        {showSchematic && (
          <div className="schematic-pane">
            <div className="schematic-title">Schematic preview</div>
            <div
              className="schematic-box"
              style={{
                width: Math.max(...ownShelves.map((s) => s.widthMm), 600) * schemScale + 8,
                alignSelf: "flex-start",
              }}
            >
              {ownShelves.map((s) => {
                const isError = s.widthMm <= 0 || s.heightMm <= 0 || s.depthMm <= 0;
                const w = s.widthMm * schemScale;
                const h = Math.max(14, s.heightMm * schemScale);
                return (
                  <div
                    key={s.id}
                    className={
                      "schematic-shelf" +
                      (isError ? " error" : "") +
                      (selectedShelfId === s.id ? " selected" : "")
                    }
                    style={{ width: w, height: h, alignSelf: "center" }}
                    onClick={() => setSelectedShelfId(s.id)}
                  >
                    <span className="pos">#{s.position + 1}</span>
                    <span>
                      {s.widthMm}×{s.heightMm} mm
                    </span>
                    <span className="orient">{s.orientation.slice(0, 1).toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              Proportional preview of the cabinet, top-to-bottom. Click a shelf to highlight it in the table.
            </div>
          </div>
        )}
      </div>

      {csvOpen && activeCab && (
        <PasteCsvModal cabinetId={activeCab.id} onClose={() => setCsvOpen(false)} />
      )}
      {dupOpen && selectedShelfId && (
        <DuplicateModal shelfId={selectedShelfId} onClose={() => setDupOpen(false)} />
      )}
    </div>
  );
};

const NumInput: React.FC<{ value: number | null; placeholder?: string; onChange: (v: number | null) => void }> = ({
  value,
  placeholder,
  onChange,
}) => {
  const [v, setV] = useState(value == null ? "" : String(value));
  React.useEffect(() => setV(value == null ? "" : String(value)), [value]);
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
};

const PasteCsvModal: React.FC<{ cabinetId: string; onClose: () => void }> = ({ cabinetId, onClose }) => {
  const addShelf = useStore((s) => s.addShelf);
  const [text, setText] = useState(
    "width,height,depth,orientation,padding,stackCount,stackHeight\n800,320,300,vertical,20,4,\n800,320,300,vertical,20,4,",
  );
  const lineCount = Math.max(0, text.trim().split("\n").length - 1);

  const apply = async () => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return onClose();
    const cols = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idxOf = (n: string) => cols.indexOf(n);
    for (const line of lines.slice(1)) {
      const cells = line.split(",").map((s) => s.trim());
      const get = (n: string) => {
        const i = idxOf(n);
        return i >= 0 ? cells[i] : "";
      };
      const parseNum = (s: string): number | null => (s === "" ? null : Number.isFinite(+s) ? +s : null);
      const orient = (get("orientation") || "vertical") as Orientation;
      const shelf: Partial<Shelf> = {
        widthMm: parseNum(get("width")) ?? 800,
        heightMm: parseNum(get("height")) ?? 320,
        depthMm: parseNum(get("depth")) ?? 300,
        orientation: ["vertical", "horizontal", "mixed"].includes(orient) ? orient : "vertical",
        paddingReserveMm: parseNum(get("padding")) ?? 20,
        maxStackCount: parseNum(get("stackcount")),
        maxStackHeightMm: parseNum(get("stackheight")),
      };
      await addShelf(cabinetId, shelf);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Paste CSV — Shelf dimensions
          <button className="btn ghost icon" onClick={onClose}>
            <Icons.X size={11} />
          </button>
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
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            Add {lineCount} shelves
          </button>
        </div>
      </div>
    </div>
  );
};

const DuplicateModal: React.FC<{ shelfId: string; onClose: () => void }> = ({ shelfId, onClose }) => {
  const shelf = useStore((s) => s.shelves.find((x) => x.id === shelfId));
  const addShelf = useStore((s) => s.addShelf);
  const [count, setCount] = useState(2);
  if (!shelf) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Duplicate shelf × N
          <button className="btn ghost icon" onClick={onClose}>
            <Icons.X size={11} />
          </button>
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
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              for (let i = 0; i < count; i++) {
                await addShelf(shelf.cabinetId, {
                  widthMm: shelf.widthMm,
                  heightMm: shelf.heightMm,
                  depthMm: shelf.depthMm,
                  orientation: shelf.orientation,
                  paddingReserveMm: shelf.paddingReserveMm,
                  maxStackCount: shelf.maxStackCount,
                  maxStackHeightMm: shelf.maxStackHeightMm,
                });
              }
              onClose();
            }}
          >
            Add {count} duplicates
          </button>
        </div>
      </div>
    </div>
  );
};
