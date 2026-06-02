# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A local-first single-user app for organizing a board game collection on physical shelves. A Node/Fastify process serves a React SPA and a REST API; a heuristic solver packs boxes onto shelves; the BoardGameGeek XML API 2 is queried for dimensions. There is no database, no auth, no remote hosting — all state lives in a JSON file on disk.

The design documents in the repo root are authoritative and should be consulted when in doubt:
- `01-user-stories.md` — user-facing goals
- `02-ux-design.md` — UI/UX behavior
- `03-implementation-spec.md` — full technical spec (data model, solver, API surface, persistence)

## Commands

```
npm run dev        # concurrently: tsx watch on server (port 3000) + vite on web (port 5173, proxies /api → 3000)
npm run dev:server # server only
npm run dev:web    # web only
npm run build      # tsc -p server/tsconfig.json && vite build  (outputs to dist/server and dist/web)
npm start          # node dist/server/index.js  (serves SPA + API from port 3000)
npm run typecheck  # tsc --noEmit on both server and web projects
npm test           # vitest run (single shot)
```

Vitest picks up `server/**/*.test.ts` and `web/src/**/*.test.{ts,tsx}` (see `vitest.config.ts`). To run a single test file: `npx vitest run server/solver/scoring.test.ts`. There is no lint script.

## Environment variables

- `PORT` (default `3000`) — server port.
- `SHELF_ORGANIZER_DATA_DIR` (default `~/.shelf-organizer`) — where `data.json` and `bgg-cache.json` live. The in-repo `data/` dir is for dev only and is gitignored.
- `SHELF_ORGANIZER_FIXTURES_DIR` — override location for the JSON fixtures otherwise read from `fixtures/`.
- `LOG_LEVEL` — Fastify log level (default `info`).

## Architecture

### Server (`server/`)

`server/index.ts` boots Fastify, constructs the singletons (`Store`, `BggCache`, `BggClient`, `JobTracker`), registers routes, and — if `dist/web/index.html` (or one of two fallback paths) exists — serves the SPA bundle with SPA-fallback for non-`/api/*` 404s.

- `server/types.ts` — the canonical data model (`AppState`, `Cabinet`, `Shelf`, `Box`, `Placement`, `Layout`, `Settings`, etc.). **The web client imports these same types** via the `include: ["../server/types.ts"]` line in `web/tsconfig.json`, re-exported by `web/src/lib/shared-types.ts`. Keep the model centralized here; do not duplicate types in the web layer.
- `server/store/persistence.ts` — `Store` holds `AppState` in memory, exposes `update(mutator)`/`replace(state)`, and debounces writes by 200ms. Writes are atomic: lock with proper-lockfile → write `data.json.tmp` → fsync → rename. On startup, `applyMigrations` runs against the loaded JSON keyed by `settings.schemaVersion`.
- `server/store/seed.ts` — default seed state injected when the data file is empty.
- `server/routes/*.ts` — one file per resource (`state`, `cabinets`, `shelves`, `boxes`, `bgg`, `solve`, `layouts`, `placements`, `fixtures`). Mutating routes call `store.update(...)` so persistence is automatic.
- `server/solver/` — the packing solver (see below).
- `server/bgg/` — rate-limited client (`client.ts`), XML→object parser (`parser.ts`), on-disk response cache (`cache.ts`), and in-memory job tracker for long-running collection imports (`jobs.ts`). BGG's collection endpoint returns 202 on first call; the client polls up to 12 times at 5s intervals before giving up.

### Solver (`server/solver/`)

Four phases (`index.ts` orchestrates):

1. **Assignment** — sort placeable boxes by face area descending, score each candidate shelf by `-remaining_width` (concentrate fill), assign to best shelf or push to the unplaced list.
2. **Per-shelf packing** (`pack.ts`) — branches on `shelf.orientation`: vertical (standing, FFD by depth), horizontal (pyramid stacks, parent must have strictly larger two-largest-dim area than child), or mixed (tries split points, picks the best). Pinned placements are anchored.
3. **Local search** — simulated annealing (geometric cooling from T0=500). Each iteration tries a random swap or move via `tryLocalMove`, runs it through the validator, accepts on positive delta or with `exp(Δ/T)` probability. Keeps the best layout seen. Uses a seeded PRNG (mulberry32) so the same input always produces the same layout.
4. **Shelf-emptying migration** — greedy deterministic pass: tries to drain the least-occupied shelves by moving their stacks onto other shelves (floor slot or stack-on-stack). Only commits when the source shelf ends up fully empty.

Score is `-largestGapMm - 1e9 * unplacedCount` (higher is better; minimise gap and unplaced).

`server/solver/geometry.ts` owns the box-to-shelf-axes mapping (resolves `forwardFace` × `orientation` → `(widthMm, heightMm)` on the shelf). All consumers — solver, validator, rendering — must go through it; do **not** re-derive dimension math elsewhere.

`server/solver/validate.ts` is the single chokepoint for placement legality (bounds, orientation mode, overlap, pyramid rule, stack count/height limits, padding reserve). Drag-drop `PATCH /api/placements` and every solver output go through it.

### Web (`web/src/`)

- `state/store.ts` — Zustand store. `AppState` fields are mirrored at the top level alongside view state (`view`, `selectedBoxId`, tweaks, toasts, etc.). All API calls go via `api/client.ts`; mutations update the store locally with the response so there's no global re-fetch.
- `views/{Layout,Cabinets,Library,Settings}View.tsx` — the four top-level views switched by `App.tsx` based on `store.view`.
- `components/canvas.ts` — SVG geometry helpers for rendering. Placements arrive from the server pre-resolved (with `widthMm`/`heightMm` already projected), so the client never repeats the orientation math.

### Fixtures

`fixtures/*.json` hold canned `AppState` snapshots wrapped with a `{ meta, state }` envelope. `POST /api/fixtures/<name>/load` overwrites the current state with a fixture; the Settings view exposes this. The fixtures directory is rescanned on each list call, so adding a file is enough.

## Things that bite

- **Shared types live in `server/types.ts`.** The web project includes that file directly via `tsconfig`. Adding a field to `AppState` means updating the seed, migrations (bump `schemaVersion` if breaking), and likely the Zustand store's initial state in `web/src/state/store.ts`. Current schema version: **4**.
- **All mutations go through `Store.update` or `Store.replace`** so the debounced write fires. Mutating `store.get()` in place without calling `update` will skip persistence.
- **Dimensions are integer millimetres** throughout. BGG returns inches; ingest multiplies by 25.4 and rounds. Don't reintroduce floats in the data model.
- **CORS** is open only to `localhost`/`127.0.0.1` origins (see the `onSend` hook in `server/index.ts`). Don't broaden it.
- **The compiled server's entrypoint path** (`dist/server/index.js` vs `dist/server/server/index.js`) depends on tsc's `rootDir` choice — `server/index.ts` tries multiple candidate locations for the static SPA bundle to handle both layouts.
- **BGG API requires authentication.** Since late 2025, all requests to `boardgamegeek.com/xmlapi2/*` return 401 without a bearer token. The token is stored in `settings.bggBearerToken` and passed as `Authorization: Bearer <token>` by `BggClient`. Users register at `boardgamegeek.com/using_the_xml_api` to get a token, then paste it in Settings → BoardGameGeek sync.
