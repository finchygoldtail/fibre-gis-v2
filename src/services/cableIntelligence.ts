// =====================================================
// FILE: cableIntelligence.ts
// PURPOSE: Shared cable path intelligence for Alistra GIS.
//          Keeps Cable Intelligence / Cable Path Intelligence out of UI files.
// =====================================================

import type { SavedMapAsset } from "../components/map/types";

type RowValue = string | number | null | undefined;

function read(asset: any, keys: string[], fallback: RowValue = "—"): RowValue {
  for (const key of keys) {
    const value = asset?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function getAssetName(asset: SavedMapAsset | null): string {
  if (!asset) return "Asset";
  const item = asset as any;
  return String(read(item, ["name", "jointName", "label", "cableId", "id"], "Asset"));
}

function getAssetType(asset: SavedMapAsset | null): string {
  if (!asset) return "asset";
  const item = asset as any;
  return String(read(item, ["assetType", "type", "jointType"], "asset")).toLowerCase();
}

function toNumber(value: any): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function isCable(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("cable") || asset?.geometry?.type === "LineString";
}

function isJoint(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("joint") || type.includes("lmj") || type.includes("cmj") || type.includes("ag");
}

function isDp(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  const item = asset as any;
  const closureType = String(
    item?.dpDetails?.closureType ||
      item?.dpDetails?.networkArchitecture ||
      item?.closureType ||
      item?.networkArchitecture ||
      "",
  ).toLowerCase();

  return (
    type.includes("distribution") ||
    type === "dp" ||
    type.includes("cbt") ||
    type.includes("afn") ||
    type.includes("mdu") ||
    closureType === "cbt" ||
    closureType === "afn" ||
    closureType === "mdu" ||
    closureType === "mdu_splitter"
  );
}

function isPole(asset: SavedMapAsset | null): boolean {
  return getAssetType(asset).includes("pole");
}

function isChamber(asset: SavedMapAsset | null): boolean {
  return getAssetType(asset).includes("chamber");
}

function isCabinet(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("cab") || type.includes("street");
}

function pointFor(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  if (!asset) return null;
  const item = asset as any;
  if (typeof item.lat === "number" && typeof item.lng === "number") return { lat: item.lat, lng: item.lng };
  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates as any[];
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) return { lat: nextLat, lng: nextLng };
  }
  return null;
}

function linePoints(asset: SavedMapAsset | null): { lat: number; lng: number }[] {
  if (!asset || asset.geometry?.type !== "LineString") return [];
  return ((asset.geometry.coordinates || []) as any[])
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeLength(asset: SavedMapAsset | null): number | null {
  const explicit = read(asset as any, ["routeLengthMeters", "lengthMeters", "distanceMeters", "measuredLengthMeters"], null);
  const explicitNumber = toNumber(explicit);
  if (explicitNumber !== null && explicitNumber > 0) return explicitNumber;

  const points = linePoints(asset);
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += haversineMeters(points[index - 1], points[index]);
  return total > 0 ? total : null;
}

export type CablePathIntelligence = {
  upstreamAsset: SavedMapAsset | null;
  downstreamAsset: SavedMapAsset | null;
  parentCable: SavedMapAsset | null;
  branchCables: SavedMapAsset[];
  connectedJoints: SavedMapAsset[];
  connectedDps: SavedMapAsset[];
  connectedHomes: SavedMapAsset[];
  nearbyRouteAssets: SavedMapAsset[];
  upstreamChain: SavedMapAsset[];
  downstreamChain: SavedMapAsset[];
  terminalAssets: SavedMapAsset[];
  passThroughJoints: SavedMapAsset[];
  fibreCapacity: number | null;
  usedFibres: number | null;
  remainingFibres: number | null;
  utilisationPercent: number | null;
  routeLengthMeters: number | null;
  spanCount: number;
  longestSpanMeters: number | null;
  averageSpanMeters: number | null;
  endpointGapStartMeters: number | null;
  endpointGapEndMeters: number | null;
  endpointSnapStatus: string;
  pathHealth: string;
  routeWarnings: string[];
};

function normaliseId(value: unknown): string {
  return String(value ?? "").trim();
}

function getCandidateIds(asset: SavedMapAsset | null): string[] {
  if (!asset) return [];
  const item = asset as any;
  return [
    item.id,
    item.assetId,
    item.name,
    item.cableId,
    item.cableName,
    item.jointName,
    item.label,
  ]
    .map(normaliseId)
    .filter(Boolean);
}

function assetMatchesAnyId(asset: SavedMapAsset | null, ids: string[]): boolean {
  if (!asset || !ids.length) return false;
  const candidates = getCandidateIds(asset).map((id) => id.toLowerCase());
  const lookup = ids.map((id) => normaliseId(id).toLowerCase()).filter(Boolean);
  return candidates.some((candidate) => lookup.includes(candidate));
}

function findAssetByAnyId(assets: SavedMapAsset[], ids: string[]): SavedMapAsset | null {
  return assets.find((candidate) => assetMatchesAnyId(candidate, ids)) || null;
}

function parseFibreNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).match(/\d+/);
  if (!match) return null;
  const next = Number(match[0]);
  return Number.isFinite(next) ? next : null;
}

function getCableEndpointIds(asset: SavedMapAsset | null): { fromIds: string[]; toIds: string[] } {
  const item = asset as any;
  const fromIds = [
    item?.fromAssetId,
    item?.fromId,
    item?.startAssetId,
    item?.sourceAssetId,
    item?.aEndAssetId,
    item?.aEnd,
    item?.fromJointId,
    item?.sourceJointId,
  ].map(normaliseId).filter(Boolean);

  const toIds = [
    item?.toAssetId,
    item?.toId,
    item?.endAssetId,
    item?.targetAssetId,
    item?.bEndAssetId,
    item?.bEnd,
    item?.toJointId,
    item?.targetJointId,
  ].map(normaliseId).filter(Boolean);

  return { fromIds, toIds };
}

function distanceToNearestPointOnCable(asset: SavedMapAsset | null, candidate: SavedMapAsset | null): number | null {
  const cablePoints = linePoints(asset);
  const point = pointFor(candidate);
  if (!cablePoints.length || !point) return null;
  return Math.min(...cablePoints.map((linePoint) => haversineMeters(point, linePoint)));
}

function isNetworkPointAsset(asset: SavedMapAsset | null): boolean {
  return isJoint(asset) || isDp(asset) || isPole(asset) || isChamber(asset) || isCabinet(asset);
}

function isHomeAsset(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  const data = asset as any;
  return type.includes("home") || type.includes("premise") || Boolean(data?.uprn || data?.UPRN || data?.properties?.UPRN);
}

function uniqueAssets(assets: SavedMapAsset[]): SavedMapAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = String((asset as any).id || (asset as any).assetId || getAssetName(asset));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstPoint(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  const points = linePoints(asset);
  return points.length ? points[0] : null;
}

function lastPoint(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  const points = linePoints(asset);
  return points.length ? points[points.length - 1] : null;
}

function getCableReferenceIds(asset: SavedMapAsset | null): string[] {
  const item = asset as any;
  return [
    item?.parentCableId,
    item?.parentCableName,
    item?.throughCableId,
    item?.sourceCable,
    item?.targetCable,
    item?.inCable,
    item?.outCable,
    item?.feedCableId,
    item?.feederCableId,
    item?.dropCableId,
    item?.cableId,
    item?.cableName,
  ].map(normaliseId).filter(Boolean);
}

function getEndpointReferenceIds(asset: SavedMapAsset | null): string[] {
  const endpoints = getCableEndpointIds(asset);
  return [...endpoints.fromIds, ...endpoints.toIds];
}


function isOverheadCable(asset: SavedMapAsset | null): boolean {
  const item = asset as any;
  const raw = String(read(item, [
    "installMethod",
    "method",
    "routeType",
    "installType",
    "cableInstallMethod",
    "installationMethod",
  ], "")).trim().toLowerCase();

  if (!raw) return false;
  if (raw.includes("underground") || raw === "ug" || raw.includes("duct") || raw.includes("direct bury") || raw.includes("buried")) return false;
  return raw === "oh" || raw.includes("overhead") || raw.includes("aerial") || raw.includes("pole") || raw.includes("span");
}

function routeStats(asset: SavedMapAsset | null): { spanCount: number; longestSpanMeters: number | null; averageSpanMeters: number | null } {
  const points = linePoints(asset);
  if (points.length < 2) return { spanCount: 0, longestSpanMeters: null, averageSpanMeters: null };
  const spans: number[] = [];
  for (let index = 1; index < points.length; index += 1) spans.push(haversineMeters(points[index - 1], points[index]));
  const total = spans.reduce((sum, span) => sum + span, 0);
  return {
    spanCount: spans.length,
    longestSpanMeters: spans.length ? Math.max(...spans) : null,
    averageSpanMeters: spans.length ? total / spans.length : null,
  };
}

function closestNetworkAssetToPoint(
  point: { lat: number; lng: number } | null,
  assets: SavedMapAsset[],
  excludeId: string | undefined,
  maxMeters = 22,
): { asset: SavedMapAsset | null; distance: number | null } {
  if (!point) return { asset: null, distance: null };

  const closest = assets
    .filter((candidate) => candidate.id !== excludeId && isNetworkPointAsset(candidate))
    .map((candidate) => {
      const candidatePoint = pointFor(candidate);
      return { candidate, distance: candidatePoint ? haversineMeters(point, candidatePoint) : Number.POSITIVE_INFINITY };
    })
    .filter(({ distance }) => distance <= maxMeters)
    .sort((a, b) => a.distance - b.distance)[0];

  return closest ? { asset: closest.candidate, distance: closest.distance } : { asset: null, distance: null };
}

function cableTouchesAsset(cable: SavedMapAsset | null, asset: SavedMapAsset | null, maxMeters = 22): boolean {
  if (!cable || !asset) return false;
  const point = pointFor(asset);
  if (point) {
    const distance = distanceToNearestPointOnCable(cable, asset);
    if (distance !== null && distance <= maxMeters) return true;
  }

  const endpointIds = getEndpointReferenceIds(cable);
  return assetMatchesAnyId(asset, endpointIds);
}

function findCableChain(
  selectedCable: SavedMapAsset,
  projectAssets: SavedMapAsset[],
  direction: "upstream" | "downstream",
): SavedMapAsset[] {
  const chain: SavedMapAsset[] = [];
  const seen = new Set<string>([String(selectedCable.id)]);
  let current: SavedMapAsset | null = selectedCable;

  for (let depth = 0; depth < 5; depth += 1) {
    const currentEndpoints = getCableEndpointIds(current);
    const lookupIds = direction === "upstream" ? currentEndpoints.fromIds : currentEndpoints.toIds;
    const lookupPoint = direction === "upstream" ? firstPoint(current) : lastPoint(current);

    const nextCable = projectAssets.find((candidate) => {
      if (!isCable(candidate) || seen.has(String(candidate.id))) return false;
      const candidateEndpoints = getCableEndpointIds(candidate);
      const candidateOppositeIds = direction === "upstream" ? candidateEndpoints.toIds : candidateEndpoints.fromIds;
      const explicitTouch = lookupIds.length && candidateOppositeIds.some((id) => lookupIds.map((value) => value.toLowerCase()).includes(id.toLowerCase()));
      if (explicitTouch) return true;

      const candidatePoint = direction === "upstream" ? lastPoint(candidate) : firstPoint(candidate);
      return Boolean(lookupPoint && candidatePoint && haversineMeters(lookupPoint, candidatePoint) <= 22);
    });

    if (!nextCable) break;
    chain.push(nextCable);
    seen.add(String(nextCable.id));
    current = nextCable;
  }

  return chain;
}

export function buildCablePathIntelligence(asset: SavedMapAsset | null, projectAssets: SavedMapAsset[]): CablePathIntelligence {
  const item = asset as any;
  const empty: CablePathIntelligence = {
    upstreamAsset: null,
    downstreamAsset: null,
    parentCable: null,
    branchCables: [],
    connectedJoints: [],
    connectedDps: [],
    connectedHomes: [],
    nearbyRouteAssets: [],
    upstreamChain: [],
    downstreamChain: [],
    terminalAssets: [],
    passThroughJoints: [],
    fibreCapacity: null,
    usedFibres: null,
    remainingFibres: null,
    utilisationPercent: null,
    routeLengthMeters: null,
    spanCount: 0,
    longestSpanMeters: null,
    averageSpanMeters: null,
    endpointGapStartMeters: null,
    endpointGapEndMeters: null,
    endpointSnapStatus: "No cable selected",
    pathHealth: "No cable selected",
    routeWarnings: [],
  };

  if (!asset || !isCable(asset)) return empty;

  const cableIds = getCandidateIds(asset);
  const { fromIds, toIds } = getCableEndpointIds(asset);
  const startSnap = closestNetworkAssetToPoint(firstPoint(asset), projectAssets, asset.id);
  const endSnap = closestNetworkAssetToPoint(lastPoint(asset), projectAssets, asset.id);

  const upstreamAsset = findAssetByAnyId(projectAssets, fromIds) || startSnap.asset;
  const downstreamAsset = findAssetByAnyId(projectAssets, toIds) || endSnap.asset;

  const upstreamChain = findCableChain(asset, projectAssets, "upstream");
  const downstreamChain = findCableChain(asset, projectAssets, "downstream");

  const parentCable = findAssetByAnyId(projectAssets, [
    item?.parentCableId,
    item?.parentCableName,
    item?.throughCableId,
    item?.sourceCable,
    item?.inCable,
  ].map(normaliseId).filter(Boolean)) || upstreamChain[0] || null;

  const nearbyRouteAssetsWithDistance = projectAssets
    .filter((candidate) => candidate.id !== asset.id && isNetworkPointAsset(candidate))
    .map((candidate) => ({ candidate, distance: distanceToNearestPointOnCable(asset, candidate) }))
    .filter((entry): entry is { candidate: SavedMapAsset; distance: number } => entry.distance !== null && entry.distance <= 18)
    .sort((a, b) => a.distance - b.distance);

  const nearbyRouteAssets = uniqueAssets([
    ...(upstreamAsset ? [upstreamAsset] : []),
    ...(downstreamAsset ? [downstreamAsset] : []),
    ...nearbyRouteAssetsWithDistance.map((entry) => entry.candidate),
  ]).slice(0, 16);

  const connectedJoints = nearbyRouteAssets.filter(isJoint).slice(0, 12);

  const connectedDps = uniqueAssets([
    ...projectAssets
      .filter((candidate) => candidate.id !== asset.id && isDp(candidate))
      .filter((candidate) => {
        const data = candidate as any;
        if (assetMatchesAnyId(asset, [data.parentCableId, data.cableId, data.feedCableId, data.feederCableId, data.sourceCable].map(normaliseId))) return true;
        const distance = distanceToNearestPointOnCable(asset, candidate);
        return distance !== null && distance <= 18;
      }),
    ...nearbyRouteAssets.filter(isDp),
  ]).slice(0, 20);

  const connectedHomes = projectAssets
    .filter(isHomeAsset)
    .filter((candidate) => {
      const data = candidate as any;
      if (assetMatchesAnyId(asset, [data.parentCableId, data.cableId, data.dropCableId, data.feedCableId].map(normaliseId))) return true;
      return connectedDps.some((dp) => assetMatchesAnyId(dp, [data.dpId, data.parentDpId, data.connectedDpId, data.servingDpId, data.dpName].map(normaliseId)));
    })
    .slice(0, 40);

  const branchCables = uniqueAssets([
    ...projectAssets
      .filter((candidate) => candidate.id !== asset.id && isCable(candidate))
      .filter((candidate) => {
        const data = candidate as any;
        if (assetMatchesAnyId(asset, [data.parentCableId, data.parentCableName, data.throughCableId, data.sourceCable, data.inCable].map(normaliseId))) return true;
        if (getCableReferenceIds(candidate).some((id) => cableIds.map((value) => value.toLowerCase()).includes(id.toLowerCase()))) return true;
        return nearbyRouteAssets.some((routeAsset) => cableTouchesAsset(candidate, routeAsset, 18));
      }),
  ]).slice(0, 16);

  const terminalAssets = uniqueAssets([upstreamAsset, downstreamAsset].filter(Boolean) as SavedMapAsset[]);
  const passThroughJoints = connectedJoints.filter((joint) => branchCables.some((branch) => cableTouchesAsset(branch, joint, 18))).slice(0, 10);

  const fibreCapacity = parseFibreNumber(read(item, ["fibreCount", "fiberCount", "coreCount", "size"], null));
  const usedFibres = parseFibreNumber(read(item, ["usedFibres", "usedFibers", "usedCoreCount", "fibresUsed", "allocatedFibres"], null));
  const remainingFibres = fibreCapacity !== null && usedFibres !== null ? Math.max(0, fibreCapacity - usedFibres) : null;
  const utilisationPercent = fibreCapacity && usedFibres !== null ? Math.min(100, Math.round((usedFibres / fibreCapacity) * 100)) : null;
  const routeLengthMeters = routeLength(asset);
  const stats = routeStats(asset);

  const routeWarnings: string[] = [];
  if (!fibreCapacity) routeWarnings.push("Fibre count missing");
  if (usedFibres === null) routeWarnings.push("Used fibres missing");
  if (!upstreamAsset) routeWarnings.push("Upstream endpoint not linked");
  if (!downstreamAsset) routeWarnings.push("Downstream endpoint not linked");
  if (!connectedJoints.length && !connectedDps.length) routeWarnings.push("No route assets detected on cable path");
  if (isOverheadCable(asset) && stats.longestSpanMeters !== null && stats.longestSpanMeters > 85) routeWarnings.push("Longest OH span is over 85m");
  if (fibreCapacity !== null && usedFibres !== null && usedFibres > fibreCapacity) routeWarnings.push("Used fibres exceed cable capacity");

  let endpointSnapStatus = "No endpoint references";
  if (fromIds.length || toIds.length) {
    if (upstreamAsset && downstreamAsset) endpointSnapStatus = "Both endpoints linked";
    else if (upstreamAsset || downstreamAsset) endpointSnapStatus = "One endpoint linked";
    else endpointSnapStatus = "Endpoint references not found";
  } else if (startSnap.asset || endSnap.asset) {
    if (startSnap.asset && endSnap.asset) endpointSnapStatus = "Likely snapped by map position";
    else endpointSnapStatus = "One endpoint likely snapped by map position";
  } else {
    endpointSnapStatus = "Needs endpoint snap check";
  }

  const pathHealth = routeWarnings.length
    ? `${routeWarnings.length} path warning${routeWarnings.length === 1 ? "" : "s"}`
    : "Cable path looks healthy";

  return {
    upstreamAsset,
    downstreamAsset,
    parentCable,
    branchCables,
    connectedJoints,
    connectedDps,
    connectedHomes,
    nearbyRouteAssets,
    upstreamChain,
    downstreamChain,
    terminalAssets,
    passThroughJoints,
    fibreCapacity,
    usedFibres,
    remainingFibres,
    utilisationPercent,
    routeLengthMeters,
    spanCount: stats.spanCount,
    longestSpanMeters: stats.longestSpanMeters,
    averageSpanMeters: stats.averageSpanMeters,
    endpointGapStartMeters: startSnap.distance,
    endpointGapEndMeters: endSnap.distance,
    endpointSnapStatus,
    pathHealth,
    routeWarnings,
  };
}
