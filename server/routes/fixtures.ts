// Predefined-state fixtures. Read from disk on every request so authors can
// add or edit fixtures without restarting the server. The directory defaults
// to <project-root>/fixtures and can be overridden with SHELF_ORGANIZER_FIXTURES_DIR.

import { FastifyInstance } from "fastify";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store/persistence.js";
import { applyMigrations } from "../store/migrations.js";
import { AppState } from "../types.js";

interface FixtureMeta {
  name: string;
  title: string;
  description: string;
  tags?: string[];
}

interface FixtureFile {
  meta: FixtureMeta;
  state: AppState;
}

interface FixtureSummary extends FixtureMeta {
  stats: {
    cabinets: number;
    shelves: number;
    boxes: number;
    layouts: number;
  };
}

function resolveFixturesDir(): string | null {
  if (process.env.SHELF_ORGANIZER_FIXTURES_DIR) {
    return process.env.SHELF_ORGANIZER_FIXTURES_DIR;
  }
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "fixtures"),
    join(__dirname, "..", "..", "..", "fixtures"),
    join(__dirname, "..", "..", "fixtures"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function loadFixtureFile(dir: string, name: string): Promise<FixtureFile> {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
    throw new Error(`invalid fixture name: ${name}`);
  }
  const path = join(dir, `${name}.json`);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as FixtureFile;
  if (!parsed?.meta?.name || !parsed?.state) {
    throw new Error(`malformed fixture: ${name}`);
  }
  return parsed;
}

export function registerFixtureRoutes(app: FastifyInstance, store: Store) {
  app.get("/api/fixtures", async (_req, reply) => {
    const dir = resolveFixturesDir();
    if (!dir) return [];
    const entries = await readdir(dir);
    const out: FixtureSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const fix = await loadFixtureFile(dir, entry.replace(/\.json$/, ""));
        out.push({
          ...fix.meta,
          stats: {
            cabinets: fix.state.cabinets?.length ?? 0,
            shelves: fix.state.shelves?.length ?? 0,
            boxes: fix.state.boxes?.length ?? 0,
            layouts: fix.state.layouts?.length ?? 0,
          },
        });
      } catch (err) {
        app.log.warn({ err, entry }, "skipping malformed fixture");
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return reply.send(out);
  });

  app.post("/api/fixtures/:name/load", async (req, reply) => {
    const dir = resolveFixturesDir();
    if (!dir) return reply.code(404).send({ error: "no fixtures directory available" });
    const { name } = req.params as { name: string };
    let fixture: FixtureFile;
    try {
      fixture = await loadFixtureFile(dir, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(404).send({ error: msg });
    }
    const migrated = applyMigrations(fixture.state);
    store.replace(migrated);
    await store.flush();
    return reply.send(store.get());
  });
}
