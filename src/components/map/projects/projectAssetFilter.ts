import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../../../types/mapAssets";
import { isAssetAssignedToProjectArea } from "../../../services/areaAssetIndex";

type PolygonAsset = SavedMapAsset & {
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: [number, number][][] | [number, number][][][];
  };
};

const DEFAULT_PADDING_METERS = 30;

function normText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isLineCableAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [
    item.assetType,
    item.type,
    item.cableType,
    item.category,
    item.properties?.assetType,
    item.properties?.type,
    item.properties?.cableType,
  ]
    .map(normText)
    .filter(Boolean)
    .join(" ");

  return asset.geometry?.type === "LineString" && (
    text.includes("cable") ||
    text.includes("feeder") ||
    text.includes("link") ||
    Boolean(item.fibreCount || item.fiberCount || item.installMethod)
  );
}

function isDropCableAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [
    item.assetType,
    item.type,
    item.cableType,
    item.category,
    item.name,
    item.label,
    item.properties?.assetType,
    item.properties?.type,
    item.properties?.cableType,
  ]
    .map(normText)
    .filter(Boolean)
    .join(" ");

  return (
    text.includes("drop") ||
    item.isDropCable === true ||
    item.generatedBy === "dp-home-drop" ||
    Boolean(item.connectedHomeId || item.homeId || item.properties?.connectedHomeId)
  );
}


function toPoint(coord: [number, number]): LatLngLiteral {
  return { lat: coord[0], lng: coord[1] };
}

function metersToDegreesLat(meters: number): number {
  return meters / 111_320;
}

function metersToDegreesLng(meters: number, latitude: number): number {
  const safeCos = Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
  return meters / (111_320 * safeCos);
}

function getPolygonBounds(points: [number, number][]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  const centreLat = (minLat + maxLat) / 2;
  const latPad = metersToDegreesLat(DEFAULT_PADDING_METERS);
  const lngPad = metersToDegreesLng(DEFAULT_PADDING_METERS, centreLat);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function pointInBounds(point: LatLngLiteral, bounds: ReturnType<typeof getPolygonBounds>): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}

function pointInPolygon(point: LatLngLiteral, polygon: [number, number][]): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function orientation(a: LatLngLiteral, b: LatLngLiteral, c: LatLngLiteral): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function onSegment(a: LatLngLiteral, b: LatLngLiteral, c: LatLngLiteral): boolean {
  return (
    Math.min(a.lng, c.lng) <= b.lng &&
    b.lng <= Math.max(a.lng, c.lng) &&
    Math.min(a.lat, c.lat) <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat)
  );
}

function segmentsIntersect(a: LatLngLiteral, b: LatLngLiteral, c: LatLngLiteral, d: LatLngLiteral): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function lineTouchesPolygon(line: [number, number][], polygon: [number, number][]): boolean {
  if (line.some((coord) => pointInPolygon(toPoint(coord), polygon))) return true;

  for (let lineIndex = 0; lineIndex < line.length - 1; lineIndex += 1) {
    const lineStart = toPoint(line[lineIndex]);
    const lineEnd = toPoint(line[lineIndex + 1]);

    for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
      const polyStart = toPoint(polygon[polygonIndex]);
      const polyEnd = toPoint(polygon[(polygonIndex + 1) % polygon.length]);

      if (segmentsIntersect(lineStart, lineEnd, polyStart, polyEnd)) return true;
    }
  }

  return false;
}

function getAreaOuterRings(area: PolygonAsset): [number, number][][] {
  if (area.geometry.type === "Polygon") {
    const ring = area.geometry.coordinates[0] as [number, number][] | undefined;
    return ring?.length ? [ring] : [];
  }

  return (area.geometry.coordinates as [number, number][][][])
    .map((polygon) => polygon[0])
    .filter((ring): ring is [number, number][] => Array.isArray(ring) && ring.length > 0);
}

export function filterAssetsForProjectArea(
  assets: SavedMapAsset[],
  activeProjectArea: SavedMapAsset | null | undefined
): SavedMapAsset[] {
  if (!activeProjectArea) {
    return assets;
  }

  const candidateAssets = assets.filter((asset) =>
    isAssetAssignedToProjectArea(asset, activeProjectArea),
  );

  if (
    activeProjectArea.geometry?.type !== "Polygon" &&
    activeProjectArea.geometry?.type !== "MultiPolygon"
  ) {
    return candidateAssets;
  }

  const polygonAsset = activeProjectArea as PolygonAsset;
  const polygons = getAreaOuterRings(polygonAsset);

  if (!polygons.length) return candidateAssets;

  return assets.filter((asset) => {
    if (asset.assetType === "area") return false;

    const isAssignedToThisArea = isAssetAssignedToProjectArea(asset, activeProjectArea);

    if (asset.geometry?.type === "Point") {
      if (!isAssignedToThisArea) return false;
      const point = toPoint(asset.geometry.coordinates as [number, number]);
      return polygons.some((polygon) => {
        const bounds = getPolygonBounds(polygon);
        return pointInBounds(point, bounds) && pointInPolygon(point, polygon);
      });
    }

    if (asset.geometry?.type === "LineString") {
      const line = asset.geometry.coordinates as [number, number][];
      const touchesThisArea = polygons.some((polygon) => {
        const bounds = getPolygonBounds(polygon);
        const inBounds = line.some((coord) => pointInBounds(toPoint(coord), bounds));
        return inBounds && lineTouchesPolygon(line, polygon);
      });

      // Network feeder/link cables are allowed to cross AG boundaries.
      // They should be visible in every workspace they pass through so the
      // topology engine can trace BAS -> BAW -> exchange without duplicating
      // the same cable. Drop cables remain area-scoped because they are tied
      // to individual homes and DPs.
      if (isLineCableAsset(asset) && !isDropCableAsset(asset)) {
        return touchesThisArea;
      }

      return isAssignedToThisArea && touchesThisArea;
    }

    return false;
  });
}
