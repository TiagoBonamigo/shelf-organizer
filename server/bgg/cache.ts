// Persistent BGG response cache keyed by URL. Stored in bgg-cache.json next to
// data.json. Cache entries never expire automatically; user controls invalidation.

import { mkdir, readFile, rename, writeFile, open } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface CacheEntry {
  fetchedAt: string;
  body: string;
}

export interface CacheFile {
  [url: string]: CacheEntry;
}

export class BggCache {
  private cache: CacheFile = {};
  private path: string;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, "bgg-cache.json");
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      const raw = await readFile(this.path, "utf8");
      try {
        this.cache = JSON.parse(raw);
      } catch {
        this.cache = {};
      }
    }
  }

  get(url: string): CacheEntry | undefined {
    return this.cache[url];
  }

  set(url: string, body: string): void {
    this.cache[url] = { fetchedAt: new Date().toISOString(), body };
    this.scheduleWrite();
  }

  delete(url: string): void {
    delete this.cache[url];
    this.scheduleWrite();
  }

  clear(): void {
    this.cache = {};
    this.scheduleWrite();
  }

  private scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, 250);
  }

  async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.cache);
    const tmp = this.path + ".tmp";
    const fh = await open(tmp, "w");
    try {
      await fh.writeFile(snapshot, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, this.path);
  }
}
