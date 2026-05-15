// =====================================================
// FILE: WorkspaceMap.tsx
// PURPOSE: Safe embedded Leaflet map for the Project Workspace.
//          This is a read-only scoped project map used by the
//          operational workspace shell. It deliberately does NOT
//          own Firestore storage, autosave, asset editing, home-drop
//          generation, or Fibre Tray parsing.
// =====================================================

import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SavedMapAsset } from "../map/types";
import OpenreachOverlayLayer, { type OpenreachLayerVisibility } from "../map/OpenreachOverlayLayer";

// =====================================================
// TYPES
// =====================================================

export type WorkspaceLayerVisibility = {
  projectBoundary: boolean;
  areas: boolean;
  cables: boolean;
  joints: boolean;
  dps: boolean;
  poles: boolean;
  chambers: boolean;
  streetCabs: boolean;
  homes: boolean;
  other: boolean;
};

type WorkspaceMapProps = {
  projectName: string;
  projectArea?: SavedMapAsset | null;
  assets: SavedMapAsset[];
  selectedAssetId?: string | null;
  showCableDistances?: boolean;
  openreachLayers?: OpenreachLayerVisibility;
  visibleLayers?: WorkspaceLayerVisibility;
  onAssetSelect?: (asset: SavedMapAsset) => void;
};

type WorkspaceBounds = [[number, number], [number, number]];

// =====================================================
// TILE LAYERS
// Keep this aligned with the current map stack:
// Leaflet + OSM + Esri imagery + optional hybrid labels.
// =====================================================

function WorkspaceBaseLayers() {
  return (
    <>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        maxZoom={22}
        maxNativeZoom={19}
      />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        opacity={0.35}
        maxZoom={22}
        maxNativeZoom={19}
      />
    </>
  );
}

// =====================================================
// SAFE MAP LIFECYCLE HELPERS
// These defensive calls avoid stale Leaflet pane/position reads
// when switching between the global map and the project workspace.
// =====================================================

function SafeMapLifecycle({ bounds }: { bounds: WorkspaceBounds | null }) {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const container = map.getContainer?.();
        if (!container || !container.isConnected) return;
        map.invalidateSize({ animate: false });

        if (bounds) {
          map.fitBounds(bounds, {
            padding: [42, 42],
            maxZoom: 18,
            animate: false,
          });
        }
      } catch {
        // Leaflet can briefly throw during workspace mount/unmount.
        // Ignore the frame; the next render will settle correctly.
      }
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [map, bounds]);

  return null;
}

// =====================================================
// ASSET NORMALISERS
// Stored geometry uses [lat, lng] throughout this app.
// =====================================================

function getAssetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.name || item.jointName || item.label || item.id || "Asset");
}

function getAssetType(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.assetType || item.type || item.jointType || "asset").toLowerCase();
}

function getPoint(asset: SavedMapAsset | null | undefined): LatLngLiteral | null {
  if (!asset) return null;
  const item = asset as any;

  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { lat: item.lat, lng: item.lng };
  }

  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates as any;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function getLinePoints(asset: SavedMapAsset | null | undefined): LatLngLiteral[] {
  if (!asset || asset.geometry?.type !== "LineString") return [];

  return ((asset.geometry.coordinates || []) as any[])
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function getPolygonRings(asset: SavedMapAsset | null | undefined): LatLngLiteral[][] {
  if (!asset || asset.geometry?.type !== "Polygon") return [];

  return ((asset.geometry.coordinates || []) as any[])
    .map((ring) =>
      (ring || [])
        .map(([lat, lng]: any[]) => ({ lat: Number(lat), lng: Number(lng) }))
        .filter((point: LatLngLiteral) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    )
    .filter((ring) => ring.length >= 3);
}

function getBoundsFromAssets(projectArea: SavedMapAsset | null | undefined, assets: SavedMapAsset[]): WorkspaceBounds | null {
  const points: LatLngLiteral[] = [];

  getPolygonRings(projectArea).forEach((ring) => points.push(...ring));

  assets.forEach((asset) => {
    const point = getPoint(asset);
    if (point) points.push(point);
    getLinePoints(asset).forEach((linePoint) => points.push(linePoint));
    getPolygonRings(asset).forEach((ring) => points.push(...ring));
  });

  if (!points.length) return null;

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function getCableColour(asset: SavedMapAsset): string {
  const item = asset as any;
  const type = `${item.cableType || ""} ${item.name || ""}`.toLowerCase();

  if (type.includes("drop")) return "#22c55e";
  if (type.includes("link")) return "#3b82f6";
  if (type.includes("distribution")) return "#f59e0b";
  if (type.includes("288")) return "#ef4444";
  if (type.includes("144")) return "#f97316";
  if (type.includes("96")) return "#eab308";
  if (type.includes("48")) return "#22c55e";
  return "#60a5fa";
}

function isOverhead(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const method = String(item.installMethod || item.method || "").toLowerCase();
  return method.includes("oh") || method.includes("overhead");
}

function getAssetMarkerIcon(asset: SavedMapAsset, selected: boolean) {
  const type = getAssetType(asset);
  const colour = selected
    ? "#facc15"
    : type.includes("distribution") || type.includes("dp")
      ? "#22c55e"
      : type.includes("pole")
        ? "#a3e635"
        : type.includes("chamber")
          ? "#f97316"
          : type.includes("street") || type.includes("cab")
            ? "#38bdf8"
            : type.includes("home")
              ? "#e5e7eb"
              : "#c084fc";

  return L.divIcon({
    className: "alistra-workspace-marker",
    html: `<div style="width:${selected ? 18 : 14}px;height:${selected ? 18 : 14}px;border-radius:999px;background:${colour};border:2px solid #020617;box-shadow:0 0 0 2px rgba(255,255,255,0.25),0 6px 14px rgba(0,0,0,0.45);"></div>`,
    iconSize: [selected ? 18 : 14, selected ? 18 : 14],
    iconAnchor: [selected ? 9 : 7, selected ? 9 : 7],
  });
}

function distanceMeters(points: LatLngLiteral[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += L.latLng(points[index - 1].lat, points[index - 1].lng).distanceTo(
      L.latLng(points[index].lat, points[index].lng),
    );
  }
  return total;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}


function selectWorkspaceAsset(asset: SavedMapAsset, onAssetSelect?: (asset: SavedMapAsset) => void, event?: any) {
  try {
    event?.originalEvent?.stopPropagation?.();
    event?.originalEvent?.preventDefault?.();
  } catch {
    // Defensive only: Leaflet event shape can differ by layer type.
  }
  onAssetSelect?.(asset);
}

function isLayerVisibleForAsset(asset: SavedMapAsset, visibleLayers: WorkspaceLayerVisibility): boolean {
  const type = getAssetType(asset);

  if (getLinePoints(asset).length >= 2) return visibleLayers.cables;
  if (getPolygonRings(asset).length > 0) return visibleLayers.areas;

  if (type.includes("home") || type.includes("premise") || type.includes("property") || type.includes("building")) {
    return visibleLayers.homes;
  }

  if (type.includes("distribution") || type === "dp" || type.includes("afn") || type.includes("cbt")) {
    return visibleLayers.dps;
  }

  if (type.includes("pole")) return visibleLayers.poles;
  if (type.includes("chamber")) return visibleLayers.chambers;
  if (type.includes("street") || type.includes("cab")) return visibleLayers.streetCabs;
  if (type.includes("joint") || type.includes("ag") || type.includes("lmj") || type.includes("cmj")) return visibleLayers.joints;

  return visibleLayers.other;
}

// =====================================================
// COMPONENT
// =====================================================

const DEFAULT_OPENREACH_LAYERS: OpenreachLayerVisibility = {
  ducts: true,
  trenches: true,
  spans: true,
  chambers: true,
  poles: true,
  labels: false,
};

export default function WorkspaceMap({
  projectName,
  projectArea,
  assets,
  selectedAssetId,
  showCableDistances = false,
  visibleLayers = {
    projectBoundary: true,
    areas: true,
    cables: true,
    joints: true,
    dps: true,
    poles: true,
    chambers: true,
    streetCabs: true,
    homes: true,
    other: true,
  },
  openreachLayers = DEFAULT_OPENREACH_LAYERS,
  onAssetSelect,
}: WorkspaceMapProps) {
  const bounds = useMemo(() => getBoundsFromAssets(projectArea, assets), [projectArea, assets]);
  const visibleAssets = useMemo(
    () => assets.filter((asset) => isLayerVisibleForAsset(asset, visibleLayers)),
    [assets, visibleLayers],
  );

  const pointAssets = useMemo(() => visibleAssets.filter((asset) => getPoint(asset)), [visibleAssets]);
  const cableAssets = useMemo(() => visibleAssets.filter((asset) => getLinePoints(asset).length >= 2), [visibleAssets]);
  const areaAssets = useMemo(
    () => visibleAssets.filter((asset) => getPolygonRings(asset).length > 0 && asset.id !== projectArea?.id),
    [visibleAssets, projectArea?.id],
  );

  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [53.795, -1.759];

  return (
    <div style={mapShell}>
      <MapContainer
        key={`workspace-map-${projectArea?.id || projectName}`}
        center={center}
        zoom={15}
        maxZoom={22}
        style={{ height: "100%", width: "100%" }}
        zoomControl
      >
        <WorkspaceBaseLayers />
        <SafeMapLifecycle bounds={bounds} />

        {visibleLayers.projectBoundary && projectArea &&
          getPolygonRings(projectArea).map((ring, index) => (
            <Polygon
              key={`project-boundary-${projectArea.id || index}`}
              positions={ring.map((point) => [point.lat, point.lng] as [number, number])}
              pathOptions={{ color: "#22c55e", weight: 4, fillOpacity: 0.06 }}
            >
              <Tooltip sticky>{projectName}</Tooltip>
            </Polygon>
          ))}

        {areaAssets.map((asset) =>
          getPolygonRings(asset).map((ring, index) => (
            <Polygon
              key={`workspace-area-${asset.id}-${index}`}
              positions={ring.map((point) => [point.lat, point.lng] as [number, number])}
              pathOptions={{ color: "#a855f7", weight: 2, fillOpacity: 0.08 }}
              eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
            >
              <Tooltip sticky>{getAssetName(asset)}</Tooltip>
            </Polygon>
          )),
        )}

        <OpenreachOverlayLayer assets={assets} visibleLayers={openreachLayers} />

        {cableAssets.map((asset) => {
          const points = getLinePoints(asset);
          const midpoint = points[Math.floor(points.length / 2)];

          return (
            <React.Fragment key={`workspace-cable-${asset.id}`}>
              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: "#ffffff",
                  weight: selectedAssetId === asset.id ? 24 : 18,
                  opacity: 0.01,
                  interactive: true,
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              />

              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: getCableColour(asset),
                  weight: selectedAssetId === asset.id ? 7 : 5,
                  opacity: selectedAssetId === asset.id ? 1 : 0.88,
                  dashArray: isOverhead(asset) ? "10, 8" : undefined,
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Tooltip sticky>
                  {getAssetName(asset)} · {formatDistance(distanceMeters(points))}
                </Tooltip>
              </Polyline>

              {showCableDistances && midpoint && (
                <Marker
                  position={[midpoint.lat, midpoint.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-cable-label",
                    html: `<div style="background:#020617;color:#f8fafc;border:1px solid rgba(96,165,250,0.8);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);">${formatDistance(distanceMeters(points))}</div>`,
                    iconSize: [1, 1],
                    iconAnchor: [0, 0],
                  })}
                />
              )}
            </React.Fragment>
          );
        })}

        {pointAssets.map((asset) => {
          const point = getPoint(asset);
          if (!point) return null;
          const selected = selectedAssetId === asset.id;

          return (
            <Marker
              key={`workspace-point-${asset.id}`}
              position={[point.lat, point.lng]}
              icon={getAssetMarkerIcon(asset, selected)}
              eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
            >
              <Popup>
                <strong>{getAssetName(asset)}</strong>
                <br />
                {getAssetType(asset)}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {!visibleAssets.length && (
        <div style={emptyOverlay}>
          <strong>No scoped assets found</strong>
          <span>This workspace is ready, but the selected area has no assets loaded.</span>
        </div>
      )}
    </div>
  );
}

// =====================================================
// STYLES
// =====================================================

const mapShell: React.CSSProperties = {
  position: "relative",
  height: "100%",
  minHeight: 455,
  width: "100%",
  overflow: "hidden",
  borderRadius: 8,
  background: "#020617",
};

const emptyOverlay: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 500,
  background: "rgba(2, 6, 23, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#e5e7eb",
  textAlign: "center",
  boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
};
