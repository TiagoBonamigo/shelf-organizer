import React, { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { api } from "../api/client";
import { Icons } from "../components/Icons";
import type { Box, ForwardFacePref } from "../lib/shared-types";

export const LibraryView: React.FC = () => {
  const boxes = useStore((s) => s.boxes);
  const search = useStore((s) => s.librarySearch);
  const setSearch = useStore((s) => s.setLibrarySearch);
  const filter = useStore((s) => s.libraryFilter);
  const setFilter = useStore((s) => s.setLibraryFilter);
  const selectedGameId = useStore((s) => s.selectedGameId);
  const selectGame = useStore((s) => s.selectGame);
  const activeLayoutId = useStore((s) => s.activeLayoutId);
  const layouts = useStore((s) => s.layouts);

  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const active = layouts.find((l) => l.id === activeLayoutId);
  const placedIds = new Set(active?.placements.map((p) => p.boxId) ?? []);
  const pinnedIds = new Set(active?.placements.filter((p) => p.pinned).map((p) => p.boxId) ?? []);
  const unplacedIds = new Set(active?.unplaced.map((u) => u.boxId) ?? []);

  let games = boxes;
  const q = search.toLowerCase();
  if (q) games = games.filter((g) => g.name.toLowerCase().includes(q));
  if (filter === "missing-dims") games = games.filter((g) => !g.dimensions || g.dimensions.w === 0);
  else if (filter === "has-expansions") {
    const baseWithExp = new Set(boxes.filter((b) => b.expansionOfBoxId).map((b) => b.expansionOfBoxId!));
    games = games.filter((g) => baseWithExp.has(g.id));
  } else if (filter === "pinned") games = games.filter((g) => pinnedIds.has(g.id));
  else if (filter === "unplaced") games = games.filter((g) => unplacedIds.has(g.id));
  games = [...games].sort((a, b) => a.name.localeCompare(b.name));

  const counts: Record<typeof filter, number> = {
    all: boxes.length,
    "missing-dims": boxes.filter((g) => !g.dimensions || g.dimensions.w === 0).length,
    "has-expansions": new Set(boxes.filter((b) => b.expansionOfBoxId).map((b) => b.expansionOfBoxId!)).size,
    pinned: pinnedIds.size,
    unplaced: unplacedIds.size,
  };

  const selectedGame = selectedGameId ? boxes.find((b) => b.id === selectedGameId) : null;

  return (
    <div className="library-view">
      <div className="library-main">
        <div className="library-toolbar">
          <div className="library-toolbar-row">
            <div className="search-input" style={{ flex: 1 }}>
              <span className="icon"><Icons.Search size={12} /></span>
              <input
                placeholder="Search games…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn ghost icon" onClick={() => setSearch("")}>
                  <Icons.X size={10} />
                </button>
              )}
            </div>
            <button className="btn" onClick={() => setImportOpen(true)}>
              <Icons.Refresh size={11} /> Import from BGG
            </button>
            <button className="btn primary" onClick={() => setAddOpen(true)}>
              <Icons.Plus size={11} /> Add game
            </button>
          </div>
          <div className="library-toolbar-row">
            <div className="chips">
              {([
                ["all", "All"],
                ["missing-dims", "Missing dimensions"],
                ["has-expansions", "Has expansions"],
                ["pinned", "Pinned"],
                ["unplaced", "Unplaced"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  className={"chip" + (filter === id ? " active" : "")}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <span className="count">{counts[id]}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>{games.length}</span> shown
            </span>
          </div>
        </div>

        <div className="library-list">
          <div className="library-row head">
            <div>Name</div>
            <div>Dimensions (mm)</div>
            <div>Source</div>
            <div>Expansion of</div>
            <div />
          </div>
          {games.map((g) => {
            const missing = !g.dimensions || g.dimensions.w === 0;
            const expansionOf = g.expansionOfBoxId ? boxes.find((b) => b.id === g.expansionOfBoxId) : null;
            return (
              <div
                key={g.id}
                className={
                  "library-row" +
                  (selectedGameId === g.id ? " active" : "") +
                  (missing ? " missing-dims" : "")
                }
                onClick={() => selectGame(g.id)}
              >
                <div className="name">
                  <span className="name-text">{g.name}</span>
                </div>
                <div className={"dims" + (missing ? " missing" : "")}>
                  {missing ? "—" : `${g.dimensions.w} × ${g.dimensions.h} × ${g.dimensions.d}`}
                </div>
                <div>
                  <span className={"tag " + g.dimensionsSource}>{g.dimensionsSource}</span>
                </div>
                <div className="expansion">{expansionOf?.name ?? ""}</div>
                <div className="status-icons">
                  {missing && <Icons.Warning size={12} className="lib-icon-warn" />}
                  {pinnedIds.has(g.id) && <Icons.Lock size={11} className="lib-icon-pin" />}
                  {unplacedIds.has(g.id) && <Icons.Tray size={11} className="lib-icon-tray" />}
                </div>
              </div>
            );
          })}
          {games.length === 0 && (
            <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
              No games match the current filter.
            </div>
          )}
        </div>
      </div>

      <LibraryDetail game={selectedGame ?? null} />

      {importOpen && <BggImportModal onClose={() => setImportOpen(false)} />}
      {addOpen && <AddGameModal onClose={() => setAddOpen(false)} />}
    </div>
  );
};

const LibraryDetail: React.FC<{ game: Box | null }> = ({ game }) => {
  const boxes = useStore((s) => s.boxes);
  const patchBox = useStore((s) => s.patchBox);
  const showToast = useStore((s) => s.showToast);
  const refresh = useStore((s) => s.refreshState);
  if (!game) {
    return (
      <div className="library-detail">
        <div className="library-detail-empty">
          <Icons.Library size={24} />
          <div style={{ marginTop: 12 }}>Select a game to view details.</div>
        </div>
      </div>
    );
  }
  const expansions = boxes.filter((b) => b.expansionOfBoxId === game.id);
  const bggDims = game.dimensionsFromBgg;
  const useOverride = game.dimensionsSource === "override";

  return (
    <div className="library-detail">
      <div className="library-detail-header">
        <input
          key={game.id}
          className="cabinet-name-edit"
          style={{ fontSize: 16, padding: "2px 4px", marginLeft: -4 }}
          defaultValue={game.name}
          onBlur={(e) => {
            if (e.target.value !== game.name) void patchBox(game.id, { name: e.target.value });
          }}
        />
        <div className="meta">
          {game.bggId && <span>BGG #{game.bggId}</span>}
          <span className={"tag " + game.dimensionsSource}>{game.dimensionsSource}</span>
        </div>
      </div>
      <div className="library-detail-body">
        <div className="detail-section">
          <div className="detail-section-title">Dimensions</div>
          <div className="segmented" style={{ width: "fit-content" }}>
            <button
              className={game.dimensionsSource === "bgg" ? "active" : ""}
              disabled={!bggDims}
              onClick={() => {
                if (bggDims) void patchBox(game.id, { dimensionsSource: "bgg", dimensions: { ...bggDims } });
              }}
            >
              Use BGG
            </button>
            <button
              className={game.dimensionsSource === "override" ? "active" : ""}
              onClick={() => void patchBox(game.id, { dimensionsSource: "override" })}
            >
              Override
            </button>
          </div>
          <div className="detail-dim-inputs">
            {(["w", "h", "d"] as const).map((axis) => (
              <div key={axis} className="detail-dim">
                <div className="label">{axis.toUpperCase()} (mm)</div>
                <input
                  type="number"
                  value={game.dimensions[axis] || ""}
                  onChange={(e) =>
                    void patchBox(game.id, {
                      dimensions: { ...game.dimensions, [axis]: parseInt(e.target.value) || 0 },
                      dimensionsSource: "override",
                    })
                  }
                />
              </div>
            ))}
          </div>
          {bggDims && useOverride && (
            <div className="bgg-compare">
              BGG: {bggDims.w} × {bggDims.h} × {bggDims.d} mm
            </div>
          )}
          {!bggDims && (
            <div className="bgg-compare" style={{ color: "var(--warning)" }}>
              No BGG dimensions available — needs manual entry.
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Preferred forward face</div>
          <div className="face-picker">
            {(["wh", "wd", "hd", "auto"] as ForwardFacePref[]).map((f) => (
              <div
                key={f}
                className={"face-option" + (game.preferredForwardFace === f ? " active" : "")}
                onClick={() => void patchBox(game.id, { preferredForwardFace: f })}
              >
                {f === "auto" ? (
                  <div style={{ width: 24, height: 24, display: "grid", placeItems: "center", fontSize: 14, color: "var(--text-3)" }}>?</div>
                ) : (
                  <FaceSvg face={f} dims={game.dimensions.w > 0 ? game.dimensions : { w: 100, h: 100, d: 50 }} />
                )}
                <span className="label">
                  {f === "auto" ? "AUTO" : faceLabel(f).toUpperCase().replace(/\s/g, "")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Expansion-of</div>
          <select
            className="select"
            value={game.expansionOfBoxId ?? ""}
            onChange={(e) => void patchBox(game.id, { expansionOfBoxId: e.target.value || null })}
          >
            <option value="">— (Not an expansion)</option>
            {boxes
              .filter((b) => b.id !== game.id && !b.expansionOfBoxId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          {expansions.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
              {expansions.length} expansion{expansions.length === 1 ? "" : "s"}: {expansions.map((e) => e.name).join(", ")}
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-title">BGG</div>
          {game.bggId ? (
            <>
              <div className="detail-row">
                <span className="label">BGG ID</span>
                <span className="value">{game.bggId}</span>
              </div>
              <div className="detail-row">
                <span className="label">Last fetched</span>
                <span className="value">{game.bggLastFetchedAt ? game.bggLastFetchedAt.slice(0, 10) : "—"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button
                  className="btn sm"
                  onClick={async () => {
                    try {
                      await api.refreshBox(game.id);
                      await refresh();
                      showToast("info", `Refreshed ${game.name} from BGG.`);
                    } catch (e) {
                      showToast("error", String(e));
                    }
                  }}
                >
                  <Icons.Refresh size={10} /> Refresh from BGG
                </button>
                <a
                  className="btn ghost sm"
                  href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <Icons.External size={10} /> Open in BGG
                </a>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Not linked to BoardGameGeek.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const BggImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const settings = useStore((s) => s.settings);
  const refresh = useStore((s) => s.refreshState);
  const [username, setUsername] = useState(settings.bggUsername ?? "");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<{
    status: "pending" | "running" | "completed" | "failed";
    fetched: number;
    total: number | null;
    message: string | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancel = false;
    const tick = async () => {
      try {
        const j = await api.getJob(jobId);
        if (cancel) return;
        setJob(j);
        if (j.status === "completed" || j.status === "failed") {
          await refresh();
          return;
        }
        setTimeout(tick, 2000);
      } catch (e) {
        setErr(String(e));
      }
    };
    void tick();
    return () => {
      cancel = true;
    };
  }, [jobId, refresh]);

  const start = async () => {
    setErr(null);
    try {
      const { jobId: id } = await api.importBgg(username);
      setJobId(id);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Import from BoardGameGeek
          <button className="btn ghost icon" onClick={onClose}>
            <Icons.X size={11} />
          </button>
        </div>
        <div className="modal-body">
          {!jobId && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
                Enter your BGG username. We'll fetch your owned collection at the configured rate ({settings.bggRateLimitMs}ms / request).
              </div>
              <div className="input-group">
                <span className="input-label">Username</span>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ width: 220 }}
                  autoFocus
                />
              </div>
            </>
          )}
          {jobId && job && job.status === "running" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Fetching items…{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-2)" }}>
                  {job.fetched}
                  {job.total != null ? ` / ${job.total}` : ""}
                </span>
              </div>
              <div className="solver-progress">
                <div
                  className="solver-progress-bar"
                  style={{ width: `${job.total ? (job.fetched / job.total) * 100 : 30}%` }}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{job.message ?? "Working…"}</div>
            </div>
          )}
          {job?.status === "completed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--success)" }}>
                <Icons.Check size={12} strokeWidth={2.4} /> Imported {job.fetched} games.
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{job.message ?? ""}</div>
            </div>
          )}
          {job?.status === "failed" && (
            <div style={{ fontSize: 12, color: "var(--danger)" }}>{job.message ?? "Import failed."}</div>
          )}
          {err && <div style={{ fontSize: 12, color: "var(--danger)" }}>{err}</div>}
        </div>
        <div className="modal-footer">
          {!jobId && (
            <>
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" disabled={!username} onClick={start}>
                Start import
              </button>
            </>
          )}
          {jobId && job?.status !== "completed" && (
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
          {job?.status === "completed" && (
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AddGameModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const refresh = useStore((s) => s.refreshState);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ bggId: number; name: string; yearPublished: number | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.searchBgg(q);
        if (!cancel) setResults(r);
      } catch {
        if (!cancel) setResults([]);
      }
    }, 300);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q]);

  const add = async (r: { bggId: number; name: string }) => {
    setBusy(true);
    try {
      await api.createBox({
        bggId: r.bggId,
        name: r.name,
        dimensions: { w: 0, h: 0, d: 0 },
        dimensionsFromBgg: null,
        dimensionsSource: "manual",
        preferredForwardFace: "auto",
        expansionOfBoxId: null,
        bggLastFetchedAt: null,
      });
      await refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Add a game
          <button className="btn ghost icon" onClick={onClose}>
            <Icons.X size={11} />
          </button>
        </div>
        <div className="modal-body">
          <div className="search-input" style={{ marginBottom: 12 }}>
            <span className="icon"><Icons.Search size={12} /></span>
            <input placeholder="Search BoardGameGeek…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {results.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {results.map((r) => (
                <div
                  key={r.bggId}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>
                      {r.name}
                      {r.yearPublished && (
                        <span style={{ color: "var(--text-3)", fontWeight: 400 }}> ({r.yearPublished})</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                      BGG #{r.bggId}
                    </div>
                  </div>
                  <button className="btn sm primary" disabled={busy} onClick={() => add(r)}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : q ? (
            <div style={{ fontSize: 11, color: "var(--text-3)", padding: 12, textAlign: "center" }}>No matches.</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Start typing to search the BGG database.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function faceLabel(f: string): string {
  return ({ wh: "W × H", wd: "W × D", hd: "H × D" } as Record<string, string>)[f] ?? f;
}

const FaceSvg: React.FC<{ face: "wh" | "wd" | "hd"; dims: { w: number; h: number; d: number } }> = ({
  face,
  dims,
}) => {
  const big = Math.max(dims.w, dims.h, dims.d) || 1;
  const wp = (dims.w / big) * 16;
  const hp = (dims.h / big) * 16;
  const dp = (dims.d / big) * 16;
  const renderFace = (w: number, h: number, top: number) => (
    <>
      <rect x="4" y={top} width={w} height={h} fill="oklch(0.92 0.02 250)" />
      <path
        d={`M${4 + w},${top} L${4 + w + 3},${top - 3} L${4 + w + 3},${top - 3 + h} L${4 + w},${top + h} Z`}
        fill="oklch(0.88 0.02 250)"
      />
      <path d={`M4,${top} L7,${top - 3} L${4 + w + 3},${top - 3} L${4 + w},${top} Z`} fill="oklch(0.96 0.02 250)" />
    </>
  );
  return (
    <svg viewBox="0 0 24 24" width={24} height={24}>
      <g stroke="currentColor" strokeWidth={1.2} fill="none">
        {face === "wh" && renderFace(wp, hp, 5)}
        {face === "wd" && renderFace(wp, dp, 11)}
        {face === "hd" && renderFace(dp, hp, 5)}
      </g>
    </svg>
  );
};
