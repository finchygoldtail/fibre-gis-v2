// =====================================================
// FILE: WorkspaceMap.tsx
// PURPOSE: Safe embedded Leaflet map for the Project Workspace.
//          This is a read-only scoped project map used by the
//          operational workspace shell. It deliberately does NOT
//          own Firestore storage, autosave, asset editing, home-drop
//          generation, or Fibre Tray parsing.
// PHASE 7 UI: Larger operational map canvas and clearer visual
//             scaling only. No storage/editing logic changed.
// =====================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SavedMapAsset } from "../map/types";
import OpenreachOverlayLayer, { type OpenreachLayerVisibility } from "../map/OpenreachOverlayLayer";
import type { NetworkState } from "../../services/network";
import { getDpIntelligence, isDpLikeAsset } from "../../services/dpIntelligence";

// =====================================================
// TYPES
// =====================================================

export type WorkspaceLayerVisibility = {
  projectBoundary: boolean;
  areas: boolean;
  cables: boolean;
  dropCables: boolean;
  joints: boolean;
  dps: boolean;
  poles: boolean;
  chambers: boolean;
  streetCabs: boolean;
  homes: boolean;
  homesConnected: boolean;
  homesUnconnected: boolean;
  homesLive: boolean;
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
  traceHighlightedAssetIds?: string[];
  traceHighlightKinds?: Record<string, string>;
  networkState?: NetworkState;
  managerAreaPoints?: LatLngLiteral[];
  managerAreaDrawMode?: boolean;
  onManagerAreaPointAdd?: (point: LatLngLiteral) => void;
  onManagerAreaClear?: () => void;
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

function ManagerAreaDrawingHandler({
  enabled,
  onPointAdd,
}: {
  enabled?: boolean;
  onPointAdd?: (point: LatLngLiteral) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPointAdd?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}


function WorkspaceViewportTracker({
  onChange,
}: {
  onChange: (bounds: WorkspaceBounds | null, zoom: number) => void;
}) {
  const map = useMap();

  const update = () => {
    try {
      const bounds = map.getBounds();
      onChange(
        [
          [bounds.getSouth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
        ],
        map.getZoom(),
      );
    } catch {
      // Ignore one frame during Leaflet mount/unmount.
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(update, 120);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useMapEvents({
    moveend: update,
    zoomend: update,
    load: update,
  });

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


type WorkspaceHomeStack = {
  id: string;
  assets: SavedMapAsset[];
  position: LatLngLiteral;
};

const WORKSPACE_HOME_STACK_DISTANCE_METERS = 1.75;

function distanceBetweenWorkspacePointsMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

function getWorkspaceHomeDisplayName(home: SavedMapAsset): string {
  const item = home as any;
  return String(
    item.address ||
      item.fullAddress ||
      item.name ||
      item.label ||
      item.uprn ||
      item.UPRN ||
      item.properties?.UPRN ||
      home.id ||
      "Home",
  );
}

function createWorkspaceHomeStackIcon(count: number) {
  const size = count >= 10 ? 42 : 36;

  return L.divIcon({
    className: "alistra-workspace-home-stack",
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;display:grid;place-items:center;background:#ef4444;color:#fff;border:3px solid #fff;box-shadow:0 0 0 3px rgba(239,68,68,0.35),0 8px 20px rgba(15,23,42,0.45);font-weight:900;font-size:0.82rem;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function groupWorkspaceHomeStacks(homes: SavedMapAsset[]): WorkspaceHomeStack[] {
  const remaining = [...homes];
  const stacks: WorkspaceHomeStack[] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const seedPoint = getPoint(seed);
    if (!seedPoint) continue;

    const group = [seed];

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      const candidatePoint = getPoint(candidate);
      if (!candidatePoint) continue;

      if (distanceBetweenWorkspacePointsMeters(seedPoint, candidatePoint) <= WORKSPACE_HOME_STACK_DISTANCE_METERS) {
        group.push(candidate);
        remaining.splice(index, 1);
      }
    }

    if (group.length < 2) continue;

    let latTotal = 0;
    let lngTotal = 0;
    group.forEach((home) => {
      const point = getPoint(home);
      if (!point) return;
      latTotal += point.lat;
      lngTotal += point.lng;
    });

    stacks.push({
      id: `workspace-home-stack-${group.map((home) => home.id).join("-")}`,
      assets: group,
      position: { lat: latTotal / group.length, lng: lngTotal / group.length },
    });
  }

  return stacks;
}

function normaliseHomeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function isDropCableByHome(asset: SavedMapAsset, home: SavedMapAsset): boolean {
  const item = asset as any;
  const homeId = String((home as any).id || "");
  const homeKeys = [
    homeId,
    String((home as any).uprn || ""),
    String((home as any).UPRN || ""),
    String((home as any).properties?.UPRN || ""),
    String((home as any).properties?.uprn || ""),
  ].filter(Boolean);

  if (!homeKeys.length) return false;

  const dropKeys = [
    item.fromAssetId,
    item.toAssetId,
    item.homeId,
    item.connectedHomeId,
    item.toHomeId,
    item.fromHomeId,
    item.uprn,
    item.UPRN,
  ].map((value) => String(value || ""));

  return isHomeDropCable(asset) && homeKeys.some((key) => dropKeys.includes(key));
}

function getWorkspaceHomeConnectionStatus(home: SavedMapAsset, allAssets: SavedMapAsset[]): "unconnected" | "connected" | "live" {
  const item = home as any;
  const ownStatus = normaliseHomeStatus(
    item.customerStatus ||
      item.homeStatus ||
      item.status ||
      item.buildStatus ||
      item.serviceStatus ||
      item.connectionStatus ||
      item.properties?.status,
  );

  if (ownStatus === "live") return "live";

  const metadataConnection = String(item.connection || item.properties?.connection || "").toLowerCase();
  if (item.connectedDpId || item.properties?.connectedDpId || item.dpId || metadataConnection === "connected") {
    return "connected";
  }

  const drop = allAssets.find((asset) => isDropCableByHome(asset, home));
  if (!drop) return "unconnected";

  const dropStatus = normaliseHomeStatus((drop as any).customerStatus || (drop as any).homeStatus || (drop as any).status);
  return dropStatus === "live" ? "live" : "connected";
}

function isHomeAssetForWorkspace(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const type = getAssetType(asset);
  const hasPoint = !!getPoint(asset);
  if (!hasPoint || isHomeDropCable(asset)) return false;

  return (
    type.includes("home") ||
    type.includes("premise") ||
    type.includes("property") ||
    type.includes("building") ||
    Boolean(item.uprn || item.UPRN || item.properties?.UPRN || item.properties?.uprn || item.homeId)
  );
}

function isHomeDropCable(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [item.assetType, item.type, item.cableType, item.name, item.label, item.category, item.generatedBy]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    text.includes("drop") ||
    text.includes("home drop") ||
    text.includes("home-drop") ||
    item.isDropCable === true ||
    item.isHomeDrop === true ||
    item.generatedDrop === true ||
    item.autoGeneratedDrop === true
  );
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


function getDpCapacityState(
  asset: SavedMapAsset,
  allAssets: SavedMapAsset[] = [],
): {
  colour: string;
  label: string;
  percent: number;
  connectedHomes: number;
  capacity: number;
  usedPorts: number;
  freePorts: number;
  capacityWarning: string;
} | null {
  if (!isDpLikeAsset(asset)) return null;

  const intelligence = getDpIntelligence(asset, allAssets);
  const percent = intelligence.capacityPercent;
  const baseState = {
    percent,
    connectedHomes: intelligence.connectedHomes,
    capacity: intelligence.capacity,
    usedPorts: intelligence.usedPorts,
    freePorts: intelligence.freePorts,
    capacityWarning: intelligence.capacityWarning,
  };

  if (intelligence.capacity <= 0) {
    return { ...baseState, colour: "#94a3b8", label: "No capacity", percent: 0 };
  }

  if (intelligence.capacityRisk === "OVER") {
    return { ...baseState, colour: "#a855f7", label: "Over capacity" };
  }

  if (intelligence.capacityRisk === "FULL") {
    return { ...baseState, colour: "#ef4444", label: "Full" };
  }

  if (intelligence.capacityRisk === "WARN") {
    return { ...baseState, colour: "#f59e0b", label: "Near capacity" };
  }

  return { ...baseState, colour: "#22c55e", label: "Capacity OK" };
}

function getAssetMarkerIcon(
  asset: SavedMapAsset,
  selected: boolean,
  traceKind: string | null = null,
  homeStatus?: "unconnected" | "connected" | "live",
  touchMode = false,
  allAssets: SavedMapAsset[] = [],
) {
  const type = getAssetType(asset);
  const traceColour = getTraceColour(traceKind);
  const dpCapacityState = getDpCapacityState(asset, allAssets);
  const colour = selected
    ? "#facc15"
    : traceColour
      ? traceColour
    : dpCapacityState
      ? dpCapacityState.colour
    : type.includes("distribution") || type.includes("dp")
      ? "#22c55e"
      : type.includes("pole")
        ? "#a3e635"
        : type.includes("chamber")
          ? "#f97316"
          : type.includes("street") || type.includes("cab")
            ? "#38bdf8"
            : isHomeAssetForWorkspace(asset)
              ? homeStatus === "live"
                ? "#16a34a"
                : homeStatus === "connected"
                  ? "#f59e0b"
                  : "#ef4444"
              : "#c084fc";

  const dotSize = touchMode ? (selected ? 28 : 22) : selected ? 18 : 14;
  const hitSize = touchMode ? 44 : dotSize;

  return L.divIcon({
    className: "alistra-workspace-marker",
    html: `<div style="width:${hitSize}px;height:${hitSize}px;display:grid;place-items:center;"><div style="width:${dotSize}px;height:${dotSize}px;border-radius:999px;background:${colour};border:2px solid #020617;box-shadow:0 0 0 2px rgba(255,255,255,0.25),0 0 14px ${colour},0 6px 14px rgba(0,0,0,0.45);"></div></div>`,
    iconSize: [hitSize, hitSize],
    iconAnchor: [hitSize / 2, hitSize / 2],
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

  if (getLinePoints(asset).length >= 2) return isHomeDropCable(asset) ? visibleLayers.dropCables : visibleLayers.cables;
  if (getPolygonRings(asset).length > 0) return visibleLayers.areas;

  if (isHomeAssetForWorkspace(asset)) {
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


const WORKSPACE_VIEWPORT_PADDING_DEGREES = 0.0025;
const WORKSPACE_MIN_ZOOM_HOMES = 17;
const WORKSPACE_MIN_ZOOM_DROPS = 18;
const WORKSPACE_MIN_ZOOM_CABLES = 14;
const WORKSPACE_MIN_ZOOM_OR_ROUTES = 15;
const WORKSPACE_MIN_ZOOM_OR_POINTS = 16;

function pointInWorkspaceBounds(point: LatLngLiteral, bounds: WorkspaceBounds | null): boolean {
  if (!bounds) return true;
  return (
    point.lat >= bounds[0][0] - WORKSPACE_VIEWPORT_PADDING_DEGREES &&
    point.lat <= bounds[1][0] + WORKSPACE_VIEWPORT_PADDING_DEGREES &&
    point.lng >= bounds[0][1] - WORKSPACE_VIEWPORT_PADDING_DEGREES &&
    point.lng <= bounds[1][1] + WORKSPACE_VIEWPORT_PADDING_DEGREES
  );
}

function assetInWorkspaceViewport(asset: SavedMapAsset, bounds: WorkspaceBounds | null): boolean {
  if (!bounds) return true;
  const points: LatLngLiteral[] = [];
  const point = getPoint(asset);
  if (point) points.push(point);
  points.push(...getLinePoints(asset));
  getPolygonRings(asset).forEach((ring) => points.push(...ring));
  if (!points.length) return true;
  return points.some((candidate) => pointInWorkspaceBounds(candidate, bounds));
}

function shouldRenderWorkspaceAssetAtZoom(asset: SavedMapAsset, zoom: number): boolean {
  const type = getAssetType(asset);
  if (isHomeDropCable(asset)) return zoom >= WORKSPACE_MIN_ZOOM_DROPS;
  if (isHomeAssetForWorkspace(asset)) return zoom >= WORKSPACE_MIN_ZOOM_HOMES;
  if (getLinePoints(asset).length >= 2) return zoom >= WORKSPACE_MIN_ZOOM_CABLES;
  return true;
}

function shouldRenderWorkspaceOpenreachAtZoom(asset: SavedMapAsset, zoom: number): boolean {
  if (getLinePoints(asset).length >= 2) return zoom >= WORKSPACE_MIN_ZOOM_OR_ROUTES;
  return zoom >= WORKSPACE_MIN_ZOOM_OR_POINTS;
}


function assetIdentityKeys(asset: SavedMapAsset): string[] {
  const item = asset as any;
  return [
    item.id,
    item.assetId,
    item.name,
    item.jointName,
    item.label,
    item.cableId,
    item.cableName,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function getTraceKind(
  asset: SavedMapAsset,
  highlightedAssetIds: string[],
  traceHighlightKinds: Record<string, string>,
): string | null {
  const highlighted = new Set(highlightedAssetIds.map((value) => String(value).toLowerCase()));
  const keys = assetIdentityKeys(asset);
  const matchedKey = keys.find((key) => highlighted.has(key) || traceHighlightKinds[key]);
  return matchedKey ? traceHighlightKinds[matchedKey] || "selected" : null;
}

function getTraceColour(kind: string | null): string | null {
  if (kind === "selected") return "#facc15";
  if (kind === "upstream") return "#38bdf8";
  if (kind === "downstream") return "#22c55e";
  if (kind === "branch") return "#f97316";
  if (kind === "home") return "#a78bfa";
  if (kind === "fibre") return "#e879f9";
  if (kind === "qa") return "#fb7185";
  return null;
}

// =====================================================
// COMPONENT
// =====================================================

const DEFAULT_OPENREACH_LAYERS: OpenreachLayerVisibility = {
  ducts: false,
  trenches: false,
  spans: false,
  chambers: false,
  poles: false,
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

  cables: false,
  dropCables: false,

  joints: true,
  dps: true,

  poles: false,
  chambers: false,
  streetCabs: false,
  homes: false,
  homesConnected: true,
  homesUnconnected: true,
  homesLive: true,

  other: false,

  },
  openreachLayers = DEFAULT_OPENREACH_LAYERS,
  traceHighlightedAssetIds = [],
  traceHighlightKinds = {},
  networkState,
  managerAreaPoints = [],
  managerAreaDrawMode = false,
  onManagerAreaPointAdd,
  onManagerAreaClear,
  onAssetSelect,
}: WorkspaceMapProps) {
  const [viewportBounds, setViewportBounds] = useState<WorkspaceBounds | null>(null);
  const [viewportZoom, setViewportZoom] = useState(15);
  const [isTouchWorkspace, setIsTouchWorkspace] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
      setIsTouchWorkspace(coarsePointer || window.innerWidth < 768);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  const bounds = useMemo(() => getBoundsFromAssets(projectArea, assets), [projectArea, assets]);
  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) => {
        if (!isLayerVisibleForAsset(asset, visibleLayers)) return false;

        if (isHomeAssetForWorkspace(asset)) {
          const homeStatus = getWorkspaceHomeConnectionStatus(asset, assets);
          if (homeStatus === "live" && visibleLayers.homesLive === false) return false;
          if (homeStatus === "connected" && visibleLayers.homesConnected === false) return false;
          if (homeStatus === "unconnected" && visibleLayers.homesUnconnected === false) return false;
        }

        return (
          assetInWorkspaceViewport(asset, viewportBounds) &&
          shouldRenderWorkspaceAssetAtZoom(asset, viewportZoom)
        );
      }),
    [assets, visibleLayers, viewportBounds, viewportZoom],
  );

  const visibleOpenreachAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          assetInWorkspaceViewport(asset, viewportBounds) &&
          shouldRenderWorkspaceOpenreachAtZoom(asset, viewportZoom),
      ),
    [assets, viewportBounds, viewportZoom],
  );

  const pointAssets = useMemo(() => visibleAssets.filter((asset) => getPoint(asset)), [visibleAssets]);
  const homePointAssets = useMemo(
    () => pointAssets.filter((asset) => isHomeAssetForWorkspace(asset)),
    [pointAssets],
  );
  const homeStacks = useMemo(
    () => groupWorkspaceHomeStacks(homePointAssets),
    [homePointAssets],
  );
  const stackedHomeIds = useMemo(
    () => new Set(homeStacks.flatMap((stack) => stack.assets.map((home) => home.id))),
    [homeStacks],
  );
  const renderPointAssets = useMemo(
    () => pointAssets.filter((asset) => !stackedHomeIds.has(asset.id)),
    [pointAssets, stackedHomeIds],
  );
  const cableAssets = useMemo(() => visibleAssets.filter((asset) => getLinePoints(asset).length >= 2), [visibleAssets]);
  const designCableAssets = useMemo(() => cableAssets.filter((asset) => !isHomeDropCable(asset)), [cableAssets]);
  const dropCableAssets = useMemo(() => cableAssets.filter(isHomeDropCable), [cableAssets]);
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
        zoomControl={!isTouchWorkspace}
        tap
        touchZoom
      >
        <WorkspaceBaseLayers />
        <SafeMapLifecycle bounds={bounds} />
        <WorkspaceViewportTracker
          onChange={(nextBounds, nextZoom) => {
            setViewportBounds(nextBounds);
            setViewportZoom(nextZoom);
          }}
        />
        <ManagerAreaDrawingHandler
          enabled={managerAreaDrawMode}
          onPointAdd={onManagerAreaPointAdd}
        />

        {managerAreaPoints.length > 0 && (
          <Polyline
            positions={managerAreaPoints.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: "#facc15",
              weight: 3,
              opacity: 0.95,
              dashArray: "6, 8",
            }}
          >
            <Tooltip sticky>Manager drawn area</Tooltip>
          </Polyline>
        )}

        {managerAreaPoints.length >= 3 && (
          <Polygon
            positions={managerAreaPoints.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: "#facc15",
              weight: 3,
              fillOpacity: 0.12,
              dashArray: "6, 8",
            }}
            eventHandlers={{ contextmenu: () => onManagerAreaClear?.() }}
          >
            <Tooltip sticky>Manager bulk update area</Tooltip>
          </Polygon>
        )}


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

        <OpenreachOverlayLayer assets={visibleOpenreachAssets} visibleLayers={openreachLayers} />

        {dropCableAssets.map((asset) => {
          const points = getLinePoints(asset);
          const midpoint = points[Math.floor(points.length / 2)];
          const traceKind = getTraceKind(asset, traceHighlightedAssetIds, traceHighlightKinds);
          const traceColour = getTraceColour(traceKind);
          const cableState = networkState?.cableStates[asset.id];

          return (
            <React.Fragment key={`workspace-drop-cable-${asset.id}`}>
              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: selectedAssetId === asset.id ? "#facc15" : traceColour || "#22c55e",
                  weight: selectedAssetId === asset.id || traceKind ? 6 : 3,
                  opacity: selectedAssetId === asset.id || traceKind ? 1 : 0.62,
                  dashArray: "4, 7",
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Tooltip sticky>
                  {getAssetName(asset)} · drop · {formatDistance(distanceMeters(points))}
                  {cableState ? ` · ${cableState.usedFibres}/${cableState.capacity || "?"}F` : ""}
                </Tooltip>
              </Polyline>

              {showCableDistances && selectedAssetId === asset.id && midpoint && (
                <Marker
                  position={[midpoint.lat, midpoint.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-drop-label",
                    html: `<div style="background:#052e16;color:#bbf7d0;border:1px solid rgba(34,197,94,0.8);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);">DROP ${formatDistance(distanceMeters(points))}</div>`,
                    iconSize: [1, 1],
                    iconAnchor: [0, 0],
                  })}
                />
              )}
            </React.Fragment>
          );
        })}

        {designCableAssets.map((asset) => {
          const points = getLinePoints(asset);
          const midpoint = points[Math.floor(points.length / 2)];
          const traceKind = getTraceKind(asset, traceHighlightedAssetIds, traceHighlightKinds);
          const traceColour = getTraceColour(traceKind);
          const cableState = networkState?.cableStates[asset.id];

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
                  weight: selectedAssetId === asset.id ? 8 : 5,
                  opacity: selectedAssetId === asset.id ? 1 : 0.9,
                  dashArray: isOverhead(asset) ? "10, 8" : undefined,
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Tooltip sticky>
                  {getAssetName(asset)} · {formatDistance(distanceMeters(points))}
                  {cableState ? ` · ${cableState.usedFibres}/${cableState.capacity || "?"}F · ${cableState.utilisationPercent}%` : ""}
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

        {homeStacks.map((stack) => (
          <Marker
            key={stack.id}
            position={[stack.position.lat, stack.position.lng]}
            icon={createWorkspaceHomeStackIcon(stack.assets.length)}
          >
            <Popup minWidth={300} maxWidth={360}>
              <strong>Stacked homes detected</strong>
              <br />
              {stack.assets.length} homes are sitting within {WORKSPACE_HOME_STACK_DISTANCE_METERS}m of each other.
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                {stack.assets.map((home) => {
                  const point = getPoint(home);
                  const status = getWorkspaceHomeConnectionStatus(home, assets);

                  return (
                    <div key={home.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 800 }}>{getWorkspaceHomeDisplayName(home)}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {status} · {point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "No coordinates"}
                      </div>
                      <button
                        type="button"
                        onClick={() => onAssetSelect?.(home)}
                        style={{ marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 8px", background: "#f8fafc", cursor: "pointer", fontWeight: 700 }}
                      >
                        Select Home
                      </button>
                    </div>
                  );
                })}
              </div>
            </Popup>
          </Marker>
        ))}

        {renderPointAssets.map((asset) => {
          const point = getPoint(asset);
          if (!point) return null;
          const selected = selectedAssetId === asset.id;
          const traceKind = getTraceKind(asset, traceHighlightedAssetIds, traceHighlightKinds);
          const homeStatus = isHomeAssetForWorkspace(asset) ? getWorkspaceHomeConnectionStatus(asset, assets) : undefined;
          const dpCapacityState = getDpCapacityState(asset, assets);

          return (
            <Marker
              key={`workspace-point-${asset.id}`}
              position={[point.lat, point.lng]}
              icon={getAssetMarkerIcon(asset, selected, traceKind, homeStatus, isTouchWorkspace, assets)}
              eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
            >
              <Popup>
                <strong>{getAssetName(asset)}</strong>
                <br />
                {getAssetType(asset)}
                {dpCapacityState ? (
                  <>
                    <br />
                    Connected Homes: {dpCapacityState.connectedHomes}
                    <br />
                    Capacity: {dpCapacityState.capacity}
                    <br />
                    Used Ports: {dpCapacityState.usedPorts}
                    <br />
                    Free Ports: {dpCapacityState.freePorts}
                    <br />
                    Capacity %: {Math.round(dpCapacityState.percent || 0)}%
                    <br />
                    Capacity Warning: {dpCapacityState.capacityWarning}
                  </>
                ) : null}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {isTouchWorkspace && visibleAssets.length > 0 && (
        <div style={touchMapHint}>
          Tap asset to select · pinch to zoom · drag to pan
        </div>
      )}

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
  minHeight: 548,
  width: "100%",
  overflow: "hidden",
  borderRadius: 12,
  background: "#020617",
};

const touchMapHint: React.CSSProperties = {
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 10,
  zIndex: 900,
  background: "rgba(2, 6, 23, 0.78)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  color: "#e5e7eb",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
  pointerEvents: "none",
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
