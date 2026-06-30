import { getTupleDistanceMeters as distanceMeters } from "../../../utils/mapMeasure";
import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../types";
import { isDropCable } from "../utils/mapAssetGeometry";

type MarkAssetForLiveSync = (asset: SavedMapAsset, isNew?: boolean) => SavedMapAsset;

type Coordinate = [number, number];

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function isSameRef(value: unknown, targetId: string): boolean {
  return norm(value) === targetId;
}

function getDropDpRef(asset: any): string {
  return norm(
    asset?.dpId ??
      asset?.fromAssetId ??
      asset?.connectedDpId ??
      asset?.properties?.dpId ??
      asset?.properties?.fromAssetId ??
      asset?.properties?.connectedDpId ??
      "",
  );
}

function getDropHomeRef(asset: any): string {
  return norm(
    asset?.homeId ??
      asset?.toAssetId ??
      asset?.connectedHomeId ??
      asset?.uprn ??
      asset?.UPRN ??
      asset?.properties?.homeId ??
      asset?.properties?.toAssetId ??
      asset?.properties?.UPRN ??
      asset?.properties?.uprn ??
      "",
  );
}

function isCoordinateList(value: unknown): value is Coordinate[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    )
  );
}

function cloneCoords(value: unknown): Coordinate[] | null {
  if (!isCoordinateList(value)) return null;
  return value.map((point) => [Number(point[0]), Number(point[1])] as Coordinate);
}

function updateDropRoute(asset: any, movedDpId: string, newDpCoord: Coordinate): SavedMapAsset {
  const geometryCoords = cloneCoords(asset?.geometry?.coordinates);
  const fallbackCoords =
    geometryCoords ||
    cloneCoords(asset?.coordinates) ||
    cloneCoords(asset?.route) ||
    cloneCoords(asset?.path) ||
    cloneCoords(asset?.points);

  if (!fallbackCoords || fallbackCoords.length < 2) return asset as SavedMapAsset;

  const fromMatches =
    isSameRef(asset?.fromAssetId, movedDpId) ||
    isSameRef(asset?.dpId, movedDpId) ||
    isSameRef(asset?.properties?.fromAssetId, movedDpId) ||
    isSameRef(asset?.properties?.dpId, movedDpId);

  const toMatches =
    isSameRef(asset?.toAssetId, movedDpId) ||
    isSameRef(asset?.properties?.toAssetId, movedDpId);

  // Drop factory uses first coordinate as DP end. If a legacy drop is reversed,
  // support that too by checking toAssetId.
  const endpointIndex = toMatches && !fromMatches ? fallbackCoords.length - 1 : 0;
  const nextCoords = fallbackCoords.map((coord) => [...coord] as Coordinate);
  nextCoords[endpointIndex] = newDpCoord;

  const otherEnd = endpointIndex === 0 ? nextCoords[nextCoords.length - 1] : nextCoords[0];
  const nextDistance = Number.isFinite(otherEnd?.[0])
    ? Math.round(distanceMeters(newDpCoord, otherEnd) * 10) / 10
    : asset?.distanceM;

  return {
    ...(asset as any),
    distanceM: nextDistance,
    coordinates: nextCoords,
    route: nextCoords,
    path: nextCoords,
    points: nextCoords,
    geometry: {
      ...((asset as any).geometry || {}),
      type: "LineString",
      coordinates: nextCoords,
    },
    properties: {
      ...((asset as any).properties || {}),
      distanceM: nextDistance,
    },
  } as SavedMapAsset;
}

export function moveDropCablesForMovedDp(
  assets: SavedMapAsset[],
  movedDpId: string,
  newDpLocation: LatLngLiteral,
  markAssetForLiveSync: MarkAssetForLiveSync,
): SavedMapAsset[] {
  const cleanMovedDpId = norm(movedDpId);
  if (!cleanMovedDpId) return assets;

  const newDpCoord: Coordinate = [newDpLocation.lat, newDpLocation.lng];

  return (assets || []).map((asset: any) => {
    if (!isDropCable(asset as SavedMapAsset)) return asset;

    const dropDpRef = getDropDpRef(asset);
    const dropHomeRef = getDropHomeRef(asset);

    if (dropDpRef !== cleanMovedDpId && dropHomeRef !== cleanMovedDpId) {
      return asset;
    }

    const updatedDrop = updateDropRoute(asset, cleanMovedDpId, newDpCoord);
    if (updatedDrop === asset) return asset;

    return markAssetForLiveSync(updatedDrop);
  });
}
