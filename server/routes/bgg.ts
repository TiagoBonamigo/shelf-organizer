import { FastifyInstance } from "fastify";
import { Store, uuid } from "../store/persistence.js";
import { BggClient } from "../bgg/client.js";
import { JobTracker } from "../bgg/jobs.js";
import { BggCache } from "../bgg/cache.js";
import { parseCollection, parseSearch, parseThing } from "../bgg/parser.js";
import { Box, BggJob } from "../types.js";

export function registerBggRoutes(
  app: FastifyInstance,
  store: Store,
  bgg: BggClient,
  jobs: JobTracker,
) {
  app.get("/api/bgg/status", async () => bgg.getStatus());

  app.post("/api/bgg/import-collection", async (req) => {
    const { username } = req.body as { username: string };
    const job = jobs.create("collection-import");
    void runCollectionImport(store, bgg, jobs, job, username);
    return { jobId: job.id };
  });

  app.get("/api/bgg/jobs/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return reply.code(404).send({ error: "not found" });
    return job;
  });

  app.get("/api/bgg/search", async (req) => {
    const q = (req.query as { q?: string }).q ?? "";
    if (!q) return [];
    const url = `https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=${encodeURIComponent(q)}`;
    try {
      const xml = await bgg.fetch(url);
      return parseSearch(xml).slice(0, 12);
    } catch {
      return [];
    }
  });

  app.post("/api/bgg/refresh/:boxId", async (req, reply) => {
    const { boxId } = req.params as { boxId: string };
    const box = store.get().boxes.find((b) => b.id === boxId);
    if (!box) return reply.code(404).send({ error: "box not found" });
    if (!box.bggId) return reply.code(400).send({ error: "box not linked to BGG" });
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${box.bggId}&stats=1`;
    try {
      const xml = await bgg.fetch(url, { noCache: true });
      const items = parseThing(xml);
      const item = items[0];
      if (!item) return reply.code(502).send({ error: "no item returned" });
      store.update((s) => {
        const b = s.boxes.find((x) => x.id === boxId);
        if (!b) return;
        b.name = item.name || b.name;
        if (item.dimensionsMm) {
          b.dimensionsFromBgg = item.dimensionsMm;
          if (b.dimensionsSource === "bgg") b.dimensions = { ...item.dimensionsMm };
        }
        b.bggLastFetchedAt = new Date().toISOString();
      });
      return store.get().boxes.find((b) => b.id === boxId);
    } catch (e) {
      return reply.code(502).send({ error: String(e) });
    }
  });

  app.post("/api/bgg/cache/clear", async () => {
    const cache = (bgg as unknown as { cache: BggCache }).cache;
    cache.clear();
    return { ok: true };
  });
}

async function runCollectionImport(
  store: Store,
  bgg: BggClient,
  jobs: JobTracker,
  job: BggJob,
  username: string,
) {
  try {
    jobs.update(job.id, { status: "running", message: "Requesting collection…" });
    const collectionUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
    const xml = await bgg.fetchCollection(collectionUrl);
    const entries = parseCollection(xml);
    jobs.update(job.id, { total: entries.length, message: `Fetching ${entries.length} items…` });

    // Batch 20 at a time.
    const out: Array<{ bggId: number; name: string; dimsMm: { w: number; h: number; d: number } | null; expansionOfBggIds: number[] }> = [];
    for (let i = 0; i < entries.length; i += 20) {
      const batch = entries.slice(i, i + 20);
      const ids = batch.map((e) => e.bggId).join(",");
      const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`;
      const tXml = await bgg.fetch(thingUrl);
      const items = parseThing(tXml);
      for (const it of items) {
        out.push({
          bggId: it.bggId,
          name: it.name,
          dimsMm: it.dimensionsMm,
          expansionOfBggIds: it.expansionOfBggIds,
        });
      }
      jobs.update(job.id, { fetched: Math.min(i + batch.length, entries.length) });
    }

    // Merge into store: create boxes that don't exist by bggId; update existing.
    store.update((s) => {
      const byBggId = new Map<number, Box>();
      for (const b of s.boxes) if (b.bggId) byBggId.set(b.bggId, b);
      const newBoxes: Box[] = [];
      for (const it of out) {
        const existing = byBggId.get(it.bggId);
        if (existing) {
          existing.name = it.name || existing.name;
          if (it.dimsMm) {
            existing.dimensionsFromBgg = it.dimsMm;
            if (existing.dimensionsSource === "bgg") existing.dimensions = { ...it.dimsMm };
          }
          existing.bggLastFetchedAt = new Date().toISOString();
          continue;
        }
        const b: Box = {
          id: uuid(),
          bggId: it.bggId,
          name: it.name,
          dimensions: it.dimsMm ?? { w: 0, h: 0, d: 0 },
          dimensionsFromBgg: it.dimsMm,
          dimensionsSource: it.dimsMm ? "bgg" : "manual",
          preferredForwardFace: "auto",
          expansionOfBoxId: null,
          bggLastFetchedAt: new Date().toISOString(),
        };
        s.boxes.push(b);
        byBggId.set(it.bggId, b);
        newBoxes.push(b);
      }
      // Second pass: resolve expansion-of links via bggId → local box id.
      for (const it of out) {
        const b = byBggId.get(it.bggId);
        if (!b) continue;
        for (const parentBggId of it.expansionOfBggIds) {
          const parent = byBggId.get(parentBggId);
          if (parent) {
            b.expansionOfBoxId = parent.id;
            break;
          }
        }
      }
    });

    jobs.update(job.id, { status: "completed", message: `Imported ${out.length} games.` });
  } catch (e) {
    jobs.update(job.id, { status: "failed", message: String(e) });
  }
}
