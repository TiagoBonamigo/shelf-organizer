// Global app state — context + reducer.
const { createContext, useContext, useReducer, useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect, Fragment } = React;

const AppContext = createContext(null);

function initialState() {
  const data = window.APP_DATA;
  return {
    view: "layout",
    cabinets: data.cabinets,
    shelves: data.shelves,
    boxes: data.boxes,
    activeLayout: null, // built by solver
    previousLayout: null,
    compareMode: false,
    selectedBoxId: null,
    proximityWeight: 0.3,
    activeLayoutName: "Default arrangement",
    activeLayoutSaved: false,
    activeLayoutDirty: false,
    savedLayouts: [],
    bggStatus: { state: "idle", message: "Idle", queueDepth: 0 },
    toasts: [],
    pendingSolve: null,
    settings: {
      defaultPaddingReserveMm: 20,
      defaultMaxStackCount: 4,
      defaultMaxStackHeightMm: null,
      defaultProximityWeight: 0.3,
      bggUsername: "boardgameowner42",
      bggRateLimitMs: 2000,
    },
    tweaks: {
      density: "comfy",
      labelMode: "rotated",
      roomToGrow: "soft",
      sidebarMode: "labeled",
      showSchematic: true,
    },
    activeCabinetId: data.cabinets[0]?.id || null,
    activeShelfId: null,
    selectedGameId: null,
    libraryFilter: "all",
    librarySearch: "",
    libraryMissingCount: 0,
    importModalOpen: false,
    addGameModalOpen: false,
    csvModalOpen: false,
    duplicateModalOpen: null,
    selectedLayoutMenuOpen: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "SET_LAYOUT":
      return {
        ...state,
        previousLayout: state.activeLayout,
        activeLayout: action.layout,
        compareMode: action.compare || false,
        activeLayoutDirty: false,
        activeLayoutSaved: false,
      };
    case "SET_DIRTY":
      return { ...state, activeLayoutDirty: true };
    case "UPDATE_PLACEMENTS":
      return {
        ...state,
        activeLayout: {
          ...state.activeLayout,
          placements: action.placements,
          unplaced: action.unplaced ?? state.activeLayout.unplaced,
          metrics: action.metrics ?? state.activeLayout.metrics,
        },
        activeLayoutDirty: true,
      };
    case "SELECT_BOX":
      return { ...state, selectedBoxId: action.id };
    case "SET_PROXIMITY":
      return { ...state, proximityWeight: action.value };
    case "SHOW_TOAST": {
      const t = { id: Math.random().toString(36).slice(2, 8), ...action.toast };
      return { ...state, toasts: [...state.toasts, t] };
    }
    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "SET_COMPARE":
      return { ...state, compareMode: action.value };
    case "SET_PENDING_SOLVE":
      return { ...state, pendingSolve: action.value };
    case "RESET_PINS": {
      if (!state.activeLayout) return state;
      const placements = state.activeLayout.placements.map((p) => ({ ...p, pinned: false }));
      return {
        ...state,
        activeLayout: { ...state.activeLayout, placements },
      };
    }
    case "SET_PIN": {
      const placements = state.activeLayout.placements.map((p) =>
        p.boxId === action.boxId ? { ...p, pinned: action.pinned } : p
      );
      return { ...state, activeLayout: { ...state.activeLayout, placements } };
    }
    case "REMOVE_FROM_SHELF": {
      const placements = state.activeLayout.placements.filter((p) => p.boxId !== action.boxId);
      const unplaced = [
        ...state.activeLayout.unplaced,
        { boxId: action.boxId, reason: "removed manually" },
      ];
      return {
        ...state,
        activeLayout: { ...state.activeLayout, placements, unplaced },
        activeLayoutDirty: true,
      };
    }
    case "SET_TWEAK":
      return { ...state, tweaks: { ...state.tweaks, ...action.tweak } };
    case "SET_ACTIVE_CABINET":
      return { ...state, activeCabinetId: action.id };
    case "SET_LIBRARY_FILTER":
      return { ...state, libraryFilter: action.value };
    case "SET_LIBRARY_SEARCH":
      return { ...state, librarySearch: action.value };
    case "SET_SELECTED_GAME":
      return { ...state, selectedGameId: action.id };
    case "PATCH_BOX": {
      const boxes = state.boxes.map((b) =>
        b.id === action.id ? { ...b, ...action.patch } : b
      );
      return { ...state, boxes };
    }
    case "PATCH_SHELF": {
      const shelves = state.shelves.map((s) =>
        s.id === action.id ? { ...s, ...action.patch } : s
      );
      return { ...state, shelves };
    }
    case "DELETE_SHELF": {
      const shelves = state.shelves.filter((s) => s.id !== action.id);
      const cabinets = state.cabinets.map((c) =>
        c.shelfIds.includes(action.id)
          ? { ...c, shelfIds: c.shelfIds.filter((sid) => sid !== action.id) }
          : c
      );
      return { ...state, shelves, cabinets };
    }
    case "ADD_SHELF": {
      const cab = state.cabinets.find((c) => c.id === action.cabinetId);
      if (!cab) return state;
      const id = "sh-" + Math.random().toString(36).slice(2, 7);
      const lastPos =
        Math.max(
          ...state.shelves.filter((s) => s.cabinetId === action.cabinetId).map((s) => s.position),
          -1
        ) + 1;
      const shelf = {
        id,
        cabinetId: action.cabinetId,
        position: lastPos,
        widthMm: 800,
        heightMm: 320,
        depthMm: 300,
        orientation: "vertical",
        paddingReserveMm: 20,
        maxStackCount: null,
        maxStackHeightMm: null,
      };
      const shelves = [...state.shelves, shelf];
      const cabinets = state.cabinets.map((c) =>
        c.id === action.cabinetId ? { ...c, shelfIds: [...c.shelfIds, id] } : c
      );
      return { ...state, shelves, cabinets };
    }
    case "PATCH_CABINET": {
      return {
        ...state,
        cabinets: state.cabinets.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c
        ),
      };
    }
    case "PATCH_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "OPEN_MODAL":
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Run initial solve on mount
  useEffect(() => {
    if (!state.activeLayout) {
      const layout = window.SOLVER.solve({
        cabinets: state.cabinets,
        shelves: state.shelves,
        boxes: state.boxes,
      });
      dispatch({ type: "SET_LAYOUT", layout });
    }
  }, []);

  // Auto-dismiss toasts after 4s
  useEffect(() => {
    const timers = state.toasts.map((t) =>
      setTimeout(() => dispatch({ type: "DISMISS_TOAST", id: t.id }), 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [state.toasts]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useApp() {
  return useContext(AppContext);
}

// Helpers
function findBox(state, id) {
  return state.boxes.find((b) => b.id === id);
}
function findShelf(state, id) {
  return state.shelves.find((s) => s.id === id);
}
function findCabinet(state, id) {
  return state.cabinets.find((c) => c.id === id);
}
function findPlacement(state, boxId) {
  return state.activeLayout?.placements.find((p) => p.boxId === boxId);
}
function placementsByShelf(state, shelfId) {
  return state.activeLayout?.placements.filter((p) => p.shelfId === shelfId) ?? [];
}
function getSibling(state, boxId) {
  const b = findBox(state, boxId);
  if (!b) return [];
  // siblings = parent + all expansions OR all expansions of this base
  const baseId = b.expansionOfBoxId || b.id;
  return state.boxes.filter(
    (x) => x.id === baseId || x.expansionOfBoxId === baseId
  );
}

Object.assign(window, {
  AppContext, AppProvider, useApp,
  findBox, findShelf, findCabinet, findPlacement, placementsByShelf, getSibling,
});
