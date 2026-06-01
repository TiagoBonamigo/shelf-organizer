# Shelf Organizer — UI/UX Design Specification

This document describes the visible structure and interaction patterns of the app. It is intentionally implementation-agnostic — concrete tech choices live in the implementation spec. Where conventions are stated as defaults, all of them are configurable in Settings unless noted.

## Information architecture

The app is a single-page interface with four primary views, reachable from a persistent left sidebar:

1. **Layout** (default landing view) — the workspace where the solver runs and the visualization lives.
2. **Cabinets** — configuration of cabinets and their shelves.
3. **Library** — the game inventory.
4. **Settings** — defaults, BGG sync, file locations.

The sidebar shows a status pill for the BGG sync state (idle, syncing, rate-limited, error) and the count of games needing attention. A small "saved HH:MM" indicator at the bottom confirms the auto-save heartbeat.

## Cabinets view

A two-pane layout. The left pane lists cabinets in their left-to-right order, with drag handles to reorder them and an "Add cabinet" button at the bottom. Selecting a cabinet populates the right pane.

The right pane has a header showing the cabinet name (editable inline) and a table editor of its shelves. Columns:

- Position (top to bottom, derived from row order; drag to reorder)
- Width (mm)
- Height (mm)
- Depth (mm)
- Orientation (segmented control: vertical / horizontal / mixed)
- Padding reserve (mm)
- Stack count limit (number or "default")
- Stack height limit (mm or "default")

Below the table sit three actions: **Add row**, **Duplicate row × N** (prompts for the number of copies of the currently selected row), and **Paste CSV** (opens a modal with a paste target; columns must match the table). A schematic on the far right shows the cabinet as a vertical stack of labelled shelf rectangles, scaled proportionally, for sanity checking. The schematic updates live as the table is edited.

Validation is inline: a row with any non-positive dimension shows a red border and a tooltip explaining the issue; rows with errors do not contribute to the schematic and the solver ignores them.

## Library view

A single primary list of games with a top toolbar.

The toolbar carries: a free-text search box that filters the list by name; an **Import from BGG** button that opens a modal where the user enters their BGG username and watches progress; an **Add game** button that opens a BGG search modal; and a row of filter chips — *All*, *Missing dimensions*, *Has expansions*, *Pinned*, *Unplaced*.

The list shows columns: name, dimensions (W × H × D in mm), source (BGG / manual / override, shown as a small coloured tag), expansion-of (linked game name if any), status icons (warning triangle for missing dimensions, lock for pinned, tray icon for unplaced).

Selecting a game opens a right-hand detail panel without leaving the page. The panel shows:

- Editable name
- Editable dimensions, with a small toggle to flip between "use BGG value" and "override". Overridden values are shown alongside the BGG values for reference.
- Preferred forward face selector: a small visual showing the three possible faces, the currently chosen one highlighted, with a "let solver choose" option.
- Expansion-of field: a searchable dropdown of other library games. Multi-select is not supported here — a game is an expansion of at most one base game (which matches BGG's structure).
- BGG link, BGG ID, last-fetched timestamp, "Refresh from BGG" button.
- Delete button (with confirmation).

## Layout view

The primary workspace. The top of the view is a horizontal toolbar:

- **Solve** — runs a fresh solve, replacing the active layout. Available only when there are no pinned boxes; otherwise greyed out with a tooltip pointing the user at the next action.
- **Re-solve around pins** — runs the solver while honouring all pinned placements. Available whenever at least one box is pinned.
- **Proximity weight** — a slider with a numeric readout from 0 (ignore expansion grouping) to 1 (maximize grouping at the cost of empty space). Default 0.3. Changes are not applied until the next solve.
- **Layout name** — shows the active layout name as editable text; an adjacent button menu offers **Save as…**, **Save** (overwrites the loaded layout), **Load**, **Compare with previous**, and **Delete this layout**.
- **Reset all pins** — secondary action, removes every pin without re-solving.

The main canvas occupies the rest of the screen. Cabinets are rendered side-by-side in their configured order, separated by a small gap. Each cabinet renders as a labelled column containing its shelves top-to-bottom, all shelves and boxes drawn at a single, shared mm-to-pixel scale so widths and heights are visually comparable across cabinets. If the total width does not fit the viewport, the canvas pans horizontally.

A right-hand sidebar contains two stacked panels:

- **Unplaced tray** — a list of boxes the solver could not place, each with a one-line "why" (e.g. "no shelf has enough width"; "blocked by pins"). Boxes are draggable from the tray onto the canvas.
- **Action panel** — visible only when a box is selected. Shows the game name (large), dimensions, source tag, current orientation, current forward face, pinned state, and the buttons **Rotate forward face** (cycles the three faces, validating each move), **Pin / Unpin**, **Remove from shelf** (sends to unplaced tray), and **Open in BGG**.

A bottom status bar shows three metrics:

- **Largest gap** — millimetres and the cabinet+shelf it is on.
- **Proximity score** — a low-is-good number with a sparkline trend across recent solves.
- **Placed / total** — e.g. "184 / 187".

### Shelf and box rendering

A **shelf** is drawn as a rectangle with a 1-px subtle border. Its interior is the placement area. The interior background is a very pale grid so empty regions read as empty without competing visually with the box rectangles.

A **standing box** (spine-out) is drawn as a narrow vertical rectangle whose width matches the box's smallest dimension (or whichever dimension the box's forward-face choice puts along the shelf) and whose height equals the box's tallest dimension. The game name renders rotated 90° counter-clockwise along the spine, truncated with ellipsis if the box is too short to fit the text; full name appears on hover.

A **stacked box** is drawn as a full-width horizontal rectangle whose width equals the largest face's width and whose height equals the smallest dimension (or as resolved by orientation). Stacks build from the shelf floor upward, each box visually sitting on its predecessor. The game name renders left-to-right inside, truncated with ellipsis as needed.

A **mixed-mode shelf** is partitioned visually with a faint vertical divider between the standing zone and the stacking zone(s); the divider is purely informational.

**Empty regions** are shaded with the same pale grid background already used by the shelf, with the largest contiguous gap on the system getting a slightly stronger highlight (a soft warm tint) and a small "room to grow" label. This label is the only thing that distinguishes the largest gap from any other empty area, so it must be unmistakable.

**Pinned boxes** display a small lock icon in their top-right corner. **Override-dimension boxes** show a small dot in the bottom-right. **Currently-selected** boxes get a thicker outline in the accent colour.

### Drag and drop

A drag starts on mousedown-and-move past a small threshold (5 px) anywhere on a box rectangle, or on any item in the unplaced tray. During a drag:

- A ghost copy of the box follows the cursor at 70% opacity.
- Every shelf computes valid drop locations live and renders insertion indicators: a thin vertical bar between adjacent standing boxes where a standing insertion would land, and a thin horizontal bar above a stack where a stacked insertion would land. The closest valid indicator highlights.
- Shelves that cannot accept the box (mode mismatch, dimensions, pyramid rule, stack limit, padding reserve all considered) tint pale red. The unplaced tray is always a valid drop target.
- On release over a valid indicator, the box snaps into place, becomes pinned, and the action panel updates.
- On release over an invalid target or empty canvas, the box snaps back to its prior position and a toast appears with the failure reason (e.g. "Stack limit reached: max 4 boxes per stack"). The toast is dismissible and auto-fades after 4 seconds.

Multi-select is out of scope for v1. Drag operates on a single box at a time.

### Solver feedback

When the user invokes Solve or Re-solve, a translucent overlay covers the canvas with a progress indicator showing the current phase (assigning to shelves, packing shelves, local search). Solves on a typical (200-game) library should complete in under two seconds; the overlay disappears automatically. If the solve takes longer than three seconds, a "still working…" message appears with a cancel button. Cancelling restores the previous layout.

When the solver returns, the canvas re-renders. If **Compare with previous** is active, boxes whose placement changed get a subtle pulse animation and stay tinted for a few seconds.

## Settings view

A single scrollable form. Sections:

- **Solver defaults.** Default padding reserve (mm), default max stack count (number or "no limit"), default max stack height (mm or "no limit"), default proximity weight (0–1 slider).
- **BGG sync.** BGG username (used by import), rate-limit pacing in ms between requests (default 2000), force-refresh-all and clear-cache buttons.
- **Data locations.** Read-only paths for the data file and BGG cache, each with a "Reveal in finder / file explorer" button.
- **About.** Version, build commit, link to the repo or local README.

## Status, errors and edge cases

**BGG status pill.** Idle, syncing (with current queue depth, e.g. "syncing 12 / 187"), rate-limited (with current backoff in seconds), error (with the most recent error message on hover). Clicking the pill expands a small dropdown with the recent request log for diagnostics.

**Game with no dimensions.** Greyed out in the library, excluded from solver, listed in the "Missing dimensions" filter. The Layout view shows a small banner at the top whenever any game is missing dimensions, with a count and a link to the filtered library.

**Game too big for any shelf.** Appears in the unplaced tray after a solve with reason "no shelf large enough". The library view shows the game with a warning icon and tooltip.

**Pyramid violation on drop.** Tooltip: "This box must sit below a box with a larger face area."

**Stack-limit violation on drop.** Tooltip: "Stack limit reached: max N boxes" or "Stack height limit reached: NN mm".

**Padding violation on drop.** Tooltip: "Adding this box would consume the shelf's padding reserve."

**Collision on drop.** Tooltip: "This area is already occupied."

**BGG 202 response.** Status pill says "BGG queued our request, polling…" with elapsed seconds. After repeated polling failures (more than 30 seconds), the import modal shows an option to retry later.

**BGG 429 response.** Status pill says "BGG rate-limited, backing off (Ns)". The pacing slider in Settings is highlighted as a hint that increasing it may help.

**Unsaved-changes prompt.** The app saves automatically, so a true unsaved-changes prompt is not needed; however, **Solve** without any pins replaces the active layout, so if the active layout has been edited but not saved as a named layout, the toolbar shows a small dot next to the layout name. **Solve** in that state prompts "Replace the current unsaved arrangement?" with the option to save first.

## Visual style notes

Type and colour choices are deferred to implementation, but a few rules belong here for clarity. The visualization must remain readable at typical screen sizes for collections of 200–500 games. Names must never be rendered smaller than the system's accessible body size; when a box is too small to fit even truncated text, the box renders without a label and relies on the hover tooltip. Selection, hover and pin states must be distinguishable by both colour and shape (icon, outline thickness) so the view remains usable for users who do not distinguish certain colours. Density beats decoration: the canvas is a working tool, not a presentation.
