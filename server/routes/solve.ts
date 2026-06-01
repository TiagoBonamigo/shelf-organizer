import { FastifyInstance } from "fastify";
import { Store } from "../store/persistence.js";
import { solve } from "../solver/index.js";

export function registerSolveRoutes(app: FastifyInstance, store: Store) {
  app.post("/api/solve", async () => {
    const layout = solve(store.get(), { preservePins: false });
    store.update((s) => {
      // remove any existing pins from active layout
      if (s.activeLayoutId) {
        const cur = s.layouts.find((l) => l.id === s.activeLayoutId);
        if (cur) cur.placements = cur.placements.map((p) => ({ ...p, pinned: false }));
      }
      // make it the active "current arrangement"
      s.layouts = s.layouts.filter((l) => l.name !== "Current arrangement");
      s.layouts.push(layout);
      s.activeLayoutId = layout.id;
    });
    return layout;
  });

  app.post("/api/solve/around-pins", async () => {
    const layout = solve(store.get(), { preservePins: true });
    store.update((s) => {
      s.layouts = s.layouts.filter((l) => l.name !== "Current arrangement");
      s.layouts.push(layout);
      s.activeLayoutId = layout.id;
    });
    return layout;
  });
}
