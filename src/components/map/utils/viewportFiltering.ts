import type { LatLngLiteral } from "leaflet";
import type { OsmBounds } from "./loadOsmBuildings";
import type { SavedMapAsset } from "../types";
import {
  shouldRenderOpenreachAssetAtZoomLevel,
  shouldRenderOperationalAssetAtZoomLevel,
} from "../../../config/assetZoomRules";

// =====================================================
// VIEWPORT RENDER FILTERING
// Render-only optimisation: keep data loaded in memory, but only pass
// assets inside the current Leaflet screen bounds into heavy Leaflet layers.
// This does NOT write visibility flags and does NOT change Firestore reads.
// =====================================================
const VIEWPORT_PADDING_DEGREES = 0.0025;

function boundsWithPadding(bounds: OsmBounds | null, padding = VIEWPORT_PADDING_DEGREES): OsmBounds | null {
  if (!bounds) return null;
  return {
    south: bounds.south - padding,
    west: bounds.west - padding,
    north: bounds.north + padding,
    east: bounds.east + padding,
  };
}

function pointInsideBounds(point: LatLngLiteral, bounds: OsmBounds | null): boolean {
  if (!bounds) return true;
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

function assetRenderPoints(asset: SavedMapAsset): LatLngLiteral[] {
  const item = asset as any;

  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return [{ lat: item.lat, lng: item.lng }];
  }

  const geometry = asset.geometry;
  if (!geometry) return [];

  if (geometry.type === "Point") {
    const [lat, lng] = geometry.coordinates as any;
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? [{ lat: Number(lat), lng: Number(lng) }]
      : [];
  }

  if (geometry.type === "LineString") {
    return ((geometry.coordinates || []) as any[])
      .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  if (geometry.type === "Polygon") {
    return (((geometry.coordinates || [])[0] || []) as any[])
      .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  return [];
}

export function assetTouchesViewport(asset: SavedMapAsset, bounds: OsmBounds | null): boolean {
  const padded = boundsWithPadding(bounds);
  if (!padded) return true;
  const points = assetRenderPoints(asset);
  if (!points.length) return true;
  return points.some((point) => pointInsideBounds(point, padded));
}

export function shouldRenderOperationalAssetAtZoom(asset: SavedMapAsset, zoom: number): boolean {
  return shouldRenderOperationalAssetAtZoomLevel(asset, zoom);
}

export function shouldRenderOpenreachAssetAtZoom(asset: SavedMapAsset, zoom: number): boolean {
  return shouldRenderOpenreachAssetAtZoomLevel(asset, zoom);
}
