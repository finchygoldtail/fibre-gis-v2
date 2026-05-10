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
import { snapPointToAssets } from "./map/utils/snapToAssets";
import {
  buildNetworkGraph,
  findDisconnectedAssets,
} from "../services/networkGraph";

import { routePointsToRoads } from "./map/utils/routeToRoads";
import {
  loadOsmBuildingsAsHomes,
  type OsmBounds,
} from "./map/utils/loadOsmBuildings";
import { createDropCableRecordsFromDPs, getAssetLatLng } from "./map/utils/generateDrops";
import StreetCabDesigner from "./streetcab/StreetCabDesigner";
import ProjectAreaSelector from "./map/projects/ProjectAreaSelector";
import { filterAssetsForProjectArea } from "./map/projects/projectAssetFilter";
import {
  loadProjectHomes,
  saveProjectHomes,
} from "./map/projects/projectHomesStorage";
import { ExchangeMarkersLayer } from "./map/ExchangeMarkersLayer";
import AssetDetailsSidebarSections from "./map/AssetDetailsSidebarSections";
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

  const currentMetadata = ((asset as any).metadata || {}) as Record<string, unknown>;
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


function requestChangeReason(action: AssetChangeAction, assetName?: string): string | null {
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
          <span style={{ textAlign: "right", maxWidth: 150 }}>{activity.lastChangeReason}</span>
        </div>
      ) : null}
    </div>
  );
}

type MapMode = "pick" | "measure" | "draw-cable" | "draw-area" | "move-homes";

type BasemapType = "street" | "satellite" | "hybrid" | "dark";

type AreaLevel = "L0" | "L1" | "L2" | "L3";

type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
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

  const updateBounds = () => {
    const bounds = map.getBounds();
    onBoundsChange({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  };

  useEffect(() => {
    updateBounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapEvents({
    moveend: updateBounds,
    zoomend: updateBounds,
  });

  return null;
}

function MapRefTracker({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
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
  return raw.startsWith("uprn-") ? [raw, raw.replace(/^uprn-/, "")] : [raw, `uprn-${raw}`];
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
  return raw.startsWith("uprn-") ? [raw, raw.replace(/^uprn-/, "")] : [raw, `uprn-${raw}`];
}

function getDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

function createManualDropCable(dp: SavedMapAsset, home: SavedMapAsset): SavedMapAsset | null {
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
    uprn: (home as any).properties?.UPRN ?? (home as any).UPRN ?? (home as any).uprn,
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
  const selected = FREE_LEAFLET_TILE_URLS[basemap] || FREE_LEAFLET_TILE_URLS.street;

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

  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>({
    agJoints: true,
    streetCabs: true,
    poles: true,
    distributionPoints: true,
    chambers: true,
    cables: true,
    areas: true,
    measurements: true,
    cableDistances: false,
    homes: false,
    l0: true,
    l1: true,
    l2: true,
    l3: true,
    newPoles: true,
    orPoles: true,
    fw2: true,
    fw4: true,
    fw6: true,
    fw10: true,
    homesSdu: false,
    homesMdu: false,
    homesFlats: false,
    feeders: true,
    links: true,
    ulw48: true,
    ulw36: true,
    ulw24: true,
    ulw12: true,
    live: true,
    bwip: true,
    unserviceable: true,
    liveNotReady: true,
  });

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isRoutingCable, setIsRoutingCable] = useState(false);
  const [isLoadingOsmHomes, setIsLoadingOsmHomes] = useState(false);
  const [isLoadingProjectHomes, setIsLoadingProjectHomes] = useState(false);
  const [projectHomes, setProjectHomes] = useState<SavedMapAsset[]>([]);
  const [loadedHomesProjectId, setLoadedHomesProjectId] = useState<
    string | null
  >(null);
  const [mapBounds, setMapBounds] = useState<OsmBounds | null>(null);

  const normalizedSavedJoints = useMemo(
    () => (savedJoints ?? []).map(normalizeMapAsset),
    [savedJoints],
  );

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
    normalizedSavedJoints.forEach((asset) => byId.set(asset.id, asset));
    normalizedProjectHomes.forEach((asset) => byId.set(asset.id, asset));
    return Array.from(byId.values());
  }, [normalizedSavedJoints, normalizedProjectHomes]);

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

  const projectAreas = useMemo(
    () =>
      allMapAssets.filter(
        (asset) =>
          asset.assetType === "area" && asset.geometry?.type === "Polygon",
      ),
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
        allMapAssets.filter((asset) => asset.assetType !== "area"),
        activeProjectArea,
      ),
    [activeProjectArea, allMapAssets],
  );

  const visibleProjectAreas = useMemo(
    () =>
      activeProjectId
        ? projectAreas.filter((area) => area.id === activeProjectId)
        : projectAreas,
    [activeProjectId, projectAreas],
  );

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
    });
    setChamberDetails({});
    setShowCableModal(false);
    setShowPoleModal(false);
    setShowDpModal(false);
    setShowChamberModal(false);
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
      (prev ?? []).map((item) => (item.id === viewedAsset.id ? viewedAsset : item)),
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
    setDpDetails(
      viewedAsset.dpDetails || {
        powerReadings: ["", "", "", ""],
        closureType: "CBT",
        connectionsToHomes: 8,
      },
    );
    setChamberDetails(viewedAsset.chamberDetails || {});

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
      setDraftCablePoints(
        asset.geometry.coordinates.map(([lat, lng]) => ({ lat, lng })),
      );
      setShowCableModal(false);
    }
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
      (asset) => asset.assetType === "home" && selectedMoveHomeIds.includes(asset.id),
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
      alert("Some selected homes could not be moved because coordinates were missing.");
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

      const markedDrops = newDrops.map((drop) => markAssetForLiveSync(drop, true));

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
    alert(`Moved ${selectedHomes.length} home${selectedHomes.length === 1 ? "" : "s"} to ${targetDp.name || "selected DP"}.`);
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

    const beforeAsset = (savedJoints ?? []).find((asset) => asset.id === editingAssetId);
    const reason = getChangeReasonForCurrentMode("updated", beforeAsset?.name || jointName);
    if (!reason) return;

    let savedAfterAsset: SavedMapAsset | null = null;
    let routedCableCoordinates: [number, number][] | null = null;

    if (assetType === "cable" && draftCablePoints.length >= 2) {
      setIsRoutingCable(true);
      try {
        routedCableCoordinates = await routePointsToRoads(draftCablePoints);
      } finally {
        setIsRoutingCable(false);
      }
    }

    const nextPoleDetails = detailOverrides?.poleDetails ?? poleDetails;
    const nextDpDetails = detailOverrides?.dpDetails ?? dpDetails;
    const nextChamberDetails =
      detailOverrides?.chamberDetails ?? chamberDetails;

    setSavedJoints((prev) =>
      prev.map((asset) => {
        if (asset.id !== editingAssetId) return asset;

        if (assetType === "area") {
          if (draftAreaPoints.length < 3) return asset;

          savedAfterAsset = withAssetEditedMetadata(markAssetForLiveSync({
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
          }), "updated", reason);
          return savedAfterAsset;
        }

        if (asset.geometry?.type === "Point") {
          if (!pickedLocation) return asset;

          savedAfterAsset = withAssetEditedMetadata(markAssetForLiveSync({
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
            poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
            dpDetails:
              assetType === "distribution-point" ? nextDpDetails : undefined,
            chamberDetails:
              assetType === "chamber" ? nextChamberDetails : undefined,
            geometry: {
              type: "Point",
              coordinates: [pickedLocation.lat, pickedLocation.lng],
            },
          }), "updated", reason);
          return savedAfterAsset;
        }

        savedAfterAsset = withAssetEditedMetadata(markAssetForLiveSync({
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
          routeMode: routedCableCoordinates ? "road" : undefined,
          geometry: {
            type: "LineString",
            coordinates:
              routedCableCoordinates ||
              draftCablePoints.map((p) => [p.lat, p.lng]),
          },
        }), "updated", reason);
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
      poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
      dpDetails: assetType === "distribution-point" ? nextDpDetails : undefined,
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
      const routedCoordinates = await routePointsToRoads(draftCablePoints);

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
        routeMode: "road",
        geometry: {
          type: "LineString",
          coordinates: routedCoordinates,
        },
      } as SavedMapAsset;

      const firstPoint = draftCablePoints[0];
      const lastPoint = draftCablePoints[draftCablePoints.length - 1];
      const endpointDps = [
        findDpAtCableEnd(savedJoints, firstPoint),
        findDpAtCableEnd(savedJoints, lastPoint),
      ].filter(Boolean) as SavedMapAsset[];

      // Use both the drawn cable route and the road-routed cable route.
      // Road routing can pull the line away from poles/DPs, so checking only
      // the final routed line can miss DPs sitting on the actual pole line.
      const routeDps = [
        ...findDpsAlongCable(savedJoints, draftCablePoints, 35),
        ...findDpsAlongCable(savedJoints, routedCoordinates, 35),
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
      (savedJoints ?? []).filter((asset) => asset.assetType !== "area"),
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
      (savedJoints ?? []).filter((asset) => asset.assetType !== "area"),
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
    const deletedAsset = (savedJoints ?? []).find((asset) => asset.id === deletedId);
    const reason = getChangeReasonForCurrentMode("deleted", deletedAsset?.name || deletedId);
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
    setJointName(getNextAssetName(savedJoints, type === "joint" ? "ag-joint" : (type as any)));
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
      (savedJoints ?? []).filter((asset) => asset.assetType !== "area"),
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
        const homes = createHomeAssetsFromGeoJson(geojson, map.getBounds());

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

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) throw new Error("Invalid file");

      setSavedJoints(
        (parsed as SavedMapAsset[]).map((asset) =>
          markAssetForLiveSync(asset, !(asset as any).createdAt),
        ),
      );
      alert("Imported successfully");
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    e.target.value = "";
  };

  const availableParentCablesForBranchAllocation = useMemo(
    () =>
      allMapAssets.filter((asset) => {
        if (asset.assetType !== "cable") return false;
        if (asset.geometry?.type !== "LineString") return false;
        if (asset.id === editingAssetId) return false;

        // Parent / through cable options need to include link cables as well as
        // feeder/spine/ULW cables. Previously Link Cable was excluded, so cables
        // like BD-BAW-LC011 could not be selected as a BAS parent cable.
        return (
          asset.cableType === "AFN Spine Cable" ||
          asset.cableType === "Feeder Cable" ||
          asset.cableType === "ULW Cable" ||
          asset.cableType === "Link Cable" ||
          asset.installMethod === "OH"
        );
      }),
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


        <details open style={card}>
          <summary style={sectionSummary}>Home Reassignment</summary>
          <div style={sectionBody}>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
              Move UPRNs/homes from one DP to another without touching feeder or link cables.
            </div>

            <button
              type="button"
              onClick={handleToggleMoveHomesMode}
              style={mapMode === "move-homes" ? btnPrimary : btnSecondary}
            >
              {mapMode === "move-homes" ? "✓ Move Homes Active" : "Move Homes to DP"}
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
                  {selectedMoveHomeIds.length} home{selectedMoveHomeIds.length === 1 ? "" : "s"} selected
                </div>
                <div>Click UPRNs/homes to select them, then click the target DP.</div>
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

        <details open style={card}>
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
                    const max = Number(String(fibreCount).replace(/\D/g, "")) || 288;
                    const next = Math.max(0, Math.min(max, Number(e.target.value) || 0));
                    setAllocatedInputFibres(Array.from({ length: next }, (_, index) => index + 1));
                  }}
                  style={input}
                />

                <div style={{ ...label, marginTop: 10 }}>Install Method</div>
                <select
                  value={installMethod}
                  onChange={(e) => setInstallMethod(e.target.value as InstallMethod)}
                  style={input}
                >
                  <option>Underground</option>
                  <option>Overhead</option>
                  <option>Existing Duct</option>
                  <option>New Duct</option>
                </select>

                <div style={{ ...label, marginTop: 10 }}>Parent / Through Cable</div>
                <select
                  value={parentCableId || ""}
                  onChange={(e) => setParentCableId(e.target.value || undefined)}
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
                    onClick={() => currentEditingAsset && onOpenJoint(currentEditingAsset)}
                    style={{ ...btnPrimary, marginTop: 10 }}
                  >
                    Open Joint Editor
                  </button>
                ) : null}

                {currentEditingAsset?.assetType === "street-cab" ? (
                  <button
                    onClick={() => currentEditingAsset && setOpenStreetCabAsset(currentEditingAsset)}
                    style={{ ...btnPrimary, marginTop: 10 }}
                  >
                    Open Street Cab Editor
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

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setMapMode("pick")} style={mapMode === "pick" ? btnPrimary : btnSecondary}>
                    Pick Location
                  </button>
                  <button onClick={handleSaveJoint} style={btnPrimary} disabled={!pickedLocation && assetType !== "cable" && assetType !== "area"}>
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
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => handleSaveEdits()} style={btnPrimary}>
                  Save Changes
                </button>
                <button onClick={resetEditor} style={btnSecondary}>
                  Cancel Edit
                </button>
              </div>
            ) : null}

            {mapMode === "draw-area" ? (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #334155" }}>
                <div style={label}>{editingAssetId ? "Edit Polygon Area" : "Polygon Area Drawing"}</div>
                <div style={{ color: "#9ca3af" }}>
                  Click around the boundary. Drag blue area point markers to adjust it.
                </div>
                <div style={{ marginTop: 8, color: "#e5e7eb" }}>Points: {draftAreaPoints.length}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={handleUndoAreaPoint} style={btnSecondary} disabled={draftAreaPoints.length === 0}>Undo</button>
                  <button onClick={handleClearArea} style={btnSecondary} disabled={draftAreaPoints.length === 0}>Clear</button>
                  {!editingAssetId ? (
                    <button onClick={handleFinishArea} style={btnPrimary} disabled={draftAreaPoints.length < 3}>Finish Area</button>
                  ) : (
                    <button onClick={() => handleSaveEdits()} style={btnPrimary} disabled={draftAreaPoints.length < 3}>Save Area</button>
                  )}
                </div>
              </div>
            ) : null}

            {mapMode === "draw-cable" ? (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #334155" }}>
                <div style={label}>{editingAssetId ? "Edit Cable Route" : "Cable Drawing"}</div>
                <div style={{ color: "#9ca3af" }}>
                  Click the map to add points. Drag points to move them. Click a segment to insert a point.
                </div>
                <div style={{ marginTop: 8, color: "#e5e7eb" }}>Points: {draftCablePoints.length}</div>
                <div style={{ fontWeight: 700, color: "#fbbf24" }}>Length: {formatDistance(draftCableDistance)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={handleUndoCablePoint} style={btnSecondary} disabled={draftCablePoints.length === 0}>Undo</button>
                  <button onClick={handleClearCable} style={btnSecondary} disabled={draftCablePoints.length === 0}>Clear</button>
                  {!editingAssetId ? (
                    <button onClick={handleFinishCable} style={btnPrimary} disabled={draftCablePoints.length < 2 || isRoutingCable}>
                      {isRoutingCable ? "Routing Cable..." : "Finish Cable"}
                    </button>
                  ) : (
                    <button onClick={() => handleSaveEdits()} style={btnPrimary} disabled={draftCablePoints.length < 2 || isRoutingCable}>
                      {isRoutingCable ? "Routing Cable..." : "Save Route"}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </details>

        <details open style={drawerSection}>
          <summary style={sectionSummary}>Network Operations</summary>
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
              <div style={label}>Load GeoJSON / UPRN Homes</div>
              <input
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadGeoJsonHomes(file);
                  e.target.value = "";
                }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={label}>Load GeoJSON / UPRN Homes in View</div>
              <input
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) loadGeoJsonHomesInView(file);
                  e.target.value = "";
                }}
              />
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

              const center = map.getCenter();
              saveMapView({
                center: { lat: center.lat, lng: center.lng },
                zoom: map.getZoom(),
                activeProjectId: activeProjectIdRef.current,
              });
            }}
          />
          <MapRefTracker
            onReady={(map) => {
              mapRef.current = map;
            }}
          />

          <MapClickHandler
            mode={mapMode}
            assets={visibleProjectAssets}
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
              handleEditAsset(asset);
              setIsPanelOpen(true);
            }}
            onDeleteAsset={handleDeleteAsset}
            onEditAsset={handleEditAsset}
            moveHomesMode={mapMode === "move-homes"}
            selectedMoveHomeIds={selectedMoveHomeIds}
            onToggleMoveHome={handleToggleMoveHomeSelection}
            onMoveHomesTargetDp={handleMoveSelectedHomesToDp}
            onMoveAsset={(id, lat, lng) => {
              const beforeAsset = (savedJoints ?? []).find((asset) => asset.id === id);
              const reason = getChangeReasonForCurrentMode("moved", beforeAsset?.name || id);
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
              icon={makeMeasureLabelIcon(`Total: ${formatDistance(measuredDistance)}`)}
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
// STYLES: DRAWER / WELCOME / TOP MAP ACTIONS
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

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "0.95rem",
};
