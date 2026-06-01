import { describe, expect, it } from "vitest";
import { AppState, DEFAULT_SETTINGS } from "../types.js";
import { applyMigrations } from "./migrations.js";

describe("applyMigrations", () => {
  it("fills in defaults when collections are missing", () => {
    const partial = {} as AppState;
    const migrated = applyMigrations(partial);
    expect(migrated.cabinets).toEqual([]);
    expect(migrated.shelves).toEqual([]);
    expect(migrated.boxes).toEqual([]);
    expect(migrated.layouts).toEqual([]);
    expect(migrated.activeLayoutId).toBeNull();
  });

  it("merges partial settings with DEFAULT_SETTINGS", () => {
    const input = {
      cabinets: [],
      shelves: [],
      boxes: [],
      layouts: [],
      activeLayoutId: null,
      settings: { bggUsername: "alice" },
    } as unknown as AppState;
    const migrated = applyMigrations(input);
    expect(migrated.settings.bggUsername).toBe("alice");
    expect(migrated.settings.bggRateLimitMs).toBe(DEFAULT_SETTINGS.bggRateLimitMs);
  });

  it("brings schemaVersion up to the current value", () => {
    const input = {
      cabinets: [],
      shelves: [],
      boxes: [],
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS, schemaVersion: 0 },
    } as AppState;
    const migrated = applyMigrations(input);
    expect(migrated.settings.schemaVersion).toBe(4);
  });

  it("leaves up-to-date state unchanged", () => {
    const input: AppState = {
      cabinets: [{ id: "c1", name: "A", position: 0, shelfIds: [] }],
      shelves: [],
      boxes: [],
      layouts: [],
      activeLayoutId: null,
      settings: { ...DEFAULT_SETTINGS, schemaVersion: 3 },
    };
    const migrated = applyMigrations(input);
    expect(migrated.cabinets).toHaveLength(1);
    expect(migrated.cabinets[0]).toEqual({ id: "c1", name: "A", position: 0, shelfIds: [] });
    expect(migrated.settings.schemaVersion).toBe(4);
  });

  it("v2: flags a layout whose child stack violates W/D containment", () => {
    // Parent stacked: w=100 h=100 d=100 → stacked dims 100×100×100 (faceArea 10000).
    // Child stacked: w=120 h=20 d=80 → stacked dims 120×20×80 (faceArea 9600).
    // Under face-area rule: parent 10000 ≥ child 9600 → legal.
    // Under W/D rule: child width 120 > parent width 100 → illegal → stale=true.
    const input: AppState = {
      cabinets: [],
      shelves: [],
      boxes: [
        { id: "parent", bggId: null, name: "P", dimensions: { w: 100, h: 100, d: 100 }, dimensionsFromBgg: null, dimensionsSource: "manual", preferredForwardFace: "auto", expansionOfBoxId: null, bggLastFetchedAt: null },
        { id: "child", bggId: null, name: "C", dimensions: { w: 120, h: 20, d: 80 }, dimensionsFromBgg: null, dimensionsSource: "manual", preferredForwardFace: "auto", expansionOfBoxId: null, bggLastFetchedAt: null },
      ],
      layouts: [{
        id: "l1",
        name: "Saved",
        createdAt: "2026-01-01T00:00:00Z",
        placements: [
          { boxId: "parent", shelfId: "s1", positionMm: 0, orientation: "stacked", forwardFace: "wh", widthMm: 100, heightMm: 100, stackYMm: 0, stackParentBoxId: null, pinned: false },
          { boxId: "child", shelfId: "s1", positionMm: 0, orientation: "stacked", forwardFace: "wh", widthMm: 120, heightMm: 20, stackYMm: 100, stackParentBoxId: "parent", pinned: false },
        ],
        unplaced: [],
        metrics: { largestGapMm: 0, largestGapShelfId: null, placedCount: 2, unplacedCount: 0 },
      }],
      activeLayoutId: "l1",
      settings: { ...DEFAULT_SETTINGS, schemaVersion: 1 },
    };
    const migrated = applyMigrations(input);
    expect(migrated.layouts[0].stale).toBe(true);
    expect(migrated.settings.schemaVersion).toBe(4);
  });

  it("v2: leaves a containment-compliant layout unflagged", () => {
    const input: AppState = {
      cabinets: [],
      shelves: [],
      boxes: [
        { id: "parent", bggId: null, name: "P", dimensions: { w: 200, h: 50, d: 200 }, dimensionsFromBgg: null, dimensionsSource: "manual", preferredForwardFace: "auto", expansionOfBoxId: null, bggLastFetchedAt: null },
        { id: "child", bggId: null, name: "C", dimensions: { w: 100, h: 30, d: 100 }, dimensionsFromBgg: null, dimensionsSource: "manual", preferredForwardFace: "auto", expansionOfBoxId: null, bggLastFetchedAt: null },
      ],
      layouts: [{
        id: "l1",
        name: "Saved",
        createdAt: "2026-01-01T00:00:00Z",
        placements: [
          { boxId: "parent", shelfId: "s1", positionMm: 0, orientation: "stacked", forwardFace: "wh", widthMm: 200, heightMm: 50, stackYMm: 0, stackParentBoxId: null, pinned: false },
          { boxId: "child", shelfId: "s1", positionMm: 0, orientation: "stacked", forwardFace: "wh", widthMm: 100, heightMm: 30, stackYMm: 50, stackParentBoxId: "parent", pinned: false },
        ],
        unplaced: [],
        metrics: { largestGapMm: 0, largestGapShelfId: null, placedCount: 2, unplacedCount: 0 },
      }],
      activeLayoutId: "l1",
      settings: { ...DEFAULT_SETTINGS, schemaVersion: 1 },
    };
    const migrated = applyMigrations(input);
    expect(migrated.layouts[0].stale).toBeUndefined();
  });

  it("v3: strips defaultProximityWeight from settings and proximityScore from layout metrics", () => {
    const input = {
      cabinets: [],
      shelves: [],
      boxes: [],
      layouts: [{
        id: "l1",
        name: "Saved",
        createdAt: "2026-01-01T00:00:00Z",
        placements: [],
        unplaced: [],
        metrics: { largestGapMm: 0, largestGapShelfId: null, proximityScore: 7, placedCount: 0, unplacedCount: 0 },
      }],
      activeLayoutId: "l1",
      settings: { ...DEFAULT_SETTINGS, defaultProximityWeight: 0.3, schemaVersion: 2 },
    } as unknown as AppState;
    const migrated = applyMigrations(input);
    expect((migrated.settings as { defaultProximityWeight?: number }).defaultProximityWeight).toBeUndefined();
    expect((migrated.layouts[0].metrics as { proximityScore?: number }).proximityScore).toBeUndefined();
    expect(migrated.settings.schemaVersion).toBe(4);
  });
});
