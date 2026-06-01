# Shelf Organizer — User Stories

This document captures the user-facing functionality of the shelf organizer as a set of user stories grouped by epic. Each story follows the form *As a [user], I want [capability] so that [benefit]*, with acceptance criteria where the wording alone leaves ambiguity. The single user role throughout is the board game owner running the app on their own machine, so the role is left implicit.

## Epic 1 — Cabinet and shelf configuration

**US-SH-1. Create a cabinet.** I want to create a named cabinet so that I can group shelves into the real shelving units I own.
*Acceptance:* I can enter a name and the cabinet appears in the cabinet list with that name.

**US-SH-2. Add a shelf with explicit dimensions.** I want to add a shelf to a cabinet by specifying width, height and depth in millimetres so that the solver knows the available space.

**US-SH-3. Bulk-add identical shelves.** I want to add several shelves of the same dimensions to a cabinet in one action so that I do not repeat entry for a uniform unit (e.g. a five-shelf bookcase).
*Acceptance:* I can specify dimensions once and a quantity, and the system creates that many shelves at the end of the cabinet.

**US-SH-4. Edit a shelf.** I want to edit a shelf's dimensions, orientation mode, padding reserve and stack limit overrides so that I can adjust the model as my real setup changes.

**US-SH-5. Delete a shelf or cabinet.** I want to delete shelves and cabinets so that I can remove furniture I no longer use. Deletion is confirmed and is non-recoverable.

**US-SH-6. Paste shelves from CSV.** I want to paste a CSV block of shelf dimensions so that I can populate the system quickly when I already have measurements in a spreadsheet.

**US-SH-7. Order cabinets.** I want to set the left-to-right order of my cabinets so that the visualization matches my physical room layout and "neighbouring shelf" is well-defined for the solver.

**US-SH-8. Choose orientation mode per shelf.** I want each shelf to be vertical (spine-out), horizontal (stacked flat) or mixed (both on the same shelf) so that I can match the storage style I actually use for each space.

**US-SH-9. Set per-shelf padding reserve.** I want to specify a minimum unused width per shelf so that boxes are not packed too tightly and the shelf has visible breathing room.

**US-SH-10. Override stack limits per shelf.** I want to override the global stack-count and stack-height limits for an individual shelf so that I can permit taller stacks on a deep, stable shelf or restrict them on an exposed one.

## Epic 2 — Game inventory

**US-GA-1. Import a BGG collection.** I want to enter my BGG username and have my owned games imported automatically so that I do not type each title by hand.

**US-GA-2. Search BGG for a single game.** I want to search BGG by name and add a single game to my library so that I can capture acquisitions one at a time.

**US-GA-3. Use BGG-provided dimensions.** I want box dimensions to be pulled from BGG when available so that most games are usable in the solver without manual measurement.

**US-GA-4. Fill in missing dimensions.** I want to enter dimensions manually for games where BGG has none, with a clearly-labelled "needs attention" list driving the work so that I know exactly which games are blocking the solver.

**US-GA-5. Override BGG dimensions.** I want to override BGG-provided dimensions when my real box is a different size (custom insert, sleeved cards, missing sleeve) so that the solver uses the size that matches reality. Overridden values are flagged in the library as such.

**US-GA-6. Set preferred forward face.** I want to set which face of a box should face outward when standing so that the solver does not arrange a box in a way I would never actually shelve it.

**US-GA-7. Auto-detect expansions from BGG.** I want the system to automatically capture expansion relationships from BGG so that the solver understands which games are expansions of which.

**US-GA-8. Declare an expansion relationship manually.** I want to declare "X is an expansion of Y" for fan-made expansions and any relationship BGG is missing so that the proximity logic still applies.

**US-GA-9. Remove a game.** I want to remove a game from my library so that the model reflects my actual collection.

**US-GA-10. See games that need attention.** I want a filtered view showing only games with missing or unverified dimensions so that I can complete data entry efficiently.

## Epic 3 — BGG synchronization

**US-BG-1. Polite request pacing.** I want BGG requests to be paced to respect the site's rate limits so that my app does not get throttled or blocked.

**US-BG-2. See import progress.** I want a visible progress indicator during a collection import so that I know the system is working and how far along it is.

**US-BG-3. Cache BGG responses on disk.** I want BGG responses cached locally so that re-imports, re-loads and restarts are fast and do not re-hit the network.

**US-BG-4. Force refresh from BGG.** I want to force-refresh an individual game from BGG so that I can pick up corrections to wrong dimensions without clearing the entire cache.

**US-BG-5. Clear the BGG cache.** I want a settings action to clear the entire BGG cache so that I can start a clean re-sync if something is wrong.

## Epic 4 — Optimization

**US-OP-1. Run the solver.** I want to press a single button that runs the solver and produces a proposed layout so that I can see the result of my configuration.

**US-OP-2. Maximize room to grow.** I want the proposed layout to maximize the largest contiguous empty region across my shelves so that I have visible space for new games.

**US-OP-3. Respect all constraints.** I want the solver to honour orientation mode, padding reserves, stack count and stack height limits, and the pyramid rule on every shelf.

**US-OP-4. Tune the proximity weight.** I want to adjust how much the solver should sacrifice empty space to keep base games and their expansions close so that I can trade off between the two priorities for my taste.

**US-OP-5. See what could not be placed.** I want any boxes the solver could not place to appear in an "unplaced" tray, each with a reason (no shelf fits, blocked by pinned boxes, etc.) so that I understand the gap and can act on it.

**US-OP-6. Compare the proposed and previous layouts.** I want to see which placements changed between the previous layout and the new proposal so that I can decide whether to accept it.

## Epic 5 — Visualization

**US-VZ-1. Front-elevation view of all cabinets.** I want a front-on view of every cabinet, rendered to scale and arranged in my configured order, so that the picture matches what I see in the room.

**US-VZ-2. Game names on every box.** I want each box drawn as a rectangle with the game's name inside so that I can read the layout directly without a legend.

**US-VZ-3. Standing vs stacked rendering.** I want standing boxes drawn as narrow vertical rectangles with the title oriented along the spine, and stacked boxes drawn as full-width rectangles in a stack, so that the rendering communicates orientation at a glance.

**US-VZ-4. Highlight empty regions.** I want unused regions of each shelf marked visually, with the single largest contiguous gap (the "room to grow") emphasized, so that I can immediately see where a new game could go.

**US-VZ-5. Hover and inspect.** I want to hover any box and see its dimensions, source (BGG/manual/override), expansion relationship, and pinned state so that I do not have to leave the layout view to investigate.

## Epic 6 — Manual overrides

**US-MO-1. Select a box.** I want to click a box to select it and see an action panel for that box so that I can act on a single placement without affecting others.

**US-MO-2. Rotate orientation of a box.** I want to rotate a selected box through its possible forward faces so that I can override the solver's choice for that box.

**US-MO-3. Drag and drop a box.** I want to drag a box to a different position, shelf, or stack and have the system validate the drop against all constraints in real time so that I know immediately whether the move is allowed.

**US-MO-4. Get a clear rejection reason.** I want a rejected drop to snap back with a tooltip explaining which constraint was violated (overlap, pyramid rule, stack limit, padding, etc.) so that I am never confused about why the system refused a move.

**US-MO-5. Auto-pin moved boxes.** I want any box I move manually to be automatically pinned so that subsequent solver runs honour my decision.

**US-MO-6. Unpin boxes.** I want to unpin a single box, all selected boxes, or every pinned box so that I can return control to the solver.

**US-MO-7. Re-solve around pins.** I want a "re-solve around pins" action that runs the solver while respecting my pinned placements so that I can combine manual decisions with automated optimization.

**US-MO-8. Place an unplaced box manually.** I want to drag a box from the unplaced tray onto a shelf so that I can find space for overflow that the solver could not place automatically.

**US-MO-9. Remove a placed box.** I want to remove a placed box from a shelf and send it to the unplaced tray without deleting it from my library so that I can experiment with leaving boxes out.

## Epic 7 — Layout persistence

**US-PE-1. Auto-save everything.** I want all configuration and the active layout saved automatically to a local file so that I never lose work to a crash or close.

**US-PE-2. Know where my data lives.** I want the settings screen to show me the on-disk paths of my data file and BGG cache so that I can back them up or move them as I wish.

**US-PE-3. Save named layouts.** I want to save the current arrangement under a name so that I can keep alternative arrangements for comparison.

**US-PE-4. Load a saved layout.** I want to load a saved layout into the active view so that I can switch between alternatives without losing them.

**US-PE-5. Delete a layout.** I want to delete saved layouts I no longer need.

**US-PE-6. Independent BGG cache.** I want the BGG cache stored in a separate file from my main data so that I can clear it without losing my library.
