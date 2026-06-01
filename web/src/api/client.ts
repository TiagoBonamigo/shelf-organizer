// Typed REST client. All endpoints proxied through Vite to localhost:3000 in dev,
// served from the same origin in production.

import type {
  AppState,
  BggJob,
  BggSearchResult,
  Box,
  Cabinet,
  Layout,
  Placement,
  PlacementApplyResult,
  Settings,
  Shelf,
  ValidationError,
} from "../lib/shared-types";

export interface BggStatus {
  state: "idle" | "syncing" | "rate-limited" | "error";
  queueDepth: number;
  backoffUntil: string | null;
  lastError: string | null;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${url} → ${r.status}: ${text}`);
  }
  return (await r.json()) as T;
}

export const api = {
  getState: () => req<AppState & { bggStatus: BggStatus }>("GET", "/api/state"),
  patchSettings: (patch: Partial<Settings>) => req<Settings>("PATCH", "/api/settings", patch),

  createCabinet: (name: string) => req<Cabinet>("POST", "/api/cabinets", { name }),
  patchCabinet: (id: string, patch: Partial<Cabinet>) =>
    req<Cabinet>("PATCH", `/api/cabinets/${id}`, patch),
  deleteCabinet: (id: string) => req<{ ok: true }>("DELETE", `/api/cabinets/${id}`),
  reorderCabinets: (order: string[]) =>
    req<Cabinet[]>("POST", "/api/cabinets/reorder", { order }),

  createShelves: (cabinetId: string, shelves: Array<Partial<Shelf>>) =>
    req<Shelf[]>("POST", `/api/cabinets/${cabinetId}/shelves`, shelves),
  patchShelf: (id: string, patch: Partial<Shelf>) =>
    req<Shelf>("PATCH", `/api/shelves/${id}`, patch),
  deleteShelf: (id: string) => req<{ ok: true }>("DELETE", `/api/shelves/${id}`),
  reorderShelves: (cabinetId: string, order: string[]) =>
    req<Shelf[]>("POST", `/api/cabinets/${cabinetId}/shelves/reorder`, { order }),

  createBox: (box: Omit<Box, "id">) => req<Box>("POST", "/api/boxes", box),
  patchBox: (id: string, patch: Partial<Box>) =>
    req<Box>("PATCH", `/api/boxes/${id}`, patch),
  deleteBox: (id: string) => req<{ ok: true }>("DELETE", `/api/boxes/${id}`),

  solve: () => req<Layout>("POST", "/api/solve", {}),
  solveAroundPins: () => req<Layout>("POST", "/api/solve/around-pins", {}),

  patchPlacements: (placements: Placement[]) =>
    req<{ layout: Layout; rejected: Array<{ placement: Placement; error: ValidationError }> }>(
      "PATCH",
      "/api/placements",
      placements,
    ),
  removePlacement: (boxId: string, reason?: string) =>
    req<Layout>("POST", "/api/placements/remove", { boxId, reason }),
  resetPins: () => req<Layout>("POST", "/api/placements/reset-pins"),
  setPin: (boxId: string, pinned: boolean) =>
    req<Layout>("POST", "/api/placements/pin", { boxId, pinned }),

  saveLayout: (name: string) => req<Layout>("POST", "/api/layouts", { name }),
  listLayouts: () => req<Layout[]>("GET", "/api/layouts"),
  deleteLayout: (id: string) => req<{ ok: true }>("DELETE", `/api/layouts/${id}`),
  activateLayout: (id: string) => req<Layout>("POST", `/api/layouts/${id}/activate`),

  bggStatus: () => req<BggStatus>("GET", "/api/bgg/status"),
  importBgg: (username: string) =>
    req<{ jobId: string }>("POST", "/api/bgg/import-collection", { username }),
  getJob: (jobId: string) => req<BggJob>("GET", `/api/bgg/jobs/${jobId}`),
  searchBgg: (q: string) => req<BggSearchResult[]>("GET", `/api/bgg/search?q=${encodeURIComponent(q)}`),
  refreshBox: (boxId: string) => req<Box>("POST", `/api/bgg/refresh/${boxId}`),
  clearBggCache: () => req<{ ok: true }>("POST", "/api/bgg/cache/clear"),

  listFixtures: () => req<FixtureSummary[]>("GET", "/api/fixtures"),
  loadFixture: (name: string) => req<AppState>("POST", `/api/fixtures/${name}/load`),
};

export interface FixtureSummary {
  name: string;
  title: string;
  description: string;
  tags?: string[];
  stats: { cabinets: number; shelves: number; boxes: number; layouts: number };
}
