import L from "leaflet";
import type { LatLngLiteral } from "leaflet";

const DEFAULT_RENDER_BOUNDS_PADDING = 0.35;

export function getPaddedRenderBounds(
  bounds: L.LatLngBounds | null | undefined,
  padding = DEFAULT_RENDER_BOUNDS_PADDING,
): L.LatLngBounds | null {
  if (!bounds || !bounds.isValid?.()) return null;
  return bounds.pad(padding);
}

export function isLatLngInsideRenderBounds(
  point: LatLngLiteral | [number, number] | null | undefined,
  bounds: L.LatLngBounds | null | undefined,
): boolean {
  if (!bounds || !point) return true;

  const lat = Array.isArray(point) ? Number(point[0]) : Number(point.lat);
  const lng = Array.isArray(point) ? Number(point[1]) : Number(point.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  return bounds.contains([lat, lng]);
}

export function isLineStringInsideRenderBounds(
  points: [number, number][] | null | undefined,
  bounds: L.LatLngBounds | null | undefined,
): boolean {
  if (!bounds || !Array.isArray(points) || points.length === 0) return true;

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    if (bounds.contains([lat, lng])) return true;

    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return false;
  }

  return bounds.intersects(L.latLngBounds([minLat, minLng], [maxLat, maxLng]));
}
