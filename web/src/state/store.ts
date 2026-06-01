import { create } from "zustand";
import type { AppState, Box, Cabinet, Layout, Shelf } from "../lib/shared-types";
import { api, type BggStatus } from "../api/client";

export type View = "layout" | "cabinets" | "library" | "settings";
export type Density = "compact" | "comfy";
export type LabelMode = "rotated" | "horizontal" | "none";
export type RoomToGrow = "subtle" | "soft" | "off";

interface Toast {
  id: string;
  kind: "info" | "error";
  message: string;
}

interface StoreState extends AppState {
  bggStatus: BggStatus;
  loaded: boolean;

  view: View;
  selectedBoxId: string | null;
  activeCabinetId: string | null;
  selectedGameId: string | null;
  librarySearch: string;
  libraryFilter: "all" | "missing-dims" | "has-expansions" | "pinned" | "unplaced";
  toasts: Toast[];
  compareMode: boolean;
  previousLayoutId: string | null;
  pendingSolve: boolean;
  savedAt: string | null;
  tweaks: {
    density: Density;
    labelMode: LabelMode;
    roomToGrow: RoomToGrow;
    showSchematic: boolean;
  };

  load: () => Promise<void>;
  setView: (v: View) => void;
  setActiveCabinet: (id: string | null) => void;
  selectBox: (id: string | null) => void;
  selectGame: (id: string | null) => void;
  setLibrarySearch: (q: string) => void;
  setLibraryFilter: (f: StoreState["libraryFilter"]) => void;
  setTweak: <K extends keyof StoreState["tweaks"]>(k: K, v: StoreState["tweaks"][K]) => void;

  showToast: (kind: "info" | "error", message: string) => void;
  dismissToast: (id: string) => void;

  refreshState: () => Promise<void>;
  applyLayout: (layout: Layout, opts?: { compare?: boolean }) => void;

  // Actions that hit the API and locally reflect the result.
  solve: () => Promise<void>;
  solveAroundPins: () => Promise<void>;
  resetPins: () => Promise<void>;
  patchBox: (id: string, patch: Partial<Box>) => Promise<void>;
  patchShelf: (id: string, patch: Partial<Shelf>) => Promise<void>;
  patchCabinet: (id: string, patch: Partial<Cabinet>) => Promise<void>;
  addShelf: (cabinetId: string, init?: Partial<Shelf>) => Promise<void>;
  deleteShelf: (id: string) => Promise<void>;
  addCabinet: (name: string) => Promise<void>;
  deleteCabinet: (id: string) => Promise<void>;
  saveLayoutAs: (name: string) => Promise<void>;
  activateLayout: (id: string) => Promise<void>;
  deleteLayout: (id: string) => Promise<void>;
  removeBoxFromShelf: (boxId: string) => Promise<void>;
  setBoxPin: (boxId: string, pinned: boolean) => Promise<void>;
  loadFixture: (name: string) => Promise<void>;
}

const TOAST_TTL = 4000;
let toastId = 0;

export const useStore = create<StoreState>((set, get) => ({
  cabinets: [],
  shelves: [],
  boxes: [],
  layouts: [],
  activeLayoutId: null,
  settings: {
    defaultPaddingReserveMm: 0,
    defaultMaxStackCount: 4,
    defaultMaxStackHeightMm: null,
    bggUsername: null,
    bggBearerToken: null,
    bggRateLimitMs: 2000,
    schemaVersion: 4,
  },
  bggStatus: { state: "idle", queueDepth: 0, backoffUntil: null, lastError: null },
  loaded: false,

  view: "layout",
  selectedBoxId: null,
  activeCabinetId: null,
  selectedGameId: null,
  librarySearch: "",
  libraryFilter: "all",
  toasts: [],
  compareMode: false,
  previousLayoutId: null,
  pendingSolve: false,
  savedAt: null,
  tweaks: {
    density: "comfy",
    labelMode: "rotated",
    roomToGrow: "soft",
    showSchematic: true,
  },

  async load() {
    const s = await api.getState();
    set({
      ...s,
      bggStatus: s.bggStatus,
      loaded: true,
      activeCabinetId: get().activeCabinetId ?? s.cabinets[0]?.id ?? null,
      savedAt: new Date().toISOString(),
    });

    // Run an initial solve if there's no active layout yet.
    if (!s.activeLayoutId && s.boxes.length > 0) {
      await get().solve();
    }

    // Poll BGG status every 2s while it's not idle.
    setInterval(async () => {
      const status = await api.bggStatus();
      set({ bggStatus: status });
    }, 2000);
  },

  setView: (v) => set({ view: v }),
  setActiveCabinet: (id) => set({ activeCabinetId: id }),
  selectBox: (id) => set({ selectedBoxId: id }),
  selectGame: (id) => set({ selectedGameId: id }),
  setLibrarySearch: (q) => set({ librarySearch: q }),
  setLibraryFilter: (f) => set({ libraryFilter: f }),
  setTweak: (k, v) => set((s) => ({ tweaks: { ...s.tweaks, [k]: v } })),

  showToast: (kind, message) => {
    const id = String(++toastId);
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), TOAST_TTL);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  async refreshState() {
    const s = await api.getState();
    set({ ...s, bggStatus: s.bggStatus, savedAt: new Date().toISOString() });
  },

  applyLayout(layout, opts) {
    set((s) => {
      // Tag changed placements against previous active layout.
      const prevId = s.activeLayoutId;
      const prev = prevId ? s.layouts.find((l) => l.id === prevId) : null;
      const tagged = { ...layout };
      if (prev) {
        const prevBy = new Map(prev.placements.map((p) => [p.boxId, p]));
        tagged.placements = layout.placements.map((p) => {
          const old = prevBy.get(p.boxId);
          const changed =
            !old || old.shelfId !== p.shelfId || Math.abs(old.positionMm - p.positionMm) > 5;
          return { ...p, changed };
        });
      }
      const layouts = s.layouts.filter((l) => l.id !== layout.id).concat([tagged]);
      return {
        layouts,
        activeLayoutId: tagged.id,
        previousLayoutId: prev?.id ?? null,
        compareMode: opts?.compare ?? false,
        savedAt: new Date().toISOString(),
      };
    });
  },

  async solve() {
    set({ pendingSolve: true });
    try {
      const layout = await api.solve();
      get().applyLayout(layout, { compare: false });
    } catch (e) {
      get().showToast("error", String(e));
    } finally {
      set({ pendingSolve: false });
    }
  },

  async solveAroundPins() {
    set({ pendingSolve: true });
    try {
      const layout = await api.solveAroundPins();
      get().applyLayout(layout, { compare: true });
    } catch (e) {
      get().showToast("error", String(e));
    } finally {
      set({ pendingSolve: false });
    }
  },

  async resetPins() {
    const layout = await api.resetPins();
    if (layout) get().applyLayout(layout);
    get().showToast("info", "All pins removed.");
  },

  async patchBox(id, patch) {
    const updated = await api.patchBox(id, patch);
    set((s) => ({ boxes: s.boxes.map((b) => (b.id === id ? updated : b)), savedAt: new Date().toISOString() }));
  },

  async patchShelf(id, patch) {
    const updated = await api.patchShelf(id, patch);
    set((s) => ({ shelves: s.shelves.map((sh) => (sh.id === id ? updated : sh)), savedAt: new Date().toISOString() }));
  },

  async patchCabinet(id, patch) {
    const updated = await api.patchCabinet(id, patch);
    set((s) => ({ cabinets: s.cabinets.map((c) => (c.id === id ? updated : c)), savedAt: new Date().toISOString() }));
  },

  async addShelf(cabinetId, init) {
    const created = await api.createShelves(cabinetId, [init ?? {}]);
    set((s) => ({
      shelves: [...s.shelves, ...created],
      cabinets: s.cabinets.map((c) =>
        c.id === cabinetId ? { ...c, shelfIds: [...c.shelfIds, ...created.map((x) => x.id)] } : c,
      ),
      savedAt: new Date().toISOString(),
    }));
  },

  async deleteShelf(id) {
    await api.deleteShelf(id);
    set((s) => ({
      shelves: s.shelves.filter((sh) => sh.id !== id),
      cabinets: s.cabinets.map((c) => ({ ...c, shelfIds: c.shelfIds.filter((sid) => sid !== id) })),
      savedAt: new Date().toISOString(),
    }));
  },

  async addCabinet(name) {
    const cab = await api.createCabinet(name);
    set((s) => ({ cabinets: [...s.cabinets, cab], activeCabinetId: cab.id, savedAt: new Date().toISOString() }));
  },

  async deleteCabinet(id) {
    await api.deleteCabinet(id);
    set((s) => {
      const remainingCabinets = s.cabinets.filter((c) => c.id !== id);
      const remainingShelves = s.shelves.filter((sh) => sh.cabinetId !== id);
      const remainingShelfIds = new Set(remainingShelves.map((sh) => sh.id));
      // Drop any placements pointing at the removed shelves from in-memory layouts.
      const cleanedLayouts = s.layouts.map((l) => ({
        ...l,
        placements: l.placements.filter((p) => remainingShelfIds.has(p.shelfId)),
      }));
      const nextActive =
        s.activeCabinetId === id ? remainingCabinets[0]?.id ?? null : s.activeCabinetId;
      return {
        cabinets: remainingCabinets,
        shelves: remainingShelves,
        layouts: cleanedLayouts,
        activeCabinetId: nextActive,
        savedAt: new Date().toISOString(),
      };
    });
  },

  async saveLayoutAs(name) {
    const layout = await api.saveLayout(name);
    set((s) => ({
      layouts: [...s.layouts.filter((l) => l.id !== layout.id), layout],
      activeLayoutId: layout.id,
      savedAt: new Date().toISOString(),
    }));
    get().showToast("info", `Saved as "${name}".`);
  },

  async activateLayout(id) {
    const layout = await api.activateLayout(id);
    set((s) => ({ activeLayoutId: id, layouts: s.layouts.map((l) => (l.id === id ? layout : l)) }));
  },

  async deleteLayout(id) {
    await api.deleteLayout(id);
    set((s) => ({
      layouts: s.layouts.filter((l) => l.id !== id),
      activeLayoutId: s.activeLayoutId === id ? s.layouts.find((l) => l.id !== id)?.id ?? null : s.activeLayoutId,
    }));
  },

  async removeBoxFromShelf(boxId) {
    const layout = await api.removePlacement(boxId, "removed manually");
    if (layout) get().applyLayout(layout);
  },

  async setBoxPin(boxId, pinned) {
    const layout = await api.setPin(boxId, pinned);
    if (layout) get().applyLayout(layout);
  },

  async loadFixture(name) {
    const next = await api.loadFixture(name);
    set({
      ...next,
      activeCabinetId: next.cabinets[0]?.id ?? null,
      selectedBoxId: null,
      selectedGameId: null,
      previousLayoutId: null,
      compareMode: false,
      savedAt: new Date().toISOString(),
    });
    get().showToast("info", `Loaded fixture "${name}".`);
  },
}));

// Convenience selectors
export const selectActiveLayout = (s: StoreState): Layout | null =>
  s.activeLayoutId ? s.layouts.find((l) => l.id === s.activeLayoutId) ?? null : null;
export const selectPreviousLayout = (s: StoreState): Layout | null =>
  s.previousLayoutId ? s.layouts.find((l) => l.id === s.previousLayoutId) ?? null : null;
