// In-memory job tracker for long-running BGG operations (collection import).

import { BggJob, UUID } from "../types.js";
import { uuid } from "../store/persistence.js";

export class JobTracker {
  private jobs = new Map<UUID, BggJob>();

  create(type: BggJob["type"]): BggJob {
    const job: BggJob = {
      id: uuid(),
      type,
      status: "pending",
      total: null,
      fetched: 0,
      message: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: UUID): BggJob | undefined {
    return this.jobs.get(id);
  }

  update(id: UUID, patch: Partial<BggJob>): BggJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch);
    if (patch.status === "completed" || patch.status === "failed") {
      job.finishedAt = new Date().toISOString();
    }
    return job;
  }
}
