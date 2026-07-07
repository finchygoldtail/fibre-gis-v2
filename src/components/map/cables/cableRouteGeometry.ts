import L from "leaflet";

import { getTupleDistanceMeters as getDistanceMeters } from "../../../utils/mapMeasure";

export const ROUTE_EDIT_MIN_INSERT_SPAN_METERS = 20;
const ROUTE_COORDINATE_DEDUPE_METERS = 0.35;

export function getMidpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function sanitizeCableCoordinates(coordinates: [number, number][]): [number, number][] {
  if (!Array.isArray(coordinates)) return [];

  const cleaned: [number, number][] = [];

  coordinates.forEach((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return;

    const lat = Number(coord[0]);
    const lng = Number(coord[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const next: [number, number] = [lat, lng];
    const previous = cleaned[cleaned.length - 1];

    if (previous && getDistanceMeters(previous, next) <= ROUTE_COORDINATE_DEDUPE_METERS) {
      return;
    }

    cleaned.push(next);
  });

  return cleaned;
}

export function getRouteEditHandleIndexes(points: [number, number][]): number[] {
  if (points.length <= 2) return points.map((_, index) => index);

  const indexes = new Set<number>([0, points.length - 1]);

  points.forEach((point, index) => {
    if (index === 0 || index === points.length - 1) return;

    const previous = points[index - 1];
    const next = points[index + 1];

    if (!previous || !next) return;

    const span = getDistanceMeters(previous, next);
    const previousLeg = getDistanceMeters(previous, point);
    const nextLeg = getDistanceMeters(point, next);

    if (span >= 120 || previousLeg >= 80 || nextLeg >= 80) {
      indexes.add(index);
    }
  });

  return Array.from(indexes).sort((a, b) => a - b);
}

export function getRouteEditInsertSegmentIndexes(
  points: [number, number][],
  handleIndexes: number[],
): number[] {
  const handleSet = new Set(handleIndexes);
  const indexes: number[] = [];

  points.slice(0, -1).forEach((point, index) => {
    const next = points[index + 1];
    if (!next) return;

    if (!handleSet.has(index) && !handleSet.has(index + 1)) return;

    if (getDistanceMeters(point, next) >= ROUTE_EDIT_MIN_INSERT_SPAN_METERS) {
      indexes.push(index);
    }
  });

  return indexes;
}

export function getCableSpanAngleDegrees(a: [number, number], b: [number, number]): number {
  const y = b[0] - a[0];
  const x = b[1] - a[1];
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function getOffsetCableLabelPosition(
  a: [number, number],
  b: [number, number],
): [number, number] {
  const midpoint = getMidpoint(a, b);
  const length = getDistanceMeters(a, b);
  if (length === 0) return midpoint;

  const latDelta = b[0] - a[0];
  const lngDelta = b[1] - a[1];
  const normalLat = -lngDelta;
  const normalLng = latDelta;
  const magnitude = Math.sqrt(normalLat * normalLat + normalLng * normalLng) || 1;
  const offsetMeters = 5;
  const latOffset = (normalLat / magnitude) * (offsetMeters / 111_320);
  const lngOffset =
    (normalLng / magnitude) *
    (offsetMeters / (111_320 * Math.max(Math.cos((midpoint[0] * Math.PI) / 180), 0.000001)));

  return [midpoint[0] + latOffset, midpoint[1] + lngOffset];
}

export function getCableDistanceLabelIcon(label: string, angleDegrees: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        transform: rotate(${angleDegrees}deg);
        transform-origin: center;
        background: rgba(15,23,42,0.82);
        color: #ffffff;
        border: 1px solid rgba(255,255,255,0.65);
        border-radius: 999px;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(15,23,42,0.25);
      ">${label}</div>
    `,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}
