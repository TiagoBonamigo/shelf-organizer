import { FastifyInstance } from "fastify";
import { Store, uuid } from "../store/persistence.js";
import { Box } from "../types.js";

export function registerBoxRoutes(app: FastifyInstance, store: Store) {
  app.post("/api/boxes", async (req) => {
    const body = req.body as Omit<Box, "id">;
    const box: Box = {
      ...body,
      id: uuid(),
    };
    store.update((s) => {
      s.boxes.push(box);
    });
    return box;
  });

  app.patch("/api/boxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = req.body as Partial<Box>;
    let updated: Box | null = null;
    store.update((s) => {
      const b = s.boxes.find((x) => x.id === id);
      if (b) {
        Object.assign(b, patch);
        updated = b;
      }
    });
    if (!updated) return reply.code(404).send({ error: "box not found" });
    return updated;
  });

  app.delete("/api/boxes/:id", async (req) => {
    const { id } = req.params as { id: string };
    store.update((s) => {
      s.boxes = s.boxes.filter((b) => b.id !== id);
      // Cascade: clear any placements that referenced it
      for (const l of s.layouts) {
        l.placements = l.placements.filter((p) => p.boxId !== id);
        l.unplaced = l.unplaced.filter((u) => u.boxId !== id);
      }
    });
    return { ok: true };
  });
}
