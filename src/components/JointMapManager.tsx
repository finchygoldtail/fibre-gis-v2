// =====================================================
// FILE: JointMapManager.tsx
// PURPOSE: Main Alistra GIS map, asset editor, cable drawing,
//          area inspection, layer controls, and project map UI.
// NOTE: Section headers are intentionally verbose so this large
//       file is easier to maintain while the app is still evolving.
// =====================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import { auth } from "../firebase";
import { useAppMode } from "../context/AppModeContext";
import AppModeSwitch from "./AppModeSwitch";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import AreaPolygonsLayer from "./map/AreaPolygonsLayer";
import ExchangeDesigner from "./exchange/ExchangeDesigner";
import { formatDistance, getPathDistanceMeters } from "../utils/mapMeasure";
import { getNextAssetName } from "../utils/mapAssetNames";
import MapContextMenu, { type MapContextAction } from "./map/MapContextMenu";
import LayersPanel from "./map/LayersPanel";
import AssetMarkersLayer from "./map/AssetMarkersLayer";
import CableLinesLayer from "./map/CableLinesLayer";
import OpenreachOverlayLayer from "./map/OpenreachOverlayLayer";
import CableDetailsModal from "./map/CableDetailsModal";
import AreaAssetInspector from "./map/AreaAssetInspector";
import { loadMapView, saveMapView } from "./map/mapViewMemory";
import PoleDetailsModal from "./map/modals/PoleDetailsModal";
import DistributionPointDetailsModal from "./map/modals/DistributionPointDetailsModal";
import ChamberDetailsModal, {
  type ChamberDetails,
} from "./map/modals/ChamberDetailsModal";
import UserMenu from "./UserMenu";
import MaintenanceAuditOverlay from "./map/audit/MaintenanceAuditOverlay";
import { createAssetChangeLog } from "./map/audit/assetChangeLogStorage";
import type { AssetChangeAction } from "./map/audit/types";
import {
  createAssetActivityLog,
  formatActivityTimestamp,
  getAssetActivityMetadata,
  withAssetEditedMetadata,
  withAssetViewedMetadata,
} from "../services/assetActivityService";
import {
  shouldUseDuctTraceForInstallMethod,
  snapPointToAssets,
  traceReferenceDuctRouteBetweenPoints,
} from "./map/utils/snapToAssets";
import {
  buildNetworkGraph,
  findDisconnectedAssets,
} from "../services/networkGraph";
import { clearDpFibreAllocationsForAssets } from "../services/network";

import { routePointsToRoads } from "./map/utils/routeToRoads";
import {
  loadOsmBuildingsAsHomes,
  type OsmBounds,
} from "./map/utils/loadOsmBuildings";
import {
  createDropCableRecordsFromDPs,
  getAssetLatLng,
} from "./map/utils/generateDrops";
import StreetCabDesigner from "./streetcab/StreetCabDesigner";
import DistributionPointEditor from "./dp/DistributionPointEditor";
import ProjectAreaSelector from "./map/projects/ProjectAreaSelector";
import { filterAssetsForProjectArea } from "./map/projects/projectAssetFilter";
import {
  loadProjectHomes,
  saveProjectHomes,
} from "./map/projects/projectHomesStorage";
import { ExchangeMarkersLayer } from "./map/ExchangeMarkersLayer";
import AssetDetailsSidebarSections from "./map/AssetDetailsSidebarSections";
import ProjectWorkspace from "./Project/ProjectWorkspace";
import type {
  AssetType,
  CableType,
  DistributionPointDetails,
  FibreCount,
  InstallMethod,
  PoleDetails,
  SavedMapAsset,
} from "./map/types";
import {
  deleteExchange,
  loadExchange,
  loadExchanges,
  saveExchange,
  type ExchangeAsset,
} from "./map/storage/exchangeStorage";
// Split storage is disabled during storage-integrity recovery.
// Main chunks are the only authoritative save/load path.
import {
  isOpenreachReferenceAsset,
  loadOrAssets,
  mergeAndSaveOrAssets,
  normaliseOpenreachAsset,
  saveOrAssets,
} from "../services/orAssetStorage";
export type SavedJoint = SavedMapAsset;
export type { SavedMapAsset };

/* Fix default leaflet icons */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function makeMeasureLabelIcon(text: string) {
  return L.divIcon({
    className: "alistra-measure-label",
    html: `<div style="background:#0f172a;color:#ffffff;border:1px solid #60a5fa;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:700;box-shadow:0 4px 12px rgba(15,23,42,0.35);white-space:nowrap;">${text}</div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

type Props = {
  currentJointName: string;
  currentJointType: string;
  currentMappingRows: any[][];
  savedJoints: SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  onClose: () => void;
  onOpenJoint: (joint: SavedMapAsset) => void;
  onOpenAutoNetwork?: (areaAsset?: SavedMapAsset | null) => void;
};

// =====================================================
// LIVE SYNC TRACKING
// Every saved map change passes through this helper so
// Firestore sees a new object and all users/tablets get
// a fresh onSnapshot update.
// =====================================================
function markAssetForLiveSync(
  asset: SavedMapAsset,
  isNew: boolean = false,
): SavedMapAsset {
  const user = auth.currentUser;
  const now = new Date().toISOString();

  const currentMetadata = ((asset as any).metadata || {}) as Record<
    string,
    unknown
  >;
  const userEmail = user?.email || "unknown";
  const userUid = user?.uid || "unknown";

  return {
    ...(asset as any),
    ...(isNew
      ? {
          createdAt: (asset as any).createdAt || now,
          createdByUid: (asset as any).createdByUid || userUid,
          createdByEmail: (asset as any).createdByEmail || userEmail,
        }
      : {}),
    updatedAt: now,
    updatedByUid: userUid,
    updatedByEmail: userEmail,
    lastEditedAt: now,
    lastEditedByUid: userUid,
    lastEditedByEmail: userEmail,
    metadata: {
      ...currentMetadata,
      ...(isNew
        ? {
            createdAt: currentMetadata.createdAt || now,
            createdBy: currentMetadata.createdBy || userEmail,
            createdByUid: currentMetadata.createdByUid || userUid,
          }
        : {}),
      lastEditedAt: now,
      lastEditedBy: userEmail,
      lastEditedByUid: userUid,
    },
    syncRevision: now,
  } as SavedMapAsset;
}

function requestChangeReason(
  action: AssetChangeAction,
  assetName?: string,
): string | null {
  const label = assetName ? ` for ${assetName}` : "";
  const reason = window.prompt(
    `Reason required: why was this asset ${action}${label}?`,
    "",
  );

  if (reason === null) return null;

  const trimmed = reason.trim();
  if (!trimmed) {
    alert("A reason is required so this change can be audited later.");
    return null;
  }

  return trimmed;
}

function AssetActivityMiniSummary({ asset }: { asset: SavedMapAsset | null }) {
  if (!asset) return null;
  const activity = getAssetActivityMetadata(asset);
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 11,
    color: "#cbd5e1",
    marginTop: 4,
  };
  const labelStyle: React.CSSProperties = { color: "#94a3b8" };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        border: "1px solid #334155",
        borderRadius: 8,
        background: "#020617",
      }}
    >
      <div style={{ fontWeight: 700, color: "#e5e7eb", marginBottom: 6 }}>
        Asset Activity
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Last viewed</span>
        <span>{formatActivityTimestamp(activity.lastViewedAt)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Viewed by</span>
        <span>{activity.lastViewedBy || "Not recorded"}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Last edited</span>
        <span>{formatActivityTimestamp(activity.lastEditedAt)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Edited by</span>
        <span>{activity.lastEditedBy || "Not recorded"}</span>
      </div>
      {activity.lastChangeReason ? (
        <div style={{ ...rowStyle, alignItems: "flex-start" }}>
          <span style={labelStyle}>Last reason</span>
          <span style={{ textAlign: "right", maxWidth: 150 }}>
            {activity.lastChangeReason}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type MapMode =
  | "pick"
  | "measure"
  | "draw-cable"
  | "draw-area"
  | "move-homes"
  | "survey-delete-homes";

type BasemapType = "street" | "satellite" | "hybrid" | "dark";

type AreaLevel = "L0" | "L1" | "L2" | "L3";

type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
  dropCables: boolean;
  areas: boolean;
  measurements: boolean;
  cableDistances: boolean;
  homes: boolean;
  l0: boolean;
  l1: boolean;
  l2: boolean;
  l3: boolean;
  newPoles: boolean;
  orPoles: boolean;
  orChambers: boolean;
  orDucts: boolean;
  orLabels: boolean;
  suggestedPoles: boolean;
  suggestedChambers: boolean;
  suggestedDucts: boolean;
  fw2: boolean;
  fw4: boolean;
  fw6: boolean;
  fw10: boolean;
  homesSdu: boolean;
  homesMdu: boolean;
  homesFlats: boolean;
  feeders: boolean;
  links: boolean;
  ulw48: boolean;
  ulw36: boolean;
  ulw24: boolean;
  ulw12: boolean;
  live: boolean;
  bwip: boolean;
  unserviceable: boolean;
  liveNotReady: boolean;
};

// =====================================================
// LAYER VISIBILITY DEFAULTS + USER PREFERENCES
// Default operational view keeps only polygons and DPs on.
// Preferences are global, so switching fibrehood/project keeps
// the same layer setup.
// =====================================================
const LAYER_PREFERENCE_STORAGE_KEY = "alistra-gis-layer-preferences-v2";

const DEFAULT_VISIBLE_LAYERS: LayerVisibility = {
  agJoints: true,
  streetCabs: false,
  poles: false,
  distributionPoints: true,
  chambers: false,
  cables: false,
  dropCables: false,
  areas: true,
  measurements: true,
  cableDistances: false,
  homes: false,
  l0: true,
  l1: true,
  l2: true,
  l3: true,
  newPoles: false,
  orPoles: false,
  orChambers: false,
  orDucts: false,
  orLabels: false,
  suggestedPoles: false,
  suggestedChambers: false,
  suggestedDucts: false,
  fw2: false,
  fw4: false,
  fw6: false,
  fw10: false,
  homesSdu: false,
  homesMdu: false,
  homesFlats: false,
  feeders: false,
  links: false,
  ulw48: false,
  ulw36: false,
  ulw24: false,
  ulw12: false,
  live: true,
  bwip: true,
  unserviceable: true,
  liveNotReady: true,
};
function loadStoredLayerPreferences<T extends Record<string, boolean>>(
  key: string,
  defaults: T,
): T {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return defaults;

    return {
      ...defaults,
      ...(JSON.parse(saved) as Partial<T>),
    };
  } catch (err) {
    console.warn("Failed to load saved layer preferences", err);
    return defaults;
  }
}

function saveStoredLayerPreferences(
  key: string,
  value: Record<string, boolean>,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to save layer preferences", err);
  }
}

function MapClickHandler({
  mode,
  assets,
  snapEnabled,
  onPick,
  onMeasurePoint,
  onCablePoint,
  onAreaPoint,
  onRightClick,
}: {
  mode: MapMode;
  assets: SavedMapAsset[];
  snapEnabled: boolean;
  onPick: (pos: LatLngLiteral) => void;
  onMeasurePoint: (pos: LatLngLiteral) => void;
  onCablePoint: (pos: LatLngLiteral) => void;
  onAreaPoint: (pos: LatLngLiteral) => void;
  onRightClick: (pos: LatLngLiteral, screen: { x: number; y: number }) => void;
}) {
  useMapEvents({
    click(e) {
      let point = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };

      if (mode === "measure") {
        onMeasurePoint(point);
        return;
      }

      if (mode === "draw-cable") {
        onCablePoint(point);
        return;
      }

      if (mode === "draw-area") {
        onAreaPoint(point);
        return;
      }

      point = snapPointToAssets(point, assets, snapEnabled, 8);
      onPick(point);
    },
    contextmenu(e) {
      onRightClick(
        { lat: e.latlng.lat, lng: e.latlng.lng },
        { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
      );
    },
  });

  return null;
}

function MapBoundsTracker({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: OsmBounds) => void;
}) {
  const map = useMap();

  /* =====================================================
     LEAFLET SAFE BOUNDS TRACKER
     The project workspace unmounts/remounts the map.
     Leaflet can briefly have no internal pane position during
     that transition, so bounds reads must be defensive.
  ===================================================== */
  const updateBounds = () => {
    try {
      const container = map.getContainer?.();
      if (!container || !container.isConnected) return;
      if (!(map as any)._loaded) return;

      const bounds = map.getBounds();
      if (!bounds) return;

      onBoundsChange({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    } catch {
      // Leaflet can throw while the map is being remounted.
      // Ignore this one frame; the next move/zoom/load will update bounds.
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(updateBounds, 120);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useMapEvents({
    load: updateBounds,
    moveend: updateBounds,
    zoomend: updateBounds,
  });

  return null;
}

function MapRefTracker({ onReady }: { onReady: (map: L.Map | null) => void }) {
  const map = useMap();

  /* =====================================================
     MAP REF LIFECYCLE
     Clears the external map ref when the Leaflet map unmounts
     so Back To Map / workspace transitions do not use a stale map.
  ===================================================== */
  useEffect(() => {
    onReady(map);
    return () => onReady(null);
  }, [map, onReady]);

  return null;
}

function getAssetPoint(asset: SavedMapAsset): LatLngLiteral | null {
  if (
    typeof (asset as any).lat === "number" &&
    typeof (asset as any).lng === "number"
  ) {
    return { lat: (asset as any).lat, lng: (asset as any).lng };
  }

  if (
    asset.geometry?.type === "Point" &&
    Array.isArray(asset.geometry.coordinates)
  ) {
    const [lat, lng] = asset.geometry.coordinates as any;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function findDpAtCableEnd(assets: SavedMapAsset[], point: LatLngLiteral) {
  return assets.find((asset) => {
    if (asset.assetType !== "distribution-point") return false;
    const assetPoint = getAssetPoint(asset);
    if (!assetPoint) return false;
    return getPathDistanceMeters([assetPoint, point]) <= 10;
  });
}

function getDistancePointToSegmentMeters(
  point: LatLngLiteral,
  start: LatLngLiteral,
  end: LatLngLiteral,
): number {
  const midLat = ((start.lat + end.lat + point.lat) / 3) * (Math.PI / 180);
  const toXY = (p: LatLngLiteral) => ({
    x: p.lng * 111320 * Math.cos(midLat),
    y: p.lat * 111320,
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
  );

  const projected = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };

  return Math.sqrt((p.x - projected.x) ** 2 + (p.y - projected.y) ** 2);
}

function getDistancePointToLineMeters(
  point: LatLngLiteral,
  line: LatLngLiteral[],
): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return getPathDistanceMeters([point, line[0]]);

  let best = Infinity;

  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(
      best,
      getDistancePointToSegmentMeters(point, line[i], line[i + 1]),
    );
  }

  return best;
}

// =====================================================
// CABLE ROUTE SAVE GUARD
// Editing a cable must replace the current route, not append or
// multiply geometry points on every save/edit cycle.
// =====================================================
const CABLE_SAVE_COORDINATE_DEDUPE_METERS = 0.35;

function sanitiseCableRouteCoordinates(
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
      getPathDistanceMeters([previous, next]) <=
        CABLE_SAVE_COORDINATE_DEDUPE_METERS
    ) {
      return;
    }

    cleaned.push(next);
  });

  return cleaned;
}

function findDpsAlongCable(
  assets: SavedMapAsset[],
  route: LatLngLiteral[],
  maxDistanceMeters = 15,
): SavedMapAsset[] {
  const seen = new Set<string>();

  return assets
    .filter((asset) => asset.assetType === "distribution-point")
    .map((asset) => {
      const assetPoint = getAssetPoint(asset);
      if (!assetPoint) return null;

      return {
        asset,
        distance: getDistancePointToLineMeters(assetPoint, route),
      };
    })
    .filter((item): item is { asset: SavedMapAsset; distance: number } =>
      Boolean(item),
    )
    .filter((item) => item.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.asset)
    .filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    });
}

function getHomeConnectionKey(asset: any): string {
  return String(
    asset?.id ??
      asset?.assetId ??
      asset?.homeId ??
      asset?.uprn ??
      asset?.UPRN ??
      asset?.properties?.UPRN ??
      asset?.properties?.uprn ??
      "",
  ).trim();
}

function getHomeDropKeys(asset: any): string[] {
  const raw = getHomeConnectionKey(asset);
  if (!raw) return [];
  return raw.startsWith("uprn-")
    ? [raw, raw.replace(/^uprn-/, "")]
    : [raw, `uprn-${raw}`];
}

function getDropHomeKeys(drop: any): string[] {
  const raw = String(
    drop?.homeId ??
      drop?.toAssetId ??
      drop?.connectedHomeId ??
      drop?.uprn ??
      drop?.UPRN ??
      "",
  ).trim();

  if (!raw) return [];
  return raw.startsWith("uprn-")
    ? [raw, raw.replace(/^uprn-/, "")]
    : [raw, `uprn-${raw}`];
}

function getDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function createManualDropCable(
  dp: SavedMapAsset,
  home: SavedMapAsset,
): SavedMapAsset | null {
  const dpCoord = getAssetLatLng(dp as any);
  const homeCoord = getAssetLatLng(home as any);
  if (!dpCoord || !homeCoord) return null;

  const homeId = getHomeConnectionKey(home);
  const dpId = String(dp.id || "");
  if (!homeId || !dpId) return null;

  const lineCoords: [number, number][] = [
    [dpCoord.lat, dpCoord.lng],
    [homeCoord.lat, homeCoord.lng],
  ];

  return {
    id: `drop_${dpId}_${homeId}`,
    name: `Drop ${dp.name || dpId} → ${home.name || homeId}`,
    assetType: "cable",
    cableType: "Drop",
    type: "cable",
    fibreCount: "1F" as FibreCount,
    installMethod: "Overhead" as InstallMethod,
    fromAssetId: dpId,
    toAssetId: homeId,
    fromType: "distribution-point",
    toType: "home",
    dpId,
    homeId,
    uprn:
      (home as any).properties?.UPRN ??
      (home as any).UPRN ??
      (home as any).uprn,
    distanceM: Math.round(getDistanceMeters(dpCoord, homeCoord) * 10) / 10,
    coordinates: lineCoords,
    route: lineCoords,
    path: lineCoords,
    points: lineCoords,
    geometry: {
      type: "LineString",
      coordinates: lineCoords,
    },
    generated: true,
    autoGenerated: true,
    generationMode: "manual-home-move",
    connectionMode: "manual",
    status: "planned",
  } as SavedMapAsset;
}

function isDropCable(asset: SavedMapAsset): boolean {
  return (
    asset.assetType === "cable" &&
    String((asset as any).cableType || "")
      .trim()
      .toLowerCase() === "drop"
  );
}

const FREE_LEAFLET_TILE_URLS: Record<
  BasemapType,
  { url: string; attribution: string }
> = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },

  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },

  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },

  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
};

function FreeLeafletBaseLayer({
  basemap,
  roadOverlayVisible,
}: {
  basemap: BasemapType;
  roadOverlayVisible: boolean;
}) {
  const selected =
    FREE_LEAFLET_TILE_URLS[basemap] || FREE_LEAFLET_TILE_URLS.street;

  return (
    <>
      <TileLayer
        key={`base-${basemap}`}
        url={selected.url}
        attribution={selected.attribution}
        maxZoom={22}
        maxNativeZoom={19}
      />

      {roadOverlayVisible && basemap !== "street" && (
        <TileLayer
          key={`roads-${basemap}`}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          opacity={0.35}
          maxZoom={22}
          maxNativeZoom={19}
        />
      )}
    </>
  );
}

function inferAssetTypeFromName(name: string): AssetType {
  const upper = String(name || "").toUpperCase();
  if (
    upper.includes("-SC") ||
    upper.includes("STREET CAB") ||
    upper.includes("CAB")
  ) {
    return "street-cab";
  }
  return "ag-joint";
}

function getPolygonAreaSquareMeters(points: [number, number][]): number {
  if (points.length < 3) return 0;

  const radius = 6378137;
  const toRad = (value: number) => (value * Math.PI) / 180;
  let area = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    area +=
      toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  return Math.abs((area * radius * radius) / 2);
}

function formatAreaLabel(areaSquareMeters: number): string {
  if (areaSquareMeters < 10000) {
    return `${areaSquareMeters.toFixed(0)} m²`;
  }

  return `${(areaSquareMeters / 10000).toFixed(2)} ha`;
}

function normaliseAreaLevel(value: unknown): AreaLevel {
  const level = String(value || "L0").toUpperCase();

  if (level === "L1" || level === "L2" || level === "L3") {
    return level;
  }

  return "L0";
}

function isAreaVisibleForLevel(
  asset: SavedMapAsset,
  visibleLayers: LayerVisibility,
): boolean {
  const areaLevel = normaliseAreaLevel((asset as any).areaLevel);

  if (areaLevel === "L0") return visibleLayers.l0;
  if (areaLevel === "L1") return visibleLayers.l1;
  if (areaLevel === "L2") return visibleLayers.l2;
  if (areaLevel === "L3") return visibleLayers.l3;

  return true;
}

// Firebase stores older/chunked map assets in a flattened shape:
//   geometryType + geometryCoordinatesJson
// The map layers need a real geometry object. Normalise once before
// filtering/rendering so cables, polygons, homes and markers all reappear.

function normaliseDpOperationalStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Planned";

  const lower = raw.toLowerCase();
  if (lower === "live") return "Live";
  if (lower === "bwip") return "BWIP";
  if (lower === "unserviceable") return "Unserviceable";
  if (lower === "live not ready for service" || lower === "lnrfs") {
    return "Live not ready for service";
  }
  if (lower === "planned") return "Planned";
  return raw;
}

function getDpOperationalStatus(asset: any, fallback: string = "Planned"): string {
  return normaliseDpOperationalStatus(
    asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      fallback,
  );
}

function syncDpOperationalStatusOnAsset<T extends Record<string, any>>(
  asset: T,
  statusValue?: unknown,
): T {
  const nextStatus = normaliseDpOperationalStatus(
    statusValue ||
      asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      "Planned",
  );

  const nextDpDetails = {
    ...(asset?.dpDetails || asset?.properties?.dpDetails || {}),
    buildStatus: nextStatus,
  };

  return {
    ...(asset as any),
    status: nextStatus,
    buildStatus: nextStatus,
    dpDetails: nextDpDetails,
    properties: {
      ...((asset as any).properties || {}),
      status: nextStatus,
      buildStatus: nextStatus,
      dpDetails: {
        ...(((asset as any).properties || {}).dpDetails || {}),
        ...nextDpDetails,
        buildStatus: nextStatus,
      },
    },
  } as T;
}

function normalizeMapAsset(asset: SavedMapAsset): SavedMapAsset {
  const copy: any = { ...(asset as any) };

  if (!copy.geometry && copy.geometryType && copy.geometryCoordinatesJson) {
    try {
      copy.geometry = {
        type: copy.geometryType,
        coordinates: JSON.parse(copy.geometryCoordinatesJson),
      };
    } catch (err) {
      console.warn("Could not parse geometry for map asset:", copy.id, err);
    }
  }

  if (!copy.mappingRows && copy.mappingRowsJson) {
    try {
      copy.mappingRows = JSON.parse(copy.mappingRowsJson);
    } catch {
      copy.mappingRows = [];
    }
  }

  // Backfill assetType for legacy assets that only have jointType/geometryType.
  if (!copy.assetType) {
    const jointType = String(copy.jointType || "").toLowerCase();
    const geometryType = String(
      copy.geometry?.type || copy.geometryType || "",
    ).toLowerCase();

    if (
      geometryType === "polygon" ||
      jointType.includes("polygon") ||
      jointType.includes("area")
    ) {
      copy.assetType = "area";
    } else if (geometryType === "linestring" || jointType.includes("cable")) {
      copy.assetType = "cable";
    } else {
      copy.assetType = inferAssetTypeFromName(
        copy.name || copy.jointName || copy.label || jointType,
      );
    }
  }

  // Repair older OR / PIA imports that were previously classified as DPs.
  // This fixes existing saved POL:DATA / JC:* point assets without requiring
  // manual deletion. It only changes Openreach-prefixed point imports.
  const geometryType = String(copy.geometry?.type || copy.geometryType || "").toLowerCase();
  const nameText = String(
    copy.name ||
      copy.piaRef ||
      copy.importedProperties?.Name ||
      copy.importedProperties?.name ||
      copy.id ||
      "",
  )
    .trim()
    .toUpperCase();

  const isSuggestedReference =
    nameText.includes("SUGGESTED") ||
    nameText.includes("PROPOSED") ||
    nameText.startsWith("SP:") ||
    nameText.includes("SUGG:");

  const isNpReference =
    nameText.startsWith("NP:") ||
    nameText.startsWith("NP-") ||
    nameText.startsWith("NP ") ||
    nameText.includes("NEW POLE") ||
    nameText.includes("MISSING POLE");

  if (
    geometryType === "point" &&
    (isNpReference ||
      isSuggestedReference ||
      nameText.startsWith("POL:") ||
      nameText.startsWith("MP:"))
  ) {
    copy.assetType = "pole";
    copy.referenceSubtype = isSuggestedReference ? "suggested" : isNpReference ? "np" : "or";
    copy.jointType = isSuggestedReference
      ? "Suggested Pole"
      : isNpReference
        ? "NP Pole"
        : "OR Pole";
    copy.source = copy.source || "pia-overlay";
    copy.poleDetails = {
      ...(copy.poleDetails || {}),
      poleType: isSuggestedReference ? "suggested" : isNpReference ? "new" : "or",
    };
    delete copy.dpDetails;
  }

  if (
    geometryType === "point" &&
    (nameText.startsWith("JC:") || nameText.startsWith("CH:") || nameText.startsWith("CHAMBER:"))
  ) {
    copy.assetType = "chamber";
    copy.referenceSubtype = isSuggestedReference ? "suggested" : "or";
    copy.jointType = isSuggestedReference ? "Suggested Chamber" : "OR Chamber";
    copy.source = copy.source || "pia-overlay";
    copy.chamberDetails = {
      ...(copy.chamberDetails || {}),
      chamberType: copy.chamberDetails?.chamberType || (isSuggestedReference ? "Suggested Chamber" : "OR Chamber"),
    };
    delete copy.dpDetails;
  }

  return copy as SavedMapAsset;
}

export default function JointMapManager({
  currentJointName,
  currentJointType,
  currentMappingRows,
  savedJoints,
  setSavedJoints,
  onClose,
  onOpenJoint,
  onOpenAutoNetwork,
}: Props) {
  const { activeMode, requiresAuditReason } = useAppMode();
  // =====================================================
  // 1) CORE MAP / PROJECT STATE
  // =====================================================
  const [pickedLocation, setPickedLocation] = useState<LatLngLiteral | null>(
    null,
  );
  const mapRef = useRef<L.Map | null>(null);
  const initialMapViewRef = useRef(loadMapView());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => initialMapViewRef.current?.activeProjectId ?? null,
  );
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  // =====================================================
  // PROJECT WORKSPACE STATE
  // First-stage migration from crowded map sidebar into a
  // dedicated project operations screen.
  // =====================================================
  const [isProjectWorkspaceOpen, setIsProjectWorkspaceOpen] = useState(false);
  const [isProjectWorkspaceLoading, setIsProjectWorkspaceLoading] =
    useState(false);
  const [assetType, setAssetType] = useState<AssetType>(
    inferAssetTypeFromName(currentJointName),
  );
  // =====================================================
  // 2) EXCHANGE STATE
  // savedExchanges controls the ⭐ markers on the map.
  // selectedExchange controls the right/side page panel.
  //
  // NOTE: This starts empty until you wire it into Firestore
  // or temporarily add a test exchange here.
  // =====================================================
  const [savedExchanges, setSavedExchanges] = useState<ExchangeAsset[]>([]);
  const [openExchangeAsset, setOpenExchangeAsset] =
    useState<ExchangeAsset | null>(null);
  // =====================================================
  // LOAD EXCHANGES FROM FIRESTORE
  // =====================================================
  useEffect(() => {
    loadExchanges()
      .then(setSavedExchanges)
      .catch((err) => {
        console.error("Failed to load exchanges", err);
      });
  }, []);

  // =====================================================
  // SAVE EXCHANGE
  // =====================================================
  const toExchangeMarker = (exchange: ExchangeAsset): ExchangeAsset => ({
    id: exchange.id,
    name: exchange.name,
    code: exchange.code,
    lat: exchange.lat,
    lng: exchange.lng,
    projectId: exchange.projectId,
    notes: exchange.notes,
    createdAt: exchange.createdAt,
    updatedAt: exchange.updatedAt,
    olts: [],
    feederPanels: [],
    hdSplitterPanels: [],
  });

  // =====================================================
  // MODE AWARE AUDIT SYSTEM
  // =====================================================

  const shouldAskForChangeReason = requiresAuditReason;

  const handleOpenExchange = async (exchange: ExchangeAsset) => {
    try {
      const fullExchange = await loadExchange(exchange.id);
      setOpenExchangeAsset(fullExchange ?? exchange);
    } catch (err) {
      console.error("Failed to open exchange", err);
      alert("Exchange failed to open. Check console.");
    }
  };

  const handleSaveExchange = async (exchange: ExchangeAsset) => {
    const markerExchange = toExchangeMarker(exchange);

    setSavedExchanges((prev) => {
      const exists = prev.some((e) => e.id === exchange.id);

      if (exists) {
        return prev.map((e) => (e.id === exchange.id ? markerExchange : e));
      }

      return [...prev, markerExchange];
    });

    try {
      console.log("Saving exchange:", exchange);
      await saveExchange(exchange);
      setOpenExchangeAsset(exchange);
      console.log("Exchange saved successfully");
    } catch (err) {
      console.error("Failed to save exchange", err);
      alert("Exchange failed to save. Check console.");
    }
  };

  const handleDeleteExchange = async (exchange: ExchangeAsset) => {
    if (
      !confirm(
        `Delete ${exchange.name || "this exchange"}? This cannot be undone.`,
      )
    )
      return;

    try {
      await deleteExchange(exchange.id);
      setSavedExchanges((prev) =>
        prev.filter((item) => item.id !== exchange.id),
      );

      if (openExchangeAsset?.id === exchange.id) {
        setOpenExchangeAsset(null);
      }
    } catch (err) {
      console.error("Failed to delete exchange", err);
      alert("Exchange failed to delete. Check console.");
    }
  };

  // =====================================================
  // 3) ASSET EDITOR FORM STATE
  // =====================================================
  const [jointName, setJointName] = useState(currentJointName || "");
  const [jointType, setJointType] = useState(
    currentJointType || "CMJ (12 trays)",
  );
  const [notes, setNotes] = useState("");
  const [cablePiaNoiNumber, setCablePiaNoiNumber] = useState("");
  const [areaLevel, setAreaLevel] = useState<AreaLevel>("L0");

  const [cableType, setCableType] = useState<CableType>("Feeder Cable");
  const [fibreCount, setFibreCount] = useState<FibreCount>("12F");
  const [installMethod, setInstallMethod] =
    useState<InstallMethod>("Underground");
  const [parentCableId, setParentCableId] = useState<string | undefined>(
    undefined,
  );
  const [allocatedInputFibres, setAllocatedInputFibres] = useState<number[]>(
    [],
  );

  const [poleDetails, setPoleDetails] = useState<PoleDetails>({});
  const [dpDetails, setDpDetails] = useState<DistributionPointDetails>({
    powerReadings: ["", "", "", ""],
    closureType: "CBT",
    connectionsToHomes: 8,
    afnDetails: undefined,
  });
  const [chamberDetails, setChamberDetails] = useState<ChamberDetails>({});

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  // =====================================================
  // 4) MAP DRAWING / LAYER UI STATE
  // =====================================================
  const [mapMode, setMapMode] = useState<MapMode>("pick");
  const [selectedMoveHomeIds, setSelectedMoveHomeIds] = useState<string[]>([]);
  const [selectedSurveyDeleteHomeIds, setSelectedSurveyDeleteHomeIds] =
    useState<string[]>([]);
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [roadOverlayVisible, setRoadOverlayVisible] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<LatLngLiteral[]>([]);
  const [draftCablePoints, setDraftCablePoints] = useState<LatLngLiteral[]>([]);
  const [draftAreaPoints, setDraftAreaPoints] = useState<LatLngLiteral[]>([]);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 600);
    updateMobile();

    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>(() =>
    loadStoredLayerPreferences(
      LAYER_PREFERENCE_STORAGE_KEY,
      DEFAULT_VISIBLE_LAYERS,
    ),
  );

  useEffect(() => {
    saveStoredLayerPreferences(LAYER_PREFERENCE_STORAGE_KEY, visibleLayers);
  }, [visibleLayers]);

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isRoutingCable, setIsRoutingCable] = useState(false);
  const [isLoadingOsmHomes, setIsLoadingOsmHomes] = useState(false);
  const [isLoadingProjectHomes, setIsLoadingProjectHomes] = useState(false);
  const [projectHomes, setProjectHomes] = useState<SavedMapAsset[]>([]);
  const [loadedHomesProjectId, setLoadedHomesProjectId] = useState<
    string | null
  >(null);
  const [orAssets, setOrAssets] = useState<SavedMapAsset[]>([]);
  const [orAssetsLoaded, setOrAssetsLoaded] = useState(false);
  const [selectedReferenceDuctId, setSelectedReferenceDuctId] = useState<string | null>(null);
  const [selectedReferenceDuctName, setSelectedReferenceDuctName] = useState<string>("");
  const [mapBounds, setMapBounds] = useState<OsmBounds | null>(null);

  const normalizedSavedJoints = useMemo(
    () => (savedJoints ?? []).map(normalizeMapAsset),
    [savedJoints],
  );

  const operationalSavedJoints = useMemo(
    () => normalizedSavedJoints.filter((asset) => !isOpenreachReferenceAsset(asset)),
    [normalizedSavedJoints],
  );

  const legacyOpenreachAssets = useMemo(
    () => normalizedSavedJoints.filter(isOpenreachReferenceAsset).map(normaliseOpenreachAsset),
    [normalizedSavedJoints],
  );

  useEffect(() => {
    let cancelled = false;

    loadOrAssets()
      .then((loadedOrAssets) => {
        if (cancelled) return;
        setOrAssets(loadedOrAssets.map(normaliseOpenreachAsset));
        setOrAssetsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load OR reference assets", err);
        if (!cancelled) setOrAssetsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openreachReferenceAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    legacyOpenreachAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, normaliseOpenreachAsset(asset));
    });

    orAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, normaliseOpenreachAsset(asset));
    });

    return Array.from(byId.values());
  }, [legacyOpenreachAssets, orAssets]);

  useEffect(() => {
    if (!orAssetsLoaded || legacyOpenreachAssets.length === 0) return;

    mergeAndSaveOrAssets(legacyOpenreachAssets, {
      reason: "migrate legacy OR assets out of main savedJoints",
    })
      .then(setOrAssets)
      .catch((err) => {
        console.error("Failed to migrate legacy OR assets into OR chunks", err);
      });
  }, [orAssetsLoaded, legacyOpenreachAssets]);

  // =====================================================
  // SPLIT MAP ASSET STORAGE MIGRATION
  // Keeps the old master chunk path untouched, but also mirrors
  // assets into safer per-type chunk buckets:
  //   mapAssets/cables/chunks
  //   mapAssets/polygons/chunks
  //   mapAssets/streetCabs/chunks
  // and the rest of the asset buckets.
  //
  // Load behaviour:
  // - If split chunks already exist, they are preferred in this component.
  // - If they do not exist yet, the existing parent/legacy load remains active.
  // Save behaviour:
  // - Once legacy/main assets are present, they are mirrored to split chunks.
  // - Empty arrays are never written, so an early blank render cannot wipe data.
  // =====================================================
  const splitStorageLastSavedSignatureRef = useRef("");

  // Split storage loading is deliberately disabled.
  // The authoritative live project state must come from mapAssets/main/chunks.
  // Loading old split buckets here can overwrite freshly saved main chunks with stale data.

  useEffect(() => {
    if (operationalSavedJoints.length === 0) return;

    const saveSignature = operationalSavedJoints
      .map(
        (asset: any) =>
          `${asset.id}:${asset.updatedAt || asset.syncRevision || ""}`,
      )
      .sort()
      .join("|");

    if (saveSignature === splitStorageLastSavedSignatureRef.current) return;

    const timer = window.setTimeout(async () => {
  splitStorageLastSavedSignatureRef.current = saveSignature;

  try {
    // MAIN AUTHORITATIVE SAVE
    // This is the ONLY save path allowed to control persistence.
    // It already safely flattens geometry and has destructive-save guards.
    const { saveMapAssetsToFirestore } = await import(
      "../services/mapAssetStorage"
    );

    await saveMapAssetsToFirestore(operationalSavedJoints, {
      reason: "joint-map-manager-primary-save",
    });

    // Split-storage mirroring is temporarily disabled during the storage
    // integrity phase. Main chunks are the only authoritative save target.
    // Re-enable this only after split buckets are proven stable and rules allow them.
  } catch (err) {
    console.error("PRIMARY MAP SAVE FAILED", err);
  }
}, 1500);

    return () => window.clearTimeout(timer);
  }, [operationalSavedJoints]);

  const normalizedProjectHomes = useMemo(
    () => (projectHomes ?? []).map(normalizeMapAsset),
    [projectHomes],
  );

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    latlng: LatLngLiteral | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    latlng: null,
  });

  const [showCableModal, setShowCableModal] = useState(false);
  const [showPoleModal, setShowPoleModal] = useState(false);
  const [showDpModal, setShowDpModal] = useState(false);
  const [showChamberModal, setShowChamberModal] = useState(false);
  const [maintenanceAsset, setMaintenanceAsset] =
    useState<SavedMapAsset | null>(null);
  const [showMaintenancePanel, setShowMaintenancePanel] = useState(false);

  const [openStreetCabAsset, setOpenStreetCabAsset] =
    useState<SavedMapAsset | null>(null);
  const [openDistributionPointAsset, setOpenDistributionPointAsset] =
    useState<SavedMapAsset | null>(null);

  // =====================================================
  // ONE MAP-ASSET SAVE PATH
  // Use this for cabs, poles, DPs, chambers, cables, areas and joints.
  // It updates an existing asset if found, or adds it if it is missing.
  // The sync metadata forces the parent/Firebase listener to see a fresh change.
  // =====================================================
  const saveMapAssetToState = (
    asset: SavedMapAsset,
    options?: { isNew?: boolean; message?: string },
  ): SavedMapAsset => {
    const syncedAsset = markAssetForLiveSync(asset, options?.isNew ?? false);

    setSavedJoints((prev) => {
      const exists = (prev ?? []).some((item) => item.id === syncedAsset.id);

      if (!exists) {
        return [...(prev ?? []), syncedAsset];
      }

      return (prev ?? []).map((item) =>
        item.id === syncedAsset.id ? syncedAsset : item,
      );
    });

    if (options?.message) {
      alert(options.message);
    }

    return syncedAsset;
  };

  const writeAssetAuditLog = (args: {
    asset: SavedMapAsset;
    action: AssetChangeAction;
    reason: string;
    comment?: string;
    before?: unknown;
    after?: unknown;
  }) => {
    void createAssetChangeLog({
      projectId: activeProjectIdRef.current,
      asset: args.asset,
      action: args.action,
      reason: args.reason,
      comment: args.comment,
      before: args.before,
      after: args.after,
    }).catch((err) => {
      console.error("Failed to write asset audit log", err);
    });

    void createAssetActivityLog({
      projectId: activeProjectIdRef.current,
      asset: args.asset,
      action: args.action === "updated" ? "updated" : (args.action as any),
      reason: args.reason,
      comment: args.comment,
      context: "map-asset-editor",
      before: args.before,
      after: args.after,
    }).catch((err) => {
      console.error("Failed to write asset activity log", err);
    });
  };

  const openMaintenanceHistory = (asset: SavedMapAsset | null) => {
    if (!asset) return;
    setMaintenanceAsset(asset);
    setShowMaintenancePanel(true);
  };
  useEffect(() => {
    setJointName(currentJointName || "");
    setJointType(currentJointType || "CMJ (12 trays)");
    setAssetType(inferAssetTypeFromName(currentJointName));
  }, [currentJointName, currentJointType]);

  const allMapAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();
    operationalSavedJoints.forEach((asset) => byId.set(asset.id, asset));
    normalizedProjectHomes.forEach((asset) => byId.set(asset.id, asset));
    return Array.from(byId.values());
  }, [operationalSavedJoints, normalizedProjectHomes]);

  const currentEditingAsset = useMemo(
    () => allMapAssets.find((asset) => asset.id === editingAssetId) || null,
    [allMapAssets, editingAssetId],
  );

  const networkGraph = useMemo(
    () => buildNetworkGraph(allMapAssets),
    [allMapAssets],
  );

  const disconnectedAssets = useMemo(
    () => findDisconnectedAssets(networkGraph),
    [networkGraph],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchProjectHomes = async () => {
      if (!activeProjectId || !visibleLayers.homes) {
        setProjectHomes([]);
        setLoadedHomesProjectId(null);
        return;
      }

      if (loadedHomesProjectId === activeProjectId) return;

      setIsLoadingProjectHomes(true);
      try {
        const homes = await loadProjectHomes(activeProjectId);
        if (!cancelled) {
          setProjectHomes(homes);
          setLoadedHomesProjectId(activeProjectId);
        }
      } catch (err) {
        console.error("Failed to load saved project homes", err);
      } finally {
        if (!cancelled) setIsLoadingProjectHomes(false);
      }
    };

    fetchProjectHomes();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, visibleLayers.homes, loadedHomesProjectId]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (pickedLocation) return [pickedLocation.lat, pickedLocation.lng];
    if (draftCablePoints.length > 0) {
      const last = draftCablePoints[draftCablePoints.length - 1];
      return [last.lat, last.lng];
    }
    if (draftAreaPoints.length > 0) {
      const last = draftAreaPoints[draftAreaPoints.length - 1];
      return [last.lat, last.lng];
    }
    if (measurePoints.length > 0) {
      const last = measurePoints[measurePoints.length - 1];
      return [last.lat, last.lng];
    }

    const savedMapView = initialMapViewRef.current;
    if (savedMapView?.center) {
      return [savedMapView.center.lat, savedMapView.center.lng];
    }

    const firstPointAsset = allMapAssets.find(
      (a) => a.geometry?.type === "Point",
    );
    if (firstPointAsset?.geometry?.type === "Point") {
      return firstPointAsset.geometry.coordinates;
    }

    return [54.5, -3.0];
  }, [
    pickedLocation,
    draftCablePoints,
    draftAreaPoints,
    measurePoints,
    allMapAssets,
  ]);

  const measuredDistance = useMemo(() => {
    return getPathDistanceMeters(measurePoints);
  }, [measurePoints]);

  const draftCableDistance = useMemo(() => {
    return getPathDistanceMeters(draftCablePoints);
  }, [draftCablePoints]);

  const isProjectAreaAsset = (asset: SavedMapAsset) => {
    const item = asset as any;
    const assetType = String(item.assetType ?? "").toLowerCase();
    const jointType = String(item.jointType ?? "").toLowerCase();
    const geometryType = String(
      item.geometryType ?? item.geometry?.type ?? "",
    ).toLowerCase();

    return (
      geometryType === "polygon" &&
      (assetType === "area" ||
        assetType === "polygon" ||
        assetType === "project-area" ||
        jointType.includes("polygon area"))
    );
  };

  const projectAreas = useMemo(
    () => allMapAssets.filter(isProjectAreaAsset),
    [allMapAssets],
  );

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const activeProjectArea = useMemo(
    () => projectAreas.find((area) => area.id === activeProjectId) ?? null,
    [activeProjectId, projectAreas],
  );

  const visibleProjectAssets = useMemo(
    () =>
      filterAssetsForProjectArea(
        allMapAssets.filter((asset) => !isProjectAreaAsset(asset)),
        activeProjectArea,
      ),
    [activeProjectArea, allMapAssets],
  );

  const visibleProjectAreas = useMemo(() => projectAreas, [projectAreas]);

  const visibleOpenreachAssets = useMemo(
    () => filterAssetsForProjectArea(openreachReferenceAssets, activeProjectArea),
    [activeProjectArea, openreachReferenceAssets],
  );

  const snapCandidateAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();
    visibleProjectAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, asset);
    });
    visibleOpenreachAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, asset);
    });
    return Array.from(byId.values());
  }, [visibleProjectAssets, visibleOpenreachAssets]);

  const openreachLayerVisibility = useMemo(
    () => ({
      ducts: visibleLayers.orDucts !== false,
      trenches: visibleLayers.orDucts !== false,
      spans: visibleLayers.orDucts !== false,
      chambers: visibleLayers.orChambers !== false,
      poles: visibleLayers.orPoles !== false,
      labels: visibleLayers.orLabels !== false,
      newPoles: visibleLayers.newPoles !== false,
      suggestedPoles: visibleLayers.suggestedPoles !== false,
      suggestedChambers: visibleLayers.suggestedChambers !== false,
      suggestedDucts: visibleLayers.suggestedDucts !== false,
    }),
    [
      visibleLayers.orDucts,
      visibleLayers.orChambers,
      visibleLayers.orPoles,
      visibleLayers.orLabels,
      visibleLayers.newPoles,
      visibleLayers.suggestedPoles,
      visibleLayers.suggestedChambers,
      visibleLayers.suggestedDucts,
    ],
  );

  // =====================================================
  // PROJECT WORKSPACE SUMMARY STATS
  // Kept intentionally lightweight and derived from the same
  // area-scoped assets already used by the map.
  // =====================================================
  const projectWorkspaceStats = useMemo(() => {
    const norm = (value: unknown) => String(value ?? "").toLowerCase();

    const isType = (asset: SavedMapAsset, tokens: string[]) => {
      const item = asset as any;
      const haystack = `${norm(item.assetType)} ${norm(item.type)} ${norm(item.jointType)} ${norm(item.name)} ${norm(item.dpType)}`;
      return tokens.some((token) => haystack.includes(token));
    };

    const isLineCable = (asset: SavedMapAsset) =>
      asset.assetType === "cable" ||
      asset.geometry?.type === "LineString" ||
      isType(asset, ["cable"]);

    const isDropCableAsset = (asset: SavedMapAsset) => {
      const item = asset as any;
      const haystack = `${norm(item.assetType)} ${norm(item.type)} ${norm(item.cableType)} ${norm(item.name)} ${norm(item.label)} ${norm(item.generatedBy)}`;
      return (
        isLineCable(asset) &&
        (haystack.includes("drop") ||
          item.isDropCable === true ||
          item.isHomeDrop === true ||
          item.generatedDrop === true ||
          item.autoGeneratedDrop === true ||
          item.dropCable === true ||
          Boolean(
            item.homeId ||
            item.connectedHomeId ||
            item.toHomeId ||
            item.fromHomeId,
          ))
      );
    };

    const isDpClosureAsset = (asset: SavedMapAsset) => {
      if (isDropCableAsset(asset)) return false;
      const item = asset as any;
      const hasPointGeometry =
        asset.geometry?.type === "Point" ||
        (typeof item.lat === "number" && typeof item.lng === "number");
      if (!hasPointGeometry) return false;
      const haystack = `${norm(item.assetType)} ${norm(item.type)} ${norm(item.jointType)} ${norm(item.name)} ${norm(item.dpType)} ${norm(item.closureType)}`;
      return (
        haystack.includes("distribution-point") ||
        haystack.includes("distribution point") ||
        haystack.includes("dp") ||
        haystack.includes("cbt") ||
        haystack.includes("afn")
      );
    };

    const cables = visibleProjectAssets.filter(isLineCable);
    const dropCables = cables.filter(isDropCableAsset);
    const designCables = cables.filter((asset) => !isDropCableAsset(asset));
    const homes = visibleProjectAssets.filter((asset) =>
      isType(asset, ["home", "uprn", "sdu", "mdu", "flat"]),
    );
    const connectedHomes = homes.filter((asset: any) =>
      Boolean(
        asset.connectedDpId ||
        asset.connectedDP ||
        asset.dpId ||
        asset.connection === "connected" ||
        asset.status === "connected",
      ),
    );

    const routeLengthMeters = cables.reduce((total, asset) => {
      if (asset.geometry?.type !== "LineString") return total;
      const points = asset.geometry.coordinates.map(([lat, lng]) => ({
        lat,
        lng,
      }));
      return total + getPathDistanceMeters(points);
    }, 0);

    const issueCount = visibleProjectAssets.filter((asset: any) => {
      const status = norm(asset.status);
      return Boolean(
        asset.auditIssue ||
        asset.auditFail ||
        asset.missingPia ||
        status.includes("fail") ||
        status.includes("issue"),
      );
    }).length;

    return {
      homesPassed: homes.length,
      homesConnected: connectedHomes.length,
      rfsPercent: homes.length
        ? Math.round((connectedHomes.length / homes.length) * 100)
        : 0,
      issueCount,
      topologyLinks: networkGraph.edges.size,
      splicePoints: visibleProjectAssets.filter((asset) =>
        isType(asset, ["joint", "cmj", "lmj", "mmj"]),
      ).length,
      joints: visibleProjectAssets.filter((asset) =>
        isType(asset, ["joint", "cmj", "lmj", "mmj"]),
      ).length,
      dps: visibleProjectAssets.filter(isDpClosureAsset).length,
      streetCabs: visibleProjectAssets.filter((asset) =>
        isType(asset, ["street cab", "streetcab", "cabinet"]),
      ).length,
      poles: visibleProjectAssets.filter((asset) => isType(asset, ["pole"]))
        .length,
      chambers: visibleProjectAssets.filter((asset) =>
        isType(asset, ["chamber", "manhole"]),
      ).length,
      cables: designCables.length,
      designCables: designCables.length,
      dropCables: dropCables.length,
      routeLengthMeters,
    };
  }, [visibleProjectAssets, networkGraph.edges.size]);

  useEffect(() => {
    if (!activeProjectArea) {
      setIsProjectWorkspaceOpen(false);
      setIsProjectWorkspaceLoading(false);
      return;
    }

    setIsProjectWorkspaceLoading(true);
    const timer = window.setTimeout(() => {
      setIsProjectWorkspaceLoading(false);
      setIsProjectWorkspaceOpen(true);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeProjectArea?.id]);

  const handleSelectProject = (projectId: string) => {
    activeProjectIdRef.current = projectId;
    setActiveProjectId(projectId);
    saveMapView({ activeProjectId: projectId });

    const project = projectAreas.find((area) => area.id === projectId);

    if (!project || project.geometry?.type !== "Polygon") return;

    const points = project.geometry.coordinates[0];

    if (!points?.length) return;

    const bounds = L.latLngBounds(
      points.map(([lat, lng]) => [lat, lng] as [number, number]),
    );

    mapRef.current?.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 18,
    });
  };

  const handleZoomToAsset = (asset: SavedMapAsset) => {
    if (!asset.geometry) return;

    if (asset.geometry.type === "Point") {
      mapRef.current?.setView(
        asset.geometry.coordinates as [number, number],
        19,
      );
      return;
    }

    if (asset.geometry.type === "LineString") {
      const points = (asset.geometry.coordinates || []) as [number, number][];
      if (points.length === 0) return;

      mapRef.current?.fitBounds(L.latLngBounds(points), {
        padding: [60, 60],
        maxZoom: 19,
      });
      return;
    }

    if (asset.geometry.type === "Polygon") {
      const points = (asset.geometry.coordinates?.[0] || []) as [
        number,
        number,
      ][];
      if (points.length === 0) return;

      mapRef.current?.fitBounds(L.latLngBounds(points), {
        padding: [60, 60],
        maxZoom: 19,
      });
    }
  };

  const resetEditor = () => {
    setEditingAssetId(null);
    setEditingAreaId(null);
    setPickedLocation(null);
    setNotes("");
    setCablePiaNoiNumber("");
    setAreaLevel("L0");
    setMapMode("pick");
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setDraftCablePoints([]);
    setDraftAreaPoints([]);
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setPoleDetails({});
    setDpDetails({
      powerReadings: ["", "", "", ""],
      closureType: "CBT",
      connectionsToHomes: 8,
      buildStatus: "Planned",
    });
    setChamberDetails({});
    setShowCableModal(false);
    setShowPoleModal(false);
    setShowDpModal(false);
    setShowChamberModal(false);
    setOpenDistributionPointAsset(null);
  };

  const openCableModalForNew = () => {
    setEditingAssetId(null);
    setAssetType("cable");
    setJointType("Cable");
    setJointName(getNextAssetName(savedJoints, "cable"));
    setNotes("");
    setCablePiaNoiNumber("");
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setPickedLocation(null);
    setDraftAreaPoints([]);
    setDraftCablePoints([]);
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setMapMode("pick");
    setShowCableModal(false);
    setIsPanelOpen(true);
  };

  const startCableDrawing = () => {
    if (!jointName.trim()) {
      alert("Enter a cable name.");
      return;
    }
    setAssetType("cable");
    setJointType("Cable");
    setMapMode("draw-cable");
    setShowCableModal(false);
  };

  const handleEditAsset = (asset: SavedMapAsset) => {
    const viewedAsset = withAssetViewedMetadata(asset, "map-edit-panel");
    setSavedJoints((prev) =>
      (prev ?? []).map((item) =>
        item.id === viewedAsset.id ? viewedAsset : item,
      ),
    );
    void createAssetActivityLog({
      projectId: activeProjectIdRef.current,
      asset: viewedAsset,
      action: "viewed",
      reason: "Asset opened",
      context: "map-edit-panel",
    });

    setEditingAssetId(viewedAsset.id);
    setAssetType(viewedAsset.assetType || "ag-joint");
    setJointName(viewedAsset.name || "");
    setJointType(viewedAsset.jointType || "");
    setNotes(viewedAsset.notes || "");
    setCablePiaNoiNumber((viewedAsset as any).piaNoiNumber || "");
    setAreaLevel(normaliseAreaLevel((viewedAsset as any).areaLevel));
    setCableType(viewedAsset.cableType || "Feeder Cable");
    setFibreCount(viewedAsset.fibreCount || "12F");
    setInstallMethod(viewedAsset.installMethod || "Underground");
    setParentCableId((viewedAsset as any).parentCableId);
    setAllocatedInputFibres(
      ((viewedAsset as any).allocatedInputFibres || []) as number[],
    );
    setPoleDetails(viewedAsset.poleDetails || {});
    setDpDetails({
      ...(viewedAsset.dpDetails || (viewedAsset as any).properties?.dpDetails || {
        powerReadings: ["", "", "", ""],
        closureType: "CBT",
        connectionsToHomes: 8,
      }),
      buildStatus: getDpOperationalStatus(viewedAsset),
    } as DistributionPointDetails);
    setChamberDetails(viewedAsset.chamberDetails || {});
    // Phase 7A.4: any Edit Details action should bring the left details panel back into view.
    setIsPanelOpen(true);

    if (asset.geometry?.type === "Point") {
      const [lat, lng] = asset.geometry.coordinates;
      setPickedLocation({ lat, lng });
      setDraftCablePoints([]);
      setMapMode("pick");

      setShowPoleModal(false);
      setShowDpModal(false);
      setShowChamberModal(false);
      setShowCableModal(false);
    } else if (asset.geometry?.type === "Polygon") {
      setPickedLocation(null);
      setDraftCablePoints([]);
      setDraftAreaPoints(
        (asset.geometry.coordinates[0] || []).map(([lat, lng]) => ({
          lat,
          lng,
        })),
      );
      setMapMode("draw-area");
      setShowCableModal(false);
    } else if (asset.geometry?.type === "LineString") {
      setPickedLocation(null);
      setDraftAreaPoints([]);

      // Edit details should only open the side-panel fields.
      // Route handles are controlled by CableLinesLayer's "Edit route" button.
      // Keeping this empty prevents every stored route vertex rendering as a marker.
      setDraftCablePoints([]);
      setMapMode("pick");
      setShowCableModal(false);
    }
  };

  // =====================================================
  // PHASE 7A.4 — REBUILD THROUGH-CABLE RESERVATIONS
  // Applies service-calculated AFN / MDU reservation updates to every
  // DP on the selected through-cable chain. Storage/save mechanics stay
  // unchanged: this only updates the same savedJoints state path used by
  // normal asset edits.
  // =====================================================
  const handleRebuildThroughCableReservations = (result: any) => {
    const updates = Array.isArray(result?.updates) ? result.updates : [];
    if (!updates.length) return;

    const updatesById = new Map<string, any>(
      updates
        .filter((update: any) => update?.assetId && update?.dpDetails)
        .map(
          (update: any) => [String(update.assetId), update] as [string, any],
        ),
    );

    setSavedJoints((prev) =>
      (prev ?? []).map((asset) => {
        const update = updatesById.get(String(asset.id || ""));
        if (!update) return asset;

        return markAssetForLiveSync({
          ...(asset as any),
          dpDetails: update.dpDetails,
        } as SavedMapAsset);
      }),
    );
  };

  // =====================================================
  // SURVEY DELETE HOMES WORKFLOW
  // Lets survey users select multiple incorrect imported homes and
  // delete them in one controlled batch. Related auto drop cables are
  // also removed so orphaned purple drop routes are not left behind.
  // Feeder, link, PIA/Openreach and designed network assets are not touched.
  // =====================================================
  const handleToggleSurveyDeleteHomesMode = () => {
    setMapMode((prev) =>
      prev === "survey-delete-homes" ? "pick" : "survey-delete-homes",
    );
    setIsPanelOpen(true);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleToggleSurveyDeleteHomeSelection = (home: SavedMapAsset) => {
    if (mapMode !== "survey-delete-homes") return;
    if (home.assetType !== "home") return;

    const homeId = String(home.id || "");
    if (!homeId) return;

    setSelectedSurveyDeleteHomeIds((prev) =>
      prev.includes(homeId)
        ? prev.filter((id) => id !== homeId)
        : [...prev, homeId],
    );
  };

  const handleClearSurveyDeleteHomeSelection = () => {
    setSelectedSurveyDeleteHomeIds([]);
  };

  const handleDeleteSelectedSurveyHomes = async () => {
    if (selectedSurveyDeleteHomeIds.length === 0) {
      alert("Select one or more wrong homes first.");
      return;
    }

    const selectedHomeIds = new Set(selectedSurveyDeleteHomeIds.map(String));

    // Project GeoJSON / OSM homes can live in projectHomes instead of savedJoints.
    // Build a wider key set so deletion works for both normal IDs and UPRN IDs,
    // and so related drop cables are removed even when they reference homeId/uprn.
    const selectedHomeKeySet = new Set<string>();
    allMapAssets.forEach((asset: any) => {
      if (asset?.assetType !== "home") return;
      const assetId = String(asset.id || "");
      if (!selectedHomeIds.has(assetId)) return;
      selectedHomeKeySet.add(assetId);
      getHomeDropKeys(asset).forEach((key) => selectedHomeKeySet.add(key));
    });

    selectedHomeIds.forEach((id) => selectedHomeKeySet.add(id));

    const ok = window.confirm(
      `Delete ${selectedSurveyDeleteHomeIds.length} selected home${selectedSurveyDeleteHomeIds.length === 1 ? "" : "s"} and any related drop cables?\n\nThis will not delete DPs, joints, feeder cables, link cables, PIA/Openreach overlay or project areas.`,
    );

    if (!ok) return;

    const shouldRemoveAsset = (asset: SavedMapAsset) => {
      const assetId = String(asset.id || "");

      if (asset.assetType === "home" && selectedHomeIds.has(assetId)) {
        return true;
      }

      const cableType = String((asset as any).cableType || "").toLowerCase();
      const isRelatedDropCable =
        asset.assetType === "cable" &&
        (cableType.includes("drop") ||
          String((asset as any).isDropCable || "").toLowerCase() === "true" ||
          String((asset as any).autoGeneratedDrop || "").toLowerCase() ===
            "true" ||
          String((asset as any).autoGenerated || "").toLowerCase() === "true" ||
          String((asset as any).generated || "").toLowerCase() === "true") &&
        getDropHomeKeys(asset).some((key) => selectedHomeKeySet.has(key));

      return isRelatedDropCable;
    };

    setSavedJoints((prev) =>
      (prev ?? []).filter((asset) => !shouldRemoveAsset(asset)),
    );

    if (activeProjectId) {
      const updatedProjectHomes = (projectHomes ?? []).filter((home) => {
        const homeId = String(home.id || "");
        return !selectedHomeIds.has(homeId);
      });

      setProjectHomes(updatedProjectHomes);

      try {
        await saveProjectHomes(activeProjectId, updatedProjectHomes);
      } catch (err) {
        console.error(
          "Failed to save project homes after survey cleanup delete",
          err,
        );
        alert(
          "Homes were removed from the map view, but saving project homes failed. Check the console before refreshing.",
        );
      }
    }

    setSelectedSurveyDeleteHomeIds([]);
    setMapMode("pick");
  };
  // =====================================================
  // MOVE HOMES TO DP WORKFLOW
  // Select one or many UPRNs/homes, then click a target DP.
  // This only removes/rebuilds Drop cables and stamps the homes as manual.
  // Feeder/link cables are never touched.
  // =====================================================
  const handleToggleMoveHomesMode = () => {
    setMapMode((prev) => (prev === "move-homes" ? "pick" : "move-homes"));
    setIsPanelOpen(true);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleToggleMoveHomeSelection = (home: SavedMapAsset) => {
    const homeId = String(home.id || "");
    if (!homeId) return;

    setSelectedMoveHomeIds((prev) =>
      prev.includes(homeId)
        ? prev.filter((id) => id !== homeId)
        : [...prev, homeId],
    );
  };

  const handleClearMoveHomeSelection = () => {
    setSelectedMoveHomeIds([]);
  };

  const handleMoveSelectedHomesToDp = async (targetDp: SavedMapAsset) => {
    if (mapMode !== "move-homes") return;

    if (targetDp.assetType !== "distribution-point") return;

    const selectedHomes = allMapAssets.filter(
      (asset) =>
        asset.assetType === "home" && selectedMoveHomeIds.includes(asset.id),
    );

    if (selectedHomes.length === 0) {
      alert("Select one or more UPRNs/homes first, then click the target DP.");
      return;
    }

    const reason = getChangeReasonForCurrentMode(
      "updated",
      `Move ${selectedHomes.length} home${selectedHomes.length === 1 ? "" : "s"} to ${targetDp.name || targetDp.id}`,
    );
    if (!reason) return;

    const selectedHomeKeySet = new Set<string>();
    selectedHomes.forEach((home) => {
      getHomeDropKeys(home).forEach((key) => selectedHomeKeySet.add(key));
    });

    const newDrops = selectedHomes
      .map((home) => createManualDropCable(targetDp, home))
      .filter(Boolean) as SavedMapAsset[];

    if (newDrops.length !== selectedHomes.length) {
      alert(
        "Some selected homes could not be moved because coordinates were missing.",
      );
      return;
    }

    const targetDpId = String(targetDp.id);

    const stampHome = (home: SavedMapAsset): SavedMapAsset =>
      markAssetForLiveSync(
        withAssetEditedMetadata(
          {
            ...home,
            connectedDpId: targetDpId,
            connection: "connected",
            connectionMode: "manual",
            properties: {
              ...((home as any).properties || {}),
              connectedDpId: targetDpId,
              connection: "connected",
              connectionMode: "manual",
            },
          } as SavedMapAsset,
          "updated",
          reason,
        ),
        false,
      );

    setSavedJoints((prev) => {
      const withoutOldDrops = (prev ?? []).filter((asset: any) => {
        if (!isDropCable(asset)) return true;
        const dropKeys = getDropHomeKeys(asset);
        return !dropKeys.some((key) => selectedHomeKeySet.has(key));
      });

      const updatedAssets = withoutOldDrops.map((asset) => {
        if (asset.assetType !== "home") return asset;
        if (!selectedMoveHomeIds.includes(asset.id)) return asset;
        return stampHome(asset);
      });

      const markedDrops = newDrops.map((drop) =>
        markAssetForLiveSync(drop, true),
      );

      return [...updatedAssets, ...markedDrops];
    });

    if (activeProjectId) {
      const updatedProjectHomes = projectHomes.map((home) => {
        if (!selectedMoveHomeIds.includes(home.id)) return home;
        return stampHome(home);
      });

      setProjectHomes(updatedProjectHomes);
      await saveProjectHomes(activeProjectId, updatedProjectHomes);
    }

    writeAssetAuditLog({
      asset: targetDp,
      action: "updated",
      reason,
      comment: `Moved ${selectedHomes.length} home${selectedHomes.length === 1 ? "" : "s"} to this DP and regenerated manual drop cables.`,
      before: selectedHomes,
      after: newDrops,
    });

    setSelectedMoveHomeIds([]);
    setMapMode("pick");
    alert(
      `Moved ${selectedHomes.length} home${selectedHomes.length === 1 ? "" : "s"} to ${targetDp.name || "selected DP"}.`,
    );
  };

  // =====================================================
  // APP MODE / AUDIT BEHAVIOUR
  // Survey + Build save fast with no reason popup.
  // Maintenance requires a reason popup for traceability.
  // =====================================================
  const getChangeReasonForCurrentMode = (
    action: AssetChangeAction,
    assetName?: string,
  ): string | null => {
    if (requiresAuditReason) {
      return requestChangeReason(action, assetName);
    }

    return `${activeMode} mode ${action}`;
  };

  const handleSaveEdits = async (detailOverrides?: {
    poleDetails?: PoleDetails;
    dpDetails?: DistributionPointDetails;
    chamberDetails?: ChamberDetails;
  }) => {
    if (!editingAssetId) return;

    const beforeAsset = (savedJoints ?? []).find(
      (asset) => asset.id === editingAssetId,
    );
    const reason = getChangeReasonForCurrentMode(
      "updated",
      beforeAsset?.name || jointName,
    );
    if (!reason) return;

    let savedAfterAsset: SavedMapAsset | null = null;
    const editedCableCoordinates =
      assetType === "cable" && draftCablePoints.length >= 2
        ? sanitiseCableRouteCoordinates(draftCablePoints)
        : null;

    const nextPoleDetails = detailOverrides?.poleDetails ?? poleDetails;
    const nextDpDetails = detailOverrides?.dpDetails ?? dpDetails;
    const nextChamberDetails =
      detailOverrides?.chamberDetails ?? chamberDetails;

    setSavedJoints((prev) =>
      prev.map((asset) => {
        if (asset.id !== editingAssetId) return asset;

        if (assetType === "area") {
          if (draftAreaPoints.length < 3) return asset;

          savedAfterAsset = withAssetEditedMetadata(
            markAssetForLiveSync({
              ...asset,
              name: jointName.trim() || asset.name,
              jointType: "Polygon Area",
              notes: notes.trim(),
              assetType: "area",
              areaLevel,
              geometry: {
                type: "Polygon",
                coordinates: [draftAreaPoints.map((p) => [p.lat, p.lng])],
              },
            }),
            "updated",
            reason,
          );
          return savedAfterAsset;
        }

        if (asset.geometry?.type === "Point") {
          if (!pickedLocation) return asset;

          savedAfterAsset = withAssetEditedMetadata(
            markAssetForLiveSync({
              ...asset,
              name: jointName.trim() || asset.name,
              jointType:
                assetType === "street-cab"
                  ? "Street Cab"
                  : assetType === "pole"
                    ? "Pole"
                    : assetType === "distribution-point"
                      ? "Distribution Point"
                      : assetType === "chamber"
                        ? "Chamber"
                        : assetType === "home"
                          ? "Home"
                          : jointType,
              notes: notes.trim(),
              assetType,
              ...(assetType === "distribution-point"
                ? {
                    status: getDpOperationalStatus({
                      ...(asset as any),
                      dpDetails: nextDpDetails,
                    }),
                    buildStatus: getDpOperationalStatus({
                      ...(asset as any),
                      dpDetails: nextDpDetails,
                    }),
                    properties: {
                      ...((asset as any).properties || {}),
                      status: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                      buildStatus: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                      dpDetails: {
                        ...(((asset as any).properties || {}).dpDetails || {}),
                        ...nextDpDetails,
                        buildStatus: getDpOperationalStatus({
                          ...(asset as any),
                          dpDetails: nextDpDetails,
                        }),
                      },
                    },
                  }
                : {}),
              poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
              dpDetails:
                assetType === "distribution-point"
                  ? ({
                      ...nextDpDetails,
                      buildStatus: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                    } as DistributionPointDetails)
                  : undefined,
              chamberDetails:
                assetType === "chamber" ? nextChamberDetails : undefined,
              geometry: {
                type: "Point",
                coordinates: [pickedLocation.lat, pickedLocation.lng],
              },
            }),
            "updated",
            reason,
          );
          return savedAfterAsset;
        }

        savedAfterAsset = withAssetEditedMetadata(
          markAssetForLiveSync({
            ...asset,
            name: jointName.trim() || asset.name,
            jointType: "Cable",
            notes: notes.trim(),
            piaNoiNumber: cablePiaNoiNumber.trim(),
            assetType: "cable",
            cableType,
            fibreCount,
            installMethod,
            parentCableId,
            allocatedInputFibres,
            routeMode: (asset as any).routeMode,
            geometry: {
              type: "LineString",
              coordinates: editedCableCoordinates?.length
                ? editedCableCoordinates
                : sanitiseCableRouteCoordinates(
                    (asset.geometry?.type === "LineString"
                      ? asset.geometry.coordinates
                      : []) as [number, number][],
                  ),
            },
          }),
          "updated",
          reason,
        );
        return savedAfterAsset;
      }),
    );

    if (savedAfterAsset) {
      writeAssetAuditLog({
        asset: savedAfterAsset,
        action: "updated",
        reason,
        before: beforeAsset,
        after: savedAfterAsset,
      });
    }

    resetEditor();
  };
  // =====================================================
  // SAVE / UPDATE MAP ASSETS
  // Handles joints, street cabs, poles, DPs, chambers, cables, areas.
  // Exchange saving can be added separately once the ⭐ marker UI is live.
  // =====================================================
  const handleSaveJoint = (detailOverrides?: {
    poleDetails?: PoleDetails;
    dpDetails?: DistributionPointDetails;
    chamberDetails?: ChamberDetails;
  }) => {
    if (!pickedLocation) {
      alert("Click a location on the map first.");
      return;
    }

    if (!jointName.trim()) {
      if (assetType === "street-cab") {
        alert("Enter a street cab name.");
      } else if (assetType === "pole") {
        alert("Enter a pole name.");
      } else if (assetType === "distribution-point") {
        alert("Enter a distribution point name.");
      } else if (assetType === "chamber") {
        alert("Enter a chamber name.");
      } else if (assetType === "home") {
        alert("Enter a home name.");
      } else {
        alert("Enter a joint name.");
      }
      return;
    }

    if (assetType === "cable") {
      alert("Use Add Cable and Start Drawing for cables.");
      return;
    }

    if (assetType === "area") {
      alert("Use Draw Area, then Finish Area for polygons.");
      return;
    }

    const nextPoleDetails = detailOverrides?.poleDetails ?? poleDetails;
    const nextDpDetails = detailOverrides?.dpDetails ?? dpDetails;
    const nextChamberDetails =
      detailOverrides?.chamberDetails ?? chamberDetails;

    const reason = getChangeReasonForCurrentMode("created", jointName.trim());
    if (!reason) return;

    const record: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: jointName.trim(),
      assetType,
      jointType:
        assetType === "street-cab"
          ? "Street Cab"
          : assetType === "pole"
            ? "Pole"
            : assetType === "distribution-point"
              ? "Distribution Point"
              : assetType === "chamber"
                ? "Chamber"
                : assetType === "home"
                  ? "Home"
                  : jointType,
      notes: notes.trim(),
      mappingRows: [],
      ...(assetType === "distribution-point"
        ? {
            status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            properties: {
              status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              dpDetails: {
                ...nextDpDetails,
                buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              },
            },
          }
        : {}),
      poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
      dpDetails:
        assetType === "distribution-point"
          ? ({
              ...nextDpDetails,
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            } as DistributionPointDetails)
          : undefined,
      chamberDetails: assetType === "chamber" ? nextChamberDetails : undefined,
      geometry: {
        type: "Point",
        coordinates: [pickedLocation.lat, pickedLocation.lng],
      },
    };

    const savedRecord = markAssetForLiveSync(record, true);
    setSavedJoints((prev) => [...prev, savedRecord]);
    writeAssetAuditLog({
      asset: savedRecord,
      action: "created",
      reason,
      after: savedRecord,
    });
    resetEditor();
  };

  const handleFinishArea = () => {
    if (draftAreaPoints.length < 3) {
      alert("Add at least three polygon points.");
      return;
    }

    const areaName =
      jointName.trim() ||
      `Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`;

    const reason = getChangeReasonForCurrentMode("created", areaName);
    if (!reason) return;

    const areaRecord: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: areaName,
      assetType: "area",
      jointType: "Polygon Area",
      notes: notes.trim(),
      areaLevel,
      mappingRows: [],
      geometry: {
        type: "Polygon",
        coordinates: [draftAreaPoints.map((p) => [p.lat, p.lng])],
      },
    };

    const savedAreaRecord = markAssetForLiveSync(areaRecord, true);
    setSavedJoints((prev) => [...prev, savedAreaRecord]);
    writeAssetAuditLog({
      asset: savedAreaRecord,
      action: "created",
      reason,
      after: savedAreaRecord,
    });
    resetEditor();
  };

  const handleUndoAreaPoint = () => {
    setDraftAreaPoints((prev) => prev.slice(0, -1));
  };

  const handleClearArea = () => {
    setDraftAreaPoints([]);
  };

  const handleMoveAreaPoint = (index: number, point: LatLngLiteral) => {
    setDraftAreaPoints((prev) =>
      prev.map((existingPoint, existingIndex) =>
        existingIndex === index ? point : existingPoint,
      ),
    );
  };

  const handleFinishCable = async () => {
    if (draftCablePoints.length < 2) {
      alert("Add at least two cable points.");
      return;
    }

    const cableName =
      jointName.trim() || getNextAssetName(savedJoints, "cable");

    setIsRoutingCable(true);

    try {
      const shouldUseReferenceDuct = shouldUseDuctTraceForInstallMethod(installMethod);
      const ductTracePoints = shouldUseReferenceDuct && selectedReferenceDuctId
        ? traceReferenceDuctRouteBetweenPoints(
            draftCablePoints[0],
            draftCablePoints[draftCablePoints.length - 1],
            snapCandidateAssets,
            25,
            selectedReferenceDuctId,
          )
        : null;

      if (shouldUseReferenceDuct && selectedReferenceDuctId && !ductTracePoints) {
        alert(
          `Could not trace both cable ends onto the selected duct${selectedReferenceDuctName ? ` (${selectedReferenceDuctName})` : ""}.\n\nMove the first/last cable points closer to that duct, or clear the selected duct and choose another one.`,
        );
        return;
      }

      const routedCoordinates = sanitiseCableRouteCoordinates(
        ductTracePoints ?? (await routePointsToRoads(draftCablePoints)),
      );

      const cableRecord = {
        id: crypto.randomUUID(),
        name: cableName,
        assetType: "cable",
        jointType: "Cable",
        notes: notes.trim(),
        piaNoiNumber: cablePiaNoiNumber.trim(),
        cableType,
        fibreCount,
        installMethod,
        parentCableId,
        allocatedInputFibres,
        routeMode: ductTracePoints ? "selected-or-duct" : "road",
        referenceDuctId: ductTracePoints ? selectedReferenceDuctId || undefined : undefined,
        referenceDuctName: ductTracePoints ? selectedReferenceDuctName || undefined : undefined,
        geometry: {
          type: "LineString",
          coordinates: routedCoordinates,
        },
      } as SavedMapAsset;

      const firstPoint = draftCablePoints[0];
      const lastPoint = draftCablePoints[draftCablePoints.length - 1];
      const endpointDps = [
        findDpAtCableEnd(operationalSavedJoints, firstPoint),
        findDpAtCableEnd(operationalSavedJoints, lastPoint),
      ].filter(Boolean) as SavedMapAsset[];

      // Use both the drawn cable route and the road-routed cable route.
      // Road routing can pull the line away from poles/DPs, so checking only
      // the final routed line can miss DPs sitting on the actual pole line.
      const routeDps = [
        ...findDpsAlongCable(operationalSavedJoints, draftCablePoints, 35),
        ...findDpsAlongCable(operationalSavedJoints, routedCoordinates, 35),
      ];

      const fedDps = Array.from(
        new Map(
          [...endpointDps, ...routeDps].map((dp) => [dp.id, dp]),
        ).values(),
      );

      // Homes can live outside savedJoints (for example project GeoJSON homes in
      // projectHomes), so use allMapAssets here. Using savedJoints only is the
      // reason DP detection worked while drop generation returned [].
      const homes = allMapAssets.filter(
        (asset: any) =>
          asset?.assetType === "home" ||
          asset?.type === "home" ||
          asset?.properties?.UPRN ||
          asset?.UPRN ||
          asset?.uprn,
      );

      // Generate drops per fed DP/AFN. Each passed DP claims nearby unconnected homes
      // within the Openreach 68m drop rule, up to that DP's own capacity.
      const autoDrops = createDropCableRecordsFromDPs({
        dps: fedDps,
        homes,
        existingDrops: [...allMapAssets, cableRecord].filter(
          (asset: any) =>
            asset?.assetType === "cable" && asset?.cableType === "Drop",
        ),
        maxDistanceM: 68,
      }) as SavedMapAsset[];

      console.log("AUTO DROPS", autoDrops);

      const getHomeConnectionKey = (asset: any): string =>
        String(
          asset?.id ??
            asset?.assetId ??
            asset?.homeId ??
            asset?.uprn ??
            asset?.UPRN ??
            asset?.properties?.UPRN ??
            asset?.properties?.uprn ??
            "",
        ).trim();

      const dropHomeConnections = new Map<string, { connectedDpId: string }>();

      autoDrops.forEach((drop: any) => {
        const homeId = String(
          drop.homeId ??
            drop.toAssetId ??
            drop.connectedHomeId ??
            drop.uprn ??
            drop.UPRN ??
            "",
        ).trim();

        const connectedDpId = String(
          drop.dpId ?? drop.fromAssetId ?? drop.connectedDpId ?? "",
        ).trim();

        if (homeId && connectedDpId) {
          dropHomeConnections.set(homeId, { connectedDpId });

          // GeoJSON imports use IDs like `uprn-72271124`, while some drop
          // generators expose the raw UPRN as `homeId`. Store both keys.
          if (!homeId.startsWith("uprn-")) {
            dropHomeConnections.set(`uprn-${homeId}`, { connectedDpId });
          }
        }
      });

      setSavedJoints((prev) => {
        const markedCableRecord = markAssetForLiveSync(cableRecord, true);
        const markedAutoDrops = autoDrops.map((asset) =>
          markAssetForLiveSync(asset, true),
        );

        const updatedExistingAssets = prev.map((asset) => {
          if (asset.assetType !== "home") return asset;

          const update = dropHomeConnections.get(getHomeConnectionKey(asset));
          if (!update) return asset;

          // Respect a manual override. Auto-generated drops should not overwrite a
          // home that the user manually assigned to a specific DP.
          const isManualOverride =
            String((asset as any).connectionMode || "").toLowerCase() ===
              "manual" && Boolean((asset as any).connectedDpId);

          if (isManualOverride) return asset;

          return markAssetForLiveSync(
            {
              ...asset,
              connectedDpId: update.connectedDpId,
              connection: "connected",
              connectionMode: "auto-dp-drop",
              properties: {
                ...((asset as any).properties || {}),
                connectedDpId: update.connectedDpId,
                connection: "connected",
                connectionMode: "auto-dp-drop",
              },
            },
            true,
          );
        });

        return [
          ...updatedExistingAssets,
          markedCableRecord,
          ...markedAutoDrops,
        ];
      });

      // Project GeoJSON homes are stored separately from savedJoints. Stamp and
      // persist them here so the home popup can show connected DP immediately and
      // the metadata survives reloads without changing the chunked map asset save path.
      if (activeProjectId) {
        const updatedProjectHomes = projectHomes.map((home) => {
          const update = dropHomeConnections.get(getHomeConnectionKey(home));
          if (!update) return home;

          const isManualOverride =
            String((home as any).connectionMode || "").toLowerCase() ===
              "manual" && Boolean((home as any).connectedDpId);

          if (isManualOverride) return home;

          return markAssetForLiveSync(
            {
              ...home,
              connectedDpId: update.connectedDpId,
              connection: "connected",
              connectionMode: "auto-dp-drop",
              properties: {
                ...((home as any).properties || {}),
                connectedDpId: update.connectedDpId,
                connection: "connected",
                connectionMode: "auto-dp-drop",
              },
            },
            true,
          );
        });

        setProjectHomes(updatedProjectHomes);
        await saveProjectHomes(activeProjectId, updatedProjectHomes);
      }

      if (autoDrops.length > 0) {
        alert(
          `Cable saved. Auto-connected ${autoDrops.length} nearby homes to the fed DP/AFN within 68m.`,
        );
      }

      resetEditor();
    } finally {
      setIsRoutingCable(false);
    }
  };

  const handleUndoCablePoint = () => {
    setDraftCablePoints((prev) => prev.slice(0, -1));
  };

  const handleClearCable = () => {
    setDraftCablePoints([]);
  };
  const handleMoveCablePoint = (index: number, point: LatLngLiteral) => {
    const snapped = snapPointToAssets(
      point,
      snapCandidateAssets.filter((asset) => asset.assetType !== "area"),
      snapEnabled,
      8,
    );

    setDraftCablePoints((prev) =>
      prev.map((existingPoint, existingIndex) =>
        existingIndex === index ? snapped : existingPoint,
      ),
    );
  };

  const handleDeleteCablePoint = (index: number) => {
    setDraftCablePoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInsertCablePoint = (index: number, point: LatLngLiteral) => {
    const snapped = snapPointToAssets(
      point,
      snapCandidateAssets.filter((asset) => asset.assetType !== "area"),
      snapEnabled,
      8,
    );

    setDraftCablePoints((prev) => [
      ...prev.slice(0, index + 1),
      snapped,
      ...prev.slice(index + 1),
    ]);
  };
  const handleDeleteAsset = async (id: string) => {
    const deletedId = String(id);
    const deletedAsset = (savedJoints ?? []).find(
      (asset) => asset.id === deletedId,
    );
    const reason = getChangeReasonForCurrentMode(
      "deleted",
      deletedAsset?.name || deletedId,
    );
    if (!reason) return;

    const getHomeConnectionKey = (asset: any): string =>
      String(
        asset?.id ??
          asset?.assetId ??
          asset?.homeId ??
          asset?.uprn ??
          asset?.UPRN ??
          asset?.properties?.UPRN ??
          asset?.properties?.uprn ??
          "",
      ).trim();

    const getDropHomeKeys = (drop: any): string[] => {
      const rawHomeId = String(
        drop?.homeId ??
          drop?.toAssetId ??
          drop?.connectedHomeId ??
          drop?.uprn ??
          drop?.UPRN ??
          "",
      ).trim();

      if (!rawHomeId) return [];

      return rawHomeId.startsWith("uprn-")
        ? [rawHomeId, rawHomeId.replace(/^uprn-/, "")]
        : [rawHomeId, `uprn-${rawHomeId}`];
    };

    const homeKeysToUnstamp = new Set<string>();

    savedJoints.forEach((asset: any) => {
      if (!isDropCable(asset)) return;

      const dropDpId = String(asset?.dpId ?? asset?.fromAssetId ?? "").trim();
      const dropHomeId = String(asset?.homeId ?? asset?.toAssetId ?? "").trim();

      if (
        dropDpId === deletedId ||
        dropHomeId === deletedId ||
        asset?.id === deletedId
      ) {
        getDropHomeKeys(asset).forEach((key) => homeKeysToUnstamp.add(key));
      }
    });

    setSavedJoints((prev) => {
      const filteredAssets = prev.filter((asset: any) => {
        if (asset?.id === deletedId) return false;

        // If a DP/AFN/CBT/home/drop is deleted, remove related auto-generated
        // drop cables as well so stale drop lines do not remain on the map.
        if (isDropCable(asset)) {
          const dropDpId = String(
            asset?.dpId ?? asset?.fromAssetId ?? "",
          ).trim();
          const dropHomeId = String(
            asset?.homeId ?? asset?.toAssetId ?? "",
          ).trim();

          return dropDpId !== deletedId && dropHomeId !== deletedId;
        }

        return true;
      });

      return filteredAssets.map((asset: any) => {
        const connectedDpId = String(
          asset?.connectedDpId ?? asset?.properties?.connectedDpId ?? "",
        ).trim();
        const homeKey = getHomeConnectionKey(asset);

        if (
          connectedDpId !== deletedId &&
          (!homeKey || !homeKeysToUnstamp.has(homeKey))
        ) {
          return asset;
        }

        return markAssetForLiveSync(
          {
            ...asset,
            connection: "unconnected",
            connectedDpId: null,
            connectionMode: null,
            properties: {
              ...((asset as any).properties || {}),
              connection: "unconnected",
              connectedDpId: null,
              connectionMode: null,
            },
          },
          true,
        );
      });
    });

    if (deletedAsset) {
      writeAssetAuditLog({
        asset: deletedAsset,
        action: "deleted",
        reason,
        before: deletedAsset,
      });
    }

    if (activeProjectId && homeKeysToUnstamp.size > 0) {
      const updatedProjectHomes = projectHomes.map((home: any) => {
        const connectedDpId = String(
          home?.connectedDpId ?? home?.properties?.connectedDpId ?? "",
        ).trim();
        const homeKey = getHomeConnectionKey(home);

        if (
          connectedDpId !== deletedId &&
          (!homeKey || !homeKeysToUnstamp.has(homeKey))
        ) {
          return home;
        }

        return markAssetForLiveSync(
          {
            ...home,
            connection: "unconnected",
            connectedDpId: null,
            connectionMode: null,
            properties: {
              ...((home as any).properties || {}),
              connection: "unconnected",
              connectedDpId: null,
              connectionMode: null,
            },
          },
          true,
        );
      });

      setProjectHomes(updatedProjectHomes);
      await saveProjectHomes(activeProjectId, updatedProjectHomes);
    }

    if (editingAssetId === id) {
      resetEditor();
    }
  };

  const handleClearMeasurement = () => {
    setMeasurePoints([]);
    setMapMode("pick");
  };

  const handleUndoMeasurementPoint = () => {
    setMeasurePoints((prev) => prev.slice(0, -1));
  };

  const handleMapRightClick = (
    pos: LatLngLiteral,
    screen: { x: number; y: number },
  ) => {
    setContextMenu({
      visible: true,
      x: screen.x,
      y: screen.y,
      latlng: pos,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      latlng: null,
    });
  };

  const handleContextAddAsset = (type: MapContextAction) => {
    const clickedPoint = contextMenu.latlng;

    if (type === "measure") {
      setMapMode("measure");
      setIsPanelOpen(false);
      handleCloseContextMenu();
      return;
    }

    if (type === "pick-location") {
      if (clickedPoint) setPickedLocation(clickedPoint);
      setMapMode("pick");
      setIsPanelOpen(true);
      handleCloseContextMenu();
      return;
    }

    setEditingAssetId(null);
    setEditingAreaId(null);
    setShowCableModal(false);
    setShowPoleModal(false);
    setShowDpModal(false);
    setShowChamberModal(false);
    setDraftCablePoints([]);
    setDraftAreaPoints([]);
    setNotes("");
    setCablePiaNoiNumber("");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setIsPanelOpen(true);

    if (type === "cable") {
      openCableModalForNew();
      handleCloseContextMenu();
      return;
    }

    if (type === "area") {
      setAssetType("area");
      setJointType("Polygon Area");
      setJointName(
        `Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`,
      );
      setAreaLevel("L0");
      setPickedLocation(null);
      setDraftAreaPoints(clickedPoint ? [clickedPoint] : []);
      setMapMode("draw-area");
      handleCloseContextMenu();
      return;
    }

    if (!clickedPoint) {
      handleCloseContextMenu();
      return;
    }

    if (type === "exchange") {
      const exchange: ExchangeAsset = {
        id: crypto.randomUUID(),
        name: `Exchange ${savedExchanges.length + 1}`,
        lat: clickedPoint.lat,
        lng: clickedPoint.lng,
      };

      handleSaveExchange(exchange);
      setOpenExchangeAsset(exchange);
      handleCloseContextMenu();
      return;
    }

    setPickedLocation(clickedPoint);
    setAssetType(type as AssetType);
    setJointName(
      getNextAssetName(
        savedJoints,
        type === "joint" ? "ag-joint" : (type as any),
      ),
    );
    setMapMode("pick");

    if (type === "joint") {
      setAssetType("ag-joint");
      setJointName(getNextAssetName(savedJoints, "ag-joint"));
      setJointType("LMJ (40 trays)");
    }

    if (type === "pole") {
      setJointType("Pole");
      setPoleDetails({});
    }

    if (type === "distribution-point") {
      setJointType("Distribution Point");
      setDpDetails({
        powerReadings: ["", "", "", ""],
        closureType: "CBT",
        connectionsToHomes: 8,
        buildStatus: "Planned",
      });
    }

    if (type === "chamber") {
      setJointType("Chamber");
      setChamberDetails({});
    }

    if (type === "street-cab") {
      setJointType("Street Cab");
    }

    handleCloseContextMenu();
  };

  const toggleLayer = (key: keyof LayerVisibility) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleCablePoint = (point: LatLngLiteral) => {
    const snapped = snapPointToAssets(
      point,
      snapCandidateAssets.filter((asset) => asset.assetType !== "area"),
      snapEnabled,
      8,
    );
    setDraftCablePoints((prev) => [...prev, snapped]);
  };

  const handleAreaPoint = (point: LatLngLiteral) => {
    setDraftAreaPoints((prev) => [...prev, point]);
  };

  const loadExistingHomesOrContinueImport = async (
    projectId: string,
  ): Promise<boolean> => {
    const existingHomes = await loadProjectHomes(projectId);

    if (existingHomes.length === 0) {
      return false;
    }

    setProjectHomes(existingHomes);
    setLoadedHomesProjectId(projectId);
    alert(
      "Homes are already saved for this project, so I loaded the saved homes instead of importing duplicates.",
    );
    return true;
  };

  const handleLoadOsmHomes = async () => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then load homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const loadedExistingHomes =
      await loadExistingHomesOrContinueImport(activeProjectId);
    if (loadedExistingHomes) return;

    if (!mapBounds) {
      alert("Move or zoom the map once, then try again.");
      return;
    }

    const latSpan = Math.abs(mapBounds.north - mapBounds.south);
    const lngSpan = Math.abs(mapBounds.east - mapBounds.west);

    if (latSpan > 0.08 || lngSpan > 0.12) {
      alert(
        "Zoom in closer before loading OSM homes. This avoids importing too many buildings at once.",
      );
      return;
    }

    setIsLoadingOsmHomes(true);

    try {
      const homes = (
        await loadOsmBuildingsAsHomes(mapBounds, allMapAssets)
      ).map((asset) => ({
        ...(asset as SavedMapAsset),
        projectId: activeProjectId,
      }));

      if (homes.length === 0) {
        alert("No new OSM homes found in the current map view.");
        return;
      }

      const savedHomes = homes.map((asset) =>
        markAssetForLiveSync(asset as SavedMapAsset, true),
      );
      const mergedHomes = [...projectHomes, ...savedHomes];

      await saveProjectHomes(activeProjectId, mergedHomes);
      setProjectHomes(mergedHomes);
      setLoadedHomesProjectId(activeProjectId);

      alert(`Saved ${homes.length} OSM homes to this project.`);
    } catch (err: any) {
      alert(`Failed to load OSM homes: ${err.message || String(err)}`);
    } finally {
      setIsLoadingOsmHomes(false);
    }
  };

  const createHomeAssetsFromGeoJson = (
    geojson: any,
    onlyInBounds?: L.LatLngBounds,
  ): SavedMapAsset[] => {
    if (!geojson?.features || !Array.isArray(geojson.features)) {
      throw new Error("Invalid GeoJSON");
    }

    const existingHomeKeys = new Set(
      allMapAssets
        .filter((asset) => asset.assetType === "home")
        .map((asset) => {
          const uprn = String(
            (asset as any).uprn || asset.name || asset.id || "",
          ).trim();
          return uprn || asset.id;
        }),
    );

    return geojson.features
      .map((feature: any) => {
        if (feature?.geometry?.type !== "Point") return null;
        if (!Array.isArray(feature.geometry.coordinates)) return null;

        const [lngRaw, latRaw] = feature.geometry.coordinates;
        const lat = Number(latRaw);
        const lng = Number(lngRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (onlyInBounds && !onlyInBounds.contains([lat, lng])) return null;

        const rawUprn =
          feature.properties?.UPRN ??
          feature.properties?.uprn ??
          feature.properties?.Uprn ??
          feature.properties?.id ??
          "";
        const uprn = String(rawUprn || "").trim();
        const id = uprn ? `uprn-${uprn}` : crypto.randomUUID();
        const duplicateKey = uprn || id;

        if (existingHomeKeys.has(duplicateKey) || existingHomeKeys.has(id)) {
          return null;
        }

        existingHomeKeys.add(duplicateKey);
        existingHomeKeys.add(id);

        return {
          id,
          name: uprn ? `UPRN ${uprn}` : "Home",
          assetType: "home",
          projectId: activeProjectId || undefined,
          jointType: "Home",
          notes: "",
          mappingRows: [],
          uprn: uprn || undefined,
          connectionMode: "auto",
          geometry: {
            type: "Point",
            coordinates: [lat, lng],
          },
        } as SavedMapAsset;
      })
      .filter(Boolean) as SavedMapAsset[];
  };

  const loadGeoJsonHomes = (file: File) => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then import homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const projectIdForImport = activeProjectId;
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const loadedExistingHomes =
          await loadExistingHomesOrContinueImport(projectIdForImport);
        if (loadedExistingHomes) return;

        const geojson = JSON.parse(String(e.target?.result || ""));
        const homes = createHomeAssetsFromGeoJson(geojson);

        if (homes.length === 0) {
          alert("No new GeoJSON homes found in that file.");
          return;
        }

        const savedHomes = homes.map((asset) =>
          markAssetForLiveSync(
            { ...asset, projectId: projectIdForImport },
            true,
          ),
        );
        const mergedHomes = [...projectHomes, ...savedHomes];

        await saveProjectHomes(projectIdForImport, mergedHomes);
        setProjectHomes(mergedHomes);
        setLoadedHomesProjectId(projectIdForImport);

        alert(`Saved ${homes.length} GeoJSON homes to this project.`);
      } catch (err: any) {
        console.error(err);
        alert(`Failed to load GeoJSON homes: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const loadGeoJsonHomesInView = (file: File) => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then import homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const projectIdForImport = activeProjectId;
    const map = mapRef.current;

    if (!map) {
      alert("Map is not ready yet. Move or zoom the map once, then try again.");
      return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const loadedExistingHomes =
          await loadExistingHomesOrContinueImport(projectIdForImport);
        if (loadedExistingHomes) return;

        const geojson = JSON.parse(String(e.target?.result || ""));
        const importedHomes = createHomeAssetsFromGeoJson(
          geojson,
          map.getBounds(),
        );
        const homes = activeProjectArea
          ? filterAssetsForProjectArea(importedHomes, activeProjectArea)
          : importedHomes;

        if (homes.length === 0) {
          alert("No new GeoJSON homes found in the current map view.");
          return;
        }

        const savedHomes = homes.map((asset) =>
          markAssetForLiveSync(
            { ...asset, projectId: projectIdForImport },
            true,
          ),
        );
        const mergedHomes = [...projectHomes, ...savedHomes];

        await saveProjectHomes(projectIdForImport, mergedHomes);
        setProjectHomes(mergedHomes);
        setLoadedHomesProjectId(projectIdForImport);

        alert(`Saved ${homes.length} GeoJSON homes in view to this project.`);
      } catch (err: any) {
        console.error(err);
        alert(`Failed to load GeoJSON homes: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(savedJoints, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-assets.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGeoJson = () => {
    const geojson = {
      type: "FeatureCollection",
      features: (savedJoints ?? [])
        .map((asset) => {
          if (asset.geometry?.type === "Point") {
            const [lat, lng] = asset.geometry.coordinates;
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "ag-joint",
                jointType: asset.jointType,
                notes: asset.notes || "",
                cableType: asset.cableType || "",
                fibreCount: asset.fibreCount || "",
                installMethod: asset.installMethod || "",
                poleDetails: asset.poleDetails || null,
                dpDetails: asset.dpDetails || null,
                chamberDetails: asset.chamberDetails || null,
                streetCabDetails: asset.streetCabDetails || null,
              },
              geometry: {
                type: "Point",
                coordinates: [lng, lat],
              },
            };
          }

          if (asset.geometry?.type === "LineString") {
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "cable",
                jointType: asset.jointType,
                notes: asset.notes || "",
                cableType: asset.cableType || "",
                fibreCount: asset.fibreCount || "",
                installMethod: asset.installMethod || "",
              },
              geometry: {
                type: "LineString",
                coordinates: asset.geometry.coordinates.map(([lat, lng]) => [
                  lng,
                  lat,
                ]),
              },
            };
          }

          if (asset.geometry?.type === "Polygon") {
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "area",
                jointType: asset.jointType,
                notes: asset.notes || "",
                areaLevel: (asset as any).areaLevel || "L0",
              },
              geometry: {
                type: "Polygon",
                coordinates: asset.geometry.coordinates.map((ring) =>
                  ring.map(([lat, lng]) => [lng, lat]),
                ),
              },
            };
          }

          return null;
        })
        .filter(Boolean),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-assets.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };

  const normalisePiaGeoJsonCoordinate = (
    coord: any,
  ): [number, number] | null => {
    if (!Array.isArray(coord) || coord.length < 2) return null;

    const x = Number(coord[0]);
    const y = Number(coord[1]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    // Normal GeoJSON WGS84 is [lng, lat].
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return [y, x];
    }

    // Many QGIS/KML exports arrive as EPSG:3857 Web Mercator metres.
    // Example from the user's PIA file: x=-168793, y=7087372.
    if (Math.abs(x) <= 20037508.34 && Math.abs(y) <= 20037508.34) {
      const earthRadius = 6378137;
      const lng = (x / earthRadius) * (180 / Math.PI);
      const lat =
        (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) *
        (180 / Math.PI);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return [lat, lng];
      }
    }

    return null;
  };

  const createPiaOverlayAssetsFromGeoJson = (geojson: any): SavedMapAsset[] => {
    if (!geojson?.features || !Array.isArray(geojson.features)) {
      throw new Error("Invalid GeoJSON FeatureCollection");
    }

    const existingPiaKeys = new Set(
      savedJoints
        .filter(
          (asset) => String((asset as any).source || "") === "pia-overlay",
        )
        .map((asset) =>
          String((asset as any).piaRef || asset.name || asset.id || "").trim(),
        )
        .filter(Boolean),
    );

    return geojson.features
      .map((feature: any, index: number) => {
        if (feature?.geometry?.type !== "LineString") return null;
        if (!Array.isArray(feature.geometry.coordinates)) return null;

        const coords = feature.geometry.coordinates
          .map((coord: any) => normalisePiaGeoJsonCoordinate(coord))
          .filter(Boolean) as [number, number][];

        if (coords.length < 2) return null;

        const props = feature.properties || {};
        const rawName = String(
          props.Name ||
            props.name ||
            props.id ||
            feature.id ||
            `PIA Route ${index + 1}`,
        ).trim();

        const description = String(
          props.description || props.Description || "",
        ).trim();
        const lowerName = rawName.toLowerCase();
        const lowerDescription = description.toLowerCase();

        const piaKind =
          lowerName.includes("trnch") || lowerDescription.includes("trench")
            ? "trench"
            : lowerName.includes("cnd") || lowerDescription.includes("duct")
              ? "duct"
              : "route";

        const piaKey = rawName || `${piaKind}-${index + 1}`;

        // if (existingPiaKeys.has(piaKey)) return null;
        existingPiaKeys.add(piaKey);

        return markAssetForLiveSync(
          {
            id: `pia-${crypto.randomUUID()}`,
            name: rawName || `PIA Route ${index + 1}`,
            assetType: "pia-route",
            jointType: "PIA Route",
            source: "pia-overlay",
            cableType: "PIA Overlay",
            installMethod: "Underground",
            notes: description,
            status: "Live",
            piaRef: piaKey,
            piaKind,
            piaProperties: props,
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          } as SavedMapAsset,
          true,
        );
      })
      .filter(Boolean) as SavedMapAsset[];
  };

  const loadPiaOverlayGeoJson = async (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const piaAssets = createPiaOverlayAssetsFromGeoJson(geojson);

        if (!piaAssets.length) {
          alert("No new PIA LineString routes found in that GeoJSON.");
          return;
        }

        const mergedOrAssets = await mergeAndSaveOrAssets(
          piaAssets.map(normaliseOpenreachAsset),
          { reason: "PIA overlay GeoJSON import" },
        );

        setOrAssets(mergedOrAssets);

        alert(
          `Imported ${piaAssets.length} PIA overlay route(s) into read-only OR reference storage.`,
        );
      } catch (err: any) {
        console.error(err);
        alert(`PIA overlay import failed: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  // =====================================================
  // ONE-BUTTON GEOJSON MAP ASSET IMPORTER
  // Accepts mixed GeoJSON containing DPs/AFNs/CBTs, poles,
  // chambers, street cabs, project polygons, cables/routes,
  // PIA overlay routes, exchanges and UPRN/home points.
  // Homes still save to projectHomes chunks. Network assets save
  // to saved map assets and are mirrored by split storage.
  // =====================================================

  const readGeoJsonProp = (
    props: any,
    keys: string[],
    fallback = "",
  ): string => {
    for (const key of keys) {
      const value = props?.[key];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return String(value).trim();
      }
    }
    return fallback;
  };

  const buildGeoJsonAssetText = (feature: any): string => {
    const props = feature?.properties || {};
    return [
      props.assetType,
      props.jointType,
      props.type,
      props.category,
      props.class,
      props.name,
      props.Name,
      props.id,
      props.dpType,
      props.chamberType,
      props.cableType,
      props.description,
      props.Description,
      feature?.geometry?.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  };

  const getOpenreachFeatureName = (feature: any): string => {
    const props = feature?.properties || {};
    return String(
      props.Name ||
        props.name ||
        props.ref ||
        props.Ref ||
        props.id ||
        props.ID ||
        feature?.id ||
        "",
    )
      .trim()
      .toUpperCase();
  };

  const getOpenreachFeatureDescription = (feature: any): string => {
    const props = feature?.properties || {};
    return String(props.description || props.Description || props.notes || props.Notes || "")
      .trim()
      .toUpperCase();
  };

  const isOpenreachPoleFeature = (feature: any): boolean => {
    const name = getOpenreachFeatureName(feature);
    const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toUpperCase();
    return (
      name.startsWith("POL:") ||
      name.startsWith("MP:") ||
      name.startsWith("POLE:") ||
      text.includes("MISSING POLE") ||
      text.includes(" POLE") ||
      text.includes("OR POLE")
    );
  };

  const isOpenreachChamberFeature = (feature: any): boolean => {
    const name = getOpenreachFeatureName(feature);
    const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toUpperCase();
    return (
      name.startsWith("JC:") ||
      name.startsWith("JNT:") ||
      name.startsWith("CH:") ||
      name.startsWith("CHAMBER:") ||
      text.includes(" CHAMBER") ||
      text.includes("JOINT CHAMBER") ||
      text.includes("JBF") ||
      text.includes("JB")
    );
  };

  const isOpenreachRouteFeature = (feature: any): boolean => {
    const name = getOpenreachFeatureName(feature);
    const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`;
    return (
      name.startsWith("OSP:") ||
      text.includes("OSP:TRNCH") ||
      text.includes("TRNCH") ||
      text.includes("TRENCH") ||
      text.includes("OSP:CND") ||
      text.includes("CND") ||
      text.includes("DUCT") ||
      text.includes("SPAN") ||
      text.includes("OVERHEAD") ||
      text.includes("PIA") ||
      text.includes("OPENREACH")
    );
  };

  const classifyGeoJsonFeature = (
    feature: any,
  ): AssetType | "pia-route" | "home" | "area" | "cable" => {
    const geometryType = String(feature?.geometry?.type || "");
    const text = buildGeoJsonAssetText(feature);
    const props = feature?.properties || {};
    const propKeys = Object.keys(props).join(" ").toLowerCase();

    if (geometryType.includes("Polygon")) return "area";

    // Openreach KML/QGIS exports often use short asset prefixes in Name:
    //   POL:* = pole, JC:* / CH:* = joint chamber, OSP:* = duct/trench/span.
    // Do this before the generic Point fallback, otherwise POL:DATA points
    // become distribution-points and render as black DP squares.
    if (geometryType === "Point" && isOpenreachPoleFeature(feature)) {
      return "pole" as AssetType;
    }

    if (geometryType === "Point" && isOpenreachChamberFeature(feature)) {
      return "chamber" as AssetType;
    }

    if (geometryType.includes("LineString") && isOpenreachRouteFeature(feature)) {
      return "pia-route";
    }

    // UPRN home GeoJSON often stores the useful clue in the FIELD NAME
    // e.g. { UPRN: "123..." }, not in the field value. The old logic only
    // searched values, so 300k Bradford UPRN points were being imported as DPs.
    if (
      geometryType === "Point" &&
      (propKeys.includes("uprn") ||
        propKeys.includes("udprn") ||
        propKeys.includes("toid") ||
        text.includes("uprn") ||
        text.includes("home") ||
        text.includes("premise") ||
        text.includes("building") ||
        text.includes("residential"))
    ) {
      return "home";
    }

    if (
      text.includes("pia") ||
      text.includes("openreach") ||
      text.includes("osp:trnch") ||
      text.includes("trnch") ||
      text.includes("osp:cnd") ||
      text.includes("duct") ||
      text.includes("trench")
    ) {
      return "pia-route";
    }

    if (geometryType.includes("LineString")) return "cable";

    if (
      text.includes("street cab") ||
      text.includes("streetcab") ||
      text.includes("cabinet") ||
      text.includes("cab")
    ) {
      return "street-cab" as AssetType;
    }

    if (
      text.includes("chamber") ||
      text.includes("fw2") ||
      text.includes("fw4") ||
      text.includes("fw6") ||
      text.includes("fw10")
    ) {
      return "chamber" as AssetType;
    }

    if (text.includes("pole")) return "pole" as AssetType;

    if (
      text.includes("distribution") ||
      text.includes(" dp") ||
      text.startsWith("dp") ||
      text.includes(" afn") ||
      text.startsWith("afn") ||
      text.includes(" cbt") ||
      text.startsWith("cbt")
    ) {
      return "distribution-point" as AssetType;
    }

    if (text.includes("exchange")) return "exchange" as AssetType;
    if (text.includes("lmj") || text.includes("cmj") || text.includes("ag"))
      return "ag-joint" as AssetType;

    return geometryType === "Point"
      ? ("distribution-point" as AssetType)
      : "cable";
  };

  const convertGeoJsonPoint = (coordinates: any): [number, number] | null => {
    return normalisePiaGeoJsonCoordinate(coordinates);
  };

  const convertGeoJsonLine = (coordinates: any): [number, number][] => {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .map((coord: any) => normalisePiaGeoJsonCoordinate(coord))
      .filter(Boolean) as [number, number][];
  };

  const convertGeoJsonPolygon = (coordinates: any): [number, number][][] => {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .map((ring: any) => convertGeoJsonLine(ring))
      .filter((ring: [number, number][]) => ring.length >= 3);
  };

  const buildImportedAssetBase = (
    feature: any,
    index: number,
    importKind: string,
  ) => {
    const props = feature?.properties || {};
    const existingId = readGeoJsonProp(props, [
      "id",
      "ID",
      "assetId",
      "AssetId",
    ]);
    const name = readGeoJsonProp(
      props,
      ["name", "Name", "label", "Label", "ref", "Ref", "id", "ID"],
      `Imported ${importKind} ${index + 1}`,
    );

    return {
      id: existingId
        ? `${importKind}-${existingId}`
        : `${importKind}-${crypto.randomUUID()}`,
      name,
      notes: readGeoJsonProp(props, [
        "notes",
        "Notes",
        "description",
        "Description",
      ]),
      status: readGeoJsonProp(props, ["status", "Status"], "Planned"),
      source: readGeoJsonProp(props, ["source", "Source"], "geojson-import"),
      importedProperties: props,
      projectId: activeProjectId || undefined,
    };
  };

  const createMapAssetsFromAnyGeoJson = (geojson: any) => {
    if (!geojson?.features || !Array.isArray(geojson.features)) {
      throw new Error("Invalid GeoJSON FeatureCollection");
    }

    const networkAssets: SavedMapAsset[] = [];
    const homeAssets: SavedMapAsset[] = [];
    const counts: Record<string, number> = {};

    geojson.features.forEach((feature: any, index: number) => {
      const geometryType = String(feature?.geometry?.type || "");
      const props = feature?.properties || {};
      const classifiedType = classifyGeoJsonFeature(feature);
      counts[classifiedType] = (counts[classifiedType] || 0) + 1;

      if (classifiedType === "home") {
        if (geometryType !== "Point") return;
        const point = convertGeoJsonPoint(feature.geometry.coordinates);
        if (!point) return;

        const rawUprn = readGeoJsonProp(props, [
          "UPRN",
          "uprn",
          "Uprn",
          "id",
          "ID",
        ]);
        const id = rawUprn ? `uprn-${rawUprn}` : `home-${crypto.randomUUID()}`;
        homeAssets.push(
          markAssetForLiveSync(
            {
              id,
              name: rawUprn
                ? `UPRN ${rawUprn}`
                : readGeoJsonProp(props, ["name", "Name"], "Home"),
              assetType: "home",
              jointType: "Home",
              uprn: rawUprn || undefined,
              projectId: activeProjectId || undefined,
              connectionMode: "auto",
              notes: readGeoJsonProp(props, [
                "notes",
                "Notes",
                "description",
                "Description",
              ]),
              importedProperties: props,
              geometry: {
                type: "Point",
                coordinates: point,
              },
            } as SavedMapAsset,
            true,
          ),
        );
        return;
      }

      if (classifiedType === "pia-route") {
        const makePiaAsset = (coords: [number, number][], lineIndex?: number) => {
          if (coords.length < 2) return;
          const text = `${getOpenreachFeatureName(feature)} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toLowerCase();
          const base = buildImportedAssetBase(feature, index, "pia");
          networkAssets.push(
            markAssetForLiveSync(
              {
                ...base,
                id: lineIndex !== undefined ? `pia-${crypto.randomUUID()}-${lineIndex + 1}` : `pia-${crypto.randomUUID()}`,
                name: lineIndex !== undefined ? `${base.name} ${lineIndex + 1}` : base.name,
                assetType: "pia-route" as any,
                jointType: "PIA Route",
                readOnly: true,
                source: "openreach",
                isReferenceAsset: true,
                cableType: "PIA Overlay",
                installMethod:
                  text.includes("span") || text.includes("overhead")
                    ? "OH"
                    : "Underground",
                piaKind:
                  text.includes("trench") || text.includes("trnch")
                    ? "trench"
                    : text.includes("span") || text.includes("overhead")
                      ? "span"
                      : "duct",
                geometry: {
                  type: "LineString",
                  coordinates: coords,
                },
              } as SavedMapAsset,
              true,
            ),
          );
        };

        if (geometryType === "LineString") {
          makePiaAsset(convertGeoJsonLine(feature.geometry.coordinates));
        }

        if (geometryType === "MultiLineString" && Array.isArray(feature.geometry.coordinates)) {
          feature.geometry.coordinates.forEach((line: any, lineIndex: number) =>
            makePiaAsset(convertGeoJsonLine(line), lineIndex),
          );
        }

        return;
      }

      if (geometryType === "Point") {
        const point = convertGeoJsonPoint(feature.geometry.coordinates);
        if (!point) return;
        const base = buildImportedAssetBase(
          feature,
          index,
          String(classifiedType),
        );
        const isOrPole = classifiedType === "pole" && isOpenreachPoleFeature(feature);
        const isOrChamber =
          classifiedType === "chamber" && isOpenreachChamberFeature(feature);
        const jointType = readGeoJsonProp(
          props,
          ["jointType", "JointType", "type", "Type", "dpType", "DPType"],
          classifiedType === "distribution-point"
            ? "DP"
            : isOrPole
              ? "OR Pole"
              : isOrChamber
                ? "OR Chamber"
                : String(classifiedType),
        );

        networkAssets.push(
          markAssetForLiveSync(
            {
              ...base,
              assetType: classifiedType as AssetType,
              jointType,
              source: isOrPole || isOrChamber ? "openreach" : base.source,
              readOnly: isOrPole || isOrChamber ? true : (base as any).readOnly,
              isReferenceAsset: isOrPole || isOrChamber ? true : (base as any).isReferenceAsset,
              poleDetails:
                classifiedType === "pole"
                  ? ({ poleType: isOrPole ? "or" : "new" } as any)
                  : undefined,
              chamberDetails:
                classifiedType === "chamber"
                  ? ({
                      chamberType: readGeoJsonProp(
                        props,
                        ["chamberType", "ChamberType", "type", "Type"],
                        isOrChamber ? "OR Chamber" : "fw2",
                      ),
                    } as any)
                  : undefined,
              dpDetails:
                classifiedType === "distribution-point"
                  ? ({ dpType: jointType || "DP", status: base.status } as any)
                  : undefined,
              geometry: {
                type: "Point",
                coordinates: point,
              },
            } as SavedMapAsset,
            true,
          ),
        );
        return;
      }

      if (geometryType === "LineString") {
        const coords = convertGeoJsonLine(feature.geometry.coordinates);
        if (coords.length < 2) return;
        const base = buildImportedAssetBase(feature, index, "cable");
        networkAssets.push(
          markAssetForLiveSync(
            {
              ...base,
              assetType: "cable" as AssetType,
              jointType: readGeoJsonProp(
                props,
                ["jointType", "JointType"],
                "Cable",
              ),
              cableType: readGeoJsonProp(
                props,
                ["cableType", "CableType"],
                "Feeder",
              ),
              fibreCount: readGeoJsonProp(
                props,
                ["fibreCount", "FibreCount", "fibres"],
                "",
              ),
              installMethod: readGeoJsonProp(
                props,
                ["installMethod", "InstallMethod"],
                "Underground",
              ),
              geometry: {
                type: "LineString",
                coordinates: coords,
              },
            } as SavedMapAsset,
            true,
          ),
        );
        return;
      }

      if (geometryType === "MultiLineString") {
        if (!Array.isArray(feature.geometry.coordinates)) return;
        feature.geometry.coordinates.forEach((line: any, lineIndex: number) => {
          const coords = convertGeoJsonLine(line);
          if (coords.length < 2) return;
          const base = buildImportedAssetBase(feature, index, "cable");
          networkAssets.push(
            markAssetForLiveSync(
              {
                ...base,
                id: `${base.id}-${lineIndex + 1}`,
                name: `${base.name} ${lineIndex + 1}`,
                assetType: "cable" as AssetType,
                jointType: "Cable",
                cableType: readGeoJsonProp(
                  props,
                  ["cableType", "CableType"],
                  "Feeder",
                ),
                installMethod: readGeoJsonProp(
                  props,
                  ["installMethod", "InstallMethod"],
                  "Underground",
                ),
                geometry: {
                  type: "LineString",
                  coordinates: coords,
                },
              } as SavedMapAsset,
              true,
            ),
          );
        });
        return;
      }

      if (geometryType === "Polygon") {
        const rings = convertGeoJsonPolygon(feature.geometry.coordinates);
        if (!rings.length) return;
        networkAssets.push(
          markAssetForLiveSync(
            {
              ...buildImportedAssetBase(feature, index, "area"),
              assetType: "area" as AssetType,
              jointType: "Polygon Area",
              areaLevel: readGeoJsonProp(
                props,
                ["areaLevel", "level", "Level"],
                "L0",
              ),
              geometry: {
                type: "Polygon",
                coordinates: rings,
              },
            } as SavedMapAsset,
            true,
          ),
        );
        return;
      }

      if (geometryType === "MultiPolygon") {
        if (!Array.isArray(feature.geometry.coordinates)) return;
        feature.geometry.coordinates.forEach(
          (polygon: any, polygonIndex: number) => {
            const rings = convertGeoJsonPolygon(polygon);
            if (!rings.length) return;
            const base = buildImportedAssetBase(feature, index, "area");
            networkAssets.push(
              markAssetForLiveSync(
                {
                  ...base,
                  id: `${base.id}-${polygonIndex + 1}`,
                  name: `${base.name} ${polygonIndex + 1}`,
                  assetType: "area" as AssetType,
                  jointType: "Polygon Area",
                  areaLevel: readGeoJsonProp(
                    props,
                    ["areaLevel", "level", "Level"],
                    "L0",
                  ),
                  geometry: {
                    type: "Polygon",
                    coordinates: rings,
                  },
                } as SavedMapAsset,
                true,
              ),
            );
          },
        );
      }
    });

    return { networkAssets, homeAssets, counts };
  };

  const loadAnyGeoJsonMapAssets = (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const { networkAssets: rawNetworkAssets, homeAssets: rawHomeAssets } =
          createMapAssetsFromAnyGeoJson(geojson);

        const networkAssets = activeProjectArea
          ? filterAssetsForProjectArea(rawNetworkAssets, activeProjectArea)
          : rawNetworkAssets;
        const homeAssets = activeProjectArea
          ? filterAssetsForProjectArea(rawHomeAssets, activeProjectArea)
          : rawHomeAssets;

        if (!networkAssets.length && !homeAssets.length) {
          alert(
            "No supported GeoJSON map assets found inside the selected project area. Check the area polygon is selected before importing.",
          );
          return;
        }

        let savedHomeCount = 0;
        if (homeAssets.length) {
          if (!activeProjectId) {
            alert(
              "This file contains homes/UPRNs. Select a project area first so homes can be saved to project home chunks.",
            );
            return;
          }

          const existingHomes =
            loadedHomesProjectId === activeProjectId
              ? projectHomes
              : await loadProjectHomes(activeProjectId);
          const existingHomeKeys = new Set(
            existingHomes
              .map((home: any) =>
                String(home.uprn || home.id || home.name || "").trim(),
              )
              .filter(Boolean),
          );
          const newHomes = homeAssets.filter((home: any) => {
            const key = String(home.uprn || home.id || home.name || "").trim();
            if (!key || existingHomeKeys.has(key)) return false;
            existingHomeKeys.add(key);
            return true;
          });

          if (newHomes.length) {
            const mergedHomes = [
              ...existingHomes,
              ...newHomes.map((home) => ({
                ...home,
                projectId: activeProjectId,
              })),
            ];
            await saveProjectHomes(activeProjectId, mergedHomes);
            setProjectHomes(mergedHomes);
            setLoadedHomesProjectId(activeProjectId);
            savedHomeCount = newHomes.length;
          }
        }

        const importedOrAssets = networkAssets
          .filter(isOpenreachReferenceAsset)
          .map(normaliseOpenreachAsset);
        const designedNetworkAssets = networkAssets.filter(
          (asset) => !isOpenreachReferenceAsset(asset),
        );

        let savedOrCount = 0;
        if (importedOrAssets.length) {
          const mergedOrAssets = await mergeAndSaveOrAssets(importedOrAssets, {
            reason: "GeoJSON OR reference import",
          });
          setOrAssets(mergedOrAssets);
          savedOrCount = importedOrAssets.length;
        }

        if (designedNetworkAssets.length) {
          const existingIds = new Set(
            savedJoints.map((asset) => String(asset.id)),
          );
          const dedupedNetworkAssets = designedNetworkAssets.filter((asset) => {
            const id = String(asset.id);
            if (existingIds.has(id)) return false;
            existingIds.add(id);
            return true;
          });
          setSavedJoints((prev) => [...prev, ...dedupedNetworkAssets]);
        }

        alert(
          `Imported ${designedNetworkAssets.length} designed network asset(s), ${savedOrCount} OR reference asset(s), and ${savedHomeCount} home(s) from GeoJSON.`,
        );
      } catch (err: any) {
        console.error(err);
        alert(`GeoJSON map asset import failed: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const isPiaOverlayAsset = (asset: SavedMapAsset): boolean => {
    const item = asset as any;
    const source = String(item.source || "")
      .trim()
      .toLowerCase();
    const assetType = String(item.assetType || "")
      .trim()
      .toLowerCase();
    const jointType = String(item.jointType || "")
      .trim()
      .toLowerCase();
    const cableType = String(item.cableType || "")
      .trim()
      .toLowerCase();
    const routeType = String(
      item.routeType || item.importedProperties?.routeType || "",
    )
      .trim()
      .toLowerCase();

    return (
      source === "pia-overlay" ||
      source.includes("pia screenshot") ||
      source.includes("openreach") ||
      assetType === "pia-route" ||
      assetType === "or-duct" ||
      assetType === "or-pole" ||
      assetType === "or-chamber" ||
      jointType === "pia route" ||
      jointType === "or duct" ||
      jointType === "or pole" ||
      jointType === "or chamber" ||
      routeType === "or duct" ||
      routeType.includes("duct") ||
      cableType === "pia overlay"
    );
  };

  const getAssetLinePositions = (asset: SavedMapAsset): [number, number][] => {
    const coords = (asset as any).geometry?.coordinates;
    if (!Array.isArray(coords)) return [];

    return coords
      .filter((point: any) => Array.isArray(point) && point.length >= 2)
      .map(
        (point: any) =>
          [Number(point[0]), Number(point[1])] as [number, number],
      )
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  };

  const getAssetPointPosition = (
    asset: SavedMapAsset,
  ): [number, number] | null => {
    const coords = (asset as any).geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;

    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  };

  const isImportedOrDuctAsset = (asset: SavedMapAsset): boolean => {
    const item = asset as any;
    const source = String(item.source || "")
      .trim()
      .toLowerCase();
    const assetType = String(item.assetType || "")
      .trim()
      .toLowerCase();
    const jointType = String(item.jointType || "")
      .trim()
      .toLowerCase();
    const cableType = String(item.cableType || "")
      .trim()
      .toLowerCase();
    const routeType = String(
      item.routeType || item.importedProperties?.routeType || "",
    )
      .trim()
      .toLowerCase();
    const geometryType = String(item.geometry?.type || item.geometryType || "")
      .trim()
      .toLowerCase();

    return (
      geometryType === "linestring" &&
      (assetType === "pia-route" ||
        assetType === "or-duct" ||
        jointType.includes("duct") ||
        routeType.includes("duct") ||
        cableType === "pia overlay" ||
        source.includes("pia screenshot"))
    );
  };

  const isImportedOrChamberAsset = (asset: SavedMapAsset): boolean => {
    const item = asset as any;
    const assetType = String(item.assetType || "")
      .trim()
      .toLowerCase();
    const jointType = String(item.jointType || "")
      .trim()
      .toLowerCase();
    return (
      assetType === "chamber" ||
      assetType === "or-chamber" ||
      jointType.includes("chamber")
    );
  };

  const isImportedOrPoleAsset = (asset: SavedMapAsset): boolean => {
    const item = asset as any;
    const assetType = String(item.assetType || "")
      .trim()
      .toLowerCase();
    const jointType = String(item.jointType || "")
      .trim()
      .toLowerCase();
    return (
      assetType === "pole" ||
      assetType === "or-pole" ||
      jointType.includes("pole")
    );
  };

  const handleDeletePiaOverlayForActiveProject = async () => {
    if (!activeProjectArea) {
      alert(
        "Select a project area first, then delete the PIA / Openreach overlay for that area.",
      );
      return;
    }

    const scopedPiaAssets = filterAssetsForProjectArea(
      openreachReferenceAssets.filter((asset) => isPiaOverlayAsset(asset)),
      activeProjectArea,
    );

    if (!scopedPiaAssets.length) {
      alert(
        "No PIA / Openreach overlay assets were found inside this selected project area.",
      );
      return;
    }

    const areaName = activeProjectArea.name || "this selected area";
    const confirmed = window.confirm(
      `Delete ${scopedPiaAssets.length} PIA / Openreach overlay route(s) from ${areaName}?

Homes, DPs, joints, designed cables and drop cables will not be deleted.`,
    );

    if (!confirmed) return;

    const deleteIds = new Set(scopedPiaAssets.map((asset) => String(asset.id)));

    const remainingOrAssets = openreachReferenceAssets.filter(
      (asset) => !deleteIds.has(String(asset.id)),
    );

    setOrAssets(remainingOrAssets);

    try {
      await saveOrAssets(remainingOrAssets, {
        allowDestructiveSave: true,
        reason: "delete OR overlay for selected project area",
      });
    } catch (err) {
      console.error("Failed to save OR overlay deletion", err);
      alert("OR overlay deletion failed to save. Check console.");
      return;
    }

    setSavedJoints((prev) =>
      prev.filter((asset) => !deleteIds.has(String(asset.id))),
    );

    alert(
      `Deleted ${scopedPiaAssets.length} PIA / Openreach overlay route(s) from ${areaName}.`,
    );
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) throw new Error("Invalid file");

      const importedAssets = (parsed as SavedMapAsset[]).map((asset) =>
        markAssetForLiveSync(asset, !(asset as any).createdAt),
      );

      const importedOrAssets = importedAssets
        .filter(isOpenreachReferenceAsset)
        .map(normaliseOpenreachAsset);
      const importedDesignedAssets = importedAssets.filter(
        (asset) => !isOpenreachReferenceAsset(asset),
      );

      if (importedOrAssets.length) {
        const mergedOrAssets = await mergeAndSaveOrAssets(importedOrAssets, {
          reason: "JSON import OR reference assets",
        });
        setOrAssets(mergedOrAssets);
      }

      setSavedJoints(importedDesignedAssets);
      alert(
        `Imported ${importedDesignedAssets.length} designed asset(s) and ${importedOrAssets.length} OR reference asset(s).`,
      );
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    e.target.value = "";
  };

  const availableParentCablesForBranchAllocation = useMemo(
    () =>
      allMapAssets
        .filter((asset) => {
          const item = asset as any;
          const assetType = String(item.assetType || "").toLowerCase();
          const cableType = String(item.cableType || "").toLowerCase();
          const name = String(
            item.name || item.cableId || item.id || "",
          ).toLowerCase();
          const fibreNumber =
            Number(String(item.fibreCount || "").replace(/\D/g, "")) || 0;

          if (asset.id === editingAssetId) return false;
          if (asset.geometry?.type !== "LineString") return false;
          if (assetType && assetType !== "cable") return false;

          // Customer drops are not valid AFN through/parent cables.
          if (
            isDropCable(asset) ||
            cableType.includes("drop") ||
            name.includes("drop")
          )
            return false;

          // Keep broad so newly drawn Link/Distribution/Spine/ULW/OH cables
          // appear immediately, including older saved records with only size.
          return (
            cableType.includes("feeder") ||
            cableType.includes("link") ||
            cableType.includes("spine") ||
            cableType.includes("distribution") ||
            cableType.includes("ulw") ||
            String(item.installMethod || "").toLowerCase() === "oh" ||
            fibreNumber >= 12
          );
        })
        .sort((a, b) =>
          String((a as any).name || (a as any).cableId || a.id).localeCompare(
            String((b as any).name || (b as any).cableId || b.id),
            undefined,
            { numeric: true, sensitivity: "base" },
          ),
        ),
    [allMapAssets, editingAssetId],
  );

  const allDistributionPointsForAfnAllocation = useMemo(
    () =>
      allMapAssets.filter((asset) => asset.assetType === "distribution-point"),
    [allMapAssets],
  );

  const connectedHomesForSelectedDp = useMemo(() => {
    if (!editingAssetId) return [];

    const drops = allMapAssets.filter((asset) => {
      return (
        isDropCable(asset) &&
        ((asset as any).fromAssetId === editingAssetId ||
          (asset as any).toAssetId === editingAssetId)
      );
    });

    return drops
      .map((drop, index) => {
        const fromId = (drop as any).fromAssetId;
        const toId = (drop as any).toAssetId;
        const homeId = fromId === editingAssetId ? toId : fromId;
        const home = allMapAssets.find((asset) => asset.id === homeId);
        const status =
          (home as any)?.customerStatus ||
          (home as any)?.homeStatus ||
          (home as any)?.status ||
          (drop as any)?.customerStatus ||
          (drop as any)?.homeStatus ||
          (drop as any)?.status ||
          "Planned";

        return {
          port: Number((drop as any).port || (drop as any).dpPort || index + 1),
          homeId: String(homeId || ""),
          homeName: String(home?.name || homeId || `Home ${index + 1}`),
          status: String(status),
        };
      })
      .sort((a, b) => a.port - b.port);
  }, [editingAssetId, allMapAssets]);

  // =====================================================
  // HANDLER: TOP GPS BUTTON
  // Moves the map to the user's current browser GPS location.
  // Kept outside Leaflet's default control stack so it can sit in
  // the cleaner top-right action area beside Layers.
  // =====================================================
  const handleGpsLocate = () => {
    if (!navigator.geolocation) {
      alert("GPS is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setPickedLocation(nextLocation);
        mapRef.current?.flyTo([nextLocation.lat, nextLocation.lng], 18);
      },
      () => {
        alert(
          "Could not get your GPS location. Check browser location permissions.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // =====================================================
  // PROJECT WORKSPACE — PERSIST BULK DP STATUS
  // Called by Workspace → Build manager tools. This uses the
  // existing savedJoints state and split chunk mirroring path, so
  // it does not introduce a second storage system.
  // =====================================================
  const handleWorkspaceBulkDpStatusUpdate = (args: {
    assetIds: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => {
    const ids = new Set((args.assetIds || []).map(String));
    if (!ids.size) {
      alert("No DPs selected for update.");
      return;
    }

    const reason = args.note?.trim();
    if (!reason) {
      alert("A manager note is required before updating DP status.");
      return;
    }

    const beforeAssets = (savedJoints ?? []).filter((asset) =>
      ids.has(String(asset.id || "")),
    );

    const updatedById = new Map<string, SavedMapAsset>();

    beforeAssets.forEach((asset) => {
      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(
          syncDpOperationalStatusOnAsset(
            asset as any,
            args.status,
          ) as SavedMapAsset,
        ),
        "updated",
        reason,
      );

      updatedById.set(String(asset.id || ""), nextAsset);
    });

    setSavedJoints((prev) =>
      (prev ?? []).map((asset) => {
        const updatedAsset = updatedById.get(String(asset.id || ""));
        return updatedAsset || asset;
      }),
    );

    beforeAssets.forEach((beforeAsset) => {
      const afterAsset = updatedById.get(String(beforeAsset.id || ""));
      if (!afterAsset) return;

      writeAssetAuditLog({
        asset: afterAsset,
        action: "updated",
        reason,
        comment: `Manager bulk DP status update from Project Workspace: ${args.status}`,
        before: {
          status: (beforeAsset as any).status,
          buildStatus: (beforeAsset as any).dpDetails?.buildStatus,
        },
        after: {
          status: (afterAsset as any).status,
          buildStatus: (afterAsset as any).dpDetails?.buildStatus,
        },
      });
    });

    alert(
      `Updated ${beforeAssets.length} DP${beforeAssets.length === 1 ? "" : "s"} to ${args.status}.`,
    );
  };


  // =====================================================
  // PROJECT WORKSPACE — CLEAR DP FIBRE ALLOCATIONS IN AREA
  // Clears only operational fibre allocation/routing fields from DPs.
  // It does NOT delete DPs, homes, drops, geometry, status, notes,
  // photos or selected through-cable choices.
  // =====================================================
  const handleWorkspaceClearDpFibreAllocations = (args: {
    assetIds: string[];
    note: string;
  }) => {
    const ids = new Set((args.assetIds || []).map(String));
    if (!ids.size) {
      alert("No DPs selected for fibre allocation clear.");
      return;
    }

    const reason = args.note?.trim();
    if (!reason) {
      alert("An audit note is required before clearing DP fibre allocations.");
      return;
    }

    const beforeAssets = (savedJoints ?? []).filter((asset) =>
      ids.has(String(asset.id || "")),
    );

    if (!beforeAssets.length) {
      alert("No matching DPs were found in the saved map assets.");
      return;
    }

    const clearResult = clearDpFibreAllocationsForAssets(beforeAssets);
    const updatedById = new Map<string, SavedMapAsset>();

    clearResult.assets.forEach((asset) => {
      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(asset as SavedMapAsset),
        "updated",
        reason,
      );

      updatedById.set(String(asset.id || ""), nextAsset);
    });

    setSavedJoints((prev) =>
      (prev ?? []).map((asset) => {
        const updatedAsset = updatedById.get(String(asset.id || ""));
        return updatedAsset || asset;
      }),
    );

    beforeAssets.forEach((beforeAsset) => {
      const afterAsset = updatedById.get(String(beforeAsset.id || ""));
      if (!afterAsset) return;

      writeAssetAuditLog({
        asset: afterAsset,
        action: "updated",
        reason,
        comment: "Manager cleared DP fibre allocations from selected project area ready for Rebuild Chain.",
        before: {
          dpDetails: (beforeAsset as any).dpDetails,
          allocatedInputFibres: (beforeAsset as any).allocatedInputFibres,
          usedFibres: (beforeAsset as any).usedFibres,
        },
        after: {
          dpDetails: (afterAsset as any).dpDetails,
          allocatedInputFibres: (afterAsset as any).allocatedInputFibres,
          usedFibres: (afterAsset as any).usedFibres,
        },
      });
    });

    alert(
      `Cleared fibre allocations from ${clearResult.summary.clearedDpCount} DP${clearResult.summary.clearedDpCount === 1 ? "" : "s"} in this area. You can now run Rebuild Chain.`,
    );
  };


  // =====================================================
  // PROJECT WORKSPACE — PERSIST SINGLE DP STATUS
  // Called by Asset Intelligence quick action buttons. It reuses
  // the same bulk status save path so audit/live-sync/chunk mirroring
  // remain consistent.
  // =====================================================
  const handleWorkspaceSingleDpStatusUpdate = (args: {
    assetId: string;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => {
    handleWorkspaceBulkDpStatusUpdate({
      assetIds: [args.assetId],
      status: args.status,
      note: args.note,
    });
  };

  // =====================================================
  // PROJECT WORKSPACE FULL SCREEN MODE
  // Keeps Leaflet mounted separately from the workspace shell.
  // This prevents map pane/marker position errors while the
  // project workspace is loading or open.
  // =====================================================
  if (isProjectWorkspaceLoading && activeProjectArea) {
    return (
      <div style={projectWorkspaceLoadingOverlay}>
        <div style={projectWorkspaceLoadingCard}>
          <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 800 }}>
            Opening Project
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8 }}>
            {activeProjectArea.name || "Selected Project"}
          </div>
          <div style={{ color: "#cbd5e1", marginTop: 8 }}>
            Loading area assets, topology, QA status and fibre continuity…
          </div>
          <div style={projectWorkspaceProgressTrack}>
            <div style={projectWorkspaceProgressBar} />
          </div>
        </div>
      </div>
    );
  }

  if (isProjectWorkspaceOpen && activeProjectArea) {
    return (
      <ProjectWorkspace
        projectName={activeProjectArea.name || "Selected Project"}
        status="Build Phase"
        stats={projectWorkspaceStats}
        projectArea={activeProjectArea}
        projectAssets={visibleProjectAssets}
        projectAreas={visibleProjectAreas}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onBackToMap={() => setIsProjectWorkspaceOpen(false)}
        onOpenTrace={() => {
          setIsProjectWorkspaceOpen(false);
          setIsPanelOpen(true);
        }}
        onOpenQA={() => {
          setIsProjectWorkspaceOpen(false);
          setIsPanelOpen(true);
        }}
        onOpenFibreTopology={() => {
          setIsProjectWorkspaceOpen(false);
          setIsPanelOpen(true);
        }}
        onOpenJointEditor={(asset) => {
          setIsProjectWorkspaceOpen(false);
          if (asset.assetType === "distribution-point") {
            setOpenDistributionPointAsset(asset);
            return;
          }
          onOpenJoint(asset);
        }}
        onBulkUpdateDpStatus={handleWorkspaceBulkDpStatusUpdate}
        onUpdateDpStatus={handleWorkspaceSingleDpStatusUpdate}
        onClearDpFibreAllocations={handleWorkspaceClearDpFibreAllocations}
        onExport={handleExportGeoJson}
      />
    );
  }

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        position: "relative",
        overflow: "hidden",
        background: "#1f2937",
        color: "white",
      }}
    >
      {/* =====================================================
          TOP LEFT: TOOLS DRAWER TOGGLE
          Keeps the first view clean and lets the full editor slide out.
          ===================================================== */}
      <button
        onClick={() => setIsPanelOpen((prev) => !prev)}
        style={drawerToggleButton}
      >
        {isPanelOpen ? "× Close" : "☰ Asset Panel"}
      </button>

      {/* =====================================================
          EXCHANGE SIDE PANEL
          Opens when a ⭐ exchange marker is clicked.
          ===================================================== */}

      <div
        style={{
          ...panel,
          position: "absolute",
          top: 0,
          left: 0,
          width: "360px",
          maxWidth: "calc(100vw - 16px)",
          height: "100%",
          zIndex: 1500,
          overflowY: "auto",
          background: "#1f2937",
          boxSizing: "border-box",
          borderRight: "1px solid #374151",
          transform: isPanelOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 0.3s ease",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ProjectAreaSelector
            projectAreas={projectAreas}
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
            onClearProject={() => {
              activeProjectIdRef.current = null;
              setActiveProjectId(null);
              saveMapView({ activeProjectId: null });
            }}
          />

          <button
            onClick={onClose}
            style={{ ...btnSecondary, marginLeft: "auto" }}
          >
            Back
          </button>
        </div>

        <UserMenu variant="sidebar" />

        {activeProjectArea && (
          <button
            type="button"
            onClick={() => setIsProjectWorkspaceOpen(true)}
            style={{
              ...btnPrimary,
              width: "100%",
              marginTop: 10,
              marginBottom: 6,
            }}
          >
            Open Project Workspace
          </button>
        )}

        {activeProjectArea && (
          <button
            type="button"
            onClick={handleDeletePiaOverlayForActiveProject}
            style={{ ...btnDanger, width: "100%", marginBottom: 6 }}
          >
            Delete PIA / Openreach Overlay In This Area
          </button>
        )}

        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
          Scope:{" "}
          {activeProjectArea
            ? activeProjectArea.name || "Selected area"
            : "Whole network"}
        </div>

        <details style={card}>
          <summary style={sectionSummary}>Survey Cleanup</summary>
          <div style={sectionBody}>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
              Select wrong imported homes on the map and delete them in one
              batch. This does not touch DPs, joints, feeder/link cables,
              project areas or PIA/Openreach overlay.
            </div>

            <button
              type="button"
              onClick={handleToggleSurveyDeleteHomesMode}
              style={
                mapMode === "survey-delete-homes" ? btnDanger : btnSecondary
              }
            >
              {mapMode === "survey-delete-homes"
                ? "✓ Delete Homes Mode Active"
                : "Delete Wrong Homes"}
            </button>

            {mapMode === "survey-delete-homes" ? (
              <div
                style={{
                  background: "#450a0a",
                  border: "1px solid #ef4444",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 12,
                  color: "#fee2e2",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  {selectedSurveyDeleteHomeIds.length} home
                  {selectedSurveyDeleteHomeIds.length === 1 ? "" : "s"} selected
                </div>
                <div>
                  Click incorrect homes to select/unselect them, then bulk
                  delete.
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleDeleteSelectedSurveyHomes}
                style={btnDanger}
                disabled={selectedSurveyDeleteHomeIds.length === 0}
              >
                Delete Selected Homes
              </button>
              <button
                type="button"
                onClick={handleClearSurveyDeleteHomeSelection}
                style={btnSecondary}
                disabled={selectedSurveyDeleteHomeIds.length === 0}
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSurveyDeleteHomeIds([]);
                  setMapMode("pick");
                }}
                style={btnSecondary}
              >
                Exit
              </button>
            </div>
          </div>
        </details>

        <details style={card}>
          <summary style={sectionSummary}>Home Reassignment</summary>
          <div style={sectionBody}>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
              Move UPRNs/homes from one DP to another without touching feeder or
              link cables.
            </div>

            <button
              type="button"
              onClick={handleToggleMoveHomesMode}
              style={mapMode === "move-homes" ? btnPrimary : btnSecondary}
            >
              {mapMode === "move-homes"
                ? "✓ Move Homes Active"
                : "Move Homes to DP"}
            </button>

            {mapMode === "move-homes" ? (
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 12,
                  color: "#dbeafe",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  {selectedMoveHomeIds.length} home
                  {selectedMoveHomeIds.length === 1 ? "" : "s"} selected
                </div>
                <div>
                  Click UPRNs/homes to select them, then click the target DP.
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleClearMoveHomeSelection}
                style={btnSecondary}
                disabled={selectedMoveHomeIds.length === 0}
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMoveHomeIds([]);
                  setMapMode("pick");
                }}
                style={btnSecondary}
              >
                Exit
              </button>
            </div>
          </div>
        </details>

        <details open={Boolean(editingAssetId)} style={card}>
          <summary style={sectionSummary}>
            {editingAssetId ? "Asset Details" : "Asset Editor"}
          </summary>
          <div style={sectionBody}>
            <div style={label}>Asset Type</div>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              style={input}
              disabled={!!editingAssetId}
            >
              <option value="ag-joint">AG Joint</option>
              <option value="street-cab">Street Cab</option>
              <option value="pole">Pole</option>
              <option value="distribution-point">Distribution Point</option>
              <option value="chamber">Chamber</option>
              <option value="home">Home</option>
              <option value="area">Polygon Area</option>
              <option value="cable">Cable</option>
            </select>

            <div style={{ ...label, marginTop: 10 }}>
              {assetType === "cable" ? "Cable Name" : "Name"}
            </div>
            <input
              value={jointName}
              onChange={(e) => setJointName(e.target.value)}
              style={input}
              placeholder="Asset name"
            />

            {assetType === "cable" ? (
              <>
                <div style={{ ...label, marginTop: 10 }}>PIA NOI Number</div>
                <input
                  value={cablePiaNoiNumber}
                  onChange={(e) => setCablePiaNoiNumber(e.target.value)}
                  style={input}
                  placeholder="e.g. NOI-123456"
                />

                <div style={{ ...label, marginTop: 10 }}>Cable Type</div>
                <select
                  value={cableType}
                  onChange={(e) => setCableType(e.target.value as CableType)}
                  style={input}
                >
                  <option>Feeder Cable</option>
                  <option>Link Cable</option>
                  <option>Distribution Cable</option>
                  <option>Drop</option>
                  <option>Spine Cable</option>
                </select>

                <div style={{ ...label, marginTop: 10 }}>Fibre Count</div>
                <select
                  value={fibreCount}
                  onChange={(e) => setFibreCount(e.target.value as FibreCount)}
                  style={input}
                >
                  <option>12F</option>
                  <option>24F</option>
                  <option>48F</option>
                  <option>96F</option>
                  <option>144F</option>
                  <option>288F</option>
                </select>

                <div style={{ ...label, marginTop: 10 }}>Used Fibres</div>
                <input
                  type="number"
                  min={0}
                  max={Number(String(fibreCount).replace(/\D/g, "")) || 288}
                  value={allocatedInputFibres.length}
                  onChange={(e) => {
                    const max =
                      Number(String(fibreCount).replace(/\D/g, "")) || 288;
                    const next = Math.max(
                      0,
                      Math.min(max, Number(e.target.value) || 0),
                    );
                    setAllocatedInputFibres(
                      Array.from({ length: next }, (_, index) => index + 1),
                    );
                  }}
                  style={input}
                />

                <div style={{ ...label, marginTop: 10 }}>Install Method</div>
                <select
                  value={installMethod}
                  onChange={(e) =>
                    setInstallMethod(e.target.value as InstallMethod)
                  }
                  style={input}
                >
                  <option>Underground</option>
                  <option>Overhead</option>
                  <option>Existing Duct</option>
                  <option>New Duct</option>
                </select>

                <div style={{ ...label, marginTop: 10 }}>
                  Parent / Through Cable
                </div>
                <select
                  value={parentCableId || ""}
                  onChange={(e) =>
                    setParentCableId(e.target.value || undefined)
                  }
                  style={input}
                >
                  <option value="">No parent cable</option>
                  {availableParentCablesForBranchAllocation.map((cable) => (
                    <option key={cable.id} value={cable.id}>
                      {cable.name} — {cable.fibreCount || "Unknown size"}
                    </option>
                  ))}
                </select>

                {!editingAssetId && mapMode !== "draw-cable" ? (
                  <button
                    onClick={startCableDrawing}
                    style={{ ...btnPrimary, marginTop: 10, width: "100%" }}
                  >
                    Start Drawing Cable
                  </button>
                ) : null}
              </>
            ) : null}

            {assetType === "area" ? (
              <>
                <div style={{ ...label, marginTop: 10 }}>Polygon Level</div>
                <select
                  value={areaLevel}
                  onChange={(e) => setAreaLevel(e.target.value as AreaLevel)}
                  style={input}
                >
                  <option value="L0">L0</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
              </>
            ) : null}

            {assetType === "ag-joint" ? (
              <>
                <div style={{ ...label, marginTop: 10 }}>Joint Type</div>
                <select
                  value={jointType}
                  onChange={(e) => setJointType(e.target.value)}
                  style={input}
                >
                  <option>CMJ (12 trays)</option>
                  <option>MMJ (20 trays)</option>
                  <option>LMJ (40 trays)</option>
                </select>
              </>
            ) : null}

            <AssetDetailsSidebarSections
              assetType={assetType}
              poleDetails={poleDetails}
              chamberDetails={chamberDetails}
              dpDetails={dpDetails}
              onChangePoleDetails={setPoleDetails}
              onChangeChamberDetails={setChamberDetails}
              onChangeDpDetails={setDpDetails}
              onRebuildThroughCableReservations={
                handleRebuildThroughCableReservations
              }
              connectedHomes={connectedHomesForSelectedDp}
              availableThroughCables={availableParentCablesForBranchAllocation}
              allDistributionPoints={allDistributionPointsForAfnAllocation}
              allAssets={allMapAssets}
              currentDpId={editingAssetId}
              inputStyle={input}
              labelStyle={{ ...label, marginTop: 10 }}
              secondaryButtonStyle={btnSecondary}
            />

            <div style={{ ...label, marginTop: 10 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...input, height: 80 }}
            />

            {editingAssetId ? (
              <>
                {currentEditingAsset?.assetType === "ag-joint" ? (
                  <button
                    onClick={() =>
                      currentEditingAsset && onOpenJoint(currentEditingAsset)
                    }
                    style={{ ...btnPrimary, marginTop: 10 }}
                  >
                    Open Joint Editor
                  </button>
                ) : null}

                {currentEditingAsset?.assetType === "street-cab" ? (
                  <button
                    onClick={() =>
                      currentEditingAsset &&
                      setOpenStreetCabAsset(currentEditingAsset)
                    }
                    style={{ ...btnPrimary, marginTop: 10 }}
                  >
                    Open Street Cab Editor
                  </button>
                ) : null}

                {currentEditingAsset?.assetType === "distribution-point" ? (
                  <button
                    onClick={() =>
                      currentEditingAsset &&
                      setOpenDistributionPointAsset(currentEditingAsset)
                    }
                    style={{ ...btnPrimary, marginTop: 10 }}
                  >
                    Open DP Operations Editor
                  </button>
                ) : null}

                <AssetActivityMiniSummary asset={currentEditingAsset} />
                <button
                  onClick={() => openMaintenanceHistory(currentEditingAsset)}
                  style={{ ...btnSecondary, marginTop: 10 }}
                >
                  Changes / Maintenance History
                </button>
              </>
            ) : null}

            {!editingAssetId ? (
              <>
                <div style={{ ...label, marginTop: 12 }}>Selected Location</div>
                <div style={{ color: "#9ca3af" }}>
                  {pickedLocation
                    ? `${pickedLocation.lat.toFixed(5)}, ${pickedLocation.lng.toFixed(5)}`
                    : "Right click the map to choose what you want to create here."}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => setMapMode("pick")}
                    style={mapMode === "pick" ? btnPrimary : btnSecondary}
                  >
                    Pick Location
                  </button>
                  <button
                    onClick={handleSaveJoint}
                    style={btnPrimary}
                    disabled={
                      !pickedLocation &&
                      assetType !== "cable" &&
                      assetType !== "area"
                    }
                  >
                    Save Asset
                  </button>
                  <button onClick={openCableModalForNew} style={btnSecondary}>
                    Prepare Cable
                  </button>
                  <button
                    onClick={() => {
                      setAssetType("area");
                      setJointType("Polygon Area");
                      setJointName(
                        `Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`,
                      );
                      setPickedLocation(null);
                      setDraftCablePoints([]);
                      setMapMode("draw-area");
                    }}
                    style={btnSecondary}
                  >
                    Prepare Area
                  </button>
                </div>
              </>
            ) : null}

            {editingAssetId ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <button onClick={() => handleSaveEdits()} style={btnPrimary}>
                  Save Changes
                </button>
                <button onClick={resetEditor} style={btnSecondary}>
                  Cancel Edit
                </button>
              </div>
            ) : null}

            {mapMode === "draw-area" ? (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid #334155",
                }}
              >
                <div style={label}>
                  {editingAssetId
                    ? "Edit Polygon Area"
                    : "Polygon Area Drawing"}
                </div>
                <div style={{ color: "#9ca3af" }}>
                  Click around the boundary. Drag blue area point markers to
                  adjust it.
                </div>
                <div style={{ marginTop: 8, color: "#e5e7eb" }}>
                  Points: {draftAreaPoints.length}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={handleUndoAreaPoint}
                    style={btnSecondary}
                    disabled={draftAreaPoints.length === 0}
                  >
                    Undo
                  </button>
                  <button
                    onClick={handleClearArea}
                    style={btnSecondary}
                    disabled={draftAreaPoints.length === 0}
                  >
                    Clear
                  </button>
                  {!editingAssetId ? (
                    <button
                      onClick={handleFinishArea}
                      style={btnPrimary}
                      disabled={draftAreaPoints.length < 3}
                    >
                      Finish Area
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSaveEdits()}
                      style={btnPrimary}
                      disabled={draftAreaPoints.length < 3}
                    >
                      Save Area
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {mapMode === "draw-cable" ? (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid #334155",
                }}
              >
                <div style={label}>
                  {editingAssetId ? "Edit Cable Route" : "Cable Drawing"}
                </div>
                <div style={{ color: "#9ca3af" }}>
                  Click the map to add points. Drag points to move them. Click a
                  segment to insert a point.
                </div>
                <div style={{ marginTop: 8, color: "#e5e7eb" }}>
                  Points: {draftCablePoints.length}
                </div>
                <div style={{ fontWeight: 700, color: "#fbbf24" }}>
                  Length: {formatDistance(draftCableDistance)}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={handleUndoCablePoint}
                    style={btnSecondary}
                    disabled={draftCablePoints.length === 0}
                  >
                    Undo
                  </button>
                  <button
                    onClick={handleClearCable}
                    style={btnSecondary}
                    disabled={draftCablePoints.length === 0}
                  >
                    Clear
                  </button>
                  {!editingAssetId ? (
                    <button
                      onClick={handleFinishCable}
                      style={btnPrimary}
                      disabled={draftCablePoints.length < 2 || isRoutingCable}
                    >
                      {isRoutingCable ? "Routing Cable..." : "Finish Cable"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSaveEdits()}
                      style={btnPrimary}
                      disabled={draftCablePoints.length < 2 || isRoutingCable}
                    >
                      {isRoutingCable ? "Routing Cable..." : "Save Route"}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </details>

        <details open style={drawerSection}>
          <summary style={sectionSummary}>Area Asset Inspector</summary>
          <div style={sectionBody}>
            <AreaAssetInspector
              assets={allMapAssets}
              areaAsset={activeProjectArea}
              networkStats={{
                nodes: networkGraph.nodes.size,
                edges: networkGraph.edges.size,
                disconnected: disconnectedAssets.length,
              }}
              onZoomAsset={handleZoomToAsset}
              onSelectAsset={handleEditAsset}
            />
          </div>
        </details>

        <details style={card}>
          <summary style={sectionSummary}>Import / Export Saved Map</summary>
          <div style={sectionBody}>
            <input type="file" accept=".json" onChange={handleImportJson} />

            <button onClick={handleExportJson} style={btnSecondary}>
              Export JSON
            </button>

            <button onClick={handleExportGeoJson} style={btnSecondary}>
              Export GeoJSON
            </button>

            <button
              onClick={handleLoadOsmHomes}
              style={btnPrimary}
              disabled={isLoadingOsmHomes}
            >
              {isLoadingOsmHomes
                ? "Loading OSM Homes..."
                : "Load OSM Homes in View"}
            </button>

            <div style={{ marginTop: 10 }}>
              <div style={label}>Load GeoJSON Map Assets</div>
              <input
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadAnyGeoJsonMapAssets(file);
                  e.target.value = "";
                }}
              />
              <div
                style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}
              >
                One importer for DPs / AFNs / CBTs, poles, chambers, street
                cabs, areas, cables, PIA routes and UPRN homes.
              </div>
            </div>

            {isLoadingProjectHomes && (
              <div
                style={{ fontSize: "0.82rem", color: "#fbbf24", marginTop: 8 }}
              >
                Loading saved homes for this project...
              </div>
            )}

            <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
              Zoom into the estate/road first, then load buildings or UPRN
              GeoJSON homes. Imported points are saved once in project home
              chunks.
            </div>
          </div>
        </details>
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
      >
        {/* =====================================================
            MAIN LEAFLET MAP
            All Leaflet layers/markers must be inside MapContainer.
            ===================================================== */}
        <MapContainer
          center={mapCenter}
          zoom={initialMapViewRef.current?.zoom ?? 6}
          maxZoom={22}
          rotate={true}
          touchRotate={true}
          rotateControl={true}
          style={{ height: "100%", width: "100%" }}
        >
          <FreeLeafletBaseLayer
            basemap={basemap}
            roadOverlayVisible={roadOverlayVisible}
          />
          <MapBoundsTracker
            onBoundsChange={(bounds) => {
              setMapBounds(bounds);
              const map = mapRef.current;
              if (!map) return;

              try {
                const container = map.getContainer?.();
                if (!container || !container.isConnected) return;
                const center = map.getCenter();
                saveMapView({
                  center: { lat: center.lat, lng: center.lng },
                  zoom: map.getZoom(),
                  activeProjectId: activeProjectIdRef.current,
                });
              } catch {
                // Ignore stale Leaflet map refs during workspace transitions.
              }
            }}
          />
          <MapRefTracker
            onReady={(map) => {
              mapRef.current = map;
            }}
          />

          <MapClickHandler
            mode={mapMode}
            assets={snapCandidateAssets}
            snapEnabled={snapEnabled}
            onPick={setPickedLocation}
            onMeasurePoint={(point) =>
              setMeasurePoints((prev) => [...prev, point])
            }
            onCablePoint={handleCablePoint}
            onAreaPoint={handleAreaPoint}
            onRightClick={handleMapRightClick}
          />
          {/* =====================================================
              EXCHANGE STAR MARKERS
              Keep this inside MapContainer.
              ===================================================== */}
          <ExchangeMarkersLayer
            exchanges={savedExchanges}
            onExchangeClick={handleOpenExchange}
            onExchangeDelete={handleDeleteExchange}
          />

          {/* =====================================================
              EXISTING JOINT / CAB / POLE / DP / CHAMBER MARKERS
              ===================================================== */}
          <AssetMarkersLayer
            assets={visibleProjectAssets}
            visibleLayers={visibleLayers}
            onOpenAsset={(asset) => {
              const routedType = String(
                (asset as any).assetType || (asset as any).type || "",
              ).toLowerCase();

              // PHASE 7A WORKSPACE WIRING:
              // Open operational editors directly where possible.
              // This deliberately does not touch storage, cable drawing, drops, AFN/MDU logic,
              // or Firestore chunk persistence.
              if (
                routedType === "ag-joint" ||
                routedType === "joint" ||
                routedType.includes("joint")
              ) {
                onOpenJoint(asset);
                return;
              }

              if (
                routedType === "street-cab" ||
                routedType.includes("street") ||
                routedType.includes("cab")
              ) {
                setOpenStreetCabAsset(asset);
                return;
              }

              if (
                routedType === "distribution-point" ||
                routedType.includes("distribution") ||
                routedType === "dp" ||
                routedType.includes("afn") ||
                routedType.includes("cbt") ||
                routedType.includes("mdu")
              ) {
                setOpenDistributionPointAsset(asset);
                setShowDpModal(false);
                setIsPanelOpen(false);
                return;
              }

              handleEditAsset(asset);
              setIsPanelOpen(true);
            }}
            onDeleteAsset={handleDeleteAsset}
            onEditAsset={(asset) => {
              // PHASE 8B.2 — Keep Edit Details as metadata editing.
              // The dedicated DP Operations editor is opened via the map Open/Operations path
              // and the side-panel "Open DP Operations Editor" button.
              // Do not route Edit Details into DistributionPointEditor.
              handleEditAsset(asset);
              setIsPanelOpen(true);
            }}
            moveHomesMode={mapMode === "move-homes"}
            selectedMoveHomeIds={selectedMoveHomeIds}
            onToggleMoveHome={handleToggleMoveHomeSelection}
            onMoveHomesTargetDp={handleMoveSelectedHomesToDp}
            assetMovementEnabled={Boolean(editingAssetId)}
            activeMoveAssetId={editingAssetId || undefined}
            surveyDeleteHomesMode={mapMode === "survey-delete-homes"}
            selectedSurveyDeleteHomeIds={selectedSurveyDeleteHomeIds}
            onToggleSurveyDeleteHome={handleToggleSurveyDeleteHomeSelection}
            onMoveAsset={(id, lat, lng) => {
              const beforeAsset = (savedJoints ?? []).find(
                (asset) => asset.id === id,
              );
              const reason = getChangeReasonForCurrentMode(
                "moved",
                beforeAsset?.name || id,
              );
              if (!reason) return;

              let movedAsset: SavedMapAsset | null = null;

              setSavedJoints((prev) =>
                prev.map((asset) => {
                  if (asset.id !== id) return asset;
                  if (asset.geometry?.type !== "Point") return asset;

                  movedAsset = markAssetForLiveSync({
                    ...asset,
                    geometry: {
                      type: "Point",
                      coordinates: [lat, lng],
                    },
                  });

                  return movedAsset;
                }),
              );

              if (movedAsset) {
                writeAssetAuditLog({
                  asset: movedAsset,
                  action: "moved",
                  reason,
                  before: beforeAsset,
                  after: movedAsset,
                });
              }
            }}
          />

          {visibleLayers.areas && (
            <AreaPolygonsLayer
              areas={visibleProjectAreas.filter((asset) =>
                isAreaVisibleForLevel(asset, visibleLayers),
              )}
              activeProjectId={activeProjectId}
              editingAreaId={editingAreaId}
              onUnlockPolygon={setEditingAreaId}
              onSelect={handleSelectProject}
              onEdit={handleEditAsset}
              onDelete={handleDeleteAsset}
            />
          )}

          <OpenreachOverlayLayer
            assets={visibleOpenreachAssets}
            visibleLayers={openreachLayerVisibility}
            ductSelectionEnabled={mapMode === "draw-cable" && shouldUseDuctTraceForInstallMethod(installMethod)}
            selectedDuctId={selectedReferenceDuctId}
            onSelectDuct={(asset) => {
              const item = asset as any;
              setSelectedReferenceDuctId(asset.id);
              setSelectedReferenceDuctName(
                String(
                  item.name ||
                    item.piaRef ||
                    item.importedProperties?.Name ||
                    item.importedProperties?.name ||
                    asset.id ||
                    "Selected duct",
                ),
              );
            }}
          />

          {/* OR / PIA assets are rendered read-only by OpenreachOverlayLayer above.
              Do not render fallback editable Leaflet markers here, otherwise
              Openreach poles/chambers appear as blue editable map pins. */}

          <CableLinesLayer
            assets={visibleProjectAssets}
            cablesVisible={visibleLayers.cables}
            visibleLayers={visibleLayers}
            showCableDistances={visibleLayers.cableDistances}
            onDeleteAsset={handleDeleteAsset}
            onEditAsset={handleEditAsset}
          />

          {pickedLocation && mapMode === "pick" && (
            <Marker position={[pickedLocation.lat, pickedLocation.lng]}>
              <Popup>Picked Location</Popup>
            </Marker>
          )}

          {visibleLayers.measurements &&
            measurePoints.map((point, index) => (
              <Marker
                key={`measure-${index}`}
                position={[point.lat, point.lng]}
              >
                <Popup>
                  <b>Measure Point {index + 1}</b>
                  <br />
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </Popup>
              </Marker>
            ))}

          {visibleLayers.measurements && measurePoints.length >= 2 && (
            <Polyline
              positions={measurePoints.map(
                (p) => [p.lat, p.lng] as [number, number],
              )}
              pathOptions={{ color: "#60a5fa", weight: 3 }}
            />
          )}

          {visibleLayers.measurements &&
            measurePoints.length >= 2 &&
            measurePoints.slice(1).map((point, index) => {
              const previous = measurePoints[index];
              const segmentDistance = getPathDistanceMeters([previous, point]);
              const midpoint = {
                lat: (previous.lat + point.lat) / 2,
                lng: (previous.lng + point.lng) / 2,
              };

              return (
                <Marker
                  key={`measure-label-${index}`}
                  position={[midpoint.lat, midpoint.lng]}
                  icon={makeMeasureLabelIcon(formatDistance(segmentDistance))}
                  interactive={false}
                />
              );
            })}

          {visibleLayers.measurements && measurePoints.length >= 2 && (
            <Marker
              key="measure-total-label"
              position={[
                measurePoints[measurePoints.length - 1].lat,
                measurePoints[measurePoints.length - 1].lng,
              ]}
              icon={makeMeasureLabelIcon(
                `Total: ${formatDistance(measuredDistance)}`,
              )}
              interactive={false}
            />
          )}

          {draftAreaPoints.map((point, index) => (
            <Marker
              key={`draft-area-${index}`}
              position={[point.lat, point.lng]}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const marker = event.target as L.Marker;
                  const nextPoint = marker.getLatLng();
                  handleMoveAreaPoint(index, {
                    lat: nextPoint.lat,
                    lng: nextPoint.lng,
                  });
                },
              }}
            >
              <Popup>
                <b>Area Point {index + 1}</b>
                <br />
                Drag this marker to adjust the polygon.
                <br />
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </Popup>
            </Marker>
          ))}

          {draftAreaPoints.length >= 2 && (
            <Polyline
              positions={[
                ...draftAreaPoints.map(
                  (p) => [p.lat, p.lng] as [number, number],
                ),
                ...(draftAreaPoints.length >= 3
                  ? [
                      [draftAreaPoints[0].lat, draftAreaPoints[0].lng] as [
                        number,
                        number,
                      ],
                    ]
                  : []),
              ]}
              pathOptions={{ color: "#a855f7", weight: 3, dashArray: "8, 6" }}
            />
          )}

          {draftAreaPoints.length >= 3 && (
            <Polygon
              positions={draftAreaPoints.map(
                (p) => [p.lat, p.lng] as [number, number],
              )}
              pathOptions={{ color: "#a855f7", weight: 3, fillOpacity: 0.16 }}
            />
          )}

          {draftCablePoints.map((point, index) => (
            <Marker
              key={`draft-cable-${index}`}
              position={[point.lat, point.lng]}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const marker = event.target as L.Marker;
                  const nextPoint = marker.getLatLng();

                  handleMoveCablePoint(index, {
                    lat: nextPoint.lat,
                    lng: nextPoint.lng,
                  });
                },
              }}
            >
              <Popup>
                <b>Cable Point {index + 1}</b>
                <br />
                Drag this marker to adjust the cable.
                <br />
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                <br />
                <button
                  onClick={() => handleDeleteCablePoint(index)}
                  style={{
                    marginTop: 8,
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    padding: "6px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Delete this point
                </button>
              </Popup>
            </Marker>
          ))}

          {draftCablePoints.length >= 2 &&
            draftCablePoints.slice(0, -1).map((point, index) => {
              const nextPoint = draftCablePoints[index + 1];

              return (
                <Polyline
                  key={`draft-cable-segment-${index}`}
                  positions={[
                    [point.lat, point.lng] as [number, number],
                    [nextPoint.lat, nextPoint.lng] as [number, number],
                  ]}
                  pathOptions={{
                    color:
                      cableType === "ULW Cable"
                        ? "#22c55e"
                        : cableType === "Link Cable"
                          ? "#3b82f6"
                          : "#f59e0b",
                    weight: 6,
                    dashArray: installMethod === "OH" ? "10, 8" : undefined,
                  }}
                  eventHandlers={{
                    click: (event) => {
                      handleInsertCablePoint(index, {
                        lat: event.latlng.lat,
                        lng: event.latlng.lng,
                      });
                    },
                  }}
                />
              );
            })}
        </MapContainer>

        <MapContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onSelect={handleContextAddAsset}
        />

        <CableDetailsModal
          visible={false}
          name={jointName}
          notes={notes}
          piaNoiNumber={cablePiaNoiNumber}
          cableType={cableType}
          fibreCount={fibreCount}
          installMethod={installMethod}
          usedFibres={allocatedInputFibres.length}
          parentCableId={parentCableId}
          allocatedInputFibres={allocatedInputFibres}
          availableParentCables={availableParentCablesForBranchAllocation}
          allAssets={allMapAssets}
          editingAssetId={editingAssetId}
          onChangeName={setJointName}
          onChangeNotes={setNotes}
          onChangePiaNoiNumber={setCablePiaNoiNumber}
          onChangeCableType={setCableType}
          onChangeFibreCount={setFibreCount}
          onChangeInstallMethod={setInstallMethod}
          onChangeUsedFibres={() => {}}
          onChangeParentCableId={setParentCableId}
          onChangeAllocatedInputFibres={setAllocatedInputFibres}
          onStart={startCableDrawing}
          onCancel={resetEditor}
          isEditing={!!editingAssetId}
        />

        <PoleDetailsModal
          visible={false}
          name={jointName}
          details={poleDetails}
          onChangeName={setJointName}
          onChange={setPoleDetails}
          onSave={(nextDetails) => {
            setShowPoleModal(false);
            if (editingAssetId) {
              handleSaveEdits({ poleDetails: nextDetails ?? poleDetails });
            } else {
              handleSaveJoint({ poleDetails: nextDetails ?? poleDetails });
            }
          }}
          onCancel={resetEditor}
        />

        <DistributionPointDetailsModal
          visible={false}
          name={jointName}
          details={dpDetails}
          connectedHomes={connectedHomesForSelectedDp}
          availableThroughCables={availableParentCablesForBranchAllocation}
          allDistributionPoints={allDistributionPointsForAfnAllocation}
          allAssets={allMapAssets}
          currentDpId={editingAssetId ?? undefined}
          editingAssetId={editingAssetId}
          onChangeName={setJointName}
          onChange={setDpDetails}
          onSave={(nextDetails) => {
            setShowDpModal(false);
            if (editingAssetId) {
              handleSaveEdits({ dpDetails: nextDetails ?? dpDetails });
            } else {
              handleSaveJoint({ dpDetails: nextDetails ?? dpDetails });
            }
          }}
          onCancel={resetEditor}
        />

        <ChamberDetailsModal
          visible={false}
          name={jointName}
          notes={notes}
          details={chamberDetails}
          onChangeName={setJointName}
          onChangeNotes={setNotes}
          onChange={setChamberDetails}
          onSave={(nextDetails) => {
            setShowChamberModal(false);
            if (editingAssetId) {
              handleSaveEdits({
                chamberDetails: nextDetails ?? chamberDetails,
              });
            } else {
              handleSaveJoint({
                chamberDetails: nextDetails ?? chamberDetails,
              });
            }
          }}
          onCancel={resetEditor}
        />

        <MaintenanceAuditOverlay
          visible={showMaintenancePanel}
          asset={maintenanceAsset}
          projectId={activeProjectId}
          onClose={() => {
            setShowMaintenancePanel(false);
            setMaintenanceAsset(null);
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          zIndex: 1100,
          transform: isLayersOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
        }}
      >
        <LayersPanel
          visibleLayers={visibleLayers}
          setVisibleLayers={setVisibleLayers}
          basemap={basemap}
          setBasemap={setBasemap}
          roadOverlayVisible={roadOverlayVisible}
          setRoadOverlayVisible={setRoadOverlayVisible}
          snapEnabled={snapEnabled}
          setSnapEnabled={setSnapEnabled}
          measurementDistance={measuredDistance}
          measurementPointCount={measurePoints.length}
          isMeasuring={mapMode === "measure"}
          onStartMeasurement={() => setMapMode("measure")}
          onStopMeasurement={() => setMapMode("pick")}
          onUndoMeasurementPoint={handleUndoMeasurementPoint}
          onClearMeasurements={handleClearMeasurement}
        />
      </div>

      {!showMaintenancePanel && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
          }}
        >
          <AppModeSwitch />
        </div>
      )}

      {!showMaintenancePanel && (
        <>
          <button
            onClick={handleGpsLocate}
            style={{
              ...topMapButton,
              right: isMobile ? 92 : isLayersOpen ? 430 : 92,
            }}
          >
            GPS
          </button>

          <button
            onClick={() => setIsLayersOpen((prev) => !prev)}
            style={{
              position: "absolute",
              top: 16,
              right: isMobile ? 16 : isLayersOpen ? 340 : 16,
              zIndex: 1200,
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "10px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
            }}
          >
            {isLayersOpen ? "Hide Layers" : "Layers"}
          </button>
        </>
      )}


      {openDistributionPointAsset && (
        <DistributionPointEditor
          asset={openDistributionPointAsset}
          allAssets={allMapAssets}
          onClose={() => {
            setOpenDistributionPointAsset(null);
            if (activeProjectArea) {
              setIsProjectWorkspaceOpen(true);
            }
          }}
          onSaveRouting={({ asset, nextDetails }) => {
            const updatedAsset = {
              ...(asset as any),
              dpDetails: nextDetails,
              properties: {
                ...((asset as any).properties || {}),
                dpDetails: nextDetails,
              },
            } as SavedMapAsset;

            const savedAsset = saveMapAssetToState(updatedAsset, {
              message: "DP routing updated",
            });

            setOpenDistributionPointAsset(savedAsset);
          }}
        />
      )}

      {openStreetCabAsset && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3000,
            background: "#0f172a",
            height: "100dvh",
            maxHeight: "100dvh",
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            paddingBottom: "96px",
            boxSizing: "border-box",
          }}
        >
          <StreetCabDesigner
            asset={openStreetCabAsset}
            onClose={() => setOpenStreetCabAsset(null)}
            onSave={(updatedAsset) => {
              const syncedAsset = saveMapAssetToState(updatedAsset, {
                isNew: false,
                message: "Street cab saved to map.",
              });
              setOpenStreetCabAsset(syncedAsset);
            }}
          />
        </div>
      )}
      {openExchangeAsset && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3000,
            background: "#0f172a",
            height: "100dvh",
            maxHeight: "100dvh",
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            paddingBottom: "96px",
            boxSizing: "border-box",
          }}
        >
          <ExchangeDesigner
            exchange={openExchangeAsset}
            onClose={() => setOpenExchangeAsset(null)}
            onSave={handleSaveExchange}
          />
        </div>
      )}
    </div>
  );
}

// =====================================================
// STYLES: PROJECT WORKSPACE LOADING SCREEN
// =====================================================
const projectWorkspaceLoadingOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background:
    "radial-gradient(circle at 60% 40%, rgba(37, 99, 235, 0.22), transparent 36%), #020617",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
};

const projectWorkspaceLoadingCard: React.CSSProperties = {
  width: "min(620px, calc(100vw - 48px))",
  background: "rgba(15, 23, 42, 0.94)",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  borderRadius: 20,
  padding: 28,
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
};

const projectWorkspaceProgressTrack: React.CSSProperties = {
  height: 8,
  background: "rgba(148, 163, 184, 0.22)",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 22,
};

const projectWorkspaceProgressBar: React.CSSProperties = {
  height: "100%",
  width: "72%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #2563eb, #22c55e)",
};

// =====================================================
// STYLES: DRAWER / TOP MAP ACTIONS
// =====================================================
const drawerToggleButton: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 2100,
  background: "#111827",
  color: "white",
  border: "1px solid #334155",
  padding: "10px 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
};

const topMapButton: React.CSSProperties = {
  position: "absolute",
  top: 16,
  zIndex: 1200,
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "8px",
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
};

const drawerSection: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  padding: "0.85rem",
  borderRadius: 10,
};

const sectionSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 800,
  color: "white",
  listStyle: "none",
};

const sectionBody: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 12,
};

// =====================================================
// STYLES: LEFT DRAWER / FORMS / BUTTONS
// =====================================================
const panel: React.CSSProperties = {
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  borderRight: "1px solid #374151",
};

const card: React.CSSProperties = {
  background: "#374151",
  padding: "1rem",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const label: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
};

const input: React.CSSProperties = {
  padding: "0.5rem",
  borderRadius: 6,
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
};

const btnDanger: React.CSSProperties = {
  background: "#991b1b",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #ef4444",
  fontWeight: 800,
};

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "0.95rem",
};
