import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { Store, resolveDataDir } from "./store/persistence.js";
import { makeSeedState } from "./store/seed.js";
import { BggCache } from "./bgg/cache.js";
import { BggClient } from "./bgg/client.js";
import { JobTracker } from "./bgg/jobs.js";

import { registerStateRoutes } from "./routes/state.js";
import { registerCabinetRoutes } from "./routes/cabinets.js";
import { registerShelfRoutes } from "./routes/shelves.js";
import { registerBoxRoutes } from "./routes/boxes.js";
import { registerBggRoutes } from "./routes/bgg.js";
import { registerSolveRoutes } from "./routes/solve.js";
import { registerLayoutRoutes } from "./routes/layouts.js";
import { registerPlacementRoutes } from "./routes/placements.js";
import { registerFixtureRoutes } from "./routes/fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);

async function main() {
  const dataDir = resolveDataDir();
  const store = new Store({ dataDir, debounceMs: 200 });
  await store.init();

  // Seed once if empty.
  if (store.get().cabinets.length === 0 && store.get().boxes.length === 0) {
    store.replace(makeSeedState());
    await store.flush();
  }

  const cache = new BggCache(dataDir);
  await cache.init();
  const bgg = new BggClient(cache, { bggRateLimitMs: store.get().settings.bggRateLimitMs });
  const jobs = new JobTracker();

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  app.addHook("onSend", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
    }
  });
  app.options("/*", (_req, reply) => reply.send());

  registerStateRoutes(app, store, bgg);
  registerCabinetRoutes(app, store);
  registerShelfRoutes(app, store);
  registerBoxRoutes(app, store);
  registerSolveRoutes(app, store);
  registerPlacementRoutes(app, store);
  registerLayoutRoutes(app, store);
  registerBggRoutes(app, store, bgg, jobs);
  registerFixtureRoutes(app, store);

  // Static SPA bundle, if built. Try a few candidate locations:
  //   - dist/web/         (Vite output, when running via `node dist/server/server/index.js`)
  //   - ../../web/        (alt: when compiled server lives at dist/server/server/)
  //   - ../web/           (alt: simpler layout)
  const candidates = [
    join(process.cwd(), "dist", "web"),
    join(__dirname, "..", "..", "web"),
    join(__dirname, "..", "web"),
  ];
  const webDist = candidates.find((p) => existsSync(join(p, "index.html")));
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      reply.type("text/html").sendFile("index.html");
    });
    app.log.info(`Serving SPA from ${webDist}`);
  } else {
    app.log.info("No SPA bundle found; running API only.");
  }

  await app.listen({ port, host: "127.0.0.1" });
  app.log.info(`Shelf Organizer listening on http://127.0.0.1:${port}`);
  app.log.info(`Data dir: ${dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
