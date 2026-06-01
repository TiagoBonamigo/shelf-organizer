import { FastifyInstance } from "fastify";
import { Store } from "../store/persistence.js";
import { Box, Layout, Placement, UUID, ValidationError } from "../types.js";
import { validatePlacement } from "../solver/validate.js";
import { largestGapMm } from "../solver/scoring.js";

export function registerPlacementRoutes(app: FastifyInstance, store: Store) {
  app.patch("/api/placements", async (req, reply) => {
    const proposed = req.body as Placement[];
    const state = store.get();
    if (!state.activeLayoutId) return reply.code(400).send({ error: "no active layout" });
    const layout = state.layouts.find((l) => l.id === state.activeLayoutId);
    if (!layout) return reply.code(404).send({ error: "active layout missing" });
    const boxesById = new Map<UUID, Box>();
    for (const b of state.boxes) boxesById.set(b.id, b);

    const accepted: Placement[] = [];
    const rejected: Array<{ placement: Placement; error: ValidationError }> = [];

    // Start from current placements; apply edits one by one.
    let working = [...layout.placements];
    for (const p of proposed) {
      const shelf = state.shelves.find((s) => s.id === p.shelfId);
      const box = boxesById.get(p.boxId);
      if (!shelf || !box) {
        rejected.push({ placement: p, error: { code: "unknown", message: "Box or shelf not found." } });
        continue;
      }
      const others = working.filter((o) => o.shelfId === p.shelfId && o.boxId !== p.boxId);
      const err = validatePlacement(p, {
        shelf,
        box,
        settings: state.settings,
        others,
        boxesById,
      });
      if (err) {
        rejected.push({ placement: p, error: err });
        continue;
      }
      // Apply: remove any existing placement for this box, add the new one (auto-pinned).
      working = working.filter((o) => o.boxId !== p.boxId).concat([{ ...p, pinned: true }]);
      accepted.push(p);
    }

    // Persist the updated layout.
    store.update((s) => {
      const l = s.layouts.find((x) => x.id === state.activeLayoutId);
      if (!l) return;
      l.placements = working;
      // Clear any unplaced entries for boxes we just placed.
      const placedIds = new Set(working.map((p) => p.boxId));
      l.unplaced = l.unplaced.filter((u) => !placedIds.has(u.boxId));
      const gap = largestGapMm(working, s.shelves);
      l.metrics.largestGapMm = gap.largest;
      l.metrics.largestGapShelfId = gap.shelfId;
      l.metrics.placedCount = working.length;
      l.metrics.unplacedCount = l.unplaced.length;
    });

    const updated = store.get().layouts.find((l) => l.id === state.activeLayoutId) as Layout;
    return { layout: updated, rejected };
  });

  app.post("/api/placements/remove", async (req) => {
    const { boxId, reason } = req.body as { boxId: string; reason?: string };
    store.update((s) => {
      if (!s.activeLayoutId) return;
      const l = s.layouts.find((x) => x.id === s.activeLayoutId);
      if (!l) return;
      l.placements = l.placements.filter((p) => p.boxId !== boxId);
      l.unplaced.push({ boxId, reason: reason ?? "removed manually" });
      l.metrics.placedCount = l.placements.length;
      l.metrics.unplacedCount = l.unplaced.length;
    });
    return store.get().layouts.find((l) => l.id === store.get().activeLayoutId);
  });

  app.post("/api/placements/reset-pins", async () => {
    store.update((s) => {
      if (!s.activeLayoutId) return;
      const l = s.layouts.find((x) => x.id === s.activeLayoutId);
      if (!l) return;
      l.placements = l.placements.map((p) => ({ ...p, pinned: false }));
    });
    return store.get().layouts.find((l) => l.id === store.get().activeLayoutId);
  });

  app.post("/api/placements/pin", async (req) => {
    const { boxId, pinned } = req.body as { boxId: string; pinned: boolean };
    store.update((s) => {
      if (!s.activeLayoutId) return;
      const l = s.layouts.find((x) => x.id === s.activeLayoutId);
      if (!l) return;
      const p = l.placements.find((pp) => pp.boxId === boxId);
      if (p) p.pinned = pinned;
    });
    return store.get().layouts.find((l) => l.id === store.get().activeLayoutId);
  });
}
