import { getDistanceMeters as distanceMeters } from "../../../utils/mapMeasure";
import type { SavedMapAsset } from "../../map/types";

// =====================================================
// FILE: duplicateHomeResolution.ts
// PURPOSE: Workspace-only duplicate / stacked home detection helpers.
//          No Firestore writes. No map storage changes. No chunk changes.
//          This module gives QA/Build screens a shared operational view of
//          duplicate homes so the huge map files do not keep growing.
// =====================================================

export type DuplicateHomeReason = "UPRN" | "ADDRESS" | "STACKED" | "HOME_ID";

export type DuplicateHomeCandidate = {
  asset: SavedMapAsset;
  id: string;
  label: string;
  uprn: string;
  address: string;
  connectedDpId: string;
  status: string;
  hasDrop: boolean;
  score: number;
  recommendation: "KEEP" | "REVIEW" | "REMOVE_CANDIDATE";
};

export type DuplicateHomeGroup = {
  id: string;
  reason: DuplicateHomeReason;
  key: string;
  canonical: DuplicateHomeCandidate;
  candidates: DuplicateHomeCandidate[];
  removeCandidates: DuplicateHomeCandidate[];
  center?: { lat: number; lng: number };
  warning: string;
};

export type DuplicateHomeSummary = {
  groups: DuplicateHomeGroup[];
  duplicateGroups: number;
  duplicateAssets: number;
  removalCandidates: number;
};

const STACK_DISTANCE_METERS = 1.75;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function norm(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function compact(value: unknown): string {
  return norm(value).replace(/[^a-z0-9]/g, "");
}

function readUprn(asset: any): string {
  return text(asset?.uprn || asset?.UPRN || asset?.properties?.UPRN || asset?.properties?.uprn);
}

function readAddress(asset: any): string {
  return text(asset?.address || asset?.fullAddress || asset?.properties?.address || asset?.label || asset?.name);
}

function readConnectedDpId(asset: any): string {
  return text(asset?.connectedDpId || asset?.properties?.connectedDpId || asset?.connectedDP || asset?.dpId);
}

function readStatus(asset: any): string {
  return text(asset?.customerStatus || asset?.homeStatus || asset?.status || asset?.buildStatus || asset?.serviceStatus || asset?.connectionStatus || asset?.properties?.status);
}

function getPoint(asset: any): { lat: number; lng: number } | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  if (asset?.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function isLineAsset(asset: any): boolean {
  const haystack = [asset?.assetType, asset?.type, asset?.cableType, asset?.name, asset?.label]
    .map(norm)
    .join(" ");
  return asset?.geometry?.type === "LineString" || haystack.includes("cable");
}

export function isWorkspaceHomeAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const point = getPoint(item);
  if (!point) return false;
  if (isLineAsset(item)) return false;

  const haystack = [item.assetType, item.type, item.homeType, item.name, item.label, item.category]
    .map(norm)
    .join(" ");

  const looksLikeInfrastructure =
    haystack.includes("joint") ||
    haystack.includes("pole") ||
    haystack.includes("chamber") ||
    haystack.includes("cabinet") ||
    haystack.includes("distribution") ||
    haystack.includes("cbt") ||
    haystack.includes("afn");

  if (looksLikeInfrastructure) return false;

  return Boolean(
    readUprn(item) ||
      item?.homeId ||
      item?.properties?.homeId ||
      haystack.includes("home") ||
      haystack.includes("premise") ||
      haystack.includes("property") ||
      haystack.includes("sdu") ||
      haystack.includes("flat"),
  );
}

function dropReferences(asset: any): string[] {
  return [
    asset?.homeId,
    asset?.connectedHomeId,
    asset?.toHomeId,
    asset?.fromHomeId,
    asset?.toAssetId,
    asset?.fromAssetId,
    asset?.uprn,
    asset?.UPRN,
  ]
    .map(compact)
    .filter(Boolean);
}

function homeReferenceKeys(asset: any): string[] {
  const raw = [
    asset?.id,
    asset?.assetId,
    asset?.homeId,
    asset?.uprn,
    asset?.UPRN,
    asset?.properties?.UPRN,
    asset?.properties?.uprn,
  ]
    .map(compact)
    .filter(Boolean);

  const expanded = new Set<string>();
  raw.forEach((key) => {
    expanded.add(key);
    expanded.add(key.replace(/^uprn/, ""));
    expanded.add(`uprn${key.replace(/^uprn/, "")}`);
  });
  return Array.from(expanded).filter(Boolean);
}

function isDropCable(asset: any): boolean {
  const haystack = [asset?.assetType, asset?.type, asset?.cableType, asset?.name, asset?.label, asset?.generatedBy]
    .map(norm)
    .join(" ");

  return (
    asset?.geometry?.type === "LineString" &&
    (haystack.includes("drop") ||
      asset?.isDropCable === true ||
      asset?.isHomeDrop === true ||
      asset?.generatedDrop === true ||
      asset?.autoGeneratedDrop === true ||
      Boolean(asset?.homeId || asset?.connectedHomeId || asset?.toHomeId || asset?.fromHomeId))
  );
}

function hasDropCable(home: SavedMapAsset, drops: SavedMapAsset[]): boolean {
  const keys = new Set(homeReferenceKeys(home as any));
  return drops.some((drop) => dropReferences(drop as any).some((key) => keys.has(key)));
}

function candidateScore(asset: SavedMapAsset, drops: SavedMapAsset[]): number {
  const item = asset as any;
  const status = norm(readStatus(item));
  let score = 0;

  if (readUprn(item)) score += 40;
  if (readAddress(item)) score += 20;
  if (readConnectedDpId(item)) score += 20;
  if (hasDropCable(asset, drops)) score += 15;
  if (status === "live") score += 12;
  if (status.includes("connected")) score += 8;
  if (item?.id) score += 4;
  if (item?.createdAt || item?.updatedAt) score += 2;

  return score;
}

function toCandidate(asset: SavedMapAsset, drops: SavedMapAsset[]): DuplicateHomeCandidate {
  const item = asset as any;
  const uprn = readUprn(item);
  const address = readAddress(item);
  const connectedDpId = readConnectedDpId(item);
  const status = readStatus(item);
  const hasDrop = hasDropCable(asset, drops);
  const score = candidateScore(asset, drops);

  return {
    asset,
    id: text(item.id || item.assetId || uprn || address || "home"),
    label: text(address || item.name || item.label || uprn || item.id || "Home"),
    uprn,
    address,
    connectedDpId,
    status,
    hasDrop,
    score,
    recommendation: "REVIEW",
  };
}

function groupWarning(reason: DuplicateHomeReason, count: number): string {
  if (reason === "UPRN") return `${count} homes share the same UPRN.`;
  if (reason === "ADDRESS") return `${count} homes look like the same address.`;
  if (reason === "HOME_ID") return `${count} homes share the same home ID.`;
  return `${count} homes are stacked within ${STACK_DISTANCE_METERS}m.`;
}

function createGroup(reason: DuplicateHomeReason, key: string, assets: SavedMapAsset[], drops: SavedMapAsset[]): DuplicateHomeGroup | null {
  if (assets.length < 2) return null;

  const candidates = assets
    .map((asset) => toCandidate(asset, drops))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const canonical = { ...candidates[0], recommendation: "KEEP" as const };
  const removeCandidates = candidates.slice(1).map((candidate) => ({
    ...candidate,
    recommendation: "REMOVE_CANDIDATE" as const,
  }));

  const allCandidates = [canonical, ...removeCandidates];
  const points = assets.map((asset) => getPoint(asset as any)).filter(Boolean) as { lat: number; lng: number }[];
  const center = points.length
    ? {
        lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
        lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
      }
    : undefined;

  return {
    id: `${reason}:${key}`,
    reason,
    key,
    canonical,
    candidates: allCandidates,
    removeCandidates,
    center,
    warning: groupWarning(reason, assets.length),
  };
}

function pushKeyGroup(groups: Map<string, SavedMapAsset[]>, key: string, asset: SavedMapAsset) {
  if (!key) return;
  const current = groups.get(key) || [];
  current.push(asset);
  groups.set(key, current);
}

function addUniqueGroup(target: DuplicateHomeGroup[], seenAssetSets: Set<string>, group: DuplicateHomeGroup | null) {
  if (!group) return;
  const signature = group.candidates.map((candidate) => candidate.id).sort().join("|");
  if (seenAssetSets.has(signature)) return;
  seenAssetSets.add(signature);
  target.push(group);
}

export function buildDuplicateHomeSummary(projectAssets: SavedMapAsset[]): DuplicateHomeSummary {
  const homes = projectAssets.filter(isWorkspaceHomeAsset);
  const drops = projectAssets.filter((asset) => isDropCable(asset as any));
  const groups: DuplicateHomeGroup[] = [];
  const seen = new Set<string>();

  const uprnGroups = new Map<string, SavedMapAsset[]>();
  const addressGroups = new Map<string, SavedMapAsset[]>();
  const homeIdGroups = new Map<string, SavedMapAsset[]>();

  homes.forEach((home) => {
    const item = home as any;
    pushKeyGroup(uprnGroups, compact(readUprn(item)), home);
    pushKeyGroup(addressGroups, compact(readAddress(item)), home);
    pushKeyGroup(homeIdGroups, compact(item.homeId || item.properties?.homeId), home);
  });

  uprnGroups.forEach((assets, key) => addUniqueGroup(groups, seen, createGroup("UPRN", key, assets, drops)));
  homeIdGroups.forEach((assets, key) => addUniqueGroup(groups, seen, createGroup("HOME_ID", key, assets, drops)));
  addressGroups.forEach((assets, key) => addUniqueGroup(groups, seen, createGroup("ADDRESS", key, assets, drops)));

  const stackedVisited = new Set<string>();
  homes.forEach((home) => {
    const homeId = text((home as any).id || (home as any).assetId);
    if (homeId && stackedVisited.has(homeId)) return;
    const homePoint = getPoint(home as any);
    if (!homePoint) return;

    const stack = homes.filter((other) => {
      const otherId = text((other as any).id || (other as any).assetId);
      if (homeId && otherId && stackedVisited.has(otherId)) return false;
      const otherPoint = getPoint(other as any);
      return Boolean(otherPoint && distanceMeters(homePoint, otherPoint) <= STACK_DISTANCE_METERS);
    });

    if (stack.length > 1) {
      stack.forEach((asset) => {
        const id = text((asset as any).id || (asset as any).assetId);
        if (id) stackedVisited.add(id);
      });
      addUniqueGroup(groups, seen, createGroup("STACKED", `${homePoint.lat.toFixed(7)},${homePoint.lng.toFixed(7)}`, stack, drops));
    }
  });

  const duplicateAssets = groups.reduce((sum, group) => sum + group.candidates.length, 0);
  const removalCandidates = groups.reduce((sum, group) => sum + group.removeCandidates.length, 0);

  return {
    groups: groups.sort((a, b) => b.removeCandidates.length - a.removeCandidates.length || a.reason.localeCompare(b.reason)),
    duplicateGroups: groups.length,
    duplicateAssets,
    removalCandidates,
  };
}

export function duplicateRemovalCandidateIds(summary: DuplicateHomeSummary): string[] {
  const ids = new Set<string>();
  summary.groups.forEach((group) => {
    group.removeCandidates.forEach((candidate) => {
      if (candidate.id) ids.add(candidate.id);
    });
  });
  return Array.from(ids);
}
