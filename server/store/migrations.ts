import { AppState, Box, DEFAULT_SETTINGS, Placement, UUID } from "../types.js";
import { resolveDims } from "../solver/geometry.js";

const CURRENT_SCHEMA_VERSION = 4;

export function applyMigrations(raw: AppState): AppState {
  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
  // schemaVersion must reflect the on-disk value, not the default, so the loop
  // below actually runs missing migrations.
  if (raw.settings && typeof raw.settings.schemaVersion === "number") {
    settings.schemaVersion = raw.settings.schemaVersion;
  } else {
    settings.schemaVersion = 0;
  }
  let state: AppState = {
    cabinets: raw.cabinets ?? [],
    shelves: raw.shelves ?? [],
    boxes: raw.boxes ?? [],
    layouts: raw.layouts ?? [],
    activeLayoutId: raw.activeLayoutId ?? null,
    settings,
  };

  while ((state.settings.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION) {
    const next = (state.settings.schemaVersion ?? 0) + 1;
    state = migrate(state, next);
    state.settings.schemaVersion = next;
  }
  return state;
}

function migrate(state: AppState, toVersion: number): AppState {
  switch (toVersion) {
    case 1:
      // initial schema — nothing to do
      return state;
    case 2: {
      // Pyramid rule tightened from face-area to W/D containment. Walk every
      // saved layout's stacked placements; flag the layout stale if any
      // child→parent pair violates the new rule.
      const boxesById = new Map<UUID, Box>();
      for (const b of state.boxes) boxesById.set(b.id, b);
      const layouts = state.layouts.map((layout) => {
        const byBox = new Map<UUID, Placement>();
        for (const p of layout.placements) byBox.set(p.boxId, p);
        for (const p of layout.placements) {
          if (p.orientation !== "stacked" || !p.stackParentBoxId) continue;
          const child = boxesById.get(p.boxId);
          const parent = boxesById.get(p.stackParentBoxId);
          if (!child || !parent) continue;
          const childR = resolveDims(child, "stacked", p.forwardFace);
          const parentP = byBox.get(parent.id);
          const parentR = resolveDims(parent, "stacked", parentP?.forwardFace);
          if (!childR || !parentR) continue;
          if (
            childR.widthOnShelf > parentR.widthOnShelf ||
            childR.depthOnShelf > parentR.depthOnShelf
          ) {
            return { ...layout, stale: true };
          }
        }
        return layout;
      });
      return { ...state, layouts };
    }
    case 3: {
      // Proximity scoring removed. Drop the now-unused setting and metric.
      const settings = { ...state.settings };
      delete (settings as { defaultProximityWeight?: number }).defaultProximityWeight;
      const layouts = state.layouts.map((layout) => {
        const metrics = { ...layout.metrics };
        delete (metrics as { proximityScore?: number }).proximityScore;
        return { ...layout, metrics };
      });
      return { ...state, settings, layouts };
    }
    case 4:
      // bggBearerToken added to Settings; defaults to null via DEFAULT_SETTINGS spread.
      return state;
    default:
      return state;
  }
}
