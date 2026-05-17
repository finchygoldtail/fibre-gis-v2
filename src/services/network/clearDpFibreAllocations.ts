// =====================================================
// FILE: src/services/network/clearDpFibreAllocations.ts
// PURPOSE: Bulk clear DP fibre allocation state for a selected
//          project/polygon without deleting DPs, homes, drops,
//          geometry, statuses, photos, notes or through-cable choice.
// =====================================================

import type { SavedMapAsset } from "../../components/map/types";

type LatLng = { lat: number; lng: number };

export type ClearDpFibreAllocationOptions = {
  /**
   * Optional project/polygon asset. When supplied the helper will only clear DPs
   * whose point falls inside the polygon. If omitted it assumes the caller has
   * already supplied area-scoped assets.
   */
  areaAsset?: SavedMapAsset | null;
};

export type ClearDpFibreAllocationSummary = {
  totalAssets: number;
  candidateDpCount: number;
  clearedDpCount: number;
  skippedDpCount: number;
  clearedDpIds: string[];
};

const FIBRE_ALLOCATION_KEYS = [
  "inputFibres",
  "splitterFibres",
  "directFibres",
  "passthroughFibres",
  "spareFibres",
  "allocatedFibres",
  "allocatedInputFibres",
  "reservedFibres",
  "consumedFibres",
  "usedFibreNumbers",
  "usedFibres",
  "portRoutes",
  "routingDraft",
  "routing",
  "routeDraft",
  "throughCableReservations",
  "autoFibrePlan",
  "allocationTrace",
  "allocationWarnings",
  "fibreRoutes",
  "fibrePlan",
  "fibreAllocation",
  "computedRouting",
  "computedFibreState",
  "downstreamPropagation",
];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function hasPoint(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  return (
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number")
  );
}

export function isDpFibreAllocationTarget(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset || !hasPoint(asset)) return false;

  const item = asset as any;
  const details = item.dpDetails || item.properties?.dpDetails || {};
  const haystack = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    item.networkArchitecture,
    details.closureType,
    details.networkArchitecture,
    item.name,
  ]
    .map(lower)
    .join(" ");

  return (
    haystack.includes("distribution-point") ||
    haystack.includes("distribution point") ||
    haystack.includes(" dp") ||
    haystack.startsWith("dp") ||
    haystack.includes("cbt") ||
    haystack.includes("afn") ||
    haystack.includes("mdu")
  );
}

function getPoint(asset: SavedMapAsset | null | undefined): LatLng | null {
  if (!asset) return null;
  const item = asset as any;

  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { lat: item.lat, lng: item.lng };
  }

  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates as any[];
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function getPolygonRing(asset: SavedMapAsset | null | undefined): LatLng[] {
  if (!asset || asset.geometry?.type !== "Polygon") return [];

  const ring = ((asset.geometry.coordinates || []) as any[])[0] || [];
  return ring
    .map(([lat, lng]: any[]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point: LatLng) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function isInsideArea(asset: SavedMapAsset, areaAsset?: SavedMapAsset | null): boolean {
  if (!areaAsset) return true;

  const point = getPoint(asset);
  const polygon = getPolygonRing(areaAsset);

  if (!point || polygon.length < 3) return false;
  return pointInPolygon(point, polygon);
}

function clearKnownAllocationKeys<T extends Record<string, any>>(source: T | undefined | null): T | undefined {
  if (!source || typeof source !== "object") return source ?? undefined;

  const next: Record<string, any> = { ...source };

  FIBRE_ALLOCATION_KEYS.forEach((key) => {
    if (key in next) {
      if (Array.isArray(next[key])) {
        next[key] = [];
      } else if (typeof next[key] === "number") {
        next[key] = 0;
      } else {
        delete next[key];
      }
    }
  });

  return next as T;
}

function clearAfnDetails(details: any): any {
  if (!details?.afnDetails || typeof details.afnDetails !== "object") {
    return details;
  }

  return {
    ...details,
    afnDetails: {
      ...details.afnDetails,
      inputFibres: [],
      fibreCountUsed: 0,
      // Keep the selected through cable, splitter ratio and enabled state.
      throughCableId: details.afnDetails.throughCableId,
      enabled: details.afnDetails.enabled,
      splitterRatio: details.afnDetails.splitterRatio,
      splitterOutputs: details.afnDetails.splitterOutputs,
    },
  };
}

function clearMduDetails(details: any): any {
  if (!details?.mduDetails || typeof details.mduDetails !== "object") {
    return details;
  }

  return {
    ...details,
    mduDetails: {
      ...details.mduDetails,
      inputFibres: [],
      totalReservedFibres: 0,
      mduFibres: 0,
      splitterFibres: 0,
      // Keep selected through cable and enabled state.
      throughCableId: details.mduDetails.throughCableId,
      enabled: details.mduDetails.enabled,
    },
  };
}

function clearDpDetails(details: any): any {
  const next = clearKnownAllocationKeys(details || {}) || {};
  return clearMduDetails(clearAfnDetails(next));
}

export function clearDpFibreAllocation(asset: SavedMapAsset): SavedMapAsset {
  const item = asset as any;
  const currentDpDetails = item.dpDetails || item.properties?.dpDetails || {};
  const nextDpDetails = clearDpDetails(currentDpDetails);
  const nextPropertiesDpDetails = clearDpDetails(item.properties?.dpDetails || currentDpDetails);

  const nextAsset: any = {
    ...item,
    ...clearKnownAllocationKeys(item),
    dpDetails: nextDpDetails,
    properties: {
      ...(item.properties || {}),
      ...clearKnownAllocationKeys(item.properties || {}),
      dpDetails: nextPropertiesDpDetails,
    },
  };

  // Keep the physical DP, homes, status, notes and selected through cable.
  return nextAsset as SavedMapAsset;
}

export function clearDpFibreAllocationsForAssets(
  assets: SavedMapAsset[],
  options: ClearDpFibreAllocationOptions = {},
): { assets: SavedMapAsset[]; summary: ClearDpFibreAllocationSummary } {
  const clearedIds: string[] = [];
  let candidateDpCount = 0;

  const nextAssets = (assets || []).map((asset) => {
    if (!isDpFibreAllocationTarget(asset)) return asset;
    if (!isInsideArea(asset, options.areaAsset)) return asset;

    candidateDpCount += 1;
    const nextAsset = clearDpFibreAllocation(asset);

    if (JSON.stringify(nextAsset) !== JSON.stringify(asset)) {
      clearedIds.push(asset.id);
      return nextAsset;
    }

    return asset;
  });

  return {
    assets: nextAssets,
    summary: {
      totalAssets: assets.length,
      candidateDpCount,
      clearedDpCount: clearedIds.length,
      skippedDpCount: Math.max(0, candidateDpCount - clearedIds.length),
      clearedDpIds: clearedIds,
    },
  };
}
