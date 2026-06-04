import type { LatLngLiteral } from "leaflet";
import { getPathDistanceMeters } from "../../../utils/mapMeasure";
import type { SavedMapAsset } from "../types";

export function getAssetPoint(asset: SavedMapAsset): LatLngLiteral | null {
  if (
    typeof (asset as any).lat === "number" &&
    typeof (asset as any).lng === "number"
  ) {
    return { lat: (asset as any).lat, lng: (asset as any).lng };
  }

  if (
    asset.geometry?.type === "Point" &&
    Array.isArray(asset.geometry.coordinates)
  ) {
    const [lat, lng] = asset.geometry.coordinates as any;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

export function findDpAtCableEnd(
  assets: SavedMapAsset[],
  point: LatLngLiteral,
): SavedMapAsset | undefined {
  return assets.find((asset) => {
    if (asset.assetType !== "distribution-point") return false;
    const assetPoint = getAssetPoint(asset);
    if (!assetPoint) return false;
    return getPathDistanceMeters([assetPoint, point]) <= 10;
  });
}

export function getDistancePointToSegmentMeters(
  point: LatLngLiteral,
  start: LatLngLiteral,
  end: LatLngLiteral,
): number {
  const midLat = ((start.lat + end.lat + point.lat) / 3) * (Math.PI / 180);
  const toXY = (p: LatLngLiteral) => ({
    x: p.lng * 111320 * Math.cos(midLat),
    y: p.lat * 111320,
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
  );

  const projected = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };

  return Math.sqrt((p.x - projected.x) ** 2 + (p.y - projected.y) ** 2);
}

export function getDistancePointToLineMeters(
  point: LatLngLiteral,
  line: LatLngLiteral[],
): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return getPathDistanceMeters([point, line[0]]);

  let best = Infinity;

  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(
      best,
      getDistancePointToSegmentMeters(point, line[i], line[i + 1]),
    );
  }

  return best;
}

const CABLE_SAVE_COORDINATE_DEDUPE_METERS = 0.35;

export function sanitiseCableRouteCoordinates(
  points: LatLngLiteral[] | [number, number][],
): [number, number][] {
  if (!Array.isArray(points)) return [];

  const cleaned: [number, number][] = [];

  points.forEach((point: any) => {
    const lat = Number(Array.isArray(point) ? point[0] : point?.lat);
    const lng = Number(Array.isArray(point) ? point[1] : point?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const next: [number, number] = [lat, lng];
    const previous = cleaned[cleaned.length - 1];

    if (
      previous &&
      getPathDistanceMeters([previous, next]) <=
        CABLE_SAVE_COORDINATE_DEDUPE_METERS
    ) {
      return;
    }

    cleaned.push(next);
  });

  return cleaned;
}

export function findDpsAlongCable(
  assets: SavedMapAsset[],
  route: LatLngLiteral[],
  maxDistanceMeters = 15,
): SavedMapAsset[] {
  const seen = new Set<string>();

  return assets
    .filter((asset) => asset.assetType === "distribution-point")
    .map((asset) => {
      const assetPoint = getAssetPoint(asset);
      if (!assetPoint) return null;

      return {
        asset,
        distance: getDistancePointToLineMeters(assetPoint, route),
      };
    })
    .filter((item): item is { asset: SavedMapAsset; distance: number } =>
      Boolean(item),
    )
    .filter((item) => item.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.asset)
    .filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    });
}

export function isDropCable(asset: SavedMapAsset): boolean {
  return (
    asset.assetType === "cable" &&
    String((asset as any).cableType || "")
      .trim()
      .toLowerCase() === "drop"
  );
}
