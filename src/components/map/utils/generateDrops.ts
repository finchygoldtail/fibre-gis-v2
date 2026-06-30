import { getDistanceMeters as haversineMetres } from "../../../utils/mapMeasure";
import { getDpCapacitySummary } from "../../../services/dpIntelligence";
const MAX_OH_DROP_METRES = 68;

type LatLng = {
  lat: number;
  lng: number;
};

type AnyAsset = Record<string, any>;

export type GeneratedDrop = AnyAsset;

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function looksLikeBradfordLatLng(lat: number, lng: number): boolean {
  return lat > 49 && lat < 61 && lng > -9 && lng < 3;
}

export function getAssetLatLng(asset: AnyAsset): LatLng | null {
  if (!asset) return null;

  const lat =
    toNumber(asset.lat) ??
    toNumber(asset.latitude) ??
    toNumber(asset.LATITUDE) ??
    toNumber(asset.properties?.LATITUDE) ??
    toNumber(asset.properties?.latitude);

  const lng =
    toNumber(asset.lng) ??
    toNumber(asset.lon) ??
    toNumber(asset.longitude) ??
    toNumber(asset.LONGITUDE) ??
    toNumber(asset.properties?.LONGITUDE) ??
    toNumber(asset.properties?.longitude);

  if (lat !== null && lng !== null) {
    return { lat, lng };
  }

  if (
    asset.geometry?.type === "Point" &&
    Array.isArray(asset.geometry.coordinates) &&
    asset.geometry.coordinates.length >= 2
  ) {
    const a = toNumber(asset.geometry.coordinates[0]);
    const b = toNumber(asset.geometry.coordinates[1]);

    if (a === null || b === null) return null;

    // Internal assets often use [lat, lng]
    if (looksLikeBradfordLatLng(a, b)) {
      return { lat: a, lng: b };
    }

    // Raw GeoJSON uses [lng, lat]
    if (looksLikeBradfordLatLng(b, a)) {
      return { lat: b, lng: a };
    }

    return { lat: a, lng: b };
  }

  const coords =
    asset.coordinates ??
    asset.position ??
    asset.location ??
    asset.latLng;

  if (Array.isArray(coords) && coords.length >= 2) {
    const a = toNumber(coords[0]);
    const b = toNumber(coords[1]);

    if (a !== null && b !== null) {
      return { lat: a, lng: b };
    }
  }

  return null;
}

export function createDropCableRecordsFromDPs(params: {
  dps?: AnyAsset[];
  homes?: AnyAsset[];
  existingDrops?: AnyAsset[];
  maxDistanceM?: number;
}): GeneratedDrop[] {
  const {
    dps = [],
    homes = [],
    existingDrops = [],
    maxDistanceM = MAX_OH_DROP_METRES,
  } = params ?? {};

  console.log("DROP GEN DEBUG", {
    dps: dps.length,
    homes: homes.length,
    existingDrops: existingDrops.length,
  });

  const alreadyConnectedHomeIds = new Set<string>();

  for (const drop of existingDrops.filter(Boolean)) {
    const homeId =
      drop.homeId ??
      drop.toAssetId ??
      drop.connectedHomeId ??
      drop.uprn ??
      drop.UPRN;

    if (homeId != null) {
      alreadyConnectedHomeIds.add(String(homeId));
    }
  }

  const generated: GeneratedDrop[] = [];
  const allocatedHomeIds = new Set<string>(alreadyConnectedHomeIds);

  for (const dp of dps.filter(Boolean)) {
    const dpCoord = getAssetLatLng(dp);
    if (!dpCoord) continue;

    const dpId = String(dp.id ?? dp.assetId);
    if (!dpId || dpId === "undefined") continue;

    const capacity = getAutoDropCapacity(dp);
    if (capacity <= 0) continue;

    const nearbyHomes = homes
      .filter(Boolean)
      .map((home) => {
        const homeCoord = getAssetLatLng(home);
        if (!homeCoord) return null;

        const homeId = getHomeId(home);
        if (!homeId || homeId === "undefined") return null;
        if (allocatedHomeIds.has(homeId)) return null;

        const distanceM = haversineMetres(dpCoord, homeCoord);
        if (distanceM > maxDistanceM) return null;

        return {
          home,
          homeCoord,
          homeId,
          distanceM,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distanceM - b.distanceM)
      .slice(0, capacity);

    for (const item of nearbyHomes as Array<{
      home: AnyAsset;
      homeCoord: LatLng;
      homeId: string;
      distanceM: number;
    }>) {
      generated.push(
        createDropAsset({
          dp,
          home: item.home,
          dpCoord,
          homeCoord: item.homeCoord,
          distanceM: item.distanceM,
        })
      );

      allocatedHomeIds.add(item.homeId);
    }
  }

  console.log("DROP GEN CREATED", generated.length, generated);

  return generated;
}

function getHomeId(home: AnyAsset): string {
  return String(
    home?.id ??
      home?.assetId ??
      home?.homeId ??
      home?.uprn ??
      home?.UPRN ??
      home?.properties?.UPRN ??
      home?.properties?.uprn ??
      home?.properties?.homeId ??
      "",
  ).trim();
}

function getAutoDropCapacity(dp: AnyAsset): number {
  try {
    const summary = getDpCapacitySummary(dp as any, [], {});
    if (Number.isFinite(summary.capacity) && summary.capacity > 0) {
      return summary.capacity;
    }
  } catch {
    // Fall through to local defensive defaults below.
  }

  const details = dp?.dpDetails || dp?.properties?.dpDetails || {};
  const rawCapacity = Number(
    dp?.capacity ??
      dp?.dpCapacity ??
      dp?.afnCapacity ??
      dp?.ports ??
      details?.capacity ??
      details?.dpCapacity ??
      details?.afnCapacity ??
      details?.connectionsToHomes ??
      dp?.properties?.capacity ??
      dp?.properties?.dpCapacity ??
      dp?.properties?.afnCapacity ??
      dp?.properties?.ports,
  );

  if (Number.isFinite(rawCapacity) && rawCapacity > 0) return rawCapacity;

  const typeText = String(
    details?.closureType ||
      dp?.closureType ||
      dp?.dpType ||
      dp?.type ||
      dp?.jointType ||
      dp?.name ||
      "",
  ).toUpperCase();

  if (typeText.includes("AFN") || typeText.includes("SB")) return 24;
  if (typeText.includes("MDU")) return 24;
  return 12;
}

function createDropAsset({
  dp,
  home,
  dpCoord,
  homeCoord,
  distanceM,
}: {
  dp: AnyAsset;
  home: AnyAsset;
  dpCoord: LatLng;
  homeCoord: LatLng;
  distanceM: number;
}): GeneratedDrop {
  const dpId = String(dp?.id ?? dp?.assetId ?? "").trim();
  const homeId = getHomeId(home);
  const dpName = String(dp?.name ?? dp?.label ?? dpId).trim();
  const homeName = String(
    home?.name ??
      home?.label ??
      home?.address ??
      home?.properties?.address ??
      home?.uprn ??
      home?.UPRN ??
      homeId,
  ).trim();

  return {
    id: `drop-${dpId || "dp"}-${homeId || crypto.randomUUID()}`.replace(/[^A-Za-z0-9_-]/g, "-"),
    name: `Drop ${dpName} to ${homeName}`,
    assetType: "cable",
    jointType: "Drop Cable",
    cableType: "Drop",
    installMethod: "Overhead",
    fibreCount: "1F",
    dpId,
    fromAssetId: dpId,
    connectedDpId: dpId,
    homeId,
    toAssetId: homeId,
    connectedHomeId: homeId,
    distanceM: Math.round(distanceM * 10) / 10,
    geometry: {
      type: "LineString",
      coordinates: [
        [dpCoord.lat, dpCoord.lng],
        [homeCoord.lat, homeCoord.lng],
      ],
    },
    properties: {
      dpId,
      fromAssetId: dpId,
      connectedDpId: dpId,
      homeId,
      toAssetId: homeId,
      connectedHomeId: homeId,
      distanceM: Math.round(distanceM * 10) / 10,
      generatedBy: "auto-dp-drop",
    },
  };
}
