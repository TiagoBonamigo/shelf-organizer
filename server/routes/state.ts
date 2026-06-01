import { FastifyInstance } from "fastify";
import { Store } from "../store/persistence.js";
import { BggClient } from "../bgg/client.js";

export function registerStateRoutes(app: FastifyInstance, store: Store, bgg: BggClient) {
  app.get("/api/state", async () => {
    return { ...store.get(), bggStatus: bgg.getStatus() };
  });

  app.patch("/api/settings", async (req) => {
    const patch = req.body as Record<string, unknown>;
    return store.update((s) => {
      s.settings = { ...s.settings, ...patch };
      bgg.setSettings({ bggRateLimitMs: s.settings.bggRateLimitMs, bggBearerToken: s.settings.bggBearerToken });
    }).settings;
  });
}
