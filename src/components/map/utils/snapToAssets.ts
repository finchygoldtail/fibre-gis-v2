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


function isReferenceInfrastructureAsset(asset: any): boolean {
  const haystack = [
    asset?.source,
    asset?.assetType,
    asset?.jointType,
    asset?.cableType,
    asset?.name,
    asset?.piaRef,
    asset?.piaKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    asset?.readOnly === true ||
    asset?.isReferenceAsset === true ||
    haystack.includes("openreach") ||
    haystack.includes("pia") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:") ||
    haystack.includes("osp:") ||
    haystack.includes("missing pole")
  );
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
  assets: SavedMapAsset[] = [],
  enabled: boolean,
  thresholdMeters = 8
): LatLngLiteral {
  if (!enabled) return point;

  const snapTargets = assets.filter((asset) => {
    if (!asset) return false;
    if (!asset.geometry) return false;
    // OR / PIA reference assets are read-only, but they ARE valid snap targets.
    // Do not exclude them here: they are excluded from editing/topology elsewhere.
    if (asset.geometry.type !== "Point") return false;
    if (!Array.isArray(asset.geometry.coordinates)) return false;

    const assetType = String((asset as any).assetType || "").toLowerCase();
    const jointType = String((asset as any).jointType || "").toLowerCase();

    if (SNAP_TARGET_TYPES.includes(asset.assetType as any)) return true;

    // Allow OR / PIA reference poles and chambers to be snap-only targets.
    return (
      isReferenceInfrastructureAsset(asset) &&
      (assetType === "pole" ||
        assetType === "chamber" ||
        jointType.includes("pole") ||
        jointType.includes("chamber"))
    );
  });

  let bestPoint: LatLngLiteral | null = null;
  let bestDistance = Infinity;

  for (const asset of snapTargets) {
    const [lat, lng] = asset.geometry.coordinates;

    if (typeof lat !== "number" || typeof lng !== "number") {
      continue;
    }

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