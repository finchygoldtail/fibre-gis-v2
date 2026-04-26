import type { LatLngLiteral } from "leaflet";

const EARTH_RADIUS_M = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function getDistanceMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const haversine =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_M * c;
}

export function getPathDistanceMeters(points: LatLngLiteral[]): number {
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += getDistanceMeters(points[i - 1], points[i]);
  }

  return total;
}

export function formatDistance(distance: number): string {
  if (distance < 1000) return `${distance.toFixed(1)} m`;
  return `${(distance / 1000).toFixed(3)} km`;
}