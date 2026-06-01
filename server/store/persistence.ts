import { mkdir, readFile, rename, writeFile, open } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import lockfile from "proper-lockfile";
import { AppState, EMPTY_STATE } from "../types.js";
import { applyMigrations } from "./migrations.js";

export interface StoreConfig {
  dataDir: string;
  debounceMs: number;
}

export function resolveDataDir(): string {
  return process.env.SHELF_ORGANIZER_DATA_DIR || join(homedir(), ".shelf-organizer");
}

export class Store {
  private state: AppState = structuredClone(EMPTY_STATE);
  private dataPath: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> | null = null;
  private dirty = false;

  constructor(private config: StoreConfig) {
    this.dataPath = join(config.dataDir, "data.json");
  }

  async init(): Promise<void> {
    await mkdir(this.config.dataDir, { recursive: true });
    if (existsSync(this.dataPath)) {
      const raw = await readFile(this.dataPath, "utf8");
      if (raw.trim().length === 0) {
        this.state = structuredClone(EMPTY_STATE);
      } else {
        const parsed = JSON.parse(raw) as AppState;
        this.state = applyMigrations(parsed);
      }
    } else {
      this.state = structuredClone(EMPTY_STATE);
      await this.writeNow();
    }
  }

  get(): AppState {
    return this.state;
  }

  // Apply a mutation atomically in memory; schedule a debounced disk write.
  update(mutator: (s: AppState) => void): AppState {
    mutator(this.state);
    this.scheduleWrite();
    return this.state;
  }

  // Replace whole state (used by import, migrations, etc.).
  replace(s: AppState): AppState {
    this.state = s;
    this.scheduleWrite();
    return this.state;
  }

  private scheduleWrite() {
    this.dirty = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, this.config.debounceMs);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    if (this.writing) return this.writing;
    this.writing = this.writeNow().finally(() => {
      this.writing = null;
    });
    return this.writing;
  }

  private async writeNow(): Promise<void> {
    this.dirty = false;
    const snapshot = JSON.stringify(this.state, null, 2);
    const tmpPath = this.dataPath + ".tmp";
    let release: (() => Promise<void>) | null = null;
    if (existsSync(this.dataPath)) {
      release = await lockfile.lock(this.dataPath, { retries: { retries: 5, minTimeout: 50 } });
    }
    try {
      const fh = await open(tmpPath, "w");
      try {
        await fh.writeFile(snapshot, "utf8");
        await fh.sync();
      } finally {
        await fh.close();
      }
      await rename(tmpPath, this.dataPath);
    } finally {
      if (release) await release();
    }
  }
}

export function uuid(): string {
  // Node 20 has crypto.randomUUID
  return globalThis.crypto.randomUUID();
}
