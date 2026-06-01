import { FastifyInstance } from "fastify";
import { Store, uuid } from "../store/persistence.js";
import { Shelf } from "../types.js";

export function registerShelfRoutes(app: FastifyInstance, store: Store) {
  app.post("/api/cabinets/:id/shelves", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = req.body as Array<Omit<Shelf, "id" | "cabinetId" | "position">>;
    const created: Shelf[] = [];
    store.update((s) => {
      const cab = s.cabinets.find((c) => c.id === id);
      if (!cab) return;
      const base = s.shelves.filter((sh) => sh.cabinetId === id).length;
      rows.forEach((row, i) => {
        const sh: Shelf = {
          id: uuid(),
          cabinetId: id,
          position: base + i,
          widthMm: row.widthMm ?? 800,
          heightMm: row.heightMm ?? 320,
          depthMm: row.depthMm ?? 300,
          orientation: row.orientation ?? "vertical",
          paddingReserveMm: row.paddingReserveMm ?? s.settings.defaultPaddingReserveMm,
          maxStackCount: row.maxStackCount ?? null,
          maxStackHeightMm: row.maxStackHeightMm ?? null,
        };
        s.shelves.push(sh);
        cab.shelfIds.push(sh.id);
        created.push(sh);
      });
    });
    if (created.length === 0) return reply.code(404).send({ error: "cabinet not found" });
    return created;
  });

  app.patch("/api/shelves/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Partial<Shelf>;
    let updated: Shelf | null = null;
    store.update((s) => {
      const sh = s.shelves.find((x) => x.id === id);
      if (sh) {
        Object.assign(sh, patch);
        updated = sh;
      }
    });
    if (!updated) return reply.code(404).send({ error: "shelf not found" });
    return updated;
  });

  app.delete("/api/shelves/:id", async (req) => {
    const { id } = req.params as { id: string };
    store.update((s) => {
      s.shelves = s.shelves.filter((sh) => sh.id !== id);
      for (const c of s.cabinets) c.shelfIds = c.shelfIds.filter((sid) => sid !== id);
      // Reflow positions within each cabinet
      for (const c of s.cabinets) {
        const own = s.shelves.filter((sh) => sh.cabinetId === c.id).sort((a, b) => a.position - b.position);
        own.forEach((sh, i) => (sh.position = i));
      }
    });
    return { ok: true };
  });

  app.post("/api/cabinets/:id/shelves/reorder", async (req) => {
    const { id } = req.params as { id: string };
    const { order } = req.body as { order: string[] };
    store.update((s) => {
      const map = new Map(order.map((sid, i) => [sid, i]));
      for (const sh of s.shelves) {
        if (sh.cabinetId !== id) continue;
        const p = map.get(sh.id);
        if (p != null) sh.position = p;
      }
      const cab = s.cabinets.find((c) => c.id === id);
      if (cab) cab.shelfIds = [...cab.shelfIds].sort((a, b) => (map.get(a) ?? 0) - (map.get(b) ?? 0));
    });
    return store.get().shelves.filter((sh) => sh.cabinetId === id);
  });
}
