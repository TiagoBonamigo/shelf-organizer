// Shared data model — also imported by the web client via tsconfig include.

export type UUID = string;

export interface Cabinet {
  id: UUID;
  name: string;
  position: number;
  shelfIds: UUID[];
}

export type Orientation = "vertical" | "horizontal" | "mixed";

export interface Shelf {
  id: UUID;
  cabinetId: UUID;
  position: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  orientation: Orientation;
  paddingReserveMm: number;
  maxStackCount: number | null;
  maxStackHeightMm: number | null;
}

export type DimensionsSource = "bgg" | "manual" | "override";
export type ForwardFace = "wh" | "wd" | "hd";
export type ForwardFacePref = ForwardFace | "auto";

export interface Dimensions {
  w: number;
  h: number;
  d: number;
}

export interface Box {
  id: UUID;
  bggId: number | null;
  name: string;
  dimensions: Dimensions;
  dimensionsFromBgg: Dimensions | null;
  dimensionsSource: DimensionsSource;
  preferredForwardFace: ForwardFacePref;
  expansionOfBoxId: UUID | null;
  bggLastFetchedAt: string | null;
  notes?: string;
}

export type PlacementOrientation = "standing" | "stacked";

export interface Placement {
  boxId: UUID;
  shelfId: UUID;
  positionMm: number;
  orientation: PlacementOrientation;
  forwardFace: ForwardFace;
  widthMm: number;
  heightMm: number;
  stackYMm?: number;
  stackParentBoxId: UUID | null;
  pinned: boolean;
  changed?: boolean;
}

export interface LayoutMetrics {
  largestGapMm: number;
  largestGapShelfId: UUID | null;
  placedCount: number;
  unplacedCount: number;
}

export interface UnplacedEntry {
  boxId: UUID;
  reason: string;
}

export interface Layout {
  id: UUID;
  name: string;
  createdAt: string;
  placements: Placement[];
  unplaced: UnplacedEntry[];
  metrics: LayoutMetrics;
  /** Set by migration when stacked placements violate the current pyramid rule. */
  stale?: boolean;
}

export interface Settings {
  defaultPaddingReserveMm: number;
  defaultMaxStackCount: number | null;
  defaultMaxStackHeightMm: number | null;
  bggUsername: string | null;
  bggBearerToken: string | null;
  bggRateLimitMs: number;
  schemaVersion: number;
}

export interface AppState {
  cabinets: Cabinet[];
  shelves: Shelf[];
  boxes: Box[];
  layouts: Layout[];
  activeLayoutId: UUID | null;
  settings: Settings;
}

export type BggJobStatus = "pending" | "running" | "completed" | "failed";

export interface BggJob {
  id: UUID;
  type: "collection-import";
  status: BggJobStatus;
  total: number | null;
  fetched: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface BggSearchResult {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface PlacementApplyResult {
  layout: Layout;
  rejected: Array<{ placement: Placement; error: ValidationError }>;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultPaddingReserveMm: 0,
  defaultMaxStackCount: 4,
  defaultMaxStackHeightMm: null,
  bggUsername: null,
  bggBearerToken: null,
  bggRateLimitMs: 2000,
  schemaVersion: 4,
};

export const EMPTY_STATE: AppState = {
  cabinets: [],
  shelves: [],
  boxes: [],
  layouts: [],
  activeLayoutId: null,
  settings: { ...DEFAULT_SETTINGS },
};
