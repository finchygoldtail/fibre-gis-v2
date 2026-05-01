import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../../../types/mapAssets";

type PolygonAsset = SavedMapAsset & {
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
};

const DEFAULT_PADDING_METERS = 30;

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

export function filterAssetsForProjectArea(
  assets: SavedMapAsset[],
  activeProjectArea: SavedMapAsset | null | undefined
): SavedMapAsset[] {
  if (!activeProjectArea || activeProjectArea.geometry?.type !== "Polygon") {
    return assets;
  }

  const polygonAsset = activeProjectArea as PolygonAsset;
  const polygon = polygonAsset.geometry.coordinates[0];

  if (!polygon?.length) return assets;

  const bounds = getPolygonBounds(polygon);

  return assets.filter((asset) => {
    if (asset.assetType === "area") return false;

    if (asset.geometry?.type === "Point") {
      const point = toPoint(asset.geometry.coordinates as [number, number]);
      return pointInBounds(point, bounds) && pointInPolygon(point, polygon);
    }

    if (asset.geometry?.type === "LineString") {
      const line = asset.geometry.coordinates as [number, number][];
      const inBounds = line.some((coord) => pointInBounds(toPoint(coord), bounds));
      return inBounds && lineTouchesPolygon(line, polygon);
    }

    return false;
  });
}
