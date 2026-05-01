import type { LatLngLiteral } from "leaflet";

const MAP_VIEW_STORAGE_KEY = "fibre-gis-map-view-v1";

export type SavedMapView = {
  center?: LatLngLiteral;
  zoom?: number;
  activeProjectId?: string | null;
};

function isValidLatLng(value: unknown): value is LatLngLiteral {
  if (!value || typeof value !== "object") return false;

  const point = value as Partial<LatLngLiteral>;

  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  );
}

export function loadMapView(): SavedMapView | null {
  try {
    const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedMapView;

    return {
      center: isValidLatLng(parsed.center) ? parsed.center : undefined,
      zoom:
        typeof parsed.zoom === "number" && Number.isFinite(parsed.zoom)
          ? parsed.zoom
          : undefined,
      activeProjectId:
        typeof parsed.activeProjectId === "string"
          ? parsed.activeProjectId
          : null,
    };
  } catch {
    return null;
  }
}

export function saveMapView(nextView: SavedMapView): void {
  try {
    const current = loadMapView() ?? {};
    const merged: SavedMapView = {
      ...current,
      ...nextView,
    };

    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage failures so the map never breaks.
  }
}
