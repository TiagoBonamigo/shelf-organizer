import React from "react";
import { useStore, type View } from "../state/store";
import { Icons } from "./Icons";
import { StatusPill } from "./StatusPill";

interface NavItemProps {
  id: View;
  label: string;
  icon: React.ReactNode;
  count?: number;
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({ id, label, icon, count, badge }) => {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div
      className={"nav-item" + (view === id ? " active" : "")}
      onClick={() => setView(id)}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {badge ? (
        <span className="badge">{badge}</span>
      ) : count != null ? (
        <span className="nav-count">{count}</span>
      ) : null}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const boxes = useStore((s) => s.boxes);
  const cabinets = useStore((s) => s.cabinets);
  const layouts = useStore((s) => s.layouts);
  const activeLayoutId = useStore((s) => s.activeLayoutId);
  const activate = useStore((s) => s.activateLayout);
  const savedAt = useStore((s) => s.savedAt);

  const missingDims = boxes.filter((b) => !b.dimensions || b.dimensions.w === 0).length;
  const savedLabel = savedAt
    ? `saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "not saved";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
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
        <NavItem id="cabinets" label="Cabinets" icon={<Icons.Cabinet />} count={cabinets.length} />
        <NavItem id="library" label="Library" icon={<Icons.Library />} count={boxes.length} badge={missingDims || undefined} />
        <NavItem id="settings" label="Settings" icon={<Icons.Settings />} />
      </div>

      <div className="sidebar-section-label">Saved layouts</div>
      <div className="sidebar-nav">
        {layouts
          .filter((l) => l.name !== "Current arrangement")
          .map((l) => (
            <div
              key={l.id}
              className={"nav-item" + (l.id === activeLayoutId ? " active" : "")}
              onClick={() => activate(l.id)}
            >
              <span style={{ width: 16 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.name}
              </span>
            </div>
          ))}
        {layouts.filter((l) => l.name !== "Current arrangement").length === 0 && (
          <div className="nav-item" style={{ color: "var(--text-4)", fontSize: 11, fontStyle: "italic" }}>
            <span style={{ width: 16 }} />
            <span>No saved layouts yet.</span>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <StatusPill />
        <div className="saved-tick">
          <span className="dot" />
          <span>{savedLabel}</span>
        </div>
      </div>
    </aside>
  );
};
