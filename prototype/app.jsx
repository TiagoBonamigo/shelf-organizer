// App shell — sidebar nav + view router + tweaks integration.

const Sidebar = () => {
  const { state, dispatch } = useApp();
  const placedCount = state.activeLayout?.metrics?.placedCount || 0;
  const totalGames = state.boxes.length;
  const missingDims = state.boxes.filter((b) => !b.dimensions || b.dimensions.w === 0).length;

  const NavItem = ({ id, label, icon, count, badge }) => (
    <div
      className={"nav-item" + (state.view === id ? " active" : "")}
      onClick={() => dispatch({ type: "SET_VIEW", view: id })}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {badge ? <span className="badge">{badge}</span> : count != null ? <span className="nav-count">{count}</span> : null}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="2" width="12" height="12" rx="0.5" />
            <line x1="2" y1="7" x2="14" y2="7" />
            <line x1="2" y1="11" x2="14" y2="11" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Shelf Organizer</div>
        </div>
      </div>

      <div className="sidebar-section-label">Workspace</div>
      <div className="sidebar-nav">
        <NavItem id="layout" label="Layout" icon={<Icons.Layout />} />
        <NavItem id="cabinets" label="Cabinets" icon={<Icons.Cabinet />} count={state.cabinets.length} />
        <NavItem id="library" label="Library" icon={<Icons.Library />} count={totalGames} badge={missingDims > 0 ? missingDims : null} />
        <NavItem id="settings" label="Settings" icon={<Icons.Settings />} />
      </div>

      <div className="sidebar-section-label">Saved layouts</div>
      <div className="sidebar-nav">
        <div className="nav-item" style={{ color: "var(--text-2)" }}>
          <span style={{ width: 16 }}></span>
          <span>Default arrangement</span>
        </div>
        <div className="nav-item" style={{ color: "var(--text-3)" }}>
          <span style={{ width: 16 }}></span>
          <span>Movie night setup</span>
        </div>
        <div className="nav-item" style={{ color: "var(--text-3)" }}>
          <span style={{ width: 16 }}></span>
          <span>Heavy-Euro pull</span>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="status-pill idle" title="BoardGameGeek sync — idle">
          <span className="dot"></span>
          <span>BGG</span>
          <span className="num">idle</span>
        </div>
        <div className="saved-tick">
          <span className="dot"></span>
          <span>saved 14:22</span>
        </div>
      </div>
    </aside>
  );
};

// Tweaks integration
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfy",
  "labelMode": "rotated",
  "roomToGrow": "soft",
  "showSchematic": true
}/*EDITMODE-END*/;

function TweaksUI() {
  const { state, dispatch } = useApp();
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Mirror to global state so views can react
  useEffect(() => {
    dispatch({
      type: "SET_TWEAK",
      tweak: {
        density: t.density,
        labelMode: t.labelMode,
        roomToGrow: t.roomToGrow,
        showSchematic: t.showSchematic,
      },
    });
  }, [t.density, t.labelMode, t.roomToGrow, t.showSchematic]);

  const { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect } = window;

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Density" />
      <TweakRadio
        label="Spacing"
        value={t.density}
        options={["compact", "comfy"]}
        onChange={(v) => setTweak("density", v)}
      />
      <TweakSection label="Box labels" />
      <TweakRadio
        label="Style"
        value={t.labelMode}
        options={["rotated", "horizontal", "none"]}
        onChange={(v) => setTweak("labelMode", v)}
      />
      <TweakSection label="Room to grow" />
      <TweakRadio
        label="Highlight"
        value={t.roomToGrow}
        options={["subtle", "soft", "off"]}
        onChange={(v) => setTweak("roomToGrow", v)}
      />
      <TweakSection label="Cabinets view" />
      <TweakToggle
        label="Show schematic preview"
        value={t.showSchematic}
        onChange={(v) => setTweak("showSchematic", v)}
      />
    </TweaksPanel>
  );
}

const App = () => {
  const { state } = useApp();
  const view = state.view;
  return (
    <div className={"app-shell density-" + state.tweaks.density}>
      <Sidebar />
      <div className="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {view === "layout" && <LayoutView />}
        {view === "cabinets" && <CabinetsView />}
        {view === "library" && <LibraryView />}
        {view === "settings" && <SettingsView />}
      </div>
      <TweaksUI />
    </div>
  );
};

// Render
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AppProvider>
    <App />
  </AppProvider>
);
