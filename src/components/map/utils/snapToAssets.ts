import type { LatLngLiteral } from "leaflet";
import { getDistanceMeters } from "../../../utils/mapMeasure";
import type { SavedMapAsset } from "../types";

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function getReferenceText(asset: any): string {
  return [
    asset?.source,
    asset?.assetType,
    asset?.jointType,
    asset?.cableType,
    asset?.name,
    asset?.piaRef,
    asset?.piaKind,
    asset?.routeType,
    asset?.referenceSubtype,
    asset?.importedProperties?.Name,
    asset?.importedProperties?.name,
    asset?.importedProperties?.Description,
    asset?.importedProperties?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isReferenceInfrastructureAsset(asset: any): boolean {
  const text = getReferenceText(asset);

  return (
    asset?.readOnly === true ||
    asset?.isReferenceAsset === true ||
    text.includes("openreach") ||
    text.includes("pia") ||
    text.includes("pol:") ||
    text.includes("mp:") ||
    text.includes("np:") ||
    text.includes("jc:") ||
    text.includes("ch:") ||
    text.includes("osp:") ||
    text.includes("missing pole") ||
    text.includes("or duct") ||
    text.includes("or chamber") ||
    text.includes("or pole")
  );
}

function isReferenceDuctRoute(asset: any): boolean {
  const text = getReferenceText(asset);
  const assetType = normalise(asset?.assetType);
  const geometryType = normalise(asset?.geometry?.type || asset?.geometryType);

  if (geometryType !== "linestring") return false;

  return (
    isReferenceInfrastructureAsset(asset) &&
    (assetType === "pia-route" ||
      text.includes("duct") ||
      text.includes("osp:") ||
      text.includes("cnd") ||
      text.includes("route") ||
      text.includes("or duct") ||
      text.includes("pia overlay"))
  );
}

const SNAP_TARGET_TYPES = [
  "pole",
  "distribution-point",
  "ag-joint",
  "joint",
  "lmj-joint",
  "chamber",
  "street-cabinet",
  "street-cab",
  "cabinet",
  "exchange",
  "data-centre",
  "data-centre-site",
  "data-center",
  "datacentre",
  "datacenter",
  "meet-me-chamber",
  "meet-me-lmj",
  "meet-me",
  "odf",
] as const;

function getPointPosition(asset: SavedMapAsset): LatLngLiteral | null {
  if (asset.geometry?.type !== "Point") return null;
  if (!Array.isArray(asset.geometry.coordinates)) return null;

  const [lat, lng] = asset.geometry.coordinates as any;
  const nextLat = Number(lat);
  const nextLng = Number(lng);

  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
  return { lat: nextLat, lng: nextLng };
}

function getLineCoordinates(asset: SavedMapAsset): LatLngLiteral[] {
  if (asset.geometry?.type !== "LineString") return [];
  if (!Array.isArray(asset.geometry.coordinates)) return [];

  return (asset.geometry.coordinates as any[])
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lat = Number(coord[0]);
      const lng = Number(coord[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((coord): coord is LatLngLiteral => Boolean(coord));
}

function projectPointToSegmentMeters(
  point: LatLngLiteral,
  start: LatLngLiteral,
  end: LatLngLiteral,
): { point: LatLngLiteral; distance: number } {
  const midLat = ((point.lat + start.lat + end.lat) / 3) * (Math.PI / 180);
  const metresPerDegreeLat = 111320;
  const metresPerDegreeLng = 111320 * Math.cos(midLat);

  const toXY = (p: LatLngLiteral) => ({
    x: p.lng * metresPerDegreeLng,
    y: p.lat * metresPerDegreeLat,
  });

  const fromXY = (x: number, y: number): LatLngLiteral => ({
    lat: y / metresPerDegreeLat,
    lng: x / metresPerDegreeLng,
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return { point: start, distance: getDistanceMeters(point, start) };
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
  );

  const projectedX = a.x + t * dx;
  const projectedY = a.y + t * dy;
  const projected = fromXY(projectedX, projectedY);

  return {
    point: projected,
    distance: getDistanceMeters(point, projected),
  };
}

function findNearestPointOnLine(
  point: LatLngLiteral,
  line: LatLngLiteral[],
): { point: LatLngLiteral; distance: number; segmentIndex: number; distanceAlongMeters: number } | null {
  if (line.length === 0) return null;
  if (line.length === 1) {
    return {
      point: line[0],
      distance: getDistanceMeters(point, line[0]),
      segmentIndex: 0,
      distanceAlongMeters: 0,
    };
  }

  let best:
    | { point: LatLngLiteral; distance: number; segmentIndex: number; distanceAlongMeters: number }
    | null = null;

  let walkedMeters = 0;

  for (let i = 0; i < line.length - 1; i += 1) {
    const start = line[i];
    const end = line[i + 1];
    const candidate = projectPointToSegmentMeters(point, start, end);
    const segmentLength = getDistanceMeters(start, end);
    const projectedDistanceOnSegment = Math.max(
      0,
      Math.min(segmentLength, getDistanceMeters(start, candidate.point)),
    );

    const nextCandidate = {
      ...candidate,
      segmentIndex: i,
      distanceAlongMeters: walkedMeters + projectedDistanceOnSegment,
    };

    if (!best || nextCandidate.distance < best.distance) {
      best = nextCandidate;
    }

    walkedMeters += segmentLength;
  }

  return best;
}


function normaliseInstallText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/-]+/g, " ");
}

export function shouldUseDuctTraceForInstallMethod(value: unknown): boolean {
  const text = normaliseInstallText(value);
  return (
    text === "ug" ||
    text.includes("underground") ||
    text.includes("duct") ||
    text.includes("sub duct") ||
    text.includes("subduct")
  );
}

function coordinatesAlmostEqual(a: LatLngLiteral, b: LatLngLiteral): boolean {
  return getDistanceMeters(a, b) <= 0.15;
}

function dedupeRoutePoints(points: LatLngLiteral[]): LatLngLiteral[] {
  const cleaned: LatLngLiteral[] = [];

  points.forEach((point) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    const previous = cleaned[cleaned.length - 1];
    if (previous && coordinatesAlmostEqual(previous, point)) return;
    cleaned.push(point);
  });

  return cleaned;
}

function traceAlongDuctLine(
  line: LatLngLiteral[],
  startSnap: { point: LatLngLiteral; segmentIndex: number; distanceAlongMeters: number },
  endSnap: { point: LatLngLiteral; segmentIndex: number; distanceAlongMeters: number },
): LatLngLiteral[] {
  if (line.length < 2) return [];

  const forward = startSnap.distanceAlongMeters <= endSnap.distanceAlongMeters;
  const route: LatLngLiteral[] = [];

  if (forward) {
    route.push(startSnap.point);

    for (let i = startSnap.segmentIndex + 1; i <= endSnap.segmentIndex; i += 1) {
      const vertex = line[i];
      if (vertex) route.push(vertex);
    }

    route.push(endSnap.point);
  } else {
    route.push(startSnap.point);

    for (let i = startSnap.segmentIndex; i > endSnap.segmentIndex; i -= 1) {
      const vertex = line[i];
      if (vertex) route.push(vertex);
    }

    route.push(endSnap.point);
  }

  return dedupeRoutePoints(route);
}

export function traceReferenceDuctRouteBetweenPoints(
  start: LatLngLiteral,
  end: LatLngLiteral,
  assets: SavedMapAsset[] = [],
  thresholdMeters = 35,
  selectedReferenceDuctId?: string | null,
): LatLngLiteral[] | null {
  let bestTrace:
    | { points: LatLngLiteral[]; score: number }
    | null = null;

  for (const asset of assets) {
    if (!asset?.geometry) continue;
    if (!isReferenceDuctRoute(asset)) continue;

    if (selectedReferenceDuctId && String(asset.id) !== String(selectedReferenceDuctId)) {
      continue;
    }

    const line = getLineCoordinates(asset);
    if (line.length < 2) continue;

    const startSnap = findNearestPointOnLine(start, line);
    const endSnap = findNearestPointOnLine(end, line);

    if (!startSnap || !endSnap) continue;

// Allow chamber clicks near the selected duct instead of
// forcing exact clicks directly on the polyline.
if (
  startSnap.distance > thresholdMeters ||
  endSnap.distance > thresholdMeters
) {
  continue;
}

    const points = traceAlongDuctLine(line, startSnap, endSnap);
    if (points.length < 2) continue;

    const traceLength = points.reduce((total, point, index) => {
      if (index === 0) return total;
      return total + getDistanceMeters(points[index - 1], point);
    }, 0);

    const score = startSnap.distance + endSnap.distance + traceLength * 0.001;

    if (!bestTrace || score < bestTrace.score) {
      bestTrace = { points, score };
    }
  }

  return bestTrace?.points ?? null;
}

export function snapPointToAssets(
  point: LatLngLiteral,
  assets: SavedMapAsset[] = [],
  enabled: boolean,
  thresholdMeters = 8,
): LatLngLiteral {
  if (!enabled) return point;

  let bestPoint: LatLngLiteral | null = null;
  let bestDistance = Infinity;

  for (const asset of assets) {
    if (!asset?.geometry) continue;

    if (asset.geometry.type === "Point") {
      const assetPoint = getPointPosition(asset);
      if (!assetPoint) continue;

      const isAllowedPointTarget =
        SNAP_TARGET_TYPES.includes(asset.assetType as any) ||
        isReferenceInfrastructureAsset(asset);

      if (!isAllowedPointTarget) continue;

      const distance = getDistanceMeters(point, assetPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = assetPoint;
      }

      continue;
    }

    // Safe OR duct assist:
    // snap to the nearest place on a read-only OR/PIA duct line, but do not
    // make the designed cable part of OR topology or save anything back to OR.
    if (isReferenceDuctRoute(asset)) {
      const nearest = findNearestPointOnLine(point, getLineCoordinates(asset));
      if (!nearest) continue;

      if (nearest.distance < bestDistance) {
        bestDistance = nearest.distance;
        bestPoint = nearest.point;
      }
    }
  }

  if (bestPoint && bestDistance <= thresholdMeters) {
    return bestPoint;
  }

  return point;
}
