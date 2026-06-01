# Fixtures

Predefined `AppState` scenarios for testing the system.

Each file wraps an `AppState` with metadata:

```json
{
  "meta": {
    "name": "<unique-name>",
    "title": "<display title>",
    "description": "<what this fixture is for>",
    "tags": ["..."]
  },
  "state": { ...AppState }
}
```

## Loading

- **Via UI**: Settings → "Load fixture" → pick a fixture → click Load. The current state is overwritten.
- **Via API**: `POST /api/fixtures/<name>/load` returns the new state.
- **Via file**: copy `fixtures/<name>.json`'s `.state` block into `~/.shelf-organizer/data.json` and restart the server.

## Available fixtures

| Name | Purpose |
|---|---|
| `empty` | No cabinets/shelves/boxes. Build-from-scratch starting point. |
| `small-library` | 1 cabinet, 3 shelves, 8 standalone boxes. Sanity-checks the solver on a small input. |
| `with-expansions` | 2 cabinets, multiple base-game + expansion chains. Exercises proximity scoring. |
| `tight-fit` | Boxes total to ~95% of total shelf width. Stresses packing. |
| `edge-cases` | Missing dims, over-large box, exact-fit, horizontal-only shelf, stack-height limit. Validates error paths. |
| `horizontal-stacks` | 1 horizontal shelf, 10 flat square boxes. Demonstrates base+knapsack stacking and pyramid containment. |

## Adding a fixture

1. Author a new `<name>.json` in this directory using the structure above.
2. Use stable string IDs (e.g. `cab-1`, `shelf-2`, `box-wingspan`) — UUIDs are not required, just unique within the fixture.
3. The fixture is picked up automatically — `GET /api/fixtures` rescans the directory on each call.

## Override location

Set `SHELF_ORGANIZER_FIXTURES_DIR` to point at a different directory if you want to keep custom fixtures outside the repo.
