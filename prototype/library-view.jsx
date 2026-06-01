// Library view — game inventory.
const LibraryView = () => {
  const { state, dispatch } = useApp();
  const [importModal, setImportModal] = useState(false);
  const [addGameModal, setAddGameModal] = useState(false);

  const search = state.librarySearch.toLowerCase();
  const filter = state.libraryFilter;

  const placedIds = new Set(state.activeLayout?.placements.map((p) => p.boxId) || []);
  const pinnedIds = new Set(state.activeLayout?.placements.filter((p) => p.pinned).map((p) => p.boxId) || []);
  const unplacedIds = new Set(state.activeLayout?.unplaced.map((u) => u.boxId) || []);

  let games = state.boxes;
  if (search) games = games.filter((g) => g.name.toLowerCase().includes(search));
  if (filter === "missing-dims") games = games.filter((g) => !g.dimensions || g.dimensions.w === 0);
  else if (filter === "has-expansions") {
    const baseWithExp = new Set(state.boxes.filter((b) => b.expansionOfBoxId).map((b) => b.expansionOfBoxId));
    games = games.filter((g) => baseWithExp.has(g.id));
  }
  else if (filter === "pinned") games = games.filter((g) => pinnedIds.has(g.id));
  else if (filter === "unplaced") games = games.filter((g) => unplacedIds.has(g.id));

  // sort by name
  games = [...games].sort((a, b) => a.name.localeCompare(b.name));

  const counts = {
    all: state.boxes.length,
    "missing-dims": state.boxes.filter((g) => !g.dimensions || g.dimensions.w === 0).length,
    "has-expansions": new Set(state.boxes.filter((b) => b.expansionOfBoxId).map((b) => b.expansionOfBoxId)).size,
    "pinned": pinnedIds.size,
    "unplaced": unplacedIds.size,
  };

  const selectedGame = state.selectedGameId ? findBox(state, state.selectedGameId) : null;

  return (
    <div className="library-view">
      <div className="library-main">
        <div className="library-toolbar">
          <div className="library-toolbar-row">
            <div className="search-input" style={{ flex: 1 }}>
              <span className="icon"><Icons.Search size={12} /></span>
              <input
                placeholder="Search games…"
                value={state.librarySearch}
                onChange={(e) => dispatch({ type: "SET_LIBRARY_SEARCH", value: e.target.value })}
              />
              {state.librarySearch && (
                <button className="btn ghost icon" onClick={() => dispatch({ type: "SET_LIBRARY_SEARCH", value: "" })}>
                  <Icons.X size={10} />
                </button>
              )}
            </div>
            <button className="btn" onClick={() => setImportModal(true)}>
              <Icons.Refresh size={11} /> Import from BGG
            </button>
            <button className="btn primary" onClick={() => setAddGameModal(true)}>
              <Icons.Plus size={11} /> Add game
            </button>
          </div>
          <div className="library-toolbar-row">
            <div className="chips">
              {[
                ["all", "All"],
                ["missing-dims", "Missing dimensions"],
                ["has-expansions", "Has expansions"],
                ["pinned", "Pinned"],
                ["unplaced", "Unplaced"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={"chip" + (filter === id ? " active" : "")}
                  onClick={() => dispatch({ type: "SET_LIBRARY_FILTER", value: id })}
                >
                  {label}
                  <span className="count">{counts[id]}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }}></div>
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
            <div></div>
          </div>
          {games.map((g) => {
            const missingDims = !g.dimensions || g.dimensions.w === 0;
            const expansionOf = g.expansionOfBoxId ? findBox(state, g.expansionOfBoxId) : null;
            return (
              <div
                key={g.id}
                className={"library-row" + (state.selectedGameId === g.id ? " active" : "") + (missingDims ? " missing-dims" : "")}
                onClick={() => dispatch({ type: "SET_SELECTED_GAME", id: g.id })}
              >
                <div className="name">
                  <span className="name-text">{g.name}</span>
                </div>
                <div className={"dims" + (missingDims ? " missing" : "")}>
                  {missingDims ? "—" : `${g.dimensions.w} × ${g.dimensions.h} × ${g.dimensions.d}`}
                </div>
                <div>
                  <span className={"tag " + g.dimensionsSource}>{g.dimensionsSource}</span>
                </div>
                <div className="expansion">{expansionOf?.name || ""}</div>
                <div className="status-icons">
                  {missingDims && <Icons.Warning size={12} className="lib-icon-warn" />}
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

      <LibraryDetail game={selectedGame} />

      {importModal && <BggImportModal onClose={() => setImportModal(false)} />}
      {addGameModal && <AddGameModal onClose={() => setAddGameModal(false)} />}
    </div>
  );
};

function LibraryDetail({ game }) {
  const { state, dispatch } = useApp();
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
  const expansionOf = game.expansionOfBoxId ? findBox(state, game.expansionOfBoxId) : null;
  const expansions = state.boxes.filter((b) => b.expansionOfBoxId === game.id);
  const placement = findPlacement(state, game.id);
  const useOverride = game.dimensionsSource === "override";
  const bggDims = game.dimensionsFromBgg;

  return (
    <div className="library-detail">
      <div className="library-detail-header">
        <input
          className="cabinet-name-edit"
          style={{ fontSize: 16, padding: "2px 4px", marginLeft: -4 }}
          defaultValue={game.name}
          onBlur={(e) => dispatch({ type: "PATCH_BOX", id: game.id, patch: { name: e.target.value } })}
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
              onClick={() => {
                if (bggDims) dispatch({ type: "PATCH_BOX", id: game.id, patch: { dimensionsSource: "bgg", dimensions: { ...bggDims } } });
              }}
              disabled={!bggDims}
            >
              Use BGG
            </button>
            <button
              className={game.dimensionsSource === "override" ? "active" : ""}
              onClick={() => dispatch({ type: "PATCH_BOX", id: game.id, patch: { dimensionsSource: "override" } })}
            >
              Override
            </button>
          </div>
          <div className="detail-dim-inputs">
            <div className="detail-dim">
              <div className="label">W (mm)</div>
              <input
                type="number"
                value={game.dimensions.w || ""}
                onChange={(e) => dispatch({ type: "PATCH_BOX", id: game.id, patch: { dimensions: { ...game.dimensions, w: parseInt(e.target.value) || 0 }, dimensionsSource: "override" } })}
              />
            </div>
            <div className="detail-dim">
              <div className="label">H (mm)</div>
              <input
                type="number"
                value={game.dimensions.h || ""}
                onChange={(e) => dispatch({ type: "PATCH_BOX", id: game.id, patch: { dimensions: { ...game.dimensions, h: parseInt(e.target.value) || 0 }, dimensionsSource: "override" } })}
              />
            </div>
            <div className="detail-dim">
              <div className="label">D (mm)</div>
              <input
                type="number"
                value={game.dimensions.d || ""}
                onChange={(e) => dispatch({ type: "PATCH_BOX", id: game.id, patch: { dimensions: { ...game.dimensions, d: parseInt(e.target.value) || 0 }, dimensionsSource: "override" } })}
              />
            </div>
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
            {["wh", "wd", "hd", "auto"].map((f) => (
              <div
                key={f}
                className={"face-option" + (game.preferredForwardFace === f ? " active" : "")}
                onClick={() => dispatch({ type: "PATCH_BOX", id: game.id, patch: { preferredForwardFace: f } })}
              >
                {f === "auto" ? (
                  <div style={{ width: 24, height: 24, display: "grid", placeItems: "center", fontSize: 14, color: "var(--text-3)" }}>?</div>
                ) : (
                  <FaceSvg face={f} dims={game.dimensions.w > 0 ? game.dimensions : { w: 100, h: 100, d: 50 }} />
                )}
                <span className="label">{f === "auto" ? "AUTO" : faceLabel(f).toUpperCase().replace(/\s/g, "")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Expansion-of</div>
          <select
            className="select"
            value={game.expansionOfBoxId || ""}
            onChange={(e) => dispatch({ type: "PATCH_BOX", id: game.id, patch: { expansionOfBoxId: e.target.value || null } })}
          >
            <option value="">— (Not an expansion)</option>
            {state.boxes
              .filter((b) => b.id !== game.id && !b.expansionOfBoxId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
          </select>
          {expansions.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
              {expansions.length} expansion{expansions.length === 1 ? "" : "s"}:{" "}
              {expansions.map((e) => e.name).join(", ")}
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-title">BGG</div>
          {game.bggId ? (
            <Fragment>
              <div className="detail-row">
                <span className="label">BGG ID</span>
                <span className="value">{game.bggId}</span>
              </div>
              <div className="detail-row">
                <span className="label">Last fetched</span>
                <span className="value">{game.bggLastFetchedAt ? game.bggLastFetchedAt.slice(0, 10) : "—"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn sm"><Icons.Refresh size={10} /> Refresh from BGG</button>
                <button className="btn ghost sm"><Icons.External size={10} /> Open in BGG</button>
              </div>
            </Fragment>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Not linked to BoardGameGeek.</div>
          )}
        </div>

        {placement && (
          <div className="detail-section">
            <div className="detail-section-title">Placement</div>
            <div className="detail-row">
              <span className="label">Shelf</span>
              <span className="value">
                {findCabinet(state, findShelf(state, placement.shelfId)?.cabinetId)?.name} · #{(findShelf(state, placement.shelfId)?.position || 0) + 1}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Orientation</span>
              <span className="value">{placement.orientation}</span>
            </div>
            <div className="detail-row">
              <span className="label">Pinned</span>
              <span className="value">{placement.pinned ? "yes" : "no"}</span>
            </div>
          </div>
        )}

        <div className="detail-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button className="btn danger" style={{ alignSelf: "flex-start" }}>
            <Icons.Trash size={11} /> Delete from library
          </button>
        </div>
      </div>
    </div>
  );
}

function BggImportModal({ onClose }) {
  const { state, dispatch } = useApp();
  const [username, setUsername] = useState(state.settings.bggUsername || "");
  const [phase, setPhase] = useState("idle"); // idle, fetching, polling, fetching-items, done
  const [progress, setProgress] = useState({ fetched: 0, total: null });

  useEffect(() => {
    if (phase !== "fetching" && phase !== "fetching-items") return;
    let cancelled = false;
    let f = 0;
    const total = 187;
    setProgress({ fetched: 0, total });
    const tick = () => {
      if (cancelled) return;
      f += Math.random() < 0.2 ? 0 : 1;
      setProgress({ fetched: Math.min(f, total), total });
      if (f >= total) {
        setPhase("done");
        return;
      }
      setTimeout(tick, 35);
    };
    if (phase === "fetching") {
      setTimeout(() => { if (!cancelled) setPhase("polling"); }, 400);
    } else if (phase === "fetching-items") {
      setTimeout(tick, 50);
    }
    return () => { cancelled = true; };
  }, [phase]);

  useEffect(() => {
    if (phase === "polling") {
      const t = setTimeout(() => setPhase("fetching-items"), 2200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Import from BoardGameGeek
          <button className="btn ghost icon" onClick={onClose}><Icons.X size={11} /></button>
        </div>
        <div className="modal-body">
          {phase === "idle" && (
            <Fragment>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
                Enter your BGG username. We'll fetch your owned collection at the configured rate ({state.settings.bggRateLimitMs}ms / request).
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
            </Fragment>
          )}
          {phase === "fetching" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Requesting collection…</div>
              <div className="solver-progress"><div className="solver-progress-bar" style={{ width: "30%" }}></div></div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>GET /xmlapi2/collection?username={username}&own=1</div>
            </div>
          )}
          {phase === "polling" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>BGG queued our request, polling…</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Large collections return HTTP 202 first. We'll re-request every 5s.
              </div>
              <div className="solver-progress"><div className="solver-progress-bar" style={{ width: "55%" }}></div></div>
            </div>
          )}
          {phase === "fetching-items" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Fetching items… <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-2)" }}>{progress.fetched} / {progress.total}</span>
              </div>
              <div className="solver-progress"><div className="solver-progress-bar" style={{ width: `${(progress.fetched / progress.total) * 100}%` }}></div></div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Batches of 20 IDs via /xmlapi2/thing. Cached on disk; reruns are instant.
              </div>
            </div>
          )}
          {phase === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--success)" }}>
                <Icons.Check size={12} strokeWidth={2.4} /> Imported {progress.total} games.
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                {Math.round(progress.total * 0.07)} games are missing dimensions. Use the “Missing dimensions” filter to enter them.
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {phase === "idle" && (
            <Fragment>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={!username} onClick={() => setPhase("fetching")}>Start import</button>
            </Fragment>
          )}
          {(phase === "fetching" || phase === "polling" || phase === "fetching-items") && (
            <button className="btn ghost" onClick={onClose}>Cancel</button>
          )}
          {phase === "done" && (
            <button className="btn primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddGameModal({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!query) { setResults([]); return; }
    // Mock: filter our existing data by name
    setResults(
      window.APP_DATA.boxes
        .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    );
  }, [query]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Add a game
          <button className="btn ghost icon" onClick={onClose}><Icons.X size={11} /></button>
        </div>
        <div className="modal-body">
          <div className="search-input" style={{ marginBottom: 12 }}>
            <span className="icon"><Icons.Search size={12} /></span>
            <input placeholder="Search BoardGameGeek…" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {results.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                      BGG #{r.bggId} · {r.dimensions.w}×{r.dimensions.h}×{r.dimensions.d} mm
                    </div>
                  </div>
                  <button className="btn sm primary">Add</button>
                </div>
              ))}
            </div>
          ) : query ? (
            <div style={{ fontSize: 11, color: "var(--text-3)", padding: 12, textAlign: "center" }}>No matches.</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Start typing to search the BGG database.</div>
          )}
        </div>
      </div>
    </div>
  );
}

window.LibraryView = LibraryView;
