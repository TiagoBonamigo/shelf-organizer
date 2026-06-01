import React from "react";
import { useStore, selectActiveLayout } from "../state/store";
import { Icons } from "./Icons";
import { api } from "../api/client";
import type { Box, ForwardFace, Placement } from "../lib/shared-types";

export const RightPane: React.FC = () => {
  const layout = useStore(selectActiveLayout);
  const boxes = useStore((s) => s.boxes);
  const selectedBoxId = useStore((s) => s.selectedBoxId);
  const selectBox = useStore((s) => s.selectBox);

  const unplaced = layout?.unplaced ?? [];
  const selectedBox = selectedBoxId ? boxes.find((b) => b.id === selectedBoxId) ?? null : null;
  const selectedPlacement = selectedBox && layout
    ? layout.placements.find((p) => p.boxId === selectedBox.id) ?? null
    : null;

  return (
    <div className="right-pane">
      <div className="pane-section unplaced-tray-drop" style={{ minHeight: 180, flex: "0 1 38%" }}>
        <div className="pane-section-header">
          <span>Unplaced tray</span>
          <span className="count">{unplaced.length}</span>
        </div>
        <div className="pane-section-body">
          {unplaced.length === 0 ? (
            <div className="tray-empty">All games placed.</div>
          ) : (
            unplaced.map((u) => {
              const b = boxes.find((bx) => bx.id === u.boxId);
              if (!b) return null;
              return (
                <div key={u.boxId} className="tray-item" onClick={() => selectBox(b.id)}>
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

      <div
        className="pane-section"
        style={{ flex: "1 1 auto", overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <div className="pane-section-header">
          <span>{selectedBox ? "Selected box" : "Action panel"}</span>
          {selectedBox && (
            <button className="btn ghost sm" onClick={() => selectBox(null)} title="Deselect">
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
};

const ActionPanel: React.FC<{ box: Box; placement: Placement | null }> = ({ box, placement }) => {
  const state = useStore();
  const cabinet = placement
    ? state.cabinets.find((c) => c.id === state.shelves.find((s) => s.id === placement.shelfId)?.cabinetId)
    : null;
  const shelf = placement ? state.shelves.find((s) => s.id === placement.shelfId) : null;
  const expansionOf = box.expansionOfBoxId ? state.boxes.find((b) => b.id === box.expansionOfBoxId) : null;
  const expansions = state.boxes.filter((b) => b.expansionOfBoxId === box.id);
  const faces: ForwardFace[] = ["wh", "wd", "hd"];

  const cycleFace = async () => {
    if (!placement) return;
    const idx = faces.indexOf(placement.forwardFace);
    const next = faces[(idx + 1) % faces.length];
    try {
      const { layout: l, rejected } = await api.patchPlacements([{ ...placement, forwardFace: next, pinned: true }]);
      if (rejected.length > 0) state.showToast("error", rejected[0].error.message);
      else state.applyLayout(l);
    } catch (e) {
      state.showToast("error", String(e));
    }
  };

  return (
    <div className="action-panel">
      <div className="action-game-name">{box.name}</div>
      <div className="action-meta">
        <div className="action-meta-row">
          <span className="label">Dimensions</span>
          <span className="value">
            {box.dimensions.w} × {box.dimensions.h} × {box.dimensions.d} mm
          </span>
        </div>
        <div className="action-meta-row">
          <span className="label">Source</span>
          <span>
            <span className={"tag " + box.dimensionsSource}>{box.dimensionsSource}</span>
          </span>
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
        {placement && cabinet && shelf && (
          <>
            <div className="action-meta-row">
              <span className="label">Placement</span>
              <span style={{ fontSize: 11 }}>
                {cabinet.name}, #{shelf.position + 1}
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
          </>
        )}
        {!placement && (
          <div className="action-meta-row">
            <span className="label">Status</span>
            <span style={{ color: "var(--warning)", fontSize: 11 }}>Unplaced</span>
          </div>
        )}
      </div>

      <div className="action-buttons">
        {placement && (
          <button className="btn" onClick={cycleFace}>
            <Icons.Rotate size={11} /> Rotate forward face
          </button>
        )}
        {placement && (
          <button
            className="btn"
            onClick={() => state.setBoxPin(box.id, !placement.pinned).then(() => state.showToast("info", placement.pinned ? "Unpinned." : "Pinned."))}
          >
            {placement.pinned ? (
              <>
                <Icons.Unlock size={11} /> Unpin
              </>
            ) : (
              <>
                <Icons.Lock size={11} /> Pin
              </>
            )}
          </button>
        )}
        {placement && (
          <button className="btn danger" onClick={() => state.removeBoxFromShelf(box.id)}>
            <Icons.Tray size={11} /> Remove from shelf
          </button>
        )}
        {box.bggId && (
          <a
            className="btn ghost"
            href={`https://boardgamegeek.com/boardgame/${box.bggId}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none" }}
          >
            <Icons.External size={11} /> Open in BGG
          </a>
        )}
      </div>
    </div>
  );
};
