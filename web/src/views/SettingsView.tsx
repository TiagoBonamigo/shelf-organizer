import React from "react";
import { useStore } from "../state/store";
import { api, type FixtureSummary } from "../api/client";
import { Icons } from "../components/Icons";

export const SettingsView: React.FC = () => {
  const s = useStore((st) => st.settings);
  const status = useStore((st) => st.bggStatus);
  const showToast = useStore((st) => st.showToast);
  const refresh = useStore((st) => st.refreshState);
  const loadFixture = useStore((st) => st.loadFixture);

  const [fixtures, setFixtures] = React.useState<FixtureSummary[] | null>(null);
  const [selectedFixture, setSelectedFixture] = React.useState<string>("");
  const [loadingFixture, setLoadingFixture] = React.useState(false);
  const [confirmingFixture, setConfirmingFixture] = React.useState(false);

  React.useEffect(() => {
    api.listFixtures().then(
      (list) => {
        setFixtures(list);
        if (list.length > 0) setSelectedFixture(list[0].name);
      },
      (err) => showToast("error", `Could not list fixtures: ${String(err)}`),
    );
  }, [showToast]);

  const handleLoadFixture = async () => {
    if (!selectedFixture) return;
    setLoadingFixture(true);
    try {
      await loadFixture(selectedFixture);
      setConfirmingFixture(false);
    } catch (e) {
      showToast("error", `Failed to load fixture: ${String(e)}`);
    } finally {
      setLoadingFixture(false);
    }
  };

  const patch = async (p: Partial<typeof s>) => {
    await api.patchSettings(p);
    await refresh();
  };

  const selected = fixtures?.find((f) => f.name === selectedFixture) ?? null;

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
              value={s.defaultMaxStackCount ?? ""}
              placeholder="no limit"
              onChange={(e) =>
                patch({ defaultMaxStackCount: e.target.value ? parseInt(e.target.value) : null })
              }
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
              value={s.defaultMaxStackHeightMm ?? ""}
              placeholder="no limit"
              onChange={(e) =>
                patch({ defaultMaxStackHeightMm: e.target.value ? parseInt(e.target.value) : null })
              }
              style={{ width: 100 }}
            />
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
              value={s.bggUsername ?? ""}
              onChange={(e) => patch({ bggUsername: e.target.value || null })}
              style={{ width: 220 }}
            />
          </div>
          <div
            className="settings-field"
            style={
              status.state === "rate-limited"
                ? { background: "var(--warning-soft)", padding: "12px", borderRadius: 4, marginLeft: -12, marginRight: -12 }
                : undefined
            }
          >
            <div>
              <div className="field-label">Rate-limit pacing (ms)</div>
              <div className="field-sub">Minimum interval between BGG requests.</div>
            </div>
            <input
              className="input num"
              type="number"
              value={s.bggRateLimitMs}
              min={500}
              max={10000}
              step={100}
              onChange={(e) => patch({ bggRateLimitMs: parseInt(e.target.value) || 2000 })}
              style={{ width: 100 }}
            />
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">Clear cache</div>
              <div className="field-sub">Discard all cached BGG responses.</div>
            </div>
            <button
              className="btn danger"
              onClick={async () => {
                await api.clearBggCache();
                showToast("info", "BGG cache cleared.");
              }}
            >
              Clear BGG cache
            </button>
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
              <button className="btn ghost sm">
                <Icons.Folder size={11} /> Reveal
              </button>
            </div>
          </div>
          <div className="settings-field">
            <div>
              <div className="field-label">BGG cache</div>
              <div className="field-sub">Cached XML responses keyed by URL. Safe to delete.</div>
            </div>
            <div className="path-readout" style={{ minWidth: 260 }}>
              <span>~/.shelf-organizer/bgg-cache.json</span>
              <button className="btn ghost sm">
                <Icons.Folder size={11} /> Reveal
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Load fixture</div>
          <div className="settings-section-sub">
            Replace the current state with a predefined scenario. Useful for testing the solver, validation,
            and UI flows. Overwrites cabinets, shelves, boxes, layouts, and settings.
          </div>
          {fixtures == null ? (
            <div className="settings-field"><div className="field-sub">Loading fixtures…</div></div>
          ) : fixtures.length === 0 ? (
            <div className="settings-field">
              <div className="field-sub">
                No fixtures found. Add JSON files to <code>fixtures/</code> in the project root.
              </div>
            </div>
          ) : (
            <>
              <div className="settings-field">
                <div>
                  <div className="field-label">Fixture</div>
                  <div className="field-sub">
                    {selected ? selected.description : "Pick a scenario."}
                  </div>
                  {selected && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                      {selected.stats.cabinets} cabinets · {selected.stats.shelves} shelves · {selected.stats.boxes} boxes · {selected.stats.layouts} layouts
                      {selected.tags && selected.tags.length > 0 && ` · ${selected.tags.join(", ")}`}
                    </div>
                  )}
                </div>
                <select
                  className="input"
                  value={selectedFixture}
                  onChange={(e) => {
                    setSelectedFixture(e.target.value);
                    setConfirmingFixture(false);
                  }}
                  style={{ minWidth: 220 }}
                >
                  {fixtures.map((f) => (
                    <option key={f.name} value={f.name}>{f.title}</option>
                  ))}
                </select>
              </div>
              <div className="settings-field">
                <div>
                  <div className="field-label">Apply</div>
                  <div className="field-sub">
                    {confirmingFixture
                      ? "This overwrites all current state. Click again to confirm."
                      : "Current state will be discarded."}
                  </div>
                </div>
                {confirmingFixture ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn ghost sm"
                      onClick={() => setConfirmingFixture(false)}
                      disabled={loadingFixture}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn danger"
                      onClick={handleLoadFixture}
                      disabled={loadingFixture}
                    >
                      {loadingFixture ? "Loading…" : "Confirm load"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    onClick={() => setConfirmingFixture(true)}
                    disabled={!selectedFixture || loadingFixture}
                  >
                    Load fixture
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">About</div>
          <div className="settings-field">
            <div className="field-label">Version</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>1.0.0-rc.3</span>
          </div>
          <div className="settings-field">
            <div className="field-label">Schema version</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>v{s.schemaVersion}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
