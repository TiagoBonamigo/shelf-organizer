// Rate-limited BGG client. Single token-bucket queue serializes all outbound
// requests; on 429, doubles the delay for 30s. Status (depth, backoff) is
// readable for the UI's status pill.

import { request } from "undici";
import { BggCache } from "./cache.js";

export type BggStatusKind = "idle" | "syncing" | "rate-limited" | "error";

export interface BggClientStatus {
  state: BggStatusKind;
  queueDepth: number;
  backoffUntil: string | null;
  lastError: string | null;
}

interface Settings {
  bggRateLimitMs: number;
}

export class BggClient {
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private lastSentAt = 0;
  private backoffUntil = 0;
  private lastError: string | null = null;
  private status: BggStatusKind = "idle";

  constructor(private cache: BggCache, private settings: Settings) {}

  setSettings(s: Settings) {
    this.settings = s;
  }

  getStatus(): BggClientStatus {
    return {
      state: this.status,
      queueDepth: this.queue.length,
      backoffUntil: this.backoffUntil > Date.now() ? new Date(this.backoffUntil).toISOString() : null,
      lastError: this.lastError,
    };
  }

  /**
   * Fetch a URL through the cache + rate-limit queue.
   * If `noCache` is true, ignores the cache and refreshes the entry on success.
   */
  async fetch(url: string, opts: { noCache?: boolean } = {}): Promise<string> {
    if (!opts.noCache) {
      const cached = this.cache.get(url);
      if (cached) return cached.body;
    }
    return await this.enqueue(url);
  }

  private enqueue(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const body = await this.doFetch(url);
          resolve(body);
        } catch (e) {
          reject(e);
        }
      });
      this.kick();
    });
  }

  private async kick() {
    if (this.running) return;
    this.running = true;
    this.status = "syncing";
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const wait = Math.max(
        this.settings.bggRateLimitMs - (Date.now() - this.lastSentAt),
        this.backoffUntil - Date.now(),
        0,
      );
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        await job();
      } catch (e) {
        // already reported via the promise
      }
    }
    this.running = false;
    if (this.lastError) this.status = "error";
    else this.status = "idle";
  }

  private async doFetch(url: string): Promise<string> {
    this.lastSentAt = Date.now();
    const res = await request(url, { method: "GET" });
    const text = await res.body.text();
    if (res.statusCode === 200) {
      this.cache.set(url, text);
      this.lastError = null;
      this.status = "syncing";
      return text;
    }
    if (res.statusCode === 202) {
      // BGG queued the request; caller handles retry.
      return "__BGG_QUEUED__";
    }
    if (res.statusCode === 429) {
      const newBackoff = Date.now() + 30_000;
      this.backoffUntil = newBackoff;
      this.status = "rate-limited";
      this.lastError = "BGG rate limited";
      throw new Error(`BGG 429 — backing off for 30s`);
    }
    this.lastError = `HTTP ${res.statusCode}`;
    throw new Error(`BGG ${res.statusCode} for ${url}: ${text.slice(0, 200)}`);
  }

  /** Poll a collection URL until it returns a real body or gives up. */
  async fetchCollection(url: string, attempts = 12, delayMs = 5000): Promise<string> {
    for (let i = 0; i < attempts; i++) {
      const body = await this.fetch(url, { noCache: i > 0 });
      if (body !== "__BGG_QUEUED__") return body;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error("BGG kept queueing the request beyond the retry budget.");
  }
}
