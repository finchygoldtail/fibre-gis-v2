import type { SavedMapAsset } from "../../components/map/types";

export type JobPackRouteFibreCount = "96F" | "48F" | "36F" | "24F" | "12F";

export type JobPackDraftStatus = "draft" | "in_review" | "ready_to_issue" | "issued";

export type JobPackAssetGroup =
  | "boundary"
  | "route"
  | "distributionPoint"
  | "streetCab"
  | "joint"
  | "chamber"
  | "pole"
  | "home"
  | "other";

export interface JobPackDraftAsset {
  id: string;
  name: string;
  group: JobPackAssetGroup;
  assetType: string;
  status?: string;
  fibreCount?: string;
  installMethod?: string;
  cableType?: string;
  notes?: string;
  geometry: SavedMapAsset["geometry"];
  sourceAsset: SavedMapAsset;
}

export interface JobPackRouteDraft {
  id: string;
  title: string;
  fibreCount: JobPackRouteFibreCount;
  installMethod?: string;
  assets: JobPackDraftAsset[];
  notes: string;
  reviewStatus: "unchecked" | "checked" | "needs_work";
  mapImageDataUrl?: string;
  mapImageCapturedAt?: string;
}

export interface JobPackScheduleRow {
  id: string;
  asset: string;
  type: string;
  detail: string;
  status: string;
  reviewNote: string;
}

export interface JobPackRiskDraft {
  id: string;
  level: "info" | "warning" | "blocker";
  title: string;
  assetId?: string;
  assetName?: string;
  action: string;
}

export interface JobPackDraftSummary {
  totalAssets: number;
  boundaries: number;
  routes: number;
  distributionPoints: number;
  joints: number;
  chambers: number;
  poles: number;
  homes: number;
  risks: number;
  blockers: number;
}

export interface JobPackDraft {
  id: string;
  areaId: string;
  areaName: string;
  packNumber: string;
  revision: string;
  status: JobPackDraftStatus;
  generatedAt: string;
  source: "live_map";
  assets: JobPackDraftAsset[];
  routes: JobPackRouteDraft[];
  dpSchedule: JobPackScheduleRow[];
  homesSchedule: JobPackScheduleRow[];
  fasRows: JobPackScheduleRow[];
  buildNotes: string[];
  risks: JobPackRiskDraft[];
  summary: JobPackDraftSummary;
  overviewMapImageDataUrl?: string;
  overviewMapCapturedAt?: string;
}

export interface BuildJobPackDraftInput {
  areaId: string;
  areaName: string;
  revision?: string;
  assets: SavedMapAsset[];
}
