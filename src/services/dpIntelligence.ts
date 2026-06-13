// =====================================================
// FILE: src/services/dpIntelligence.ts
// PURPOSE: Single read-only DP / CBT / AFN intelligence source.
//          All workspace panels should use this instead of calculating
//          capacity, homes, fibre intake, or risk independently.
// =====================================================

import type { SavedMapAsset } from "../components/map/types";

export type DpCapacityRisk = "OK" | "WARN" | "FULL" | "OVER";

export type DpIntelligence = {
  assetId: string;
  assetName: string;
  dpType: string;
  status: string;
  connectedHomes: number;
  usedPorts: number;
  capacity: number;
  freePorts: number;
  capacityPercent: number;
  capacityRisk: DpCapacityRisk;
  capacityWarning: string;
  splitterRatio: string;
  splitterOutputs: number;
  inputFibres: number[];
  inputFibreCount: number;
  passthroughFibres: number[];
  passthroughFibreCount: number;
  incomingCable: SavedMapAsset | null;
  incomingCableId: string;
  incomingCableName: string;
  incomingCableFibreCount: number;
};

type Point = { lat: number; lng: number };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalise(value: unknown): string {
  return text(value).toLowerCase();
}

function normaliseRef(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsMatch(left: unknown, right: unknown): boolean {
  const a = normaliseRef(left);
  const b = normaliseRef(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function uniqueSorted(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function getAssetName(asset: any): string {
  return text(asset?.name || asset?.jointName || asset?.label || asset?.cableId || asset?.assetId || asset?.id || "Asset");
}

function getAssetId(asset: any): string {
  return text(asset?.id || asset?.assetId || asset?.dpId || asset?.name || asset?.label);
}

function getDetails(asset: any): Record<string, any> {
  return asset?.dpDetails || asset?.properties?.dpDetails || {};
}

function getAfnDetails(asset: any): Record<string, any> {
  const details = getDetails(asset);
  return details.afnDetails || asset?.afnDetails || {};
}

function getMduDetails(asset: any): Record<string, any> {
  const details = getDetails(asset);
  return details.mduDetails || asset?.mduDetails || {};
}

function getPoint(asset: any): Point | null {
  if (!asset) return null;
  if (typeof asset.lat === "number" && typeof asset.lng === "number") return { lat: asset.lat, lng: asset.lng };
  const coords = asset.geometry?.coordinates;
  if (asset.geometry?.type === "Point" && Array.isArray(coords)) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function getLine(asset: any): Point[] {
  const coords = asset?.geometry?.coordinates;
  if (asset?.geometry?.type !== "LineString" || !Array.isArray(coords)) return [];
  return coords
    .map((coord: any) => ({ lat: Number(coord?.[0]), lng: Number(coord?.[1]) }))
    .filter((point: Point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function distanceMeters(a: Point, b: Point): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function minDistanceToLine(point: Point, line: Point[]): number {
  if (!line.length) return Number.POSITIVE_INFINITY;
  return Math.min(...line.map((linePoint) => distanceMeters(point, linePoint)));
}

export function isDpLikeAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset || asset.geometry?.type === "LineString") return false;
  const item = asset as any;
  const details = getDetails(item);
  const haystack = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    details.closureType,
    details.networkArchitecture,
    item.name,
    item.label,
  ]
    .map(normalise)
    .join(" ");

  return (
    haystack.includes("distribution") ||
    haystack.includes("afn") ||
    haystack.includes("cbt") ||
    haystack.includes("mdu") ||
    /\bsb\s*0*\d+\b/i.test(haystack) ||
    /sb0*\d+/i.test(haystack) ||
    Boolean(item.dpDetails || item.properties?.dpDetails)
  );
}

export function isDropCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const hasLineGeometry = asset.geometry?.type === "LineString";
  const typeText = [item.assetType, item.type, item.cableType, item.name, item.label, item.generatedBy]
    .map(normalise)
    .join(" ");

  return Boolean(
    hasLineGeometry &&
      (typeText.includes("drop") ||
        item.isDropCable === true ||
        item.isHomeDrop === true ||
        item.generatedDrop === true ||
        item.autoGeneratedDrop === true ||
        item.dropCable === true ||
        item.homeId ||
        item.connectedHomeId ||
        item.toHomeId ||
        item.fromHomeId),
  );
}

export function isSupportingCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const haystack = [
    item.source,
    item.assetType,
    item.type,
    item.cableType,
    item.routeType,
    item.jointType,
    item.name,
    item.label,
    item.cableId,
    item.notes,
    item.importedProperties?.Name,
    item.importedProperties?.name,
    item.importedProperties?.Description,
    item.importedProperties?.description,
  ]
    .map(normalise)
    .join(" ");

  if (asset.geometry?.type !== "LineString") return false;
  if (item.readOnly === true || item.isReferenceAsset === true) return false;
  if (isDropCableAsset(asset)) return false;
  if (
    haystack.includes("openreach") ||
    haystack.includes("pia") ||
    haystack.includes("osp:") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:") ||
    haystack.includes("missing duct") ||
    haystack.includes("suggested duct")
  ) {
    return false;
  }

  return (
    haystack.includes("cable") ||
    haystack.includes("ulw") ||
    haystack.includes("feeder") ||
    haystack.includes("link") ||
    haystack.includes("distribution") ||
    haystack.includes("spine") ||
    getCableFibreCount(asset) > 0
  );
}

export function getCableFibreCount(asset: SavedMapAsset | null | undefined): number {
  const item = asset as any;
  if (!item) return 0;
  const haystack = [
    item.fibreCount,
    item.fiberCount,
    item.coreCount,
    item.size,
    item.cableSize,
    item.name,
    item.cableId,
    item.cableName,
    item.label,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
  const match = haystack.match(/(?:^|[^0-9])(288|144|96|48|36|24|12)\s*F?(?:[^0-9]|$)/i);
  return match ? Number(match[1]) : 0;
}

function getAssetIdentityKeys(asset: any): string[] {
  return [asset?.id, asset?.assetId, asset?.name, asset?.jointName, asset?.label, asset?.dpId]
    .map(text)
    .filter(Boolean);
}

function getHomeKey(asset: any): string {
  return normaliseRef(
    asset?.uprn ||
      asset?.UPRN ||
      asset?.properties?.UPRN ||
      asset?.properties?.uprn ||
      asset?.homeId ||
      asset?.connectedHomeId ||
      asset?.toHomeId ||
      asset?.toAssetId ||
      asset?.address ||
      asset?.fullAddress ||
      asset?.name ||
      asset?.label ||
      asset?.id,
  );
}

function isHomeAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset || asset.geometry?.type === "LineString" || isDropCableAsset(asset)) return false;
  const item = asset as any;
  const haystack = [item.assetType, item.type, item.homeType, item.category, item.name, item.label]
    .map(normalise)
    .join(" ");
  return Boolean(
    haystack.includes("home") ||
      haystack.includes("premise") ||
      haystack.includes("property") ||
      haystack.includes("sdu") ||
      haystack.includes("flat") ||
      item.uprn ||
      item.UPRN ||
      item.properties?.UPRN ||
      item.properties?.uprn ||
      item.homeId,
  );
}

function assetReferencesDp(asset: any, dpKeys: string[]): boolean {
  const refs = [
    asset?.dpId,
    asset?.connectedDpId,
    asset?.assignedDpId,
    asset?.servingDpId,
    asset?.distributionPointId,
    asset?.parentDpId,
    asset?.fromDpId,
    asset?.toDpId,
    asset?.dpName,
    asset?.connectedDpName,
    asset?.assignedDpName,
    asset?.servingDpName,
    asset?.distributionPointName,
    asset?.splitterBox,
    asset?.splitterBoxName,
    asset?.sbName,
    asset?.fromAssetId,
    asset?.toAssetId,
    asset?.sourceAssetId,
    asset?.targetAssetId,
    asset?.properties?.dpId,
    asset?.properties?.connectedDpId,
    asset?.properties?.assignedDpId,
    asset?.properties?.servingDpId,
    asset?.properties?.distributionPointId,
    asset?.properties?.dpName,
    asset?.properties?.connectedDpName,
    asset?.properties?.assignedDpName,
    asset?.properties?.servingDpName,
    asset?.properties?.splitterBox,
    asset?.properties?.splitterBoxName,
    asset?.properties?.sbName,
    asset?.properties?.fromAssetId,
    asset?.properties?.toAssetId,
  ].filter(Boolean);

  return refs.some((ref) => dpKeys.some((key) => refsMatch(ref, key)));
}

export function getDpConnectedHomeCount(dp: SavedMapAsset | null | undefined, allAssets: SavedMapAsset[] = []): number {
  if (!dp) return 0;
  const item = dp as any;
  const details = getDetails(item);

  // Prefer the DP's explicit served/used count when it exists.  Imported or
  // regenerated drop cables can leave stale references behind, which was making
  // workspace map popups show old values such as "Full (100%)" while the right
  // intelligence panel correctly showed the saved DP value, for example 25/32.
  // Do not use connectionsToHomes here: in this app that field is capacity.
  const explicitServedCount = Number(
    details.connectedHomes ??
      item.connectedHomes ??
      item.homesConnected ??
      item.homeCount ??
      item.servedHomes ??
      item.usedPorts ??
      item.portsUsed ??
      0,
  );

  if (Number.isFinite(explicitServedCount) && explicitServedCount > 0) {
    return explicitServedCount;
  }

  const dpKeys = Array.from(new Set([getAssetId(item), getAssetName(item), ...getAssetIdentityKeys(item)].filter(Boolean)));
  const homeKeys = new Set<string>();

  allAssets.forEach((asset: any) => {
    if (isHomeAsset(asset) && assetReferencesDp(asset, dpKeys)) {
      const key = getHomeKey(asset);
      if (key) homeKeys.add(key);
    }
  });

  allAssets.forEach((asset: any) => {
    if (isDropCableAsset(asset) && assetReferencesDp(asset, dpKeys)) {
      const key = getHomeKey(asset);
      if (key) homeKeys.add(key);
    }
  });

  return homeKeys.size;
}

export function getDpStatus(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  const details = getDetails(item);
  const raw = text(
    details.buildStatus ||
      item?.buildStatus ||
      item?.status ||
      item?.serviceStatus ||
      item?.dpStatus ||
      item?.properties?.status ||
      "Planned",
  );
  const lower = raw.toLowerCase();
  if (lower === "live") return "Live";
  if (lower === "bwip") return "BWIP";
  if (lower === "unserviceable") return "Unserviceable";
  if (lower === "lnrfs" || lower === "live not ready" || lower === "live not ready for service") return "Live not ready for service";
  if (lower === "planned") return "Planned";
  return raw || "Planned";
}

export function getDpType(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  const details = getDetails(item);
  const raw = text(
    details.closureType ||
      details.networkArchitecture ||
      item?.closureType ||
      item?.dpType ||
      item?.distributionPointType ||
      item?.jointType ||
      item?.assetType ||
      "Distribution Point",
  );
  const upper = raw.toUpperCase();
  if (upper.includes("AFN") || /\bSB\s*0*\d+/i.test(getAssetName(item))) return "SB";
  if (upper.includes("CBT")) return "CBT";
  if (upper.includes("MDU")) return "MDU";
  return raw || "Distribution Point";
}

function getSplitterOutputs(asset: SavedMapAsset | null | undefined): number {
  const item = asset as any;
  const details = getDetails(item);
  const afn = getAfnDetails(item);
  const candidates = [afn.splitterOutputs, afn.outputsPerInput, details.splitterOutputs, item?.splitterOutputs];
  const explicit = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (explicit) return explicit;
  const ratioText = text(afn.splitterRatio || details.splitterRatio || item?.splitterRatio || "1:8");
  const ratio = ratioText.match(/1\s*(?::|to|\/)\s*(\d+)/i) || ratioText.match(/(\d+)\s*-?\s*way/i);
  return ratio ? Number(ratio[1]) : 8;
}

function getExplicitInputFibres(asset: SavedMapAsset | null | undefined): number[] {
  const item = asset as any;
  const afn = getAfnDetails(item);
  const mdu = getMduDetails(item);
  return uniqueSorted([
    ...(Array.isArray(afn.inputFibres) ? afn.inputFibres : []),
    ...(Array.isArray(afn.localInputFibres) ? afn.localInputFibres : []),
    ...(Array.isArray(afn.splitterFibres) ? afn.splitterFibres : []),
    ...(Array.isArray(mdu.inputFibres) ? mdu.inputFibres : []),
  ]);
}

function getThroughCableId(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  const details = getDetails(item);
  const afn = getAfnDetails(item);
  const mdu = getMduDetails(item);
  return text(
    afn.throughCableId ||
      afn.supportingCableId ||
      afn.cableId ||
      mdu.throughCableId ||
      details.throughCableId ||
      item?.throughCableId ||
      item?.parentCableId ||
      item?.feedCableId,
  );
}

export function findDpIncomingCable(dp: SavedMapAsset | null | undefined, allAssets: SavedMapAsset[] = []): SavedMapAsset | null {
  if (!dp) return null;
  const throughCableId = getThroughCableId(dp);
  if (throughCableId) {
    const explicit = allAssets.find((asset: any) =>
      [asset?.id, asset?.assetId, asset?.name, asset?.cableId, asset?.cableName, asset?.label]
        .filter(Boolean)
        .some((ref) => refsMatch(ref, throughCableId)),
    );
    if (explicit && isSupportingCableAsset(explicit)) return explicit;
  }

  const point = getPoint(dp);
  if (!point) return null;
  const candidates = allAssets
    .filter(isSupportingCableAsset)
    .map((asset) => {
      const line = getLine(asset);
      if (line.length < 2) return null;
      const startDistance = distanceMeters(point, line[0]);
      const endDistance = distanceMeters(point, line[line.length - 1]);
      const routeDistance = minDistanceToLine(point, line);
      return { asset, score: Math.min(startDistance, endDistance, routeDistance) };
    })
    .filter((row): row is { asset: SavedMapAsset; score: number } => Boolean(row))
    .filter((row) => row.score <= 40)
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.asset || null;
}

function getExplicitCapacity(asset: SavedMapAsset | null | undefined): number {
  const item = asset as any;
  const details = getDetails(item);
  const values = [
    item?.capacity,
    item?.dpCapacity,
    item?.ports,
    details.capacity,
    details.portCapacity,
    // connectionsToHomes is historically used as capacity in this app.
    details.connectionsToHomes,
  ];
  const explicit = values.map(Number).find((value) => Number.isFinite(value) && value > 0);
  return explicit || 0;
}

export function getDpIntelligence(dp: SavedMapAsset | null | undefined, allAssets: SavedMapAsset[] = []): DpIntelligence {
  const item = dp as any;
  const assetId = getAssetId(item);
  const assetName = getAssetName(item);
  const dpType = getDpType(dp);
  const lowerType = dpType.toLowerCase();
  const isAfn = lowerType.includes("sb") || lowerType.includes("afn");
  const isCbt = lowerType.includes("cbt");
  const isMdu = lowerType.includes("mdu");
  const connectedHomes = getDpConnectedHomeCount(dp, allAssets);
  const usedPorts = connectedHomes;
  const splitterOutputs = getSplitterOutputs(dp);
  const storedInputFibres = getExplicitInputFibres(dp);
  const requiredInputCount = isAfn && usedPorts > 0 ? Math.max(1, Math.ceil(usedPorts / splitterOutputs)) : 0;
  const inputFibreCount = isAfn
    ? Math.max(storedInputFibres.length, requiredInputCount)
    : storedInputFibres.length;
  const inputFibres = storedInputFibres.length
    ? storedInputFibres.slice(0, inputFibreCount || storedInputFibres.length)
    : inputFibreCount > 0
      ? Array.from({ length: inputFibreCount }, (_, index) => index + 1)
      : [];
  const explicitCapacity = getExplicitCapacity(dp);
  const splitterCapacity = isAfn && inputFibreCount > 0 ? inputFibreCount * splitterOutputs : 0;
  const fallbackCapacity = isCbt ? 12 : isMdu ? Math.max(explicitCapacity, usedPorts) : usedPorts;
  const capacity = Math.max(explicitCapacity, splitterCapacity, fallbackCapacity, usedPorts);
  const freePorts = Math.max(capacity - usedPorts, 0);
  const capacityPercent = capacity > 0 ? Math.round((usedPorts / capacity) * 100) : 0;
  const capacityRisk: DpCapacityRisk =
    capacity <= 0
      ? "WARN"
      : usedPorts > capacity
        ? "OVER"
        : usedPorts === capacity
          ? "FULL"
          : capacityPercent >= 80
            ? "WARN"
            : "OK";
  const capacityWarning =
    capacity <= 0
      ? "No capacity set"
      : capacityRisk === "OVER"
        ? "Over capacity"
        : capacityRisk === "FULL"
          ? "Full"
          : capacityRisk === "WARN"
            ? "Near capacity"
            : "Capacity OK";

  const incomingCable = findDpIncomingCable(dp, allAssets);
  const incomingCableFibreCount = getCableFibreCount(incomingCable);
  const passthroughFibreCount = incomingCableFibreCount > 0 ? Math.max(incomingCableFibreCount - inputFibreCount, 0) : 0;
  const passthroughFibres = passthroughFibreCount > 0
    ? Array.from({ length: passthroughFibreCount }, (_, index) => inputFibreCount + index + 1)
    : [];

  return {
    assetId,
    assetName,
    dpType,
    status: getDpStatus(dp),
    connectedHomes,
    usedPorts,
    capacity,
    freePorts,
    capacityPercent,
    capacityRisk,
    capacityWarning,
    splitterRatio: isAfn ? `1:${splitterOutputs}` : "—",
    splitterOutputs,
    inputFibres,
    inputFibreCount,
    passthroughFibres,
    passthroughFibreCount,
    incomingCable,
    incomingCableId: incomingCable ? getAssetId(incomingCable as any) : "",
    incomingCableName: incomingCable ? getAssetName(incomingCable as any) : "",
    incomingCableFibreCount,
  };
}
