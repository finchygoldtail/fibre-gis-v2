import type { LatLngLiteral } from "leaflet";
import { getPathDistanceMeters } from "../../../utils/mapMeasure";

export const CABLE_SAVE_COORDINATE_DEDUPE_METERS = 0.35;

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
      getPathDistanceMeters([previous, next]) <= CABLE_SAVE_COORDINATE_DEDUPE_METERS
    ) {
      return;
    }

    cleaned.push(next);
  });

  return cleaned;
}

export function latLngLiteralToTuple(point: LatLngLiteral): [number, number] {
  return [point.lat, point.lng];
}

export function tuplesToLatLng(points: [number, number][]): LatLngLiteral[] {
  return points.map(([lat, lng]) => ({ lat, lng }));
}
