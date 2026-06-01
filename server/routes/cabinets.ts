import { FastifyInstance } from "fastify";
import { Store, uuid } from "../store/persistence.js";
import { Cabinet } from "../types.js";

export function registerCabinetRoutes(app: FastifyInstance, store: Store) {
  app.post("/api/cabinets", async (req) => {
    const { name } = req.body as { name: string };
    const cab: Cabinet = {
      id: uuid(),
      name: name || "Untitled cabinet",
      position: store.get().cabinets.length,
      shelfIds: [],
    };
    store.update((s) => {
      s.cabinets.push(cab);
    });
    return cab;
  });

  app.patch("/api/cabinets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Partial<Cabinet>;
    let updated: Cabinet | null = null;
    store.update((s) => {
      const cab = s.cabinets.find((c) => c.id === id);
      if (cab) {
        Object.assign(cab, patch);
        updated = cab;
      }
    });
    if (!updated) return reply.code(404).send({ error: "cabinet not found" });
    return updated;
  });

  app.delete("/api/cabinets/:id", async (req) => {
    const { id } = req.params as { id: string };
    store.update((s) => {
      const cab = s.cabinets.find((c) => c.id === id);
      if (!cab) return;
      s.cabinets = s.cabinets.filter((c) => c.id !== id);
      s.shelves = s.shelves.filter((sh) => sh.cabinetId !== id);
      // Reflow positions
      s.cabinets.sort((a, b) => a.position - b.position).forEach((c, i) => (c.position = i));
    });
    return { ok: true };
  });

  app.post("/api/cabinets/reorder", async (req) => {
    const { order } = req.body as { order: string[] };
    store.update((s) => {
      const map = new Map(order.map((id, i) => [id, i]));
      for (const c of s.cabinets) {
        const p = map.get(c.id);
        if (p != null) c.position = p;
      }
      s.cabinets.sort((a, b) => a.position - b.position);
    });
    return store.get().cabinets;
  });
}
