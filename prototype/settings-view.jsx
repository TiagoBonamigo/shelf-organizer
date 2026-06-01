// Settings view.
const SettingsView = () => {
  const { state, dispatch } = useApp();
  const s = state.settings;
  const patch = (p) => dispatch({ type: "PATCH_SETTINGS", patch: p });
  return (
    <div className="main" style={{ overflow: "auto" }}>
      <div className="settings-view">
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.015em" }}>Settings</h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Defaults apply to new shelves and the global solver run. Existing per-shelf overrides take precedence.
          </p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Solver defaults</div>
          <div className="settings-section-sub">Used by the solver when a shelf has no explicit override.</div>
          <div className="settings-field">
            <div>
              <div className="field-label">Default padding reserve (mm)</div>
              <div className="field-sub">Unused width left on each shelf for breathing room.</div>
            </div>
            <input
              className="input num"
              type="number"
              value={s.defaultPaddingReserveMm}
              onChange={(e) => patch({ defaultPaddingReserveMm: parseInt(e.target.value) || 0 })}
              style={{ width: 100 }}
            />
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Default max stack count</div>
              <div className="field-sub">Maximum boxes per stack. Blank for unlimited.</div>
            </div>
            <input
              className="input num"
              type="number"
              value={s.defaultMaxStackCount || ""}
              onChange={(e) => patch({ defaultMaxStackCount: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="no limit"
              style={{ width: 100 }}
            />
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Default max stack height (mm)</div>
              <div className="field-sub">Maximum total height of any stack. Blank for unlimited.</div>
            </div>
            <input
              className="input num"
              type="number"
              value={s.defaultMaxStackHeightMm || ""}
              onChange={(e) => patch({ defaultMaxStackHeightMm: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="no limit"
              style={{ width: 100 }}
            />
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Default proximity weight</div>
              <div className="field-sub">0 = ignore expansion grouping. 1 = maximize grouping at cost of empty space.</div>
            </div>
            <div className="slider-wrap">
              <input
                className="slider"
                type="range"
                min="0" max="1" step="0.05"
                value={s.defaultProximityWeight}
                onChange={(e) => patch({ defaultProximityWeight: parseFloat(e.target.value) })}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 32, color: "var(--text-1)" }}>
                {s.defaultProximityWeight.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">BoardGameGeek sync</div>
          <div className="settings-section-sub">
            BGG's API requires polite request pacing. Increase the interval if you see frequent rate-limit warnings.
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">BGG username</div>
              <div className="field-sub">Used to import your owned collection.</div>
            </div>
            <input
              className="input"
              value={s.bggUsername || ""}
              onChange={(e) => patch({ bggUsername: e.target.value })}
              style={{ width: 220 }}
            />
          </div>
          <div className="settings-field" style={{ background: state.bggStatus?.state === "rate-limited" ? "var(--warning-soft)" : undefined, padding: state.bggStatus?.state === "rate-limited" ? "12px 12px" : undefined, borderRadius: 4, marginLeft: -12, marginRight: -12 }}>
            <div>
              <div className="field-label">Rate-limit pacing (ms)</div>
              <div className="field-sub">Minimum interval between BGG requests.</div>
            </div>
            <input
              className="input num"
              type="number"
              value={s.bggRateLimitMs}
              min={500} max={10000} step={100}
              onChange={(e) => patch({ bggRateLimitMs: parseInt(e.target.value) || 2000 })}
              style={{ width: 100 }}
            />
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Force refresh entire collection</div>
              <div className="field-sub">Re-fetch every owned game from BGG. Slow.</div>
            </div>
            <button className="btn">Force refresh all</button>
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Clear cache</div>
              <div className="field-sub">Discard all cached BGG responses.</div>
            </div>
            <button className="btn danger">Clear BGG cache</button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Data locations</div>
          <div className="settings-section-sub">All data is stored on this machine. Back up these files to preserve your library.</div>
          <div className="settings-field">
            <div>
              <div className="field-label">Data file</div>
              <div className="field-sub">Cabinets, shelves, library, layouts, settings.</div>
            </div>
            <div className="path-readout" style={{ minWidth: 260 }}>
              <span>~/.shelf-organizer/data.json</span>
              <button className="btn ghost sm"><Icons.Folder size={11} /> Reveal</button>
            </div>
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">BGG cache</div>
              <div className="field-sub">Cached XML responses keyed by URL. Safe to delete.</div>
            </div>
            <div className="path-readout" style={{ minWidth: 260 }}>
              <span>~/.shelf-organizer/bgg-cache.json</span>
              <button className="btn ghost sm"><Icons.Folder size={11} /> Reveal</button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">About</div>
          <div className="settings-field">
            <div className="field-label">Version</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>1.0.0-rc.3</span>
          </div>
          <div className="settings-field">
            <div className="field-label">Build commit</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>9a4f1c2</span>
          </div>
          <div className="settings-field">
            <div className="field-label">Repository</div>
            <a href="#" style={{ color: "var(--accent)", fontSize: 12 }}>github.com/you/shelf-organizer ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
};

window.SettingsView = SettingsView;
