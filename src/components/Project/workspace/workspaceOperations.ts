import { getPathDistanceMeters } from "../../../utils/mapMeasure";
import type { DailyProgressEntry, DailyProgressTeam, SavedMapAsset } from "../../map/types";

export type WorkStatus =
  | "planned"
  | "assigned"
  | "in-progress"
  | "complete"
  | "blocked";

export type CloseoutSummary = {
  assetCount: number;
  closeoutReady: number;
  missingPhotos: number;
  missingGps: number;
  missingStatus: number;
  blockers: number;
};

export type ProductionSummary = {
  ductMeters: number;
  cableMeters: number;
  subDuctMeters: number;
  completedDuctMeters: number;
  completedCableMeters: number;
  dpInstalls: number;
  chamberWorks: number;
  splicePoints: number;
  blockedAssets: number;
  assignedAssets: number;
  inProgressAssets: number;
  completedAssets: number;
};

export type WorkspaceOperationsSummary = {
  production: ProductionSummary;
  closeout: CloseoutSummary;
};

export type DailyProgressTotals = {
  civilsMeters: number;
  cablingMeters: number;
  spliceCount: number;
  entries: DailyProgressEntry[];
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function norm(value: unknown): string {
  return text(value).toLowerCase();
}

export function getAssetWorkStatus(asset: SavedMapAsset): WorkStatus {
  const item = asset as any;
  const raw = norm(
    item.workStatus ||
      item.buildStatus ||
      item.status ||
      item.dpDetails?.buildStatus ||
      item.properties?.workStatus ||
      item.properties?.buildStatus ||
      item.properties?.status,
  );

  if (raw.includes("block") || raw.includes("unserviceable") || raw.includes("issue")) {
    return "blocked";
  }
  if (raw.includes("complete") || raw.includes("built") || raw.includes("live")) {
    return "complete";
  }
  if (raw.includes("progress") || raw.includes("wip") || raw.includes("bwip")) {
    return "in-progress";
  }
  if (raw.includes("assign")) {
    return "assigned";
  }
  return "planned";
}

export function getAssetDisplayName(asset: SavedMapAsset): string {
  const item = asset as any;
  return text(item.name || item.label || item.cableName || item.cableId || item.assetId || item.id || "Unnamed asset");
}

export function getAssetTypeLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  const raw = norm([item.assetType, item.type, item.jointType, item.cableType, item.name].join(" "));
  if (item.assetType === "duct" || raw.includes("duct")) return "Duct";
  if (item.assetType === "cable" || raw.includes("cable") || asset.geometry?.type === "LineString") return "Cable";
  if (item.assetType === "distribution-point" || raw.includes("distribution") || raw.includes("dp") || raw.includes("sb")) return "DP";
  if (item.assetType === "chamber" || raw.includes("chamber")) return "Chamber";
  if (item.assetType === "pole" || raw.includes("pole")) return "Pole";
  if (item.assetType === "street-cab" || raw.includes("cab")) return "Street cab";
  if (raw.includes("joint")) return "Joint";
  return "Asset";
}

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyProgressEntries(asset: SavedMapAsset, date = getTodayIsoDate()): DailyProgressEntry[] {
  const item = asset as any;
  const entries = Array.isArray(item.dailyProgress)
    ? (item.dailyProgress as DailyProgressEntry[])
    : Array.isArray(item.properties?.dailyProgress)
      ? (item.properties.dailyProgress as DailyProgressEntry[])
      : [];
  return entries.filter((entry) => entry?.date === date);
}

export function getDailyProgressTotals(asset: SavedMapAsset, date = getTodayIsoDate()): DailyProgressTotals {
  const entries = getDailyProgressEntries(asset, date);
  return {
    entries,
    civilsMeters: entries
      .filter((entry) => entry.team === "civils")
      .reduce((sum, entry) => sum + Number(entry.meters || 0), 0),
    cablingMeters: entries
      .filter((entry) => entry.team === "cabling")
      .reduce((sum, entry) => sum + Number(entry.meters || 0), 0),
    spliceCount: entries
      .filter((entry) => entry.team === "splicing")
      .reduce((sum, entry) => sum + Number(entry.spliceCount || 0), 0),
  };
}

export function getDailyProgressTeamColour(team: DailyProgressTeam) {
  if (team === "civils") return "#f59e0b";
  if (team === "cabling") return "#06b6d4";
  return "#ec4899";
}

function isCloseoutAsset(asset: SavedMapAsset): boolean {
  if (asset.assetType === "home" || asset.assetType === "area") return false;
  return ["Duct", "Cable", "DP", "Chamber", "Pole", "Street cab", "Joint"].includes(getAssetTypeLabel(asset));
}

function hasGps(asset: SavedMapAsset): boolean {
  const item = asset as any;
  if (typeof item.lat === "number" && typeof item.lng === "number") return true;
  if (asset.geometry?.type === "Point") return true;
  return Boolean(item.fieldEvidence?.gps || item.closeout?.gps || item.gpsCapturedAt);
}

function getPhotos(asset: SavedMapAsset): string[] {
  const item = asset as any;
  return [
    ...(Array.isArray(item.photos) ? item.photos : []),
    ...(Array.isArray(item.fieldPhotos) ? item.fieldPhotos : []),
    ...(Array.isArray(item.closeoutPhotos) ? item.closeoutPhotos : []),
    ...(Array.isArray(item.poleDetails?.photos) ? item.poleDetails.photos : []),
    ...(Array.isArray(item.chamberDetails?.photos) ? item.chamberDetails.photos : []),
  ].filter(Boolean);
}

function getLineLengthMeters(asset: SavedMapAsset): number {
  if (asset.geometry?.type !== "LineString") return 0;
  return getPathDistanceMeters(asset.geometry.coordinates.map(([lat, lng]) => ({ lat, lng })));
}

function isDuct(asset: SavedMapAsset): boolean {
  const raw = norm([(asset as any).assetType, (asset as any).type, asset.name].join(" "));
  return asset.assetType === "duct" || raw.includes("duct");
}

function isCable(asset: SavedMapAsset): boolean {
  const raw = norm([(asset as any).assetType, (asset as any).type, (asset as any).cableType, asset.name].join(" "));
  return asset.assetType === "cable" || raw.includes("cable") || raw.includes("ulw") || raw.includes("fulw") || raw.includes("feeder");
}

function countSubDucts(asset: SavedMapAsset): number {
  const item = asset as any;
  const schedule = item.subDuctsByDuctNumber;
  if (!schedule || typeof schedule !== "object") return 0;
  return Object.values(schedule).reduce((total, entries: any) => {
    if (!Array.isArray(entries)) return total;
    return total + entries.reduce((sum, entry) => sum + Number(entry?.quantity || 0), 0);
  }, 0);
}

export function buildWorkspaceOperationsSummary(assets: SavedMapAsset[]): WorkspaceOperationsSummary {
  const closeoutAssets = (assets || []).filter(isCloseoutAsset);
  const production: ProductionSummary = {
    ductMeters: 0,
    cableMeters: 0,
    subDuctMeters: 0,
    completedDuctMeters: 0,
    completedCableMeters: 0,
    dpInstalls: 0,
    chamberWorks: 0,
    splicePoints: 0,
    blockedAssets: 0,
    assignedAssets: 0,
    inProgressAssets: 0,
    completedAssets: 0,
  };

  const closeout: CloseoutSummary = {
    assetCount: closeoutAssets.length,
    closeoutReady: 0,
    missingPhotos: 0,
    missingGps: 0,
    missingStatus: 0,
    blockers: 0,
  };

  closeoutAssets.forEach((asset) => {
    const status = getAssetWorkStatus(asset);
    const length = getLineLengthMeters(asset);
    const type = getAssetTypeLabel(asset);
    const photos = getPhotos(asset);
    const gps = hasGps(asset);

    if (status === "blocked") production.blockedAssets += 1;
    if (status === "assigned") production.assignedAssets += 1;
    if (status === "in-progress") production.inProgressAssets += 1;
    if (status === "complete") production.completedAssets += 1;

    if (isDuct(asset)) {
      production.ductMeters += length;
      production.subDuctMeters += length * countSubDucts(asset);
      if (status === "complete") production.completedDuctMeters += length;
    } else if (isCable(asset)) {
      production.cableMeters += length;
      if (status === "complete") production.completedCableMeters += length;
    }

    if (type === "DP") production.dpInstalls += 1;
    if (type === "Chamber") production.chamberWorks += 1;
    if (type === "Joint") production.splicePoints += 1;

    if (!photos.length) closeout.missingPhotos += 1;
    if (!gps) closeout.missingGps += 1;
    if (status === "planned") closeout.missingStatus += 1;
    if (status === "blocked") closeout.blockers += 1;
    if (photos.length && gps && status === "complete") closeout.closeoutReady += 1;
  });

  return { production, closeout };
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadTextFile(fileName: string, body: string, mime = "text/csv") {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadProductionCsv(projectName: string, assets: SavedMapAsset[]) {
  const rows = [
    ["Asset", "Type", "Status", "Length m", "Sub-duct count", "Duct path", "PIA NOI", "Notes"],
    ...(assets || []).filter(isCloseoutAsset).map((asset) => {
      const item = asset as any;
      return [
        getAssetDisplayName(asset),
        getAssetTypeLabel(asset),
        getAssetWorkStatus(asset),
        getLineLengthMeters(asset).toFixed(1),
        countSubDucts(asset),
        item.ductPathLabel || item.ductPath || "",
        item.piaNoiNumber || item.properties?.piaNoiNumber || "",
        item.notes || "",
      ];
    }),
  ];

  downloadTextFile(`${projectName || "workspace"}-production.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\n"));
}

export function downloadCloseoutCsv(projectName: string, assets: SavedMapAsset[]) {
  const rows = [
    ["Asset", "Type", "Status", "Photos", "GPS", "Closeout ready", "Blocked reason", "Last checked"],
    ...(assets || []).filter(isCloseoutAsset).map((asset) => {
      const item = asset as any;
      const status = getAssetWorkStatus(asset);
      const photoCount = getPhotos(asset).length;
      const gps = hasGps(asset);
      return [
        getAssetDisplayName(asset),
        getAssetTypeLabel(asset),
        status,
        photoCount,
        gps ? "Yes" : "No",
        status === "complete" && photoCount > 0 && gps ? "Yes" : "No",
        item.blockedReason || item.serviceNote || "",
        item.lastFieldCheckedAt || item.closeout?.checkedAt || "",
      ];
    }),
  ];

  downloadTextFile(`${projectName || "workspace"}-closeout.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\n"));
}
