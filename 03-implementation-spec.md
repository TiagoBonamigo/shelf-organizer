# Shelf Organizer — Implementation Specification

This document describes the technical architecture, data model, server surface, BGG integration, and solver design needed to build the application described in the user stories and UX spec. It is intended to be detailed enough that a single competent developer can build the first version without further design decisions.

## Architecture

The application is local-first. A single Node.js process runs on the user's machine, serves the React single-page application as static assets, exposes a REST API for the SPA to call, persists all data to a JSON file on disk, and proxies requests to the BoardGameGeek XML API 2 with rate limiting and caching. The user runs the process with `npm start` and visits `http://localhost:3000` in any modern browser. There is no external hosting, no authentication, and no database; the data file is a portable artifact the user can back up or move.

A future packaging as Tauri or Electron is possible without architectural changes — the same Node server runs inside the desktop wrapper. That is out of scope for v1.

## Tech stack

- **Runtime:** Node.js 20 or later.
- **Server framework:** Fastify (small, fast, good plugin ecosystem).
- **Frontend framework:** React 18 with TypeScript.
- **Bundler/dev server:** Vite.
- **Drag and drop:** dnd-kit.
- **Visualization:** plain SVG rendered via React components. No game engine required.
- **State management (frontend):** Zustand.
- **HTTP client (server-side, to BGG):** undici.
- **XML parsing:** fast-xml-parser.
- **File locking for atomic writes:** proper-lockfile.
- **Testing:** Vitest, both for solver logic and React components.
- **Linting/formatting:** ESLint + Prettier.

## Project structure

```
shelf-organizer/
├── package.json
├── tsconfig.json
├── server/
│   ├── index.ts                 # Fastify entrypoint, static file serving
│   ├── routes/
│   │   ├── state.ts
│   │   ├── cabinets.ts
│   │   ├── shelves.ts
│   │   ├── boxes.ts
│   │   ├── bgg.ts
│   │   ├── solve.ts
│   │   └── layouts.ts
│   ├── bgg/
│   │   ├── client.ts            # rate-limited BGG client
│   │   ├── parser.ts            # XML → typed objects
│   │   └── cache.ts             # persistent response cache
│   ├── solver/
│   │   ├── index.ts             # entry point and orchestration
│   │   ├── vertical.ts
│   │   ├── horizontal.ts
│   │   ├── mixed.ts
│   │   ├── scoring.ts
│   │   ├── validate.ts
│   │   └── geometry.ts          # shared dimension math
│   └── store/
│       ├── persistence.ts       # JSON read/write with locking
│       └── migrations.ts        # schema migrations
├── web/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/client.ts        # typed fetch wrapper
│   │   ├── state/store.ts       # Zustand store
│   │   ├── views/
│   │   │   ├── LayoutView.tsx
│   │   │   ├── CabinetsView.tsx
│   │   │   ├── LibraryView.tsx
│   │   │   └── SettingsView.tsx
│   │   └── components/
│   │       ├── Sidebar.tsx
│   │       ├── StatusPill.tsx
│   │       ├── CabinetRender.tsx
│   │       ├── ShelfRender.tsx
│   │       ├── BoxRect.tsx
│   │       ├── UnplacedTray.tsx
│   │       └── ActionPanel.tsx
│   └── tsconfig.json
└── data/                        # created at runtime, git-ignored
    ├── data.json
    └── bgg-cache.json
```

The default data directory is `~/.shelf-organizer/`; the in-repo `data/` exists only for development. The path is configurable via an environment variable `SHELF_ORGANIZER_DATA_DIR`.

## Data model

All identifiers are UUID v4 strings unless stated otherwise. All dimensions are stored in millimetres as integers; BGG values are in inches and are multiplied by 25.4 and rounded on ingest. All timestamps are ISO 8601 strings.

```ts
type UUID = string

interface Cabinet {
  id: UUID
  name: string
  position: number              // 0 = leftmost
  shelfIds: UUID[]              // ordered top to bottom
}

interface Shelf {
  id: UUID
  cabinetId: UUID
  position: number              // 0 = top
  widthMm: number
  heightMm: number
  depthMm: number
  orientation: 'vertical' | 'horizontal' | 'mixed'
  paddingReserveMm: number
  maxStackCount: number | null      // null = use settings default; numeric overrides; -1 = unlimited
  maxStackHeightMm: number | null   // same convention as above
}

interface Box {
  id: UUID
  bggId: number | null
  name: string
  dimensions: { w: number; h: number; d: number }   // mm
  dimensionsFromBgg: { w: number; h: number; d: number } | null
  dimensionsSource: 'bgg' | 'manual' | 'override'
  preferredForwardFace: 'wh' | 'wd' | 'hd' | 'auto'
  expansionOfBoxId: UUID | null
  bggLastFetchedAt: string | null
  notes?: string
}

interface Placement {
  boxId: UUID
  shelfId: UUID
  positionMm: number           // along shelf width, measured from left edge to the box's left edge
  orientation: 'standing' | 'stacked'
  forwardFace: 'wh' | 'wd' | 'hd'  // resolved at place time
  stackParentBoxId: UUID | null    // null for shelf-floor placements
  pinned: boolean
}

interface Layout {
  id: UUID
  name: string
  createdAt: string
  placements: Placement[]
  unplacedBoxIds: UUID[]
  metrics: {
    largestGapMm: number
    largestGapShelfId: UUID | null
    proximityScore: number
    placedCount: number
    unplacedCount: number
  }
}

interface Settings {
  defaultPaddingReserveMm: number          // default 0
  defaultMaxStackCount: number | null      // null = unlimited; default 4
  defaultMaxStackHeightMm: number | null   // null = unlimited; default null
  defaultProximityWeight: number           // 0..1; default 0.3
  bggUsername: string | null
  bggRateLimitMs: number                   // default 2000
  schemaVersion: number
}

interface AppState {
  cabinets: Cabinet[]
  shelves: Shelf[]
  boxes: Box[]
  layouts: Layout[]
  activeLayoutId: UUID | null
  settings: Settings
}
```

### Dimension resolution

When a box is placed, its three real-world dimensions `(w, h, d)` are mapped to placement-relative axes `(width along shelf, height above shelf floor, depth into shelf)` based on `forwardFace` and `orientation`:

- `forwardFace = 'wh'`: the W × H face faces outward. Standing: width-along-shelf = D, height-above-floor = max(W, H), depth-into-shelf = min(W, H). Stacked: similar projection with the depth axis swapped.
- `forwardFace = 'wd'`: the W × D face faces outward. Equivalent rotation.
- `forwardFace = 'hd'`: the H × D face faces outward. Equivalent rotation.
- `forwardFace = 'auto'`: the solver picks whichever orientation fits best; the resolved value is stored in `Placement.forwardFace`.

This mapping is implemented once in `server/solver/geometry.ts` and reused everywhere (rendering on the client receives placements pre-resolved by the solver, so the client never re-does this math).

## Persistence

A single JSON file holds the entire `AppState`. The path is `~/.shelf-organizer/data.json` by default. Writes are atomic via the write-temp-and-rename pattern:

1. Acquire an exclusive lock via `proper-lockfile` on the target path.
2. Serialize state to `data.json.tmp` in the same directory.
3. `fsync` the temp file.
4. Rename `data.json.tmp` → `data.json`.
5. Release the lock.

Writes are debounced 200 ms — a burst of mutations coalesces into a single write. On startup, the server reads the file; if it is absent or empty, the server writes a default skeleton (empty arrays plus default settings).

Schema migrations are keyed by `settings.schemaVersion`. The migration system applies each `migrations/vN_to_vN+1.ts` in order until the on-disk version matches the code's current expected version. v1 is the initial schema.

The BGG cache lives in a sibling file `bgg-cache.json` shaped as `{ [url: string]: { fetchedAt: string; response: unknown } }`. Cache entries do not expire automatically; the user controls invalidation via the settings UI ("clear cache") and per-game refresh.

## BGG client

The BGG XML API 2 has three behaviours the client must handle.

### Rate limiting

A token-bucket queue serializes all outbound requests. The bucket releases one request every `settings.bggRateLimitMs` (default 2000 ms). When BGG responds 429, the queue temporarily doubles its delay for the next 30 seconds, then returns to the configured rate. Concurrent callers wait on the queue; the queue surfaces its current depth and current backoff via a status endpoint consumed by the BGG status pill in the UI.

### Asynchronous collection endpoint

The collection endpoint at `/xmlapi2/collection?username=USERNAME&own=1` returns HTTP 202 the first time it is called for a large collection, with a body indicating the request has been queued. The client must poll the same URL until it returns 200. Implementation: if a 202 is received, wait 5 seconds and re-issue the same request (still through the rate-limit queue). Give up after 12 attempts (about 60 seconds in total) and surface an error.

### Batched thing lookups

The thing endpoint at `/xmlapi2/thing?id=...&stats=1` accepts up to 20 comma-separated IDs. Collection imports collect all IDs first, then fetch them in batches of 20. Each XML response contains one `<item>` per ID; the parser extracts:

- `<item id>` → `bggId`
- `<name type="primary" value="...">` → `name`
- `<width>`, `<height>`, `<depth>` (each carrying a `value` in inches) → dimensions converted to mm
- `<link type="boardgameexpansion" inbound="true" id="...">` → expansion-of base BGG ID; on import, after all boxes exist, a second pass resolves these to local box UUIDs and sets `expansionOfBoxId`.

When dimensions are zero or missing, the box is created with `dimensions: { w: 0, h: 0, d: 0 }` and `dimensionsSource: 'manual'`, and the library flags it as missing.

### Caching

Every successful GET is stored verbatim in `bgg-cache.json`. The client checks the cache before issuing a request. The cache is the source of truth for "last fetched" timestamps on boxes; a force-refresh action invalidates the entry for a single URL.

### Job tracking for imports

A collection import is a long-running job. The server tracks it in memory:

```ts
interface BggJob {
  id: UUID
  type: 'collection-import'
  status: 'pending' | 'running' | 'completed' | 'failed'
  total: number | null         // populated once collection list is fetched
  fetched: number              // number of `thing` items processed so far
  message: string | null       // recent informational or error text
  startedAt: string
  finishedAt: string | null
}
```

The client polls `GET /api/bgg/jobs/:jobId` every two seconds while a job is running.

## REST API

All endpoints return JSON. All mutating endpoints return the updated entity (or full state where simpler).

```
GET    /api/state                              → AppState
PATCH  /api/settings                           Body: Partial<Settings>           → Settings

POST   /api/cabinets                           Body: { name }                    → Cabinet
PATCH  /api/cabinets/:id                       Body: Partial<Cabinet>            → Cabinet
DELETE /api/cabinets/:id                                                          → { ok: true }
POST   /api/cabinets/reorder                   Body: { order: UUID[] }           → Cabinet[]

POST   /api/cabinets/:id/shelves               Body: Shelf[] (without ids)       → Shelf[]
PATCH  /api/shelves/:id                        Body: Partial<Shelf>              → Shelf
DELETE /api/shelves/:id                                                           → { ok: true }
POST   /api/cabinets/:id/shelves/reorder       Body: { order: UUID[] }           → Shelf[]

POST   /api/boxes                              Body: Box (without id)            → Box
PATCH  /api/boxes/:id                          Body: Partial<Box>                → Box
DELETE /api/boxes/:id                                                             → { ok: true }

POST   /api/bgg/import-collection              Body: { username }                → { jobId }
GET    /api/bgg/jobs/:jobId                                                      → BggJob
GET    /api/bgg/search?q=...                                                     → BggSearchResult[]
POST   /api/bgg/refresh/:boxId                                                   → Box

POST   /api/solve                              Body: { proximityWeight? }        → Layout
POST   /api/solve/around-pins                  Body: { proximityWeight? }        → Layout

PATCH  /api/placements                         Body: Placement[]                 → Layout
                                              (Used by drag-drop. Server validates each placement,
                                               applies the valid ones, returns the updated layout.
                                               Invalid placements are returned in a separate field
                                               with reasons.)

POST   /api/layouts                            Body: { name }                    → Layout
                                              (Saves the current active layout under the given name.)
GET    /api/layouts/:id                                                          → Layout
DELETE /api/layouts/:id                                                          → { ok: true }
POST   /api/layouts/:id/activate                                                 → Layout
```

CORS is permitted only from `http://localhost:*` and `http://127.0.0.1:*`. The server logs every request at info level and BGG client activity at debug level by default.

## Solver

The solver problem is multi-objective constrained packing. The objectives are:

1. **Primary:** maximize the single largest contiguous empty region across all shelves (the "room to grow").
2. **Secondary:** minimize the proximity penalty between base games and their expansions.
3. **Hard constraint:** every placement must satisfy orientation mode, padding reserve, stack limits, and the stacking face-area rule (a box may stack on another whose two-largest-dimensions area is at least as large).

The strategy is a three-phase heuristic rather than an exact ILP solve.

### Phase 1 — Assignment

Sort the unpinned boxes by their largest-two-dimensions area, descending (largest first). For each box, evaluate every shelf as a candidate:

- Reject shelves whose orientation mode does not allow this box (e.g. a fixed-vertical shelf where the box would need to be stacked).
- Reject shelves where, even with this box placed greedily, the remaining width would be less than the padding reserve.
- Reject shelves where the box, in its best-fitting orientation, exceeds the shelf height or depth.

Among candidate shelves, compute a delta score:

- `Δgap`: change in the largest contiguous empty region across all shelves if this box were placed greedily here. (Better to *concentrate* fill on shelves already partly used, so the largest empty shelf remains the largest.)
- `Δproximity`: change in the proximity penalty if this box were placed here, given pre-existing placements of its base or expansion siblings.

The chosen shelf maximizes `Δgap − w · Δproximity` where `w = settings.proximityWeight`. If no shelf is a candidate, the box goes to the unplaced overflow list.

### Phase 2 — Per-shelf packing

Once boxes are assigned, each shelf packs its boxes independently. The packing algorithm depends on the shelf's orientation:

**Vertical (spine-out).** Each box occupies its smallest dimension along the shelf width and its largest dimension as height (or as resolved by `preferredForwardFace`). Pinned boxes are anchored at their `positionMm`. Remaining boxes are sorted by height descending — so the tallest box claims the leftmost free slot — and placed using first-fit into the open intervals between pinned boxes and shelf edges. After the local-search phase, a finalization pass re-applies this height-descending ordering on every vertical shelf so the tallest game ends up at the beginning even when SA has shuffled boxes between shelves. The padding reserve is split evenly between adjacent gaps after packing, expanding inter-box gaps uniformly.

**Horizontal (stacked).** Boxes are grouped into stacks. A stack is a vertical chain of boxes from the shelf floor upward where each box's two-largest-dimensions area is less than or equal to its parent's — boxes with the same face size may stack on each other. Algorithm: sort boxes by their two-largest-dimensions area, descending; for each box, attempt to place it on top of an existing stack whose top satisfies the pyramid rule, fits within the stack's residual height budget and stack-count budget. If no existing stack accepts it, start a new stack. Stacks are then arranged side-by-side along the shelf width, ordered by descending base width. Pinned boxes anchor stacks at their `positionMm`; their stack chains are built from the pinned position outward. Padding reserve is split as horizontal slack between stacks.

**Mixed.** The shelf is partitioned into one standing zone and one stacking zone. The partition point is chosen by trying a small set of candidate splits (every 50 mm, or aligned to the spines of representative boxes) and running both sub-packers on each split. The split that maximizes the empty width in the more-empty zone wins; ties broken by which yields a more uniform fill across the shelf.

### Phase 3 — Local search

A small swap-and-move loop refines the result:

```
for iter in 0 .. SEARCH_ITERATIONS (default 200):
  pick a random pair of boxes (a, b) on different shelves
  if swapping (a, b) is feasible (all validators pass) and improves score: swap
  pick a random box c; pick a random alternative shelf s'
  if moving c to s' is feasible and improves score: move
keep best layout seen
```

The score function:

```
score(layout) = largestGapMm(layout)
              − proximityWeight × proximityPenalty(layout)
              − UNPLACED_PENALTY × unplaced_count(layout)

UNPLACED_PENALTY = 1e9     // unplaced boxes are essentially forbidden if any layout places them
```

Where:

```
proximityPenalty(layout) =
  sum over every (base, expansion) edge in the expansion graph:
    distance( placement_of(base), placement_of(expansion) )

distance(p1, p2) =
  if same shelf and the placements are adjacent in shelf order: 0
  else if same shelf:                                            1
  else if neighbouring shelf in same cabinet:                    2
  else if same cabinet:                                          3
  else:                                                          4

  // If either box is unplaced, treat distance as 5 (worse than any placed distance).
```

"Adjacent" for standing boxes means no other box sits between them along the shelf width. For stacked boxes, adjacent means same stack. Mixed-shelf adjacency follows whichever zone the boxes sit in.

### Pinning

Pinned placements are constraints on the solver. Phase 1 sees them as immovable occupants of their shelves' space budgets. Phase 2 anchors them at their `positionMm` and packs around them. Phase 3 never proposes a move that involves a pinned box.

A "solve from scratch" call (`POST /api/solve`) clears all pins first, regenerates the entire layout, and returns it. A "solve around pins" call (`POST /api/solve/around-pins`) preserves pins.

### Validation

Every drag-drop submission and every solver-produced placement passes through a validator at `server/solver/validate.ts`:

```
validate(placement, layout, shelf, box, settings):
  resolved = resolve_dimensions(box, placement.forwardFace, placement.orientation)

  // bounds
  if resolved.width > shelf.widthMm: fail('box too wide for shelf')
  if resolved.height > shelf.heightMm: fail('box too tall for shelf')
  if resolved.depth > shelf.depthMm: fail('box too deep for shelf')
  if placement.positionMm < 0: fail('negative position')
  if placement.positionMm + resolved.width > shelf.widthMm: fail('extends past shelf right edge')

  // orientation mode
  if shelf.orientation == 'vertical' and placement.orientation != 'standing':
    fail('shelf only accepts standing boxes')
  if shelf.orientation == 'horizontal' and placement.orientation != 'stacked':
    fail('shelf only accepts stacked boxes')

  // overlap
  for other in layout.placements where other.shelfId == shelf.id and other.boxId != box.id:
    if other shares the same orientation and the x-intervals overlap: fail('overlap with other box')

  // stacking face-area rule (stacked only)
  if placement.stackParentBoxId is not null:
    parent = boxes[parent_id]
    if area_of_two_largest(parent.dimensions) < area_of_two_largest(box.dimensions):
      fail('stacking rule: lower box must be at least as large by face area')

  // stack limits (stacked only)
  if placement.orientation == 'stacked':
    chain = walk stack from floor through this placement
    count_limit = shelf.maxStackCount ?? settings.defaultMaxStackCount
    if count_limit is not null and chain.length > count_limit: fail('stack count limit exceeded')
    height_limit = shelf.maxStackHeightMm ?? settings.defaultMaxStackHeightMm
    if height_limit is not null and sum(chain heights) > height_limit: fail('stack height limit exceeded')

  // padding reserve
  if shelf.orientation in {'vertical', 'mixed'}:
    total_used = sum of widths of all placements on this shelf + this placement
    if total_used > shelf.widthMm − shelf.paddingReserveMm:
      fail('would consume the padding reserve')

  return ok
```

Validation errors carry both a machine-readable code and a human-readable message; the client uses the code to localize and the message as a fallback.

## Build and run

Initial setup:

```
git clone <repo>
cd shelf-organizer
npm install
```

Development (hot reload on both server and client):

```
npm run dev
```

This runs Vite for the client at port 5173 with API proxying to the server at port 3000, and `tsx watch` on the server.

Production:

```
npm run build      # builds the React bundle into web/dist and compiles the server
npm start          # runs the compiled server, which serves the static bundle and the API on port 3000
```

The server respects two environment variables: `PORT` (default 3000) and `SHELF_ORGANIZER_DATA_DIR` (default `~/.shelf-organizer`). Both are read at startup.

## Out of scope for v1

The following are deliberately deferred to keep v1 shippable:

- Two-deep storage (front-and-back games on a single shelf).
- Multi-user data sharing or sync between machines.
- Authentication or per-user data partitioning.
- Mobile or tablet UI.
- Export of layouts to PDF, image, or print formats.
- Localized text (English only in v1).
- Multi-select drag operations.
- Undo/redo history beyond the implicit "load previous layout" comparison.

Each is independently addable on top of the v1 model without architectural changes.
