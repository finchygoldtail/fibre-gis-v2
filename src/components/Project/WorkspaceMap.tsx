// =====================================================
// FILE: WorkspaceMap.tsx
// PURPOSE: Safe embedded Leaflet map for the Project Workspace.
//          This is a read-only scoped project map used by the
//          operational workspace shell. It deliberately does NOT
//          own Firestore storage, autosave, asset editing, home-drop
//          generation, or Fibre Tray parsing.
// Larger operational map canvas and clearer visual
//             scaling only. No storage/editing logic changed.
// =====================================================

import { getDistanceMeters as distanceBetweenWorkspacePointsMeters, getPathDistanceMeters } from "../../utils/mapMeasure";
import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
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
import OpenreachOverlayLayer, { type OpenreachLayerVisibility } from "../map/layers/OpenreachOverlayLayer";
import type { NetworkState } from "../../services/network";
import { getDpIntelligence, isDpLikeAsset } from "../../services/dpIntelligence";
import { getHomeConnectionStatus } from "../../services/homeIntelligence";
import { hasCanonicalHomeServiceException } from "./workspace/canonicalHomeStatus";
import {
  getDailyProgressTeamColour,
  getDailyProgressTotals,
} from "./workspace/workspaceOperations";

// =====================================================
// TYPES
// =====================================================

export type WorkspaceLayerVisibility = {
  projectBoundary: boolean;
  areas: boolean;
  ducts: boolean;
  cables: boolean;
  dropCables: boolean;
  joints: boolean;
  dps: boolean;
  poles: boolean;
  chambers: boolean;
  streetCabs: boolean;
  dataCentres: boolean;
  homes: boolean;
  homesConnected: boolean;
  homesUnconnected: boolean;
  homesLive: boolean;
  homesNotLive: boolean;
  other: boolean;
};

export type JobPackMapCaptureTarget = "overview" | "96F" | "48F" | "36F" | "24F" | "12F";

export type JobPackMapCaptureRequest = {
  id: number;
  target: JobPackMapCaptureTarget;
};

type WorkspaceMapProps = {
  projectName: string;
  projectArea?: SavedMapAsset | null;
  assets: SavedMapAsset[];
  openreachAssets?: SavedMapAsset[];
  selectedAssetId?: string | null;
  showCableDistances?: boolean;
  openreachLayers?: OpenreachLayerVisibility;
  visibleLayers?: WorkspaceLayerVisibility;
  traceHighlightedAssetIds?: string[];
  traceHighlightKinds?: Record<string, string>;
  networkState?: NetworkState;
  managerAreaPoints?: LatLngLiteral[];
  managerAreaDrawMode?: boolean;
  jobPackCaptureRequest?: JobPackMapCaptureRequest | null;
  onJobPackMapCaptured?: (target: JobPackMapCaptureTarget, imageDataUrl: string) => void;
  onManagerAreaPointAdd?: (point: LatLngLiteral) => void;
  onManagerAreaClear?: () => void;
  onAssetSelect?: (asset: SavedMapAsset) => void;
  onOpenDistributionPointEditor?: (asset: SavedMapAsset) => void;
  onOpenAudit?: (asset: SavedMapAsset) => void;
};

type WorkspaceBounds = [[number, number], [number, number]];
type WorkspaceBasemap = "street" | "satellite" | "hybrid";

// =====================================================
// TILE LAYERS
// Keep this aligned with the current map stack:
// Leaflet + OSM + Esri imagery + optional hybrid labels.
// =====================================================

function WorkspaceBaseLayers({ basemap }: { basemap: WorkspaceBasemap }) {
  if (basemap === "street") {
    return (
      <TileLayer
        key="workspace-street-basemap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={22}
        maxNativeZoom={19}
      />
    );
  }

  if (basemap === "satellite") {
    return (
      <TileLayer
        key="workspace-satellite-basemap"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri - Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        maxZoom={22}
        maxNativeZoom={19}
      />
    );
  }

  return (
    <>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri - Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
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

function SelectedWorkspaceAssetPopupHandler({
  selectedAssetId,
  assets,
  markerRefs,
}: {
  selectedAssetId?: string | null;
  assets: SavedMapAsset[];
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedAssetId) return;
    const asset = assets.find((item) => item.id === selectedAssetId);
    const point = getPoint(asset);
    if (!point) return;

    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 18), {
      animate: true,
    });

    window.setTimeout(() => {
      markerRefs.current.get(selectedAssetId)?.openPopup();
    }, 180);
  }, [assets, map, markerRefs, selectedAssetId]);

  return null;
}

function JobPackMapCaptureHandler({
  request,
  bounds,
  onCaptured,
}: {
  request?: JobPackMapCaptureRequest | null;
  bounds: WorkspaceBounds | null;
  onCaptured?: (target: JobPackMapCaptureTarget, imageDataUrl: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!request || !onCaptured) return;
    let cancelled = false;

    const capture = async () => {
      try {
        map.invalidateSize({ animate: false });
        if (bounds) {
          map.fitBounds(bounds, {
            padding: [70, 70],
            maxZoom: request.target === "overview" ? 17 : 19,
            animate: false,
          });
        }

        await new Promise((resolve) => window.setTimeout(resolve, 950));
        if (cancelled) return;

        const container = map.getContainer();
        const canvas = await html2canvas(container, {
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: 2,
          ignoreElements: (element) => {
            const node = element as HTMLElement;
            return Boolean(
              node.closest(".leaflet-control-container") ||
              node.closest(".leaflet-popup") ||
              node.closest(".leaflet-tooltip"),
            );
          },
        });
        if (!cancelled) onCaptured(request.target, canvas.toDataURL("image/png", 0.96));
      } catch (error) {
        console.warn("Job Pack map capture failed", error);
      }
    };

    capture();
    return () => {
      cancelled = true;
    };
  }, [bounds, map, onCaptured, request]);

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
  if (!asset) return [];

  const item = asset as any;
  const coordinates =
    asset.geometry?.type === "LineString"
      ? asset.geometry.coordinates
      : item.coordinates || item.route || item.path || item.points || item.properties?.coordinates;

  if (!Array.isArray(coordinates)) return [];

  return (coordinates as any[])
    .map((coordinate) => {
      if (Array.isArray(coordinate)) {
        const [lat, lng] = coordinate;
        return { lat: Number(lat), lng: Number(lng) };
      }

      return {
        lat: Number(coordinate?.lat ?? coordinate?.latitude),
        lng: Number(coordinate?.lng ?? coordinate?.lon ?? coordinate?.longitude),
      };
    })
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

function getBoundsFromProjectArea(projectArea: SavedMapAsset | null | undefined): WorkspaceBounds | null {
  const points = getPolygonRings(projectArea).flat();
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

function isDuctAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [item.assetType, item.type, item.jointType, item.name, item.label, item.category]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return text.includes("duct") && !text.includes("drop");
}

function getDailyRouteProgress(asset: SavedMapAsset) {
  const totals = getDailyProgressTotals(asset);
  const meters = totals.civilsMeters + totals.cablingMeters;
  const routeEntries = totals.entries.filter((entry) => entry.team === "civils" || entry.team === "cabling");
  const team = routeEntries.length ? routeEntries[routeEntries.length - 1].team : null;

  return { ...totals, meters, team, routeEntries };
}

function interpolateWorkspacePoint(a: LatLngLiteral, b: LatLngLiteral, ratio: number): LatLngLiteral {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lng: a.lng + (b.lng - a.lng) * ratio,
  };
}

function sliceWorkspaceLineByMeters(points: LatLngLiteral[], startMeter: number, endMeter: number): LatLngLiteral[] {
  if (points.length < 2 || endMeter <= startMeter) return [];

  const total = getPathDistanceMeters(points);
  const start = Math.max(0, Math.min(startMeter, total));
  const end = Math.max(start, Math.min(endMeter, total));
  if (end <= start) return [];

  const sliced: LatLngLiteral[] = [];
  let travelled = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const segmentLength = distanceBetweenWorkspacePointsMeters(a, b);
    const segmentStart = travelled;
    const segmentEnd = travelled + segmentLength;
    travelled = segmentEnd;

    if (!segmentLength || segmentEnd < start || segmentStart > end) continue;

    const fromRatio = Math.max(0, (start - segmentStart) / segmentLength);
    const toRatio = Math.min(1, (end - segmentStart) / segmentLength);
    const fromPoint = fromRatio <= 0 ? a : interpolateWorkspacePoint(a, b, fromRatio);
    const toPoint = toRatio >= 1 ? b : interpolateWorkspacePoint(a, b, toRatio);

    if (!sliced.length) sliced.push(fromPoint);
    else {
      const previous = sliced[sliced.length - 1];
      if (Math.abs(previous.lat - fromPoint.lat) > 0.0000001 || Math.abs(previous.lng - fromPoint.lng) > 0.0000001) {
        sliced.push(fromPoint);
      }
    }
    sliced.push(toPoint);
  }

  return sliced;
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

function formatWorkspaceFibreRanges(fibres?: number[]): string {
  if (!fibres?.length) return "";
  const sorted = [...fibres].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(", ");
}

function getDpFibreLabel(asset: SavedMapAsset): string {
  return "";
}

function isStreetCabAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const type = getAssetType(asset);
  const text = [item.assetType, item.type, item.name, item.label, item.cableId, item.category]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    type.includes("street") ||
    type.includes("cab") ||
    text.includes("street cab") ||
    text.includes("street-cab") ||
    /\bsb[\s-]?\d*\b/.test(text)
  );
}

function isDataCentreAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [item.assetType, item.type, item.name, item.label, item.category]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    item.assetType === "data-centre" ||
    text.includes("data centre") ||
    text.includes("data center") ||
    text.includes("datacentre") ||
    text.includes("datacenter")
  );
}

function getStreetCabLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  const raw = String(
    item.name ||
      item.label ||
      item.cabinetNumber ||
      item.cabNumber ||
      item.sbNumber ||
      item.properties?.name ||
      item.properties?.label ||
      "SB",
  ).trim();

  if (!raw) return "SB";
  return raw.toUpperCase().includes("SB") ? raw : `SB ${raw}`;
}

function getCableFibreCountLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  const value = item.fibreCount || item.fiberCount || item.coreCount || item.size || item.properties?.fibreCount || item.properties?.fiberCount;
  if (!value) return "";
  const text = String(value).trim().toUpperCase();
  if (!text) return "";
  return text.endsWith("F") ? text : `${text}F`;
}

function parseWorkspaceFibreNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function getWorkspaceCableUsageDisplay(
  asset: SavedMapAsset,
  cableState?: NetworkState["cableStates"][string],
): string {
  const item = asset as any;
  const explicitUsed = parseWorkspaceFibreNumber(
    item.usedFibres ??
      item.usedFibers ??
      item.usedCoreCount ??
      item.fibresUsed ??
      item.allocatedFibres ??
      item.properties?.usedFibres ??
      item.properties?.fibresUsed,
  );
  const capacity =
    parseWorkspaceFibreNumber(
      item.fibreCount ||
        item.fiberCount ||
        item.coreCount ||
        item.size ||
        item.properties?.fibreCount ||
        item.properties?.fiberCount,
    ) ||
    cableState?.capacity ||
    null;
  const used = explicitUsed ?? cableState?.usedFibres ?? null;

  if (used === null) return "";

  const percent =
    capacity && capacity > 0
      ? Math.min(100, Math.round((used / capacity) * 100))
      : cableState?.utilisationPercent;

  return `${used}/${capacity || "?"}F${percent !== undefined ? ` - ${percent}%` : ""}`;
}

function getCablePiaLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(
    item.piaNoiNumber ||
      item.piaNOINumber ||
      item.piaNoi ||
      item.piaNOI ||
      item.properties?.piaNoiNumber ||
      item.properties?.piaNOINumber ||
      item.properties?.piaNoi ||
      "",
  ).trim();
}

function getWorkspaceCableLabel(asset: SavedMapAsset, showPiaNoiLabel: boolean): string {
  const item = asset as any;
  const piaLabel = showPiaNoiLabel ? getCablePiaLabel(asset) : "";
  const fibreLabel = getCableFibreCountLabel(asset);
  const cableRef = String(item.cableId || item.cableName || item.name || item.label || "").trim();

  return [piaLabel ? `PIA ${piaLabel}` : cableRef, fibreLabel].filter(Boolean).join(" / ");
}

function getLineLabelPlacement(points: LatLngLiteral[]): { point: LatLngLiteral; angle: number } | null {
  if (points.length < 2) return null;
  const total = getPathDistanceMeters(points);
  const target = total / 2;
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segment = distanceBetweenWorkspacePointsMeters(start, end);
    if (travelled + segment >= target || index === points.length - 1) {
      const ratio = segment > 0 ? Math.max(0, Math.min(1, (target - travelled) / segment)) : 0;
      const point = {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      };
      let angle = Math.atan2(-(end.lat - start.lat), end.lng - start.lng) * (180 / Math.PI);
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return { point, angle };
    }
    travelled += segment;
  }

  return { point: points[Math.floor(points.length / 2)], angle: 0 };
}

function getAssetMarkerIcon(
  asset: SavedMapAsset,
  selected: boolean,
  traceKind: string | null = null,
  homeStatus?: "unconnected" | "connected" | "live",
  touchMode = false,
  allAssets: SavedMapAsset[] = [],
  showLabels = true,
) {
  const type = getAssetType(asset);
  const streetCab = isStreetCabAsset(asset);
  const dataCentre = isDataCentreAsset(asset);
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
          : streetCab
            ? "#38bdf8"
            : dataCentre
              ? "#22d3ee"
            : isHomeAssetForWorkspace(asset)
              ? homeStatus === "live"
                ? "#16a34a"
                : homeStatus === "connected"
                  ? "#f59e0b"
                  : "#ef4444"
              : "#c084fc";

  const dotSize = touchMode ? (selected ? 28 : 22) : selected ? 18 : 14;
  const hitSize = touchMode ? 44 : dotSize;
  const dpFibreLabel = type.includes("distribution") || type === "dp" || type.includes("afn") || type.includes("cbt")
    ? getDpFibreLabel(asset)
    : "";
  const streetCabLabel = showLabels && streetCab ? getStreetCabLabel(asset) : "";
  const dataCentreLabel = showLabels && dataCentre ? "DC" : "";
  const markerLabel = showLabels && dpFibreLabel ? `F${dpFibreLabel}` : streetCabLabel || dataCentreLabel;
  const labelHtml = markerLabel
    ? `<div style="position:absolute;left:50%;top:${hitSize - 2}px;transform:translateX(-50%);background:${streetCabLabel || dataCentreLabel ? "#0f172a" : "#ffffff"};color:${streetCabLabel || dataCentreLabel ? "#e0f2fe" : "#020617"};border:1px solid ${dataCentreLabel ? "rgba(34,211,238,0.85)" : streetCabLabel ? "rgba(56,189,248,0.85)" : "rgba(2,6,23,0.55)"};border-radius:4px;padding:1px 4px;font-size:10px;font-weight:900;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,0.22);">${markerLabel}</div>`
    : "";
  const extraHeight = markerLabel ? 18 : 0;

  return L.divIcon({
    className: "alistra-workspace-marker",
    html: `<div style="position:relative;width:${hitSize}px;height:${hitSize + extraHeight}px;display:grid;place-items:start center;"><div style="width:${hitSize}px;height:${hitSize}px;display:grid;place-items:center;"><div style="width:${dotSize}px;height:${dotSize}px;border-radius:999px;background:${colour};border:2px solid #020617;box-shadow:0 0 0 2px rgba(255,255,255,0.25),0 0 14px ${colour},0 6px 14px rgba(0,0,0,0.45);"></div></div>${labelHtml}</div>`,
    iconSize: [hitSize, hitSize + extraHeight],
    iconAnchor: [hitSize / 2, hitSize / 2],
  });
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

function getAuditButtonLabel(asset: SavedMapAsset): string {
  const type = getAssetType(asset).toLowerCase();
  if (type.includes("joint") || type.includes("cmj") || type.includes("midj") || type.includes("lmj")) return "Audit Joint";
  if (type.includes("chamber")) return "Audit Chamber";
  if (type.includes("pole")) return "Audit Pole";
  if (type.includes("distribution") || type === "dp") return "Audit DP";
  if (type.includes("cab")) return "Audit Street Cab";
  if (type.includes("home")) return "Audit Home";
  return "Audit Asset";
}

function hasAuditFormTemplate(asset: SavedMapAsset): boolean {
  const type = getAssetType(asset).toLowerCase();
  return (
    type.includes("joint") ||
    type.includes("cmj") ||
    type.includes("midj") ||
    type.includes("lmj") ||
    type.includes("chamber") ||
    type.includes("pole")
  );
}

function isLayerVisibleForAsset(asset: SavedMapAsset, visibleLayers: WorkspaceLayerVisibility): boolean {
  const type = getAssetType(asset);

  if (isDuctAsset(asset)) return visibleLayers.ducts;
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
  if (isStreetCabAsset(asset)) return visibleLayers.streetCabs;
  if (isDataCentreAsset(asset)) return visibleLayers.dataCentres;
  if (type.includes("joint") || type.includes("ag") || type.includes("lmj") || type.includes("midj") || type.includes("cmj")) return visibleLayers.joints;

  return visibleLayers.other;
}


const WORKSPACE_VIEWPORT_PADDING_DEGREES = 0.0025;
const WORKSPACE_MIN_ZOOM_HOMES = 17;
const WORKSPACE_MIN_ZOOM_DROPS = WORKSPACE_MIN_ZOOM_HOMES;
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
  if (isDuctAsset(asset)) return true;
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
  openreachAssets,
  selectedAssetId,
  showCableDistances = false,
  visibleLayers = {
    projectBoundary: true,
    areas: true,
    ducts: true,
    cables: false,
    dropCables: false,
    joints: true,
    dps: true,
    poles: false,
    chambers: false,
    streetCabs: true,
    dataCentres: true,
    homes: false,
    homesConnected: true,
    homesUnconnected: true,
    homesLive: true,
    homesNotLive: true,
    other: false,
  },
  openreachLayers = DEFAULT_OPENREACH_LAYERS,
  traceHighlightedAssetIds = [],
  traceHighlightKinds = {},
  networkState,
  managerAreaPoints = [],
  managerAreaDrawMode = false,
  jobPackCaptureRequest,
  onJobPackMapCaptured,
  onManagerAreaPointAdd,
  onManagerAreaClear,
  onAssetSelect,
  onOpenDistributionPointEditor,
  onOpenAudit,
}: WorkspaceMapProps) {
  const [viewportBounds, setViewportBounds] = useState<WorkspaceBounds | null>(null);
  const [viewportZoom, setViewportZoom] = useState(15);
  const [isTouchWorkspace, setIsTouchWorkspace] = useState(false);
  const [basemap, setBasemap] = useState<WorkspaceBasemap>("street");
  const [showMapLabels, setShowMapLabels] = useState(true);
  const [showPiaNoiLabels, setShowPiaNoiLabels] = useState(false);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

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

  useEffect(() => {
    if (!selectedAssetId) return;
    const marker = markerRefs.current.get(selectedAssetId);
    if (!marker) return;
    window.setTimeout(() => marker.openPopup(), 0);
  }, [selectedAssetId, viewportBounds, viewportZoom]);

  const jobPackCaptureAssets = useMemo(
    () => assets,
    [assets],
  );
  const projectAreaBounds = useMemo(() => getBoundsFromProjectArea(projectArea), [projectArea]);
  const assetBounds = useMemo(() => getBoundsFromAssets(projectArea, assets), [projectArea, assets]);
  const bounds = projectAreaBounds || assetBounds;
  const activeBounds = useMemo(
    () => jobPackCaptureRequest
      ? getBoundsFromAssets(
          projectArea,
          jobPackCaptureRequest.target === "overview"
            ? jobPackCaptureAssets
            : jobPackCaptureAssets.filter((asset) => getLinePoints(asset).length >= 2),
        )
      : bounds,
    [bounds, jobPackCaptureAssets, jobPackCaptureRequest, projectArea],
  );
  const visibleAssets = useMemo(
    () =>
      (jobPackCaptureRequest ? jobPackCaptureAssets : assets).filter((asset) => {
        if (!jobPackCaptureRequest && !isLayerVisibleForAsset(asset, visibleLayers)) return false;

        if (isHomeAssetForWorkspace(asset)) {
          const homeStatus = getHomeConnectionStatus(asset, assets, isHomeDropCable);
          const homeNotLive =
            homeStatus === "unconnected" ||
            hasCanonicalHomeServiceException(asset);
          if (homeStatus === "live" && visibleLayers.homesLive === false) return false;
          if (homeStatus === "connected" && visibleLayers.homesConnected === false) return false;
          if (homeStatus === "unconnected" && visibleLayers.homesUnconnected === false) return false;
          if (homeNotLive && visibleLayers.homesNotLive === false) return false;
        }

        if (jobPackCaptureRequest) return true;

        return (
          assetInWorkspaceViewport(asset, viewportBounds) &&
          shouldRenderWorkspaceAssetAtZoom(asset, viewportZoom)
        );
      }),
    [assets, jobPackCaptureAssets, jobPackCaptureRequest, visibleLayers, viewportBounds, viewportZoom],
  );

  const visibleOpenreachAssets = useMemo(() => {
    const sourceAssets =
      openreachAssets && openreachAssets.length > 0 ? openreachAssets : assets;

    return sourceAssets.filter(
      (asset) =>
        assetInWorkspaceViewport(asset, viewportBounds) &&
        shouldRenderWorkspaceOpenreachAtZoom(asset, viewportZoom),
    );
  }, [assets, openreachAssets, viewportBounds, viewportZoom]);

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
  const ductAssets = useMemo(() => cableAssets.filter(isDuctAsset), [cableAssets]);
  const designCableAssets = useMemo(() => cableAssets.filter((asset) => !isHomeDropCable(asset) && !isDuctAsset(asset)), [cableAssets]);
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
        <WorkspaceBaseLayers basemap={basemap} />
        <SafeMapLifecycle bounds={activeBounds} />
        <JobPackMapCaptureHandler
          request={jobPackCaptureRequest}
          bounds={activeBounds}
          onCaptured={onJobPackMapCaptured}
        />
        <WorkspaceViewportTracker
          onChange={(nextBounds, nextZoom) => {
            setViewportBounds(nextBounds);
            setViewportZoom(nextZoom);
          }}
        />
        <SelectedWorkspaceAssetPopupHandler
          selectedAssetId={selectedAssetId}
          assets={assets}
          markerRefs={markerRefs}
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

        <OpenreachOverlayLayer
          assets={visibleOpenreachAssets}
          visibleLayers={openreachLayers}
          onSelectReferenceAsset={(asset) => selectWorkspaceAsset(asset, onAssetSelect)}
        />

        {ductAssets.map((asset) => {
          const points = getLinePoints(asset);
          const labelPlacement = getLineLabelPlacement(points);
          const dailyProgress = getDailyRouteProgress(asset);

          return (
            <React.Fragment key={`workspace-duct-${asset.id}`}>
              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: "#ffffff",
                  weight: selectedAssetId === asset.id ? 26 : 20,
                  opacity: 0.01,
                  interactive: true,
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              />
              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: selectedAssetId === asset.id ? "#facc15" : "#f59e0b",
                  weight: selectedAssetId === asset.id ? 8 : 5,
                  opacity: 0.95,
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Tooltip sticky>
                  {getAssetName(asset)} - duct - {formatDistance(getPathDistanceMeters(points))}
                </Tooltip>
              </Polyline>
              {dailyProgress.routeEntries.map((entry) => {
                const startMeter = Number(entry.startMeter ?? 0);
                const endMeter = Number(entry.endMeter ?? startMeter + Number(entry.meters || 0));
                const segment = sliceWorkspaceLineByMeters(points, startMeter, endMeter);
                if (segment.length < 2) return null;

                return (
                  <Polyline
                    key={`workspace-duct-daily-${asset.id}-${entry.id}`}
                    positions={segment.map((point) => [point.lat, point.lng] as [number, number])}
                    pathOptions={{
                      color: "#22c55e",
                      weight: selectedAssetId === asset.id ? 13 : 10,
                      opacity: 0.98,
                    }}
                    eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
                  >
                    <Tooltip sticky>
                      {getAssetName(asset)} - completed {startMeter.toFixed(0)}m to {endMeter.toFixed(0)}m
                    </Tooltip>
                  </Polyline>
                );
              })}
              {showMapLabels && labelPlacement && viewportZoom >= 10 && (
                <Marker
                  position={[labelPlacement.point.lat, labelPlacement.point.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-duct-label",
                    html: `<div style="transform:translate(-50%,-50%) rotate(${labelPlacement.angle.toFixed(1)}deg);transform-origin:center;background:rgba(120,53,15,0.9);color:#fffbeb;border:1px solid rgba(251,191,36,0.8);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.28);">DUCT</div>`,
                    iconSize: [1, 1],
                    iconAnchor: [0, 0],
                  })}
                />
              )}
            </React.Fragment>
          );
        })}

        {dropCableAssets.map((asset) => {
          const points = getLinePoints(asset);
          const midpoint = points[Math.floor(points.length / 2)];
          const traceKind = getTraceKind(asset, traceHighlightedAssetIds, traceHighlightKinds);
          const traceColour = getTraceColour(traceKind);
          const cableState = networkState?.cableStates[asset.id];
          const cableUsageDisplay = getWorkspaceCableUsageDisplay(asset, cableState);

          return (
            <React.Fragment key={`workspace-drop-cable-${asset.id}`}>
              <Polyline
                positions={points.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: selectedAssetId === asset.id ? "#facc15" : traceColour || "#10b981",
                  weight: selectedAssetId === asset.id || traceKind ? 7 : 5,
                  opacity: selectedAssetId === asset.id || traceKind ? 1 : 0.9,
                  dashArray: "6, 7",
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Tooltip sticky>
                  {getAssetName(asset)} - drop - {formatDistance(getPathDistanceMeters(points))}
                  {cableUsageDisplay ? ` - ${cableUsageDisplay}` : ""}
                </Tooltip>
              </Polyline>

              {showCableDistances && selectedAssetId === asset.id && midpoint && (
                <Marker
                  position={[midpoint.lat, midpoint.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-drop-label",
                    html: `<div style="background:#052e16;color:#bbf7d0;border:1px solid rgba(34,197,94,0.8);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.35);">DROP ${formatDistance(getPathDistanceMeters(points))}</div>`,
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
          const labelPlacement = getLineLabelPlacement(points);
          const traceKind = getTraceKind(asset, traceHighlightedAssetIds, traceHighlightKinds);
          const traceColour = getTraceColour(traceKind);
          const cableState = networkState?.cableStates[asset.id];
          const cableUsageDisplay = getWorkspaceCableUsageDisplay(asset, cableState);
          const cableLabel = getWorkspaceCableLabel(asset, showPiaNoiLabels);
          const dailyProgress = getDailyRouteProgress(asset);

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
                  {getAssetName(asset)} - {formatDistance(getPathDistanceMeters(points))}
                  {cableUsageDisplay ? ` - ${cableUsageDisplay}` : ""}
                </Tooltip>
              </Polyline>
              {dailyProgress.routeEntries.map((entry) => {
                const startMeter = Number(entry.startMeter ?? 0);
                const endMeter = Number(entry.endMeter ?? startMeter + Number(entry.meters || 0));
                const segment = sliceWorkspaceLineByMeters(points, startMeter, endMeter);
                if (segment.length < 2) return null;

                return (
                  <Polyline
                    key={`workspace-cable-daily-${asset.id}-${entry.id}`}
                    positions={segment.map((point) => [point.lat, point.lng] as [number, number])}
                    pathOptions={{
                      color: "#22c55e",
                      weight: selectedAssetId === asset.id ? 13 : 10,
                      opacity: 0.98,
                    }}
                    eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
                  >
                    <Tooltip sticky>
                      {getAssetName(asset)} - completed {startMeter.toFixed(0)}m to {endMeter.toFixed(0)}m
                    </Tooltip>
                  </Polyline>
                );
              })}

              {showMapLabels && (showCableDistances || cableLabel) && labelPlacement && (
                <Marker
                  position={[labelPlacement.point.lat, labelPlacement.point.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-cable-label",
                    html: `<div style="transform:translate(-50%,-50%) rotate(${labelPlacement.angle.toFixed(1)}deg);transform-origin:center;background:rgba(255,255,255,0.88);color:#020617;border:1px solid rgba(2,6,23,0.62);border-radius:999px;padding:3px 7px;font-size:11px;font-weight:900;white-space:nowrap;text-shadow:none;box-shadow:0 3px 8px rgba(255,255,255,0.35);">${[cableLabel, showCableDistances ? formatDistance(getPathDistanceMeters(points)) : ""].filter(Boolean).join(" - ")}</div>`,
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
                  const status = getHomeConnectionStatus(home, assets, isHomeDropCable);

                  return (
                    <div key={home.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 800 }}>{getWorkspaceHomeDisplayName(home)}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {status} - {point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "No coordinates"}
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
          const homeStatus = isHomeAssetForWorkspace(asset) ? getHomeConnectionStatus(asset, assets, isHomeDropCable) : undefined;
          const dpCapacityState = getDpCapacityState(asset, assets);
          const dailyProgress = getDailyProgressTotals(asset);

          return (
            <React.Fragment key={`workspace-point-wrap-${asset.id}`}>
              <Marker
                key={`workspace-point-${asset.id}`}
                position={[point.lat, point.lng]}
                icon={getAssetMarkerIcon(asset, selected, traceKind, homeStatus, isTouchWorkspace, assets, showMapLabels)}
                ref={(marker) => {
                  if (marker) {
                    markerRefs.current.set(asset.id, marker);
                  } else {
                    markerRefs.current.delete(asset.id);
                  }
                }}
                eventHandlers={{ click: (event) => selectWorkspaceAsset(asset, onAssetSelect, event) }}
              >
                <Popup minWidth={260}>
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
                  {dailyProgress.spliceCount > 0 ? (
                    <>
                      <br />
                      Today spliced: {dailyProgress.spliceCount}
                    </>
                  ) : null}
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {hasAuditFormTemplate(asset) ? (
                      <button
                        type="button"
                        onClick={() => onOpenAudit?.(asset)}
                        style={workspacePopupButton}
                      >
                        {getAuditButtonLabel(asset)}
                      </button>
                    ) : null}
                    {isDpLikeAsset(asset) ? (
                      <button
                        type="button"
                        onClick={() => onOpenDistributionPointEditor?.(asset)}
                        style={workspacePopupSecondaryButton}
                      >
                        Open DP
                      </button>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
              {dailyProgress.spliceCount > 0 ? (
                <Marker
                  position={[point.lat, point.lng]}
                  interactive={false}
                  icon={L.divIcon({
                    className: "alistra-workspace-daily-splice-label",
                    html: `<div style="transform:translate(12px,-28px);background:${getDailyProgressTeamColour("splicing")};color:#fff;border:1px solid rgba(251,207,232,0.85);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.28);">SPLICE ${dailyProgress.spliceCount}</div>`,
                    iconSize: [1, 1],
                    iconAnchor: [0, 0],
                  })}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </MapContainer>

      <div style={basemapControl} aria-label="Workspace basemap selector">
        {(["street", "satellite", "hybrid"] as WorkspaceBasemap[]).map((option) => (
          <button
            key={option}
            type="button"
            style={basemap === option ? basemapButtonActive : basemapButton}
            onClick={() => setBasemap(option)}
          >
            {option === "street" ? "Street" : option === "satellite" ? "Satellite" : "Hybrid"}
          </button>
        ))}
        <button
          type="button"
          style={showMapLabels ? basemapButtonActive : basemapButton}
          onClick={() => setShowMapLabels((value) => !value)}
        >
          Labels {showMapLabels ? "On" : "Off"}
        </button>
        <button
          type="button"
          style={showPiaNoiLabels ? basemapButtonActive : basemapButton}
          onClick={() => setShowPiaNoiLabels((value) => !value)}
        >
          PIA Labels {showPiaNoiLabels ? "On" : "Off"}
        </button>
      </div>

      {isTouchWorkspace && visibleAssets.length > 0 && (
        <div style={touchMapHint}>
          Tap asset to select - pinch to zoom - drag to pan
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

const basemapControl: React.CSSProperties = {
  position: "absolute",
  left: 56,
  top: 12,
  zIndex: 900,
  display: "flex",
  gap: 6,
  padding: 6,
  background: "rgba(2, 6, 23, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 10,
  boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
};

const basemapButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.86)",
  color: "#cbd5e1",
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const basemapButtonActive: React.CSSProperties = {
  ...basemapButton,
  background: "#2563eb",
  color: "#fff",
  borderColor: "rgba(147,197,253,0.75)",
};

const workspacePopupButton: React.CSSProperties = {
  border: "none",
  borderRadius: 7,
  background: "#2563eb",
  color: "#ffffff",
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const workspacePopupSecondaryButton: React.CSSProperties = {
  ...workspacePopupButton,
  background: "#334155",
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


