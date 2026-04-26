import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../types";

function getDistanceMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const SNAP_TARGET_TYPES = [
  "pole",
  "distribution-point",
  "ag-joint",
  "lmj-joint",
  "chamber",
  "street-cabinet",
  "cabinet",
] as const;

export function snapPointToAssets(
  point: LatLngLiteral,
  assets: SavedMapAsset[],
  enabled: boolean,
  thresholdMeters = 8
): LatLngLiteral {
  if (!enabled) return point;

  const snapTargets = assets.filter((asset) => {
    if (asset.geometry.type !== "Point") return false;

    return SNAP_TARGET_TYPES.includes(asset.assetType as any);
  });

  let bestPoint: LatLngLiteral | null = null;
  let bestDistance = Infinity;

  for (const asset of snapTargets) {
    if (asset.geometry.type !== "Point") continue;

    const [lat, lng] = asset.geometry.coordinates;
    const candidate = { lat, lng };
    const distance = getDistanceMeters(point, candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  if (bestPoint && bestDistance <= thresholdMeters) {
    return bestPoint;
  }

  return point;
}