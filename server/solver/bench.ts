// Microbenchmark for solve(). Two scenarios — small and big — driven by a
// seeded PRNG so dimensions are stable across runs. Reports per-scenario
// p50/p95/mean wall-clock and unplaced counts.
//
// Run: npx tsx server/solver/bench.ts
//      npx tsx server/solver/bench.ts small
//      npx tsx server/solver/bench.ts big
//
// Numbers are wall-clock from performance.now(). Each scenario warms 5
// iterations before timing. The PRNG is deterministic, so re-running this
// benchmark on the same machine gives stable readings.

import { performance } from "node:perf_hooks";
import {
  AppState,
  Box,
  Cabinet,
  DEFAULT_SETTINGS,
  Shelf,
} from "../types.js";
import { solve } from "./index.js";

// Deterministic mulberry32 — same as the solver uses internally.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScenarioSpec {
  name: string;
  cabinets: number;
  shelvesPerCabinet: number;
  boxes: number;
  // Distribution of shelf orientations.
  verticalShare: number;
  horizontalShare: number;
  // remainder → mixed
}

function buildScenario(spec: ScenarioSpec, seed: number): AppState {
  const rng = mulberry32(seed);
  const cabinets: Cabinet[] = [];
  const shelves: Shelf[] = [];
  const boxes: Box[] = [];

  // Cabinets + shelves.
  for (let c = 0; c < spec.cabinets; c++) {
    const cabId = `cab-${c}`;
    const shelfIds: string[] = [];
    for (let s = 0; s < spec.shelvesPerCabinet; s++) {
      const id = `shelf-${c}-${s}`;
      const roll = rng();
      const orientation: Shelf["orientation"] =
        roll < spec.verticalShare ? "vertical"
        : roll < spec.verticalShare + spec.horizontalShare ? "horizontal"
        : "mixed";
      // 800-1200 mm wide; 250-400 mm tall; 280-340 mm deep.
      const widthMm = 800 + Math.floor(rng() * 401);
      const heightMm = 250 + Math.floor(rng() * 151);
      const depthMm = 280 + Math.floor(rng() * 61);
      shelves.push({
        id,
        cabinetId: cabId,
        position: s,
        widthMm,
        heightMm,
        depthMm,
        orientation,
        paddingReserveMm: 0,
        maxStackCount: null,
        maxStackHeightMm: null,
      });
      shelfIds.push(id);
    }
    cabinets.push({ id: cabId, name: `Cab ${c}`, position: c, shelfIds });
  }

  // Boxes — three rough size buckets so packing actually has variety:
  // small (≤ 200 mm largest dim), medium (200-300), large (300-400).
  for (let i = 0; i < spec.boxes; i++) {
    const bucket = rng();
    let w: number, h: number, d: number;
    if (bucket < 0.4) {
      // small
      w = 80 + Math.floor(rng() * 121);
      h = 80 + Math.floor(rng() * 121);
      d = 30 + Math.floor(rng() * 71);
    } else if (bucket < 0.8) {
      // medium
      w = 180 + Math.floor(rng() * 121);
      h = 180 + Math.floor(rng() * 121);
      d = 50 + Math.floor(rng() * 81);
    } else {
      // large
      w = 280 + Math.floor(rng() * 121);
      h = 280 + Math.floor(rng() * 121);
      d = 70 + Math.floor(rng() * 81);
    }
    boxes.push({
      id: `box-${i}`,
      bggId: null,
      name: `Box ${i}`,
      dimensions: { w, h, d },
      dimensionsFromBgg: null,
      dimensionsSource: "manual",
      preferredForwardFace: "auto",
      expansionOfBoxId: null,
      bggLastFetchedAt: null,
    });
  }

  return {
    cabinets,
    shelves,
    boxes,
    layouts: [],
    activeLayoutId: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

const SCENARIOS: Record<string, ScenarioSpec> = {
  small: {
    name: "small (2 cab × 2 shelves = 4, 15 boxes)",
    cabinets: 2,
    shelvesPerCabinet: 2,
    boxes: 15,
    verticalShare: 0.5,
    horizontalShare: 0.4,
  },
  big: {
    name: "big (6 cab × 5 shelves = 30, 150 boxes)",
    cabinets: 6,
    shelvesPerCabinet: 5,
    boxes: 150,
    verticalShare: 0.5,
    horizontalShare: 0.4,
  },
  xlarge: {
    name: "xlarge (10 cab × 8 shelves = 80, 600 boxes)",
    cabinets: 10,
    shelvesPerCabinet: 8,
    boxes: 600,
    verticalShare: 0.5,
    horizontalShare: 0.4,
  },
};

function timeIt(state: AppState, iters: number): {
  samples: number[];
  unplaced: number;
} {
  const samples: number[] = [];
  let lastUnplaced = -1;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    const layout = solve(state, { preservePins: false });
    const t1 = performance.now();
    samples.push(t1 - t0);
    lastUnplaced = layout.unplaced.length;
  }
  return { samples, unplaced: lastUnplaced };
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { p50: p(0.5), p95: p(0.95), min: sorted[0], max: sorted[sorted.length - 1], mean };
}

function fmt(ms: number) {
  return ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`;
}

async function main() {
  const requested = process.argv[2];
  const names = requested ? [requested] : ["small", "big"];
  const warmupIters = 5;
  const timedIters = 50;

  for (const name of names) {
    const spec = SCENARIOS[name];
    if (!spec) {
      console.error(`unknown scenario: ${name}`);
      process.exitCode = 1;
      continue;
    }
    const state = buildScenario(spec, /* seed */ 0xC0FFEE);
    console.log(`\n=== ${spec.name} ===`);
    console.log(`shelves: ${state.shelves.length}, boxes: ${state.boxes.length}`);

    // Warm-up (JIT, cache).
    timeIt(state, warmupIters);
    const { samples, unplaced } = timeIt(state, timedIters);
    const s = stats(samples);
    console.log(
      `iters=${timedIters}  p50=${fmt(s.p50)}  p95=${fmt(s.p95)}  mean=${fmt(s.mean)}  min=${fmt(s.min)}  max=${fmt(s.max)}`,
    );
    console.log(`unplaced: ${unplaced}/${state.boxes.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
