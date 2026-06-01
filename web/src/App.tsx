import React, { useEffect } from "react";
import { useStore } from "./state/store";
import { Sidebar } from "./components/Sidebar";
import { LayoutView } from "./views/LayoutView";
import { CabinetsView } from "./views/CabinetsView";
import { LibraryView } from "./views/LibraryView";
import { SettingsView } from "./views/SettingsView";
import { Toasts } from "./components/Toasts";

const App: React.FC = () => {
  const view = useStore((s) => s.view);
  const load = useStore((s) => s.load);
  const loaded = useStore((s) => s.loaded);
  const density = useStore((s) => s.tweaks.density);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--text-3)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div className={"app-shell density-" + density}>
      <Sidebar />
      <div className="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {view === "layout" && <LayoutView />}
        {view === "cabinets" && <CabinetsView />}
        {view === "library" && <LibraryView />}
        {view === "settings" && <SettingsView />}
      </div>
      <Toasts />
    </div>
  );
};

export default App;
