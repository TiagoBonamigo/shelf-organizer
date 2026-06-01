import { FastifyInstance } from "fastify";
import { Store, uuid } from "../store/persistence.js";
import { Layout } from "../types.js";

export function registerLayoutRoutes(app: FastifyInstance, store: Store) {
  app.get("/api/layouts", async () => store.get().layouts);

  app.post("/api/layouts", async (req) => {
    const { name } = req.body as { name: string };
    const state = store.get();
    if (!state.activeLayoutId) {
      return { error: "no active layout to save" };
    }
    const cur = state.layouts.find((l) => l.id === state.activeLayoutId);
    if (!cur) return { error: "active layout missing" };
    const copy: Layout = {
      ...cur,
      id: uuid(),
      name: name || "Untitled",
      createdAt: new Date().toISOString(),
      placements: cur.placements.map((p) => ({ ...p })),
      unplaced: cur.unplaced.map((u) => ({ ...u })),
    };
    store.update((s) => {
      s.layouts.push(copy);
      s.activeLayoutId = copy.id;
    });
    return copy;
  });

  app.get("/api/layouts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const layout = store.get().layouts.find((l) => l.id === id);
    if (!layout) return reply.code(404).send({ error: "not found" });
    return layout;
  });

  app.delete("/api/layouts/:id", async (req) => {
    const { id } = req.params as { id: string };
    store.update((s) => {
      s.layouts = s.layouts.filter((l) => l.id !== id);
      if (s.activeLayoutId === id) s.activeLayoutId = s.layouts[0]?.id ?? null;
    });
    return { ok: true };
  });

  app.post("/api/layouts/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    let chosen: Layout | null = null;
    store.update((s) => {
      const l = s.layouts.find((x) => x.id === id);
      if (l) {
        s.activeLayoutId = id;
        chosen = l;
      }
    });
    if (!chosen) return reply.code(404).send({ error: "not found" });
    return chosen;
  });
}
