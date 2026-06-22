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
import { useAppMode } from "../context/AppModeContext";
import { useUserRole } from "../context/UserRoleContext";
import { useJointMappings } from "./map/hooks/useJointMappings";
import { useOpenreachAssets } from "./map/hooks/useOpenreachAssets";
import {
  useLayerVisibility,
  type LayerVisibility,
} from "./map/hooks/useLayerVisibility";
import { useProjectHomesController } from "./map/homes/useProjectHomesController";
import { useHomeWorkflowControllers } from "./map/homes/useHomeWorkflowControllers";
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
import { loadMapView, saveMapView } from "./map/mapViewMemory";
import PoleDetailsModal from "./map/modals/PoleDetailsModal";
import DistributionPointDetailsModal from "./map/modals/DistributionPointDetailsModal";
import ChamberDetailsModal, {
  type ChamberDetails,
} from "./map/modals/ChamberDetailsModal";
import UserMenu from "./UserMenu";
import MaintenanceAuditOverlay from "./map/audit/MaintenanceAuditOverlay";
import { useMaintenanceHistory } from "./map/maintenance/useMaintenanceHistory";
import type { AssetChangeAction } from "./map/audit/types";
import {
  createAssetActivityLog,
  formatActivityTimestamp,
  getAssetActivityMetadata,
  withAssetEditedMetadata,
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
import {
  createManualDropCable,
  getDistanceMeters,
  getDropHomeKeys,
  getHomeConnectionKey,
  getHomeDropKeys,
} from "./map/homes/homeDropHelpers";
import {
  findDpAtCableEnd,
  findDpsAlongCable,
  getAssetPoint,
  isDropCable,
  sanitiseCableRouteCoordinates,
} from "./map/utils/mapAssetGeometry";
import StreetCabDesigner from "./streetcab/StreetCabDesigner";
import DistributionPointEditor from "./dp/DistributionPointEditor";
import ProjectAreaSelector from "./map/projects/ProjectAreaSelector";
import { filterAssetsForProjectArea } from "./map/projects/projectAssetFilter";
import { useProjectAreaView } from "./map/projects/useProjectAreaView";
import { useProjectWorkspaceStats } from "./map/workspace/useProjectWorkspaceStats";
import { useLayerCounts } from "./map/layers/useLayerCounts";
import { useCableAllocationOptions } from "./map/cables/useCableAllocationOptions";
import { useCableWorkflow } from "./map/cables/useCableWorkflow";
import {
  useMapDrawingState,
  type BasemapType,
  type MapMode,
} from "./map/hooks/useMapDrawingState";
import { useRoleMobileMode } from "./map/responsive/useRoleMobileMode";
import { useDeviceLayout } from "./map/responsive/useDeviceLayout";
import SurveyMobileControls from "./map/responsive/mobile/SurveyMobileControls";
import MaintenanceMobileControls from "./map/responsive/mobile/MaintenanceMobileControls";
import BuildMobileWorkspaceNotice from "./map/responsive/mobile/BuildMobileWorkspaceNotice";
import FieldModeStatusPill from "./map/responsive/shared/FieldModeStatusPill";
import FieldQuickActionDrawer from "./map/responsive/shared/FieldQuickActionDrawer";
import FieldSelectedAssetCard from "./map/responsive/shared/FieldSelectedAssetCard";
import FieldNavigationBar from "./map/responsive/shared/FieldNavigationBar";
import AssetBottomSheet from "./map/responsive/mobile/AssetBottomSheet";
import { useOfflineFieldMode } from "./map/responsive/offline/useOfflineFieldMode";
import OfflineFieldModeBanner from "./map/responsive/offline/OfflineFieldModeBanner";
import FieldPhotoCapturePanel from "./map/responsive/photos/FieldPhotoCapturePanel";
import ResponsiveFieldPolish from "./map/responsive/shared/ResponsiveFieldPolish";
import SurveyTabletControls from "./map/responsive/tablet/SurveyTabletControls";
import MaintenanceTabletControls from "./map/responsive/tablet/MaintenanceTabletControls";
import {
  markAssetForLiveSync,
  useAssetPersistence,
} from "./map/persistence/useAssetPersistence";
import {
  createMapAssetsFromAnyGeoJson,
  createPiaOverlayAssetsFromGeoJson,
} from "./map/import/geoJsonAssetImport";
import {
  loadProjectHomes,
  saveProjectHomes,
} from "./map/projects/projectHomesStorage";
import { ExchangeMarkersLayer } from "./map/ExchangeMarkersLayer";
import {
  useExchangeController,
  type ExchangeAsset,
} from "./map/exchange/useExchangeController";
import { useAssetEditorState } from "./map/editor/useAssetEditorState";
import { useAssetSelection } from "./map/editor/useAssetSelection";
import { useEditorReset } from "./map/editor/useEditorReset";
import { useMapNavigation } from "./map/navigation/useMapNavigation";
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
// Split storage is disabled during storage-integrity recovery.
// Main chunks are the only authoritative save/load path.
import {
  isOpenreachReferenceAsset,
  loadOrAssets,
  mergeAndSaveOrAssets,
  normaliseOpenreachAsset,
  saveOrAssets,
} from "../services/orAssetStorage";
import { withAreaAssetIndex } from "../services/areaAssetIndex";
export type SavedJoint = SavedMapAsset;
export type { SavedMapAsset };

/* Fix default leaflet icons */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const measurePointIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
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

type AreaLevel = "L0" | "L1" | "L2" | "L3";

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
  onBoundsChange: (bounds: OsmBounds, zoom?: number) => void;
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

      onBoundsChange(
        {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
        map.getZoom(),
      );
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


function getPolygonOuterRing(asset: SavedMapAsset | null | undefined): [number, number][] {
  const geometry = (asset as any)?.geometry;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return [];

  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring)) return [];

  return ring
    .map((coord: any) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lat = Number(coord[0]);
      const lng = Number(coord[1]);
      return Number.isFinite(lat) && Number.isFinite(lng)
        ? ([lat, lng] as [number, number])
        : null;
    })
    .filter(Boolean) as [number, number][];
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;

  const [pointLat, pointLng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersects =
      latI > pointLat !== latJ > pointLat &&
      pointLng <
        ((lngJ - lngI) * (pointLat - latI)) /
          ((latJ - latI) || Number.EPSILON) +
          lngI;

    if (intersects) inside = !inside;
  }

  return inside;
}

function getAssetGeometryPoints(asset: SavedMapAsset): [number, number][] {
  const geometry = (asset as any)?.geometry;
  if (!geometry) return [];

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lat, lng] = geometry.coordinates;
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? [[Number(lat), Number(lng)]]
      : [];
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lat = Number(coord[0]);
        const lng = Number(coord[1]);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? ([lat, lng] as [number, number])
          : null;
      })
      .filter(Boolean) as [number, number][];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring)) return [];
    return ring
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lat = Number(coord[0]);
        const lng = Number(coord[1]);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? ([lat, lng] as [number, number])
          : null;
      })
      .filter(Boolean) as [number, number][];
  }

  return [];
}

function assetTouchesPolygon(asset: SavedMapAsset, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  return getAssetGeometryPoints(asset).some((point) => pointInPolygon(point, polygon));
}


function getAreaRepairCodes(area: SavedMapAsset | null | undefined, areaName: string): string[] {
  const source = area as any;
  const values = [
    source?.areaCode,
    source?.projectAreaCode,
    source?.code,
    source?.ag_code,
    source?.fibrehood_code,
    source?.importedProperties?.ag_code,
    source?.importedProperties?.AG_CODE,
    source?.importedProperties?.fibrehood_code,
    source?.importedProperties?.FIBREHOOD_CODE,
    source?.name,
    areaName,
  ];

  const codes = values
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((value) => /[A-Z]{2,}-[A-Z0-9]{2,}/.test(value));

  const lowerAreaName = String(areaName || "").toLowerCase();
  if (lowerAreaName.includes("baildon south")) codes.push("BD-BAS");
  if (lowerAreaName.includes("baildon east")) codes.push("BD-BAE");
  if (lowerAreaName.includes("baildon west")) codes.push("BD-BAW");

  return Array.from(new Set(codes));
}

function assetMatchesAreaRepairCode(asset: SavedMapAsset, areaCodes: string[]): boolean {
  if (!areaCodes.length) return false;

  const item = asset as any;
  const haystack = [
    item?.name,
    item?.jointName,
    item?.label,
    item?.id,
    item?.areaName,
    item?.projectAreaName,
    item?.properties?.name,
    item?.properties?.areaName,
    item?.properties?.projectAreaName,
  ]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");

  return areaCodes.some((code) => haystack.includes(code));
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

function getDpOperationalStatus(
  asset: any,
  fallback: string = "Planned",
): string {
  return normaliseDpOperationalStatus(
    asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      fallback,
  );
}

function normaliseForSaveComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normaliseForSaveComparison(item));
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const ignoredKeys = new Set([
      "updatedAt",
      "updatedByUid",
      "updatedByEmail",
      "lastEditedAt",
      "lastEditedByUid",
      "lastEditedByEmail",
      "lastViewedAt",
      "lastViewedBy",
      "lastViewedByUid",
      "lastViewedByEmail",
      "lastViewedContext",
      "syncRevision",
      "importedAt",
    ]);

    return Object.keys(source)
      .filter((key) => !ignoredKeys.has(key))
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const nextValue = source[key];
        if (typeof nextValue === "undefined") return acc;
        acc[key] = normaliseForSaveComparison(nextValue);
        return acc;
      }, {});
  }

  return value;
}

function stableAssetSignature(value: unknown): string {
  try {
    return JSON.stringify(normaliseForSaveComparison(value));
  } catch {
    return String(value ?? "");
  }
}

function sameOperationalData(left: unknown, right: unknown): boolean {
  return stableAssetSignature(left) === stableAssetSignature(right);
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
  const geometryType = String(
    copy.geometry?.type || copy.geometryType || "",
  ).toLowerCase();
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
    copy.referenceSubtype = isSuggestedReference
      ? "suggested"
      : isNpReference
        ? "np"
        : "or";
    copy.jointType = isSuggestedReference
      ? "Suggested Pole"
      : isNpReference
        ? "NP Pole"
        : "OR Pole";
    copy.source = copy.source || "pia-overlay";
    copy.poleDetails = {
      ...(copy.poleDetails || {}),
      poleType: isSuggestedReference
        ? "suggested"
        : isNpReference
          ? "new"
          : "or",
    };
    delete copy.dpDetails;
  }

  if (
    geometryType === "point" &&
    (nameText.startsWith("JC:") ||
      nameText.startsWith("CH:") ||
      nameText.startsWith("CHAMBER:"))
  ) {
    copy.assetType = "chamber";
    copy.referenceSubtype = isSuggestedReference ? "suggested" : "or";
    copy.jointType = isSuggestedReference ? "Suggested Chamber" : "OR Chamber";
    copy.source = copy.source || "pia-overlay";
    copy.chamberDetails = {
      ...(copy.chamberDetails || {}),
      chamberType:
        copy.chamberDetails?.chamberType ||
        (isSuggestedReference ? "Suggested Chamber" : "OR Chamber"),
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
  const { permissions, isSuperUser, isAdmin } = useUserRole();
  const canManageNetworkDesign = isSuperUser || permissions.build;
  const canUseSurveyTools = canManageNetworkDesign || permissions.survey;
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
  // 2) EXCHANGE CONTROLLER
  // Exchange marker load/open/save/delete is isolated so the main map manager
  // no longer owns the exchange storage lifecycle.
  // =====================================================
  const {
    savedExchanges,
    openExchangeAsset,
    setOpenExchangeAsset,
    handleOpenExchange,
    handleSaveExchange,
    handleDeleteExchange,
  } = useExchangeController();

  // =====================================================
  // MODE AWARE AUDIT SYSTEM
  // =====================================================

  const shouldAskForChangeReason = requiresAuditReason;

  // =====================================================
  // 3) ASSET EDITOR FORM STATE
  // Extracted into a dedicated hook so JointMapManager no longer owns
  // every editor field directly. Behaviour is unchanged.
  // =====================================================
  const {
    jointName,
    setJointName,
    jointType,
    setJointType,
    notes,
    setNotes,
    cablePiaNoiNumber,
    setCablePiaNoiNumber,
    areaLevel,
    setAreaLevel,
    cableType,
    setCableType,
    fibreCount,
    setFibreCount,
    installMethod,
    setInstallMethod,
    parentCableId,
    setParentCableId,
    allocatedInputFibres,
    setAllocatedInputFibres,
    poleDetails,
    setPoleDetails,
    dpDetails,
    setDpDetails,
    chamberDetails,
    setChamberDetails,
    editingAssetId,
    setEditingAssetId,
    editingAreaId,
    setEditingAreaId,
  } = useAssetEditorState(currentJointName, currentJointType);

  // =====================================================
  // 4) MAP DRAWING / LAYER UI STATE
  // Map mode, draft route/area state, mobile state and viewport state now
  // live in a dedicated hook. Behaviour is unchanged.
  // =====================================================
  const {
    mapMode,
    setMapMode,
    basemap,
    setBasemap,
    roadOverlayVisible,
    setRoadOverlayVisible,
    measurePoints,
    setMeasurePoints,
    draftCablePoints,
    setDraftCablePoints,
    draftAreaPoints,
    setDraftAreaPoints,
    isLayersOpen,
    setIsLayersOpen,
    isPanelOpen,
    setIsPanelOpen,
    isMobile,
    snapEnabled,
    setSnapEnabled,
    isRoutingCable,
    setIsRoutingCable,
    isLoadingOsmHomes,
    setIsLoadingOsmHomes,
    selectedReferenceDuctId,
    setSelectedReferenceDuctId,
    selectedReferenceDuctName,
    setSelectedReferenceDuctName,
    mapBounds,
    setMapBounds,
    mapZoom,
    setMapZoom,
  } = useMapDrawingState({
    initialZoom: initialMapViewRef.current?.zoom ?? 6,
  });

  const { visibleLayers, setVisibleLayers } = useLayerVisibility();

  const roleMobileMode = useRoleMobileMode({
    isMobile,
    activeMode,
    permissions,
    isSuperUser,
  });
  const { isTablet } = useDeviceLayout();
  const isSurveyTabletMode =
    isTablet &&
    !isSuperUser &&
    !permissions.build &&
    (permissions.survey || activeMode === "survey");
  const isMaintenanceTabletMode =
    isTablet &&
    !isSuperUser &&
    !permissions.build &&
    (permissions.maintenance || activeMode === "maintenance");
  const [isFieldQuickDrawerOpen, setIsFieldQuickDrawerOpen] = useState(false);
  const isFieldResponsiveMode =
    roleMobileMode === "survey" ||
    roleMobileMode === "maintenance" ||
    isSurveyTabletMode ||
    isMaintenanceTabletMode;
  const fieldQuickRole =
    roleMobileMode === "maintenance" || isMaintenanceTabletMode
      ? "maintenance"
      : "survey";
  const [isFieldPhotoPanelOpen, setIsFieldPhotoPanelOpen] = useState(false);

  const normalizedSavedJoints = useMemo(
    () => (savedJoints ?? []).map(normalizeMapAsset),
    [savedJoints],
  );

  const operationalSavedJoints = useMemo(
    () =>
      normalizedSavedJoints.filter(
        (asset) => !isOpenreachReferenceAsset(asset),
      ),
    [normalizedSavedJoints],
  );

  const { hydratedOperationalSavedJoints } = useJointMappings(
    operationalSavedJoints,
  );

  const {
    orAssets,
    setOrAssets,
    orAssetsLoaded,
    legacyOpenreachAssets,
    openreachReferenceAssets,
  } = useOpenreachAssets(normalizedSavedJoints);

  const {
    projectHomes,
    setProjectHomes,
    normalizedProjectHomes,
    isLoadingProjectHomes,
    loadedHomesProjectId,
    setLoadedHomesProjectId,
  } = useProjectHomesController({
    activeProjectId,
    visibleHomesLayer: visibleLayers.homes,
    isProjectWorkspaceOpen,
    normalizeHomeAsset: normalizeMapAsset,
  });

  // =====================================================
  // SIMPLE MANUAL MAP SAVE
  // Autosave has been removed to stop Firestore queued-write exhaustion.
  // Map assets now save only when the user presses Save Map Now.
  // Project homes still save separately through saveProjectHomes().
  // =====================================================
  const [isSavingMapNow, setIsSavingMapNow] = useState(false);
  const [polygonBulkSelectEnabled, setPolygonBulkSelectEnabled] = useState(false);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<string[]>([]);

  const handleSaveMapNow = async () => {
    if (isSavingMapNow) return;

    if (!operationalSavedJoints.length) {
      alert("No map assets to save yet.");
      return;
    }

    setIsSavingMapNow(true);

    try {
      const { saveMapAssetsToFirestore } =
        await import("../services/mapAssetStorage");

      await saveMapAssetsToFirestore(operationalSavedJoints, {
        reason: "manual-save-map-now",
      });

      alert(
        `Map saved. ${operationalSavedJoints.length} asset(s) written to Firestore.`,
      );
    } catch (err) {
      console.error("MANUAL MAP SAVE FAILED", err);
      alert("Map save failed. Check the console for details.");
    } finally {
      setIsSavingMapNow(false);
    }
  };

  const isPolygonAreaAsset = (asset: any) => {
    const geometryType = String(
      asset?.geometry?.type || asset?.geometryType || "",
    ).toLowerCase();
    return asset?.assetType === "area" || geometryType === "polygon";
  };

  const isImportedAreaAsset = (asset: any) => {
    const name = String(asset?.name || "")
      .trim()
      .toLowerCase();
    const jointType = String(asset?.jointType || "")
      .trim()
      .toLowerCase();
    return (
      isPolygonAreaAsset(asset) &&
      (name.startsWith("imported area") || jointType.includes("imported area"))
    );
  };

  const removePolygonAssetsFromMapState = (
    polygonsToRemove: SavedMapAsset[],
    successLabel: string,
  ) => {
    const polygonIds = new Set(
      polygonsToRemove.map((asset) => String(asset.id || "")),
    );

    setSavedJoints((prev) =>
      (prev ?? []).filter(
        (asset: any) => !polygonIds.has(String(asset?.id || "")),
      ),
    );

    if (editingAssetId && polygonIds.has(String(editingAssetId))) {
      resetEditor();
    }

    setSelectedPolygonIds((prev) =>
      prev.filter((id) => !polygonIds.has(String(id))),
    );

    alert(
      `${polygonsToRemove.length} ${successLabel} removed from the map.

Press Save Map to make this permanent in Firestore.`,
    );
  };

  const handleAdminRemoveImportedAreas = () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const importedAreas = operationalSavedJoints.filter(isImportedAreaAsset);

    if (!importedAreas.length) {
      alert("No imported area polygons were found.");
      return;
    }

    const typed = window.prompt(
      `Found ${importedAreas.length} imported area polygon(s).

Type DELETE IMPORTED AREAS to remove them from the map.

You must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE IMPORTED AREAS") return;

    removePolygonAssetsFromMapState(importedAreas, "imported area polygon(s)");
  };

  const getVisiblePolygonAreas = () =>
    visibleProjectAreas.filter((asset) =>
      isAreaVisibleForLevel(asset, visibleLayers),
    );

  const togglePolygonBulkSelection = (id: string) => {
    setSelectedPolygonIds((prev) =>
      prev.includes(id)
        ? prev.filter((existingId) => existingId !== id)
        : [...prev, id],
    );
  };

  const handleAdminSelectAllPolygons = () => {
    const ids = operationalSavedJoints
      .filter(isPolygonAreaAsset)
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminSelectVisiblePolygons = () => {
    const ids = getVisiblePolygonAreas()
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminSelectImportedPolygons = () => {
    const ids = operationalSavedJoints
      .filter(isImportedAreaAsset)
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminClearPolygonSelection = () => {
    setSelectedPolygonIds([]);
  };

  const handleAdminRemoveSelectedPolygons = () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const selectedIds = new Set(selectedPolygonIds.map(String));
    const selectedPolygons = operationalSavedJoints.filter(
      (asset: any) =>
        selectedIds.has(String(asset?.id || "")) && isPolygonAreaAsset(asset),
    );

    if (!selectedPolygons.length) {
      alert("No polygons are currently selected. Turn on bulk select and click polygons on the map first.");
      return;
    }

    const typed = window.prompt(
      `Selected ${selectedPolygons.length} polygon(s).

Type DELETE SELECTED POLYGONS to remove the selected polygons from the map.

You must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGONS") return;

    removePolygonAssetsFromMapState(selectedPolygons, "selected polygon(s)");
  };

  const handleAdminRemoveSelectedPolygon = () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const selectedPolygon = operationalSavedJoints.find(
      (asset: any) =>
        String(asset?.id || "") === String(editingAssetId || "") &&
        isPolygonAreaAsset(asset),
    );

    if (!selectedPolygon) {
      alert("Select a polygon first, then use this cleanup action.");
      return;
    }

    const polygonName = String(
      selectedPolygon.name ||
        selectedPolygon.jointName ||
        selectedPolygon.id ||
        "selected polygon",
    );
    const typed = window.prompt(
      `Selected polygon:
${polygonName}

Type DELETE SELECTED POLYGON to remove only this polygon from the map.

You must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGON") return;

    removePolygonAssetsFromMapState([selectedPolygon], "selected polygon");
  };

  const handleAdminRemoveAllPolygons = () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const allPolygons = operationalSavedJoints.filter(isPolygonAreaAsset);

    if (!allPolygons.length) {
      alert("No polygon areas were found.");
      return;
    }

    const typed = window.prompt(
      `WARNING: This will remove ALL ${allPolygons.length} polygon area(s) from the map.

This includes imported polygons and manually drawn project/area polygons.

Type DELETE ALL POLYGONS to continue.

You must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE ALL POLYGONS") return;

    removePolygonAssetsFromMapState(allPolygons, "polygon area(s)");
  };

  const handleAdminRepairAreaStamps = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    if (!activeProjectArea) {
      alert("Select the area polygon you want to repair first.");
      return;
    }

    const areaRing = getPolygonOuterRing(activeProjectArea);
    if (areaRing.length < 3) {
      alert("The selected area does not have a valid polygon boundary.");
      return;
    }

    const areaName = String(
      (activeProjectArea as any).areaName ||
        (activeProjectArea as any).projectAreaName ||
        activeProjectArea.name ||
        activeProjectArea.id ||
        "selected area",
    ).trim();

    const areaCodes = getAreaRepairCodes(activeProjectArea, areaName);
    const areaSlug = areaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const preferredAreaCode =
      areaCodes
        .map((code) => String(code || "").trim().toUpperCase())
        .find((code) => code.startsWith("BD-"))
        ?.split("-")[1] ||
      String((activeProjectArea as any).areaCode || (activeProjectArea as any).projectAreaCode || "").trim();

    const repairAreaStamp = <T extends SavedMapAsset,>(asset: T): T =>
      markAssetForLiveSync(
        {
          ...(asset as any),
          projectId: activeProjectArea.id,
          areaId: activeProjectArea.id,
          projectAreaId: activeProjectArea.id,
          areaName,
          projectAreaName: areaName,
          ...(preferredAreaCode
            ? {
                areaCode: preferredAreaCode,
                projectAreaCode: preferredAreaCode,
              }
            : {}),
          areaSlug,
          areaStorageKey: areaSlug,
          repairSource: "admin-repair-area-stamps",
          repairUpdatedAt: new Date().toISOString(),
          properties: {
            ...((asset as any).properties || {}),
            projectId: activeProjectArea.id,
            areaId: activeProjectArea.id,
            projectAreaId: activeProjectArea.id,
            areaName,
            projectAreaName: areaName,
            ...(preferredAreaCode
              ? {
                  areaCode: preferredAreaCode,
                  projectAreaCode: preferredAreaCode,
                }
              : {}),
            areaSlug,
            areaStorageKey: areaSlug,
            repairSource: "admin-repair-area-stamps",
            repairUpdatedAt: new Date().toISOString(),
          },
        } as T,
        true,
      ) as T;

    const repairableAssets = operationalSavedJoints.filter((asset: any) => {
      if (!asset?.id) return false;
      if (String(asset.id) === String(activeProjectArea.id)) return false;
      if (isPolygonAreaAsset(asset)) return false;
      if (isOpenreachReferenceAsset(asset)) return false;

      return (
        assetTouchesPolygon(asset as SavedMapAsset, areaRing) ||
        assetMatchesAreaRepairCode(asset as SavedMapAsset, areaCodes)
      );
    });

    const lowerAreaName = areaName.toLowerCase();
    const legacyProjectHomeKeys = [
      // Baildon South homes were originally saved under this deleted polygon id.
      // Keep this here so Admin repair can recover homes after the area polygon
      // has been recreated and renamed back to Baildon South.
      lowerAreaName.includes("baildon south")
        ? "85cd3428-edc3-4315-85a2-957a09715175"
        : null,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const candidateProjectHomeKeys = Array.from(
      new Set(
        [
          activeProjectId,
          activeProjectArea.id,
          (activeProjectArea as any).projectId,
          (activeProjectArea as any).areaId,
          (activeProjectArea as any).projectAreaId,
          (activeProjectArea as any).areaStorageKey,
          (activeProjectArea as any).areaSlug,
          (activeProjectArea as any).properties?.projectId,
          (activeProjectArea as any).properties?.areaId,
          (activeProjectArea as any).properties?.projectAreaId,
          (activeProjectArea as any).properties?.areaStorageKey,
          (activeProjectArea as any).properties?.areaSlug,
          areaSlug,
          lowerAreaName.includes("baildon south") ? "baildon-south" : null,
          lowerAreaName.includes("baildon east") ? "baildon-east" : null,
          lowerAreaName.includes("baildon west") ? "baildon-west" : null,
          ...legacyProjectHomeKeys,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    let allCandidateHomes = [...(projectHomes ?? [])];

    const getHomeRepairKey = (home: any): string =>
      String(
        home?.id ||
          home?.uprn ||
          home?.UPRN ||
          home?.properties?.UPRN ||
          home?.properties?.uprn ||
          home?.name ||
          "",
      ).trim();

    for (const projectHomeKey of candidateProjectHomeKeys) {
      try {
        const loadedHomes = await loadProjectHomes(projectHomeKey);
        allCandidateHomes = [...allCandidateHomes, ...loadedHomes];
      } catch (err) {
        console.warn("Could not load project homes for area repair", projectHomeKey, err);
      }
    }

    const homesByKey = new Map<string, SavedMapAsset>();
    allCandidateHomes.forEach((home: any) => {
      const key = getHomeRepairKey(home);
      if (key && !homesByKey.has(key)) homesByKey.set(key, home as SavedMapAsset);
    });

    const candidateHomes = Array.from(homesByKey.values());

    // IMPORTANT SAFETY GUARD:
    // Legacy project-home storage can contain thousands of homes under one old
    // project id. Do not repair every home that merely has the old id. Only
    // repair homes whose actual point geometry is inside the selected polygon.
    const repairableHomes = candidateHomes.filter((home: any) =>
      assetTouchesPolygon(home as SavedMapAsset, areaRing),
    );

    if (!repairableAssets.length && !repairableHomes.length) {
      alert(`No operational assets or project homes were found inside ${areaName}.`);
      return;
    }

    const typeCounts = repairableAssets.reduce<Record<string, number>>((acc, asset: any) => {
      const key = String(asset?.assetType || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const summary = [
      ...Object.entries(typeCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type}: ${count}`),
      `project homes: ${repairableHomes.length}`,
    ].join("\n");

    const typed = window.prompt(
      `Repair area stamps for ${areaName}?\n\nThis will restamp ${repairableAssets.length} operational asset(s) and ${repairableHomes.length} project home(s).

Project homes are restricted to homes physically inside the selected polygon only.\n\nArea code matches: ${areaCodes.length ? areaCodes.join(", ") : "none"}\n\n${summary}\n\nIt will NOT delete anything and it will NOT change fibre routing or DP-home assignments.\n\nType REPAIR AREA STAMPS to continue.\n\nPress Save Map afterwards to persist map assets. Project homes are saved by this repair tool.`,
      "",
    );

    if (typed !== "REPAIR AREA STAMPS") return;

    const repairIds = new Set(repairableAssets.map((asset) => String(asset.id)));

    setSavedJoints((prev) =>
      (prev ?? []).map((asset: any) => {
        if (!repairIds.has(String(asset?.id || ""))) return asset;
        return repairAreaStamp(asset as SavedMapAsset);
      }),
    );

    const repairHomeKeys = new Set(
      repairableHomes
        .map((home: any) => String(home?.id || home?.uprn || home?.UPRN || home?.properties?.UPRN || home?.name || "").trim())
        .filter(Boolean),
    );

    const repairedHomes = candidateHomes
      .filter((home: any) => {
        const key = String(home?.id || home?.uprn || home?.UPRN || home?.properties?.UPRN || home?.name || "").trim();
        return repairHomeKeys.has(key);
      })
      .map((home) => repairAreaStamp(home as SavedMapAsset));

    setProjectHomes(repairedHomes);
    setLoadedHomesProjectId(activeProjectArea.id);

    try {
      const homeSaveKeys = Array.from(
        new Set(
          [
            activeProjectArea.id,
            (activeProjectArea as any).projectId,
            (activeProjectArea as any).areaId,
            (activeProjectArea as any).projectAreaId,
            (activeProjectArea as any).areaStorageKey,
            (activeProjectArea as any).areaSlug,
            (activeProjectArea as any).properties?.projectId,
            (activeProjectArea as any).properties?.areaStorageKey,
            lowerAreaName.includes("baildon south") ? "baildon-south" : null,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      );

      for (const homeSaveKey of homeSaveKeys) {
        await saveProjectHomes(homeSaveKey, repairedHomes, areaName);
      }
    } catch (err) {
      console.error("Failed to save repaired project homes", err);
      alert(
        "Map assets were repaired on screen, but saving repaired project homes failed. Do not refresh yet; check the console.",
      );
      return;
    }

    alert(
      `Repaired area stamps for ${repairableAssets.length} asset(s) and ${repairableHomes.length} home(s) inside ${areaName}.\n\nProject homes have been saved. Press Save Map to make the map-asset repair permanent in Firestore.`,
    );
  };

  const handleAdminDeleteAllOrReferenceAssets = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const count = openreachReferenceAssets.length;
    if (!count) {
      alert("No OR / PIA reference assets are currently loaded.");
      return;
    }

    const typed = window.prompt(
      `This will delete ALL ${count} OR / PIA reference assets from the OR reference storage.

It will not delete designed DPs, joints, homes, project areas or cables.

Type DELETE ALL OR to continue.`,
      "",
    );

    if (typed !== "DELETE ALL OR") return;

    setOrAssets([]);

    try {
      await saveOrAssets([], {
        allowDestructiveSave: true,
        reason: "administrator delete all OR / PIA reference assets",
      });
    } catch (err) {
      console.error("Failed to delete all OR / PIA reference assets", err);
      alert("Delete all OR / PIA reference assets failed. Check the console.");
      return;
    }

    setSavedJoints((prev) =>
      (prev ?? []).filter((asset) => !isOpenreachReferenceAsset(asset)),
    );

    alert(`Deleted ${count} OR / PIA reference asset(s).`);
  };

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

  const {
    maintenanceAsset,
    showMaintenancePanel,
    openMaintenanceHistory,
    closeMaintenanceHistory,
  } = useMaintenanceHistory();

  const [openStreetCabAsset, setOpenStreetCabAsset] =
    useState<SavedMapAsset | null>(null);
  const [openDistributionPointAsset, setOpenDistributionPointAsset] =
    useState<SavedMapAsset | null>(null);
  useEffect(() => {
    setJointName(currentJointName || "");
    setJointType(currentJointType || "CMJ (12 trays)");
    setAssetType(inferAssetTypeFromName(currentJointName));
  }, [currentJointName, currentJointType]);

  const allMapAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    // AREA GROUPING WITHOUT DUPLICATING DATA
    // Existing assets are virtually indexed from their own metadata/name
    // (for example BD-BAS => Baildon South, BD-BAE => Baildon East).
    // This lets Baildon South/East/West work as grouped workspaces while the
    // asset itself still lives once in the existing split bucket/main storage.
    hydratedOperationalSavedJoints.forEach((asset) =>
      byId.set(asset.id, withAreaAssetIndex(asset)),
    );
    normalizedProjectHomes.forEach((asset) => byId.set(asset.id, asset));
    return Array.from(byId.values());
  }, [hydratedOperationalSavedJoints, normalizedProjectHomes]);

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

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  // =====================================================
  // PROJECT AREA / VIEWPORT ASSET VIEW
  // Project scoping, viewport filtering and OR layer visibility are now kept
  // outside the main map component so this file stays easier to maintain.
  // =====================================================
  const {
    projectAreas,
    activeProjectArea,
    activeProjectAreaName,
    stampHomesForActiveArea,
    visibleProjectAssets,
    visibleProjectAreas,
    visibleOpenreachAssets,
    renderProjectAssets,
    renderOpenreachAssets,
    snapCandidateAssets,
    openreachLayerVisibility,
  } = useProjectAreaView({
    allMapAssets,
    openreachReferenceAssets,
    activeProjectId,
    mapBounds,
    mapZoom,
    visibleLayers,
  });

  const offlineFieldMode = useOfflineFieldMode({
    projectId: activeProjectId,
    assets: visibleProjectAssets,
    homes: projectHomes,
  });

  // =====================================================
  // ASSET PERSISTENCE / AUDIT LOGGING
  // Save-to-state and audit side effects are isolated so the main map
  // component does not own persistence wiring directly.
  // =====================================================
  const { saveMapAssetToState, writeAssetAuditLog } = useAssetPersistence({
    activeProjectIdRef,
    activeProjectArea,
    setSavedJoints,
  });

  // =====================================================
  // PROJECT WORKSPACE SUMMARY STATS
  // Heavy derived statistics now live in a dedicated hook so
  // JointMapManager no longer owns this counting logic.
  // =====================================================
  const projectWorkspaceStats = useProjectWorkspaceStats({
    visibleProjectAssets,
    topologyLinks: networkGraph.edges.size,
  });

  // =====================================================
  // LAYER COUNTS
  // Extracted from JointMapManager so layer panel badge/count logic
  // can be maintained without growing the main map component.
  // =====================================================
  const layerCounts = useLayerCounts({
    visibleProjectAreas,
    visibleProjectAssets,
    visibleOpenreachAssets,
  });

  useEffect(() => {
    if (!activeProjectArea || !canManageNetworkDesign) {
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
  }, [activeProjectArea?.id, canManageNetworkDesign]);

  const { handleSelectProject, handleZoomToAsset } = useMapNavigation({
    mapRef,
    activeProjectIdRef,
    setActiveProjectId,
    projectAreas,
  });

  const { resetEditor } = useEditorReset({
    setEditingAssetId,
    setEditingAreaId,
    setPickedLocation,
    setNotes,
    setCablePiaNoiNumber,
    setAreaLevel,
    setMapMode,
    setSelectedReferenceDuctId,
    setSelectedReferenceDuctName,
    setDraftCablePoints,
    setDraftAreaPoints,
    setCableType,
    setFibreCount,
    setInstallMethod,
    setParentCableId,
    setAllocatedInputFibres,
    setPoleDetails,
    setDpDetails,
    setChamberDetails,
    setShowCableModal,
    setShowPoleModal,
    setShowDpModal,
    setShowChamberModal,
    setOpenDistributionPointAsset,
  });

  // =====================================================
  // CABLE WORKFLOW
  // Cable editor startup and route-point edits now live in a focused hook.
  // Finish/save still stays here for now because it touches persistence, homes
  // and audit logic and will be split in a later pass.
  // =====================================================
  const {
    openCableModalForNew,
    startCableDrawing,
    handleUndoCablePoint,
    handleClearCable,
    handleMoveCablePoint,
    handleDeleteCablePoint,
    handleInsertCablePoint,
    handleCablePoint,
  } = useCableWorkflow({
    jointName,
    savedJoints,
    snapCandidateAssets,
    snapEnabled,
    setEditingAssetId,
    setAssetType,
    setJointType,
    setJointName,
    setNotes,
    setCablePiaNoiNumber,
    setCableType,
    setFibreCount,
    setInstallMethod,
    setParentCableId,
    setAllocatedInputFibres,
    setPickedLocation,
    setDraftAreaPoints,
    setDraftCablePoints,
    setSelectedReferenceDuctId,
    setSelectedReferenceDuctName,
    setMapMode,
    setShowCableModal,
    setIsPanelOpen,
  });

  // =====================================================
  // ASSET SELECTION / EDIT PANEL HYDRATION
  // Opens an asset into the editor, records view activity and sets the correct
  // map drawing mode without keeping that workflow inside the main map file.
  // =====================================================
  const { handleEditAsset } = useAssetSelection({
    activeProjectIdRef,
    setSavedJoints,
    setEditingAssetId,
    setAssetType,
    setJointName,
    setJointType,
    setNotes,
    setCablePiaNoiNumber,
    setAreaLevel,
    setCableType,
    setFibreCount,
    setInstallMethod,
    setParentCableId,
    setAllocatedInputFibres,
    setPoleDetails,
    setDpDetails,
    setChamberDetails,
    setIsPanelOpen,
    setPickedLocation,
    setDraftCablePoints,
    setDraftAreaPoints,
    setMapMode,
    setShowPoleModal,
    setShowDpModal,
    setShowChamberModal,
    setShowCableModal,
  });

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

    setSavedJoints((prev) => {
      let changed = false;

      const nextAssets = (prev ?? []).map((asset) => {
        const update = updatesById.get(String(asset.id || ""));
        if (!update) return asset;

        const nextAsset = {
          ...(asset as any),
          dpDetails: update.dpDetails,
          properties: {
            ...((asset as any).properties || {}),
            dpDetails: update.dpDetails,
          },
        } as SavedMapAsset;

        if (sameOperationalData(asset, nextAsset)) return asset;
        changed = true;
        return markAssetForLiveSync(nextAsset);
      });

      return changed ? nextAssets : prev;
    });
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

  const {
    selectedMoveHomeIds,
    selectedSurveyDeleteHomeIds,
    handleToggleSurveyDeleteHomesMode,
    handleToggleSurveyDeleteHomeSelection,
    handleClearSurveyDeleteHomeSelection,
    handleDeleteSelectedSurveyHomes,
    handleToggleMoveHomesMode,
    handleToggleMoveHomeSelection,
    handleClearMoveHomeSelection,
    handleMoveSelectedHomesToDp,
  } = useHomeWorkflowControllers({
    mapMode,
    setMapMode,
    setIsPanelOpen,
    setContextMenu,
    allMapAssets,
    selectedProjectHomes: projectHomes,
    setProjectHomes,
    setSavedJoints,
    activeProjectId,
    activeProjectAreaName,
    stampHomesForActiveArea,
    getChangeReasonForCurrentMode,
    markAssetForLiveSync,
    writeAssetAuditLog,
  });

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
      mappingRows: assetType === "ag-joint" ? currentMappingRows : [],
      mappingRowsCount:
        assetType === "ag-joint" ? currentMappingRows.length : undefined,
      ...(assetType === "ag-joint" && currentMappingRows.length > 0
        ? {
            mappingRowsRef: false,
            mappingRowsSummary: { rowCount: currentMappingRows.length },
          }
        : {}),
      ...(assetType === "distribution-point"
        ? {
            status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            properties: {
              status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              dpDetails: {
                ...nextDpDetails,
                buildStatus: getDpOperationalStatus({
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
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            } as DistributionPointDetails)
          : undefined,
      chamberDetails: assetType === "chamber" ? nextChamberDetails : undefined,
      geometry: {
        type: "Point",
        coordinates: [pickedLocation.lat, pickedLocation.lng],
      },
    };

    // IMPORTANT:
    // New point assets must use the single save path so area metadata is stamped
    // before the workspace/map filters run. Without this, assets named with
    // BD-BAS / BD-BAE can be indexed inconsistently and appear to not add.
    const savedRecord = saveMapAssetToState(record, { isNew: true });
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

    const savedAreaRecord = saveMapAssetToState(areaRecord, { isNew: true });
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
      const shouldUseReferenceDuct =
        shouldUseDuctTraceForInstallMethod(installMethod);
      const ductTracePoints =
        shouldUseReferenceDuct && selectedReferenceDuctId
          ? traceReferenceDuctRouteBetweenPoints(
              draftCablePoints[0],
              draftCablePoints[draftCablePoints.length - 1],
              snapCandidateAssets,
              25,
              selectedReferenceDuctId,
            )
          : null;

      if (
        shouldUseReferenceDuct &&
        selectedReferenceDuctId &&
        !ductTracePoints
      ) {
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
        referenceDuctId: ductTracePoints
          ? selectedReferenceDuctId || undefined
          : undefined,
        referenceDuctName: ductTracePoints
          ? selectedReferenceDuctName || undefined
          : undefined,
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
        await saveProjectHomes(
          activeProjectId,
          stampHomesForActiveArea(updatedProjectHomes),
          activeProjectAreaName,
        );
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
      await saveProjectHomes(
        activeProjectId,
        stampHomesForActiveArea(updatedProjectHomes),
        activeProjectAreaName,
      );
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
      setIsPanelOpen(true);
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
    setIsPanelOpen(true);

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

      await saveProjectHomes(
        activeProjectId,
        stampHomesForActiveArea(mergedHomes),
        activeProjectAreaName,
      );
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

        await saveProjectHomes(
          projectIdForImport,
          stampHomesForActiveArea(mergedHomes),
          activeProjectAreaName,
        );
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

        await saveProjectHomes(
          projectIdForImport,
          stampHomesForActiveArea(mergedHomes),
          activeProjectAreaName,
        );
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

  const loadPiaOverlayGeoJson = async (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const piaAssets = createPiaOverlayAssetsFromGeoJson(geojson, {
          savedJoints,
          markAssetForLiveSync,
        });

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

  const loadAnyGeoJsonMapAssets = (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const { networkAssets: rawNetworkAssets, homeAssets: rawHomeAssets } =
          createMapAssetsFromAnyGeoJson(geojson, {
            activeProjectId,
            markAssetForLiveSync,
            activeProjectArea,
          });

        const networkAssets = activeProjectArea
          ? filterAssetsForProjectArea(rawNetworkAssets, activeProjectArea)
          : rawNetworkAssets;
        // Homes are now clipped to the active project polygon inside the importer.
        // Do not run the generic asset-area index filter again here; imported homes
        // may not yet have areaId/projectAreaId stamps until saveProjectHomes().
        const homeAssets = rawHomeAssets;

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
            await saveProjectHomes(
              activeProjectId,
              stampHomesForActiveArea(mergedHomes),
              activeProjectAreaName,
            );
            setProjectHomes(mergedHomes);
            setLoadedHomesProjectId(activeProjectId);
            savedHomeCount = newHomes.length;
          }
        }

        const importedOrAssets = networkAssets
          .filter(isOpenreachReferenceAsset)
          .map((asset) =>
            withAreaAssetIndex(
              normaliseOpenreachAsset(asset),
              activeProjectId,
              (activeProjectArea as any)?.name ||
                (activeProjectArea as any)?.label,
            ),
          );
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
          setSavedJoints((prev) => [
            ...prev,
            ...dedupedNetworkAssets.map((asset) =>
              withAreaAssetIndex(
                asset,
                activeProjectId,
                (activeProjectArea as any)?.name ||
                  (activeProjectArea as any)?.label,
              ),
            ),
          ]);
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
        .map((asset) =>
          withAreaAssetIndex(
            normaliseOpenreachAsset(asset),
            activeProjectId,
            (activeProjectArea as any)?.name ||
              (activeProjectArea as any)?.label,
          ),
        );
      const importedDesignedAssets = importedAssets.filter(
        (asset) => !isOpenreachReferenceAsset(asset),
      );

      if (importedOrAssets.length) {
        const mergedOrAssets = await mergeAndSaveOrAssets(importedOrAssets, {
          reason: "JSON import OR reference assets",
        });
        setOrAssets(mergedOrAssets);
      }

      setSavedJoints(
        importedDesignedAssets.map((asset) =>
          withAreaAssetIndex(
            asset,
            activeProjectId,
            (activeProjectArea as any)?.name ||
              (activeProjectArea as any)?.label,
          ),
        ),
      );
      alert(
        `Imported ${importedDesignedAssets.length} designed asset(s) and ${importedOrAssets.length} OR reference asset(s).`,
      );
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    e.target.value = "";
  };

  // =====================================================
  // CABLE / AFN ALLOCATION OPTIONS
  // Parent cable selector, AFN DP list and selected-DP connected homes
  // now live in a dedicated hook so the map manager stays focused on UI flow.
  // =====================================================
  const {
    availableParentCablesForBranchAllocation,
    allDistributionPointsForAfnAllocation,
    connectedHomesForSelectedDp,
  } = useCableAllocationOptions({
    allMapAssets,
    activeProjectArea,
    editingAssetId,
  });

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
      const rawNextAsset = syncDpOperationalStatusOnAsset(
        asset as any,
        args.status,
      ) as SavedMapAsset;

      if (sameOperationalData(asset, rawNextAsset)) return;

      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(rawNextAsset),
        "updated",
        reason,
      );

      updatedById.set(String(asset.id || ""), nextAsset);
    });

    if (!updatedById.size) {
      alert(
        `No DP status changes were needed; selected DPs already show ${args.status}.`,
      );
      return;
    }

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
      const item = asset as any;
      const details = {
        ...(item.dpDetails || item.properties?.dpDetails || {}),
      } as any;
      const nextAfnDetails = { ...(details.afnDetails || {}) } as any;
      delete nextAfnDetails.sbToSbRoutes;
      delete nextAfnDetails.inputFibres;
      delete nextAfnDetails.splitterFibres;

      const nextDetails = {
        ...details,
        afnDetails: nextAfnDetails,
      } as DistributionPointDetails;

      const rawNextAsset = {
        ...item,
        dpDetails: nextDetails,
        properties: {
          ...(item.properties || {}),
          dpDetails: nextDetails,
        },
      } as SavedMapAsset;

      if (sameOperationalData(asset, rawNextAsset)) return;

      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(rawNextAsset),
        "updated",
        reason,
      );

      updatedById.set(String(asset.id || ""), nextAsset);
    });

    if (!updatedById.size) {
      alert(
        "No DP fibre allocation changes were needed; selected DPs were already clear.",
      );
      return;
    }

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
        comment:
          "Manager cleared DP fibre allocations from selected project area ready for Rebuild Chain.",
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
  // PROJECT WORKSPACE — BULK FAS SB ROUTE IMPORT
  // Applies FAS-derived SB → SB fibre routes to all matching SB / DP assets.
  // Manual SB routes are preserved; previous FAS-imported routes can be replaced.
  // Cable is stored as supporting evidence only and is not the authority.
  // =====================================================
  const handleWorkspaceSbRouteAssignments = (request: {
    routes: any[];
    note: string;
    replaceImportedRoutes?: boolean;
  }) => {
    const routes = Array.isArray(request.routes) ? request.routes : [];
    if (!routes.length) {
      alert("No FAS SB routes were supplied.");
      return;
    }

    const reason = String(request.note || "").trim();
    if (!reason) {
      alert("An audit note is required before applying FAS SB routes.");
      return;
    }

    const normaliseRef = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[–—]/g, "-")
        .replace(/-SP\s*\d+\b/i, "")
        .replace(/[^A-Z0-9]/g, "");

    const getTitle = (asset: any) =>
      String(
        asset?.name ||
          asset?.jointName ||
          asset?.label ||
          asset?.assetId ||
          asset?.id ||
          "",
      );

    const isDpAsset = (asset: SavedMapAsset | null | undefined) => {
      if (!asset || asset.geometry?.type === "LineString") return false;
      const item = asset as any;
      const haystack = [
        item.assetType,
        item.type,
        item.jointType,
        item.dpType,
        item.distributionPointType,
        item.closureType,
        item.name,
        item.label,
      ]
        .map((value) => String(value ?? ""))
        .join(" ")
        .toUpperCase();

      return (
        haystack.includes("DISTRIBUTION") ||
        haystack.includes("AFN") ||
        haystack.includes("CBT") ||
        haystack.includes("MDU") ||
        /\bSB\s*\d+|SB\d+/.test(haystack)
      );
    };

    const findDpForSbName = (sbName: string) => {
      const wanted = normaliseRef(sbName);
      if (!wanted) return null;

      return (
        (savedJoints ?? []).find((asset) => {
          if (!isDpAsset(asset)) return false;
          const item = asset as any;
          const candidates = [
            asset.id,
            item.assetId,
            item.name,
            item.jointName,
            item.label,
            item.dpId,
          ]
            .map(normaliseRef)
            .filter(Boolean);

          return candidates.some(
            (candidate) =>
              candidate === wanted ||
              candidate.includes(wanted) ||
              wanted.includes(candidate),
          );
        }) || null
      );
    };

    const routeGroups = new Map<string, any[]>();
    routes.forEach((route) => {
      const toSbName = String(route?.toSbName || route?.toSb || "").trim();
      if (!toSbName) return;
      const child = findDpForSbName(toSbName);
      if (!child?.id) return;
      const current = routeGroups.get(String(child.id)) || [];
      current.push(route);
      routeGroups.set(String(child.id), current);
    });

    if (!routeGroups.size) {
      alert("No matching SB assets were found for the uploaded FAS routes.");
      return;
    }

    const updatedById = new Map<string, SavedMapAsset>();
    const beforeAssets = (savedJoints ?? []).filter((asset) =>
      routeGroups.has(String(asset.id || "")),
    );

    beforeAssets.forEach((beforeAsset) => {
      const item = beforeAsset as any;
      const details = {
        ...(item.dpDetails || item.properties?.dpDetails || {}),
      } as any;
      const afnDetails = {
        ...(details.afnDetails || {}),
      } as any;

      const existingRoutes = Array.isArray(afnDetails.sbToSbRoutes)
        ? afnDetails.sbToSbRoutes
        : [];
      const preservedRoutes =
        request.replaceImportedRoutes === false
          ? existingRoutes
          : existingRoutes.filter(
              (route: any) => route?.source !== "fas-import",
            );

      const importedRoutes = (
        routeGroups.get(String(beforeAsset.id || "")) || []
      ).map((route) => ({
        id:
          route.id ||
          `fas_${normaliseRef(route.fromSbName)}_${normaliseRef(route.toSbName)}_${normaliseRef(route.supportingCableName)}`,
        fromSbId: findDpForSbName(route.fromSbName || "")?.id,
        fromSbName: String(route.fromSbName || "").trim(),
        toSbId: beforeAsset.id,
        toSbName: String(route.toSbName || getTitle(beforeAsset)).trim(),
        parentFibres: Array.isArray(route.parentFibres)
          ? route.parentFibres.map(Number).filter(Number.isFinite)
          : [],
        localFibres: Array.isArray(route.localFibres)
          ? route.localFibres.map(Number).filter(Number.isFinite)
          : [],
        supportingCableName:
          String(route.supportingCableName || "").trim() || undefined,
        source: "fas-import",
        note: route.note || reason,
        importedAt: new Date().toISOString(),
      }));

      const nextAfnDetails = {
        ...afnDetails,
        enabled: true,
        sbToSbRoutes: [...preservedRoutes, ...importedRoutes],
        // Keep the local fibre list populated for capacity/splitter display only.
        // Authority remains the SB → SB route records above.
        inputFibres: Array.from(
          new Set(
            [
              ...((Array.isArray(afnDetails.inputFibres)
                ? afnDetails.inputFibres
                : []) as any[]),
              ...importedRoutes.flatMap(
                (route: any) => route.localFibres || [],
              ),
            ]
              .map(Number)
              .filter(Number.isFinite),
          ),
        ).sort((a, b) => a - b),
      };

      const nextDetails = {
        ...details,
        closureType: details.closureType || "AFN",
        afnDetails: nextAfnDetails,
      } as DistributionPointDetails;

      const rawNextAsset = {
        ...item,
        dpDetails: nextDetails,
        properties: {
          ...(item.properties || {}),
          dpDetails: nextDetails,
        },
      } as SavedMapAsset;

      if (sameOperationalData(beforeAsset, rawNextAsset)) return;

      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(rawNextAsset),
        "updated",
        reason,
      );

      updatedById.set(String(beforeAsset.id || ""), nextAsset);
    });

    if (!updatedById.size) {
      alert(
        "No DP fibre changes were needed; the saved SB route data already matches.",
      );
      return;
    }

    setSavedJoints((prev) =>
      (prev ?? []).map(
        (asset) => updatedById.get(String(asset.id || "")) || asset,
      ),
    );

    beforeAssets.forEach((beforeAsset) => {
      const afterAsset = updatedById.get(String(beforeAsset.id || ""));
      if (!afterAsset) return;
      writeAssetAuditLog({
        asset: afterAsset,
        action: "updated",
        reason,
        comment:
          "Imported FAS SB → SB fibre routes from Project Workspace Build tab.",
        before: { dpDetails: (beforeAsset as any).dpDetails },
        after: { dpDetails: (afterAsset as any).dpDetails },
      });
    });

    const missing =
      routes.length - Array.from(routeGroups.values()).flat().length;
    alert(
      `Applied FAS SB routes to ${beforeAssets.length} SB${beforeAssets.length === 1 ? "" : "s"}.` +
        (missing > 0
          ? ` ${missing} route${missing === 1 ? "" : "s"} could not be matched to a saved SB.`
          : ""),
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
  // PROJECT WORKSPACE — ADDRESS SHEET SB / HOME / DROP ASSIGNMENT
  // Uses the uploaded address sheet match report to:
  //   1) create or update splitter-box DPs by sheet splitter_box
  //   2) stamp matched homes with the assigned SB/DP
  //   3) optionally replace those homes' existing drops with SB→home drops
  // This deliberately ignores OR pole/chamber references for now and keeps
  // all writes on the existing savedJoints + projectHomes paths.
  // =====================================================
  const handleWorkspaceAddressSheetAssignments = async (request: {
    rows: any[];
    overwriteExistingDrops?: boolean;
    note: string;
  }) => {
    const rows = (request.rows || []).filter(
      (row) => row?.homeAsset && String(row?.splitterBox || "").trim(),
    );

    if (!rows.length) {
      alert("No matched address sheet rows were supplied for SB assignment.");
      return;
    }

    const reason = String(request.note || "").trim();
    if (!reason) {
      alert("An audit note is required before assigning SBs and drops.");
      return;
    }

    const compact = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

    const safeId = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "splitter";

    const getTitle = (asset: any) =>
      String(
        asset?.name ||
          asset?.jointName ||
          asset?.label ||
          asset?.assetId ||
          asset?.id ||
          "",
      );

    const isSplitterDp = (asset: SavedMapAsset | null | undefined) => {
      if (!asset) return false;
      const item = asset as any;
      if (asset.geometry?.type === "LineString") return false;
      const text = [
        item.assetType,
        item.type,
        item.jointType,
        item.dpType,
        item.closureType,
        item.name,
        item.label,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return (
        text.includes("distribution") ||
        text.includes("splitter") ||
        text.includes("sb") ||
        text.includes("dp") ||
        text.includes("cbt") ||
        text.includes("afn") ||
        text.includes("mdu")
      );
    };

    const findExistingSplitter = (splitterBox: string) => {
      const target = compact(splitterBox);
      if (!target) return null;

      return (
        allMapAssets.find((asset) => {
          if (!isSplitterDp(asset)) return false;
          const title = compact(getTitle(asset));
          return (
            title === target || title.includes(target) || target.includes(title)
          );
        }) || null
      );
    };

    const fullHomeById = new Map<string, SavedMapAsset>();
    allMapAssets.forEach((asset) => {
      if (asset?.id) fullHomeById.set(String(asset.id), asset);
    });

    const groups = new Map<string, any[]>();
    rows.forEach((row) => {
      const splitterBox = String(row.splitterBox || "").trim();
      if (!splitterBox) return;
      const current = groups.get(splitterBox) || [];
      current.push(row);
      groups.set(splitterBox, current);
    });

    const now = new Date().toISOString();
    const updatedHomeById = new Map<string, SavedMapAsset>();
    const splitterById = new Map<string, SavedMapAsset>();
    const newDropsById = new Map<string, SavedMapAsset>();
    const affectedHomeDropKeys = new Set<string>();

    let skippedHomes = 0;

    groups.forEach((groupRows, splitterBox) => {
      const matchedHomes = groupRows
        .map(
          (row) =>
            fullHomeById.get(String(row.homeAsset?.id || "")) || row.homeAsset,
        )
        .filter(Boolean) as SavedMapAsset[];

      const homePoints = matchedHomes
        .map((home) => getAssetLatLng(home as any))
        .filter(Boolean) as { lat: number; lng: number }[];

      if (!matchedHomes.length || !homePoints.length) {
        skippedHomes += matchedHomes.length;
        return;
      }

      const existingSplitter = findExistingSplitter(splitterBox);
      const splitterId = String(
        existingSplitter?.id || `sb_${safeId(splitterBox)}`,
      );
      const centre = existingSplitter
        ? getAssetLatLng(existingSplitter as any) || {
            lat:
              homePoints.reduce((sum, point) => sum + point.lat, 0) /
              homePoints.length,
            lng:
              homePoints.reduce((sum, point) => sum + point.lng, 0) /
              homePoints.length,
          }
        : {
            lat:
              homePoints.reduce((sum, point) => sum + point.lat, 0) /
              homePoints.length,
            lng:
              homePoints.reduce((sum, point) => sum + point.lng, 0) /
              homePoints.length,
          };

      const splitterRatio = String(
        (existingSplitter as any)?.dpDetails?.splitterRatio ||
          (existingSplitter as any)?.splitterRatio ||
          "1:8",
      );
      const splitterPortsMatch = splitterRatio.match(/1\s*:\s*(\d+)/i);
      const splitterPorts = splitterPortsMatch
        ? Number(splitterPortsMatch[1])
        : 8;
      const splitterCount = Math.max(
        1,
        Math.ceil(
          matchedHomes.length /
            (Number.isFinite(splitterPorts) && splitterPorts > 0
              ? splitterPorts
              : 8),
        ),
      );

      const splitterAsset = markAssetForLiveSync(
        withAssetEditedMetadata(
          {
            ...(existingSplitter || {}),
            id: splitterId,
            name: splitterBox,
            label: splitterBox,
            assetType: "distribution-point",
            type: "distribution-point",
            jointType: "Splitter Box",
            dpType: "SB",
            splitterBox,
            source: existingSplitter
              ? (existingSplitter as any).source
              : "address-sheet-import",
            lat: centre.lat,
            lng: centre.lng,
            geometry: {
              type: "Point",
              coordinates: [centre.lat, centre.lng],
            },
            dpDetails: {
              ...((existingSplitter as any)?.dpDetails || {}),
              closureType: ((existingSplitter as any)?.dpDetails?.closureType ||
                "CBT") as any,
              connectionsToHomes: matchedHomes.length,
              connectedHomes: matchedHomes.length,
              splitterRatio,
              splitterCount,
              inputFibreCount: splitterCount,
              inputFibresRequired: splitterCount,
              buildStatus: getDpOperationalStatus(
                existingSplitter || {},
                "Planned",
              ),
              addressSheetAssignment: {
                source: "address-sheet",
                splitterBox,
                homeCount: matchedHomes.length,
                updatedAt: now,
              },
            },
            properties: {
              ...((existingSplitter as any)?.properties || {}),
              splitterBox,
              splitterRatio,
              splitterCount,
              inputFibreCount: splitterCount,
              inputFibresRequired: splitterCount,
              addressSheetAssignment: {
                source: "address-sheet",
                splitterBox,
                homeCount: matchedHomes.length,
                updatedAt: now,
              },
            },
          } as SavedMapAsset,
          existingSplitter ? "updated" : "created",
          reason,
        ),
        !existingSplitter,
      );

      splitterById.set(splitterId, splitterAsset);

      matchedHomes.forEach((home, index) => {
        const homeCoord = getAssetLatLng(home as any);
        if (!homeCoord) {
          skippedHomes += 1;
          return;
        }

        const matchingRow =
          groupRows.find(
            (row) => String(row.homeAsset?.id || "") === String(home.id),
          ) || groupRows[index];
        const dropTypeText = String(matchingRow?.dropType || "").toLowerCase();
        const homeConnectionKey =
          getHomeConnectionKey(home as any) || String(home.id || "");
        getHomeDropKeys(home as any).forEach((key) =>
          affectedHomeDropKeys.add(key),
        );

        const stampedHome = markAssetForLiveSync(
          withAssetEditedMetadata(
            {
              ...(home as any),
              connectedDpId: splitterId,
              connectedDP: splitterId,
              dpId: splitterId,
              connection: "connected",
              connectionMode: "address-sheet",
              splitterBox,
              assignedSplitterBox: splitterBox,
              addressSheetAssignment: {
                source: "address-sheet",
                splitterBox,
                dropType: matchingRow?.dropType || "",
                rowNumber: matchingRow?.rowNumber,
                updatedAt: now,
              },
              properties: {
                ...((home as any).properties || {}),
                connectedDpId: splitterId,
                connectedDP: splitterId,
                dpId: splitterId,
                connection: "connected",
                connectionMode: "address-sheet",
                splitterBox,
                assignedSplitterBox: splitterBox,
                addressSheetAssignment: {
                  source: "address-sheet",
                  splitterBox,
                  dropType: matchingRow?.dropType || "",
                  rowNumber: matchingRow?.rowNumber,
                  updatedAt: now,
                },
              },
            } as SavedMapAsset,
            "updated",
            reason,
          ),
          false,
        );

        updatedHomeById.set(String(home.id), stampedHome);

        const dropId = `drop_${splitterId}_${safeId(homeConnectionKey)}`;
        const dropAsset = markAssetForLiveSync(
          {
            id: dropId,
            name: `${splitterBox} Drop → ${(home as any).address || (home as any).name || homeConnectionKey}`,
            label: `${splitterBox} Drop`,
            assetType: "cable",
            type: "cable",
            cableType: "Drop" as any,
            fibreCount: "1F" as any,
            installMethod: (dropTypeText.includes("oh") ||
            dropTypeText.includes("overhead")
              ? "OH"
              : "Underground") as any,
            fromAssetId: splitterId,
            toAssetId: String(home.id || homeConnectionKey),
            fromType: "distribution-point",
            toType: "home",
            dpId: splitterId,
            homeId: homeConnectionKey,
            connectedHomeId: String(home.id || homeConnectionKey),
            uprn:
              (home as any).uprn ||
              (home as any).UPRN ||
              (home as any).properties?.UPRN ||
              (home as any).properties?.uprn,
            splitterBox,
            source: "address-sheet-import",
            generationMode: "address-sheet-sb-home-drop",
            connectionMode: "address-sheet",
            status: "planned",
            distanceM:
              Math.round(getDistanceMeters(centre, homeCoord) * 10) / 10,
            route: [
              [centre.lat, centre.lng],
              [homeCoord.lat, homeCoord.lng],
            ],
            path: [
              [centre.lat, centre.lng],
              [homeCoord.lat, homeCoord.lng],
            ],
            points: [
              [centre.lat, centre.lng],
              [homeCoord.lat, homeCoord.lng],
            ],
            coordinates: [
              [centre.lat, centre.lng],
              [homeCoord.lat, homeCoord.lng],
            ],
            geometry: {
              type: "LineString",
              coordinates: [
                [centre.lat, centre.lng],
                [homeCoord.lat, homeCoord.lng],
              ],
            },
            addressSheetAssignment: {
              source: "address-sheet",
              splitterBox,
              dropType: matchingRow?.dropType || "",
              rowNumber: matchingRow?.rowNumber,
              updatedAt: now,
            },
          } as SavedMapAsset,
          true,
        );

        newDropsById.set(dropId, dropAsset);
      });
    });

    if (!splitterById.size || !updatedHomeById.size) {
      alert(
        "No SB/home/drop assignments could be created. Check that matched homes have coordinates.",
      );
      return;
    }

    setSavedJoints((prev) => {
      const base = (prev ?? []).filter((asset: any) => {
        if (!request.overwriteExistingDrops || !isDropCable(asset)) return true;
        const dropKeys = getDropHomeKeys(asset);
        return !dropKeys.some((key) => affectedHomeDropKeys.has(key));
      });

      const byId = new Map<string, SavedMapAsset>();
      base.forEach((asset) => byId.set(String(asset.id), asset));
      splitterById.forEach((asset, id) => byId.set(id, asset));
      updatedHomeById.forEach((asset, id) => {
        if (byId.has(id)) byId.set(id, asset);
      });
      newDropsById.forEach((asset, id) => byId.set(id, asset));

      return Array.from(byId.values());
    });

    if (activeProjectId) {
      const updatedProjectHomes = projectHomes.map((home) => {
        const updated = updatedHomeById.get(String(home.id));
        return updated || home;
      });
      setProjectHomes(updatedProjectHomes);
      await saveProjectHomes(
        activeProjectId,
        stampHomesForActiveArea(updatedProjectHomes),
        activeProjectAreaName,
      );
    }

    const auditTarget =
      splitterById.values().next().value ||
      activeProjectArea ||
      ({} as SavedMapAsset);
    writeAssetAuditLog({
      asset: auditTarget,
      action: "updated",
      reason,
      comment: `Address sheet assigned ${updatedHomeById.size} home${updatedHomeById.size === 1 ? "" : "s"} to ${splitterById.size} splitter box${splitterById.size === 1 ? "" : "es"} and generated ${newDropsById.size} SB→home drop${newDropsById.size === 1 ? "" : "s"}.`,
      before: {
        matchedRows: rows.length,
        overwriteExistingDrops: Boolean(request.overwriteExistingDrops),
      },
      after: {
        splitterBoxes: splitterById.size,
        homesUpdated: updatedHomeById.size,
        dropsGenerated: newDropsById.size,
        skippedHomes,
      },
    });

    alert(
      `Address sheet applied.\n\nSplitter boxes: ${splitterById.size}\nHomes assigned: ${updatedHomeById.size}\nDrops generated: ${newDropsById.size}${skippedHomes ? `\nSkipped homes without coordinates: ${skippedHomes}` : ""}`,
    );
  };

  // =====================================================
  // PROJECT WORKSPACE FULL SCREEN MODE
  // Keeps Leaflet mounted separately from the workspace shell.
  // This prevents map pane/marker position errors while the
  // project workspace is loading or open.
  // =====================================================

  const handleAutoSpreadStackedHomes = async () => {
    if (!activeProjectId) {
      alert("Select/open a project area before auto-spreading homes.");
      return;
    }

    const getPointForHome = (
      asset: SavedMapAsset,
    ): { lat: number; lng: number } | null => {
      const item = asset as any;

      if (typeof item.lat === "number" && typeof item.lng === "number") {
        return { lat: item.lat, lng: item.lng };
      }

      if (
        asset.geometry?.type === "Point" &&
        Array.isArray(asset.geometry.coordinates)
      ) {
        const [lat, lng] = asset.geometry.coordinates as any[];
        const nextLat = Number(lat);
        const nextLng = Number(lng);
        if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
          return { lat: nextLat, lng: nextLng };
        }
      }

      return null;
    };

    const isSpreadHomeAsset = (
      asset: SavedMapAsset | null | undefined,
    ): boolean => {
      if (!asset || asset.geometry?.type === "LineString" || isDropCable(asset))
        return false;
      const item = asset as any;
      const text = [
        item.assetType,
        item.type,
        item.homeType,
        item.name,
        item.label,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return Boolean(
        item.uprn ||
        item.UPRN ||
        item.properties?.UPRN ||
        item.properties?.uprn ||
        item.homeId ||
        text.includes("home") ||
        text.includes("premise") ||
        text.includes("property") ||
        text.includes("sdu") ||
        text.includes("flat"),
      );
    };

    const projectHomeIds = new Set(
      (projectHomes ?? []).map((home) => String(home.id)),
    );
    const areaHomes = (
      projectHomes.length ? projectHomes : visibleProjectAssets
    ).filter(isSpreadHomeAsset);

    if (areaHomes.length < 2) {
      alert("No project homes are loaded to auto-spread.");
      return;
    }

    const stackThresholdMeters = 1.75;
    const spreadRadiusMeters = 2.5;
    const processed = new Set<string>();
    const movedById = new Map<string, SavedMapAsset>();
    let stackCount = 0;

    for (const seed of areaHomes) {
      if (processed.has(seed.id)) continue;
      const seedPoint = getPointForHome(seed);
      if (!seedPoint) continue;

      const group = areaHomes.filter((candidate) => {
        if (processed.has(candidate.id)) return false;
        const candidatePoint = getPointForHome(candidate);
        if (!candidatePoint) return false;
        return (
          getDistanceMeters(seedPoint, candidatePoint) <= stackThresholdMeters
        );
      });

      if (group.length <= 1) {
        processed.add(seed.id);
        continue;
      }

      stackCount += 1;
      group.forEach((home) => processed.add(home.id));

      group.forEach((home, index) => {
        // Keep the first/canonical home exactly where it is.
        if (index === 0) return;

        const angle =
          ((Math.PI * 2) / Math.max(group.length - 1, 1)) * (index - 1);
        const latOffset = (Math.sin(angle) * spreadRadiusMeters) / 111_320;
        const lngOffset =
          (Math.cos(angle) * spreadRadiusMeters) /
          (111_320 *
            Math.max(Math.cos((seedPoint.lat * Math.PI) / 180), 0.000001));

        const nextLat = seedPoint.lat + latOffset;
        const nextLng = seedPoint.lng + lngOffset;
        const existing = home as any;

        movedById.set(home.id, {
          ...existing,
          lat: nextLat,
          lng: nextLng,
          geometry: {
            ...(existing.geometry || {}),
            type: "Point",
            coordinates: [nextLat, nextLng],
          },
          autoSpreadStackedHome: true,
          autoSpreadAt: new Date().toISOString(),
        } as SavedMapAsset);
      });
    }

    if (movedById.size === 0) {
      alert("No stacked homes were found within 1.75m.");
      return;
    }

    const reason = `Auto-spread ${movedById.size} stacked home${movedById.size === 1 ? "" : "s"} across ${stackCount} group${stackCount === 1 ? "" : "s"}.`;

    setSavedJoints((prev) =>
      (prev ?? []).map((asset) => {
        const moved = movedById.get(asset.id);
        return moved ? markAssetForLiveSync(moved, false) : asset;
      }),
    );

    if (projectHomes.length > 0) {
      const updatedProjectHomes = projectHomes.map(
        (home) => movedById.get(home.id) || home,
      );
      setProjectHomes(updatedProjectHomes);

      try {
        await saveProjectHomes(
          activeProjectId,
          stampHomesForActiveArea(updatedProjectHomes),
          activeProjectAreaName,
        );
      } catch (err) {
        console.error("Failed to save auto-spread project homes", err);
        alert(
          "Homes moved on screen, but saving project homes failed. Check the console before refreshing.",
        );
        return;
      }
    } else if (projectHomeIds.size === 0) {
      // No projectHomes state to save; this means homes are stored in the main map assets.
      // setSavedJoints above will persist via the existing main chunk save path.
    }

    writeAssetAuditLog({
      asset:
        activeProjectArea ||
        (Array.from(movedById.values())[0] as SavedMapAsset),
      action: "moved",
      reason,
      comment:
        "Auto-spread stacked homes within 1.75m into a small 2.5m circle. No homes were deleted and UPRNs were preserved.",
      before: {
        stackThresholdMeters,
        spreadRadiusMeters,
      },
      after: {
        stackCount,
        movedHomes: movedById.size,
      },
    });

    alert(
      `Auto-spread complete. ${movedById.size} home${movedById.size === 1 ? "" : "s"} moved across ${stackCount} stack${stackCount === 1 ? "" : "s"}.`,
    );
  };

  if (
    isProjectWorkspaceLoading &&
    activeProjectArea &&
    canManageNetworkDesign
  ) {
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

  if (
    isProjectWorkspaceOpen &&
    activeProjectArea &&
    canManageNetworkDesign &&
    isMobile
  ) {
    return (
      <BuildMobileWorkspaceNotice
        projectName={activeProjectArea.name || "Selected Project"}
        onBackToMap={() => setIsProjectWorkspaceOpen(false)}
      />
    );
  }

  if (isProjectWorkspaceOpen && activeProjectArea && canManageNetworkDesign) {
    return (
      <ProjectWorkspace
        projectName={activeProjectArea.name || "Selected Project"}
        status="Build Phase"
        stats={projectWorkspaceStats}
        projectArea={activeProjectArea}
        projectAssets={visibleProjectAssets}
        projectAreas={projectAreas}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onBackToMap={() => {
          setIsProjectWorkspaceOpen(false);

          window.setTimeout(() => {
            if (
              !mapRef.current ||
              activeProjectArea?.geometry?.type !== "Polygon"
            ) {
              return;
            }

            const ring = activeProjectArea.geometry.coordinates?.[0] || [];
            const bounds = L.latLngBounds(
              ring
                .map(
                  ([lat, lng]: [number, number]) =>
                    [lat, lng] as [number, number],
                )
                .filter(
                  ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng),
                ),
            );

            if (bounds.isValid()) {
              mapRef.current.fitBounds(bounds, {
                padding: [40, 40],
                maxZoom: 18,
                animate: false,
              });
            }
          }, 150);
        }}
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
        onApplyAddressSheetAssignments={handleWorkspaceAddressSheetAssignments}
        onApplySbRouteAssignments={handleWorkspaceSbRouteAssignments}
        onAutoSpreadStackedHomes={handleAutoSpreadStackedHomes}
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
      {!isPanelOpen && (
        <button onClick={() => setIsPanelOpen(true)} style={drawerToggleButton}>
          ☰ Asset Panel
        </button>
      )}

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
            type="button"
            onClick={() => setIsPanelOpen(false)}
            style={{ ...btnSecondary, marginLeft: "auto", flexShrink: 0 }}
          >
            × Close
          </button>
        </div>

        <UserMenu variant="sidebar" />

        {isAdmin && (
          <details style={card}>
            <summary style={sectionSummary}>Administration</summary>
            <div style={sectionBody}>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>
                Admin-only cleanup tools. These are hidden from Super Users,
                Build, Survey and Maintenance users. Use typed confirmations
                before any destructive cleanup.
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: "1px solid #475569",
                  borderRadius: 10,
                  background: "#0f172a",
                }}
              >
                <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 800 }}>
                  Polygon bulk selection
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
                  {polygonBulkSelectEnabled
                    ? `Bulk select is ON. Click polygons on the map to add/remove them. Selected: ${selectedPolygonIds.length}`
                    : `Bulk select is OFF. Selected: ${selectedPolygonIds.length}`}
                </div>

                <button
                  type="button"
                  onClick={() => setPolygonBulkSelectEnabled((value) => !value)}
                  style={{
                    ...btnSecondary,
                    width: "100%",
                    marginTop: 8,
                    background: polygonBulkSelectEnabled ? "#14532d" : "#1f2937",
                  }}
                >
                  {polygonBulkSelectEnabled ? "Polygon Bulk Select: ON" : "Polygon Bulk Select: OFF"}
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={handleAdminSelectVisiblePolygons} style={btnSecondary}>
                    Select Visible
                  </button>
                  <button type="button" onClick={handleAdminSelectImportedPolygons} style={btnSecondary}>
                    Select Imported
                  </button>
                  <button type="button" onClick={handleAdminSelectAllPolygons} style={btnSecondary}>
                    Select All
                  </button>
                  <button type="button" onClick={handleAdminClearPolygonSelection} style={btnSecondary}>
                    Clear Selection
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdminRemoveImportedAreas}
                style={btnDanger}
              >
                Remove Imported Area Polygons
              </button>

              <button
                type="button"
                onClick={handleAdminRemoveSelectedPolygons}
                style={btnDanger}
                disabled={selectedPolygonIds.length === 0}
                title={
                  selectedPolygonIds.length > 0
                    ? "Remove the selected polygon set"
                    : "Use Polygon Bulk Select or Select Visible/Imported/All first"
                }
              >
                Remove Selected Polygons ({selectedPolygonIds.length})
              </button>

              <button
                type="button"
                onClick={handleAdminRemoveSelectedPolygon}
                style={btnDanger}
                disabled={
                  !currentEditingAsset ||
                  !isPolygonAreaAsset(currentEditingAsset)
                }
                title={
                  currentEditingAsset && isPolygonAreaAsset(currentEditingAsset)
                    ? "Remove the currently selected polygon only"
                    : "Select a polygon first"
                }
              >
                Remove Current Polygon
              </button>

              <button
                type="button"
                onClick={handleAdminRemoveAllPolygons}
                style={btnDanger}
              >
                Remove ALL Polygons
              </button>

              <button
                type="button"
                onClick={handleAdminRepairAreaStamps}
                style={{
                  ...btnSecondary,
                  width: "100%",
                  marginTop: 8,
                  background: activeProjectArea ? "#14532d" : "#1f2937",
                  borderColor: activeProjectArea ? "#22c55e" : "#475569",
                }}
                disabled={!activeProjectArea}
                title={
                  activeProjectArea
                    ? "Restamp operational assets inside the selected polygon back to this area"
                    : "Select an area polygon first"
                }
              >
                Repair Area Stamps for Selected Area
              </button>

              <button
                type="button"
                onClick={handleDeletePiaOverlayForActiveProject}
                style={btnDanger}
                disabled={!activeProjectArea}
                title={
                  activeProjectArea
                    ? "Delete OR / PIA overlay only inside the selected area"
                    : "Select an area first"
                }
              >
                Delete OR / PIA in Selected Area
              </button>

              <button
                type="button"
                onClick={handleAdminDeleteAllOrReferenceAssets}
                style={btnDanger}
              >
                Delete ALL OR / PIA Reference Layers
              </button>

              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
                Imported area cleanup removes polygons from the map state first;
                press Save Map afterwards to persist that cleanup. OR / PIA
                cleanup writes directly to OR reference storage.
              </div>
            </div>
          </details>
        )}

        {activeProjectArea && canManageNetworkDesign && (
          <button
            type="button"
            onClick={() => {
              if (!canManageNetworkDesign) {
                setIsProjectWorkspaceOpen(false);
                return;
              }
              setIsProjectWorkspaceOpen(true);
            }}
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

        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
          Scope:{" "}
          {activeProjectArea
            ? activeProjectArea.name || "Selected area"
            : "Whole network"}
        </div>

        {canUseSurveyTools && (
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
                    {selectedSurveyDeleteHomeIds.length === 1 ? "" : "s"}{" "}
                    selected
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
                    handleClearSurveyDeleteHomeSelection();
                    setMapMode("pick");
                  }}
                  style={btnSecondary}
                >
                  Exit
                </button>
              </div>
            </div>
          </details>
        )}

        {canUseSurveyTools && (
          <details style={card}>
            <summary style={sectionSummary}>Home Reassignment</summary>
            <div style={sectionBody}>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
                Move UPRNs/homes from one DP to another without touching feeder
                or link cables.
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
                    handleClearMoveHomeSelection();
                    setMapMode("pick");
                  }}
                  style={btnSecondary}
                >
                  Exit
                </button>
              </div>
            </div>
          </details>
        )}

        {canUseSurveyTools && (
          <details
            open={Boolean(
              editingAssetId ||
              pickedLocation ||
              mapMode === "draw-area" ||
              draftAreaPoints.length > 0,
            )}
            style={card}
          >
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
                    onChange={(e) =>
                      setFibreCount(e.target.value as FibreCount)
                    }
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
                availableThroughCables={
                  availableParentCablesForBranchAllocation
                }
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
                  <div style={{ ...label, marginTop: 12 }}>
                    Selected Location
                  </div>
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
                    Click the map to add points. Drag points to move them. Click
                    a segment to insert a point.
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
        )}

        {canManageNetworkDesign && (
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
                  style={{
                    fontSize: "0.78rem",
                    color: "#94a3b8",
                    marginTop: 4,
                  }}
                >
                  One importer for DPs / AFNs / CBTs, poles, chambers, street
                  cabs, areas, cables, PIA routes and UPRN homes.
                </div>
              </div>

              {isLoadingProjectHomes && (
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "#fbbf24",
                    marginTop: 8,
                  }}
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
        )}
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
            onBoundsChange={(bounds, zoom) => {
              setMapBounds(bounds);
              if (typeof zoom === "number" && Number.isFinite(zoom)) {
                setMapZoom(zoom);
              }
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
            assets={renderProjectAssets}
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
              const beforeAsset = allMapAssets.find((asset) => asset.id === id);
              const reason = getChangeReasonForCurrentMode(
                "moved",
                beforeAsset?.name || id,
              );
              if (!reason) return;

              const buildMovedPointAsset = (
                asset: SavedMapAsset,
              ): SavedMapAsset =>
                markAssetForLiveSync(
                  withAssetEditedMetadata(
                    {
                      ...asset,
                      lat,
                      lng,
                      geometry: {
                        type: "Point",
                        coordinates: [lat, lng],
                      },
                    } as SavedMapAsset,
                    "moved",
                    reason,
                  ),
                  false,
                );

              const movedAsset = beforeAsset
                ? buildMovedPointAsset(beforeAsset)
                : null;
              const isMovedHome = movedAsset?.assetType === "home";
              const movedHomeKeys = movedAsset
                ? getHomeDropKeys(movedAsset)
                : [];
              const connectedDpId = String(
                (beforeAsset as any)?.connectedDpId ??
                  (beforeAsset as any)?.properties?.connectedDpId ??
                  (beforeAsset as any)?.dpId ??
                  "",
              );
              const connectedDp = connectedDpId
                ? allMapAssets.find(
                    (asset) =>
                      asset.assetType === "distribution-point" &&
                      String(asset.id) === connectedDpId,
                  ) || null
                : null;
              const regeneratedDrop =
                isMovedHome && connectedDp && movedAsset
                  ? createManualDropCable(connectedDp, movedAsset)
                  : null;

              const shouldRemoveExistingDropForMovedHome = (
                asset: SavedMapAsset,
              ): boolean => {
                if (
                  !isMovedHome ||
                  movedHomeKeys.length === 0 ||
                  !isDropCable(asset)
                ) {
                  return false;
                }

                return getDropHomeKeys(asset).some((key) =>
                  movedHomeKeys.includes(key),
                );
              };

              setSavedJoints((prev) => {
                let foundInSavedJoints = false;

                const updated = (prev ?? [])
                  .filter(
                    (asset) => !shouldRemoveExistingDropForMovedHome(asset),
                  )
                  .map((asset) => {
                    if (asset.id !== id) return asset;
                    if (asset.geometry?.type !== "Point") return asset;

                    foundInSavedJoints = true;
                    return buildMovedPointAsset(asset);
                  });

                const withRegeneratedDrop = regeneratedDrop
                  ? [...updated, markAssetForLiveSync(regeneratedDrop, true)]
                  : updated;

                if (
                  !foundInSavedJoints &&
                  movedAsset &&
                  beforeAsset?.assetType !== "home"
                ) {
                  return [...withRegeneratedDrop, movedAsset];
                }

                return withRegeneratedDrop;
              });

              if (beforeAsset?.assetType === "home") {
                const updatedProjectHomes = (projectHomes ?? []).map((home) => {
                  if (home.id !== id) return home;
                  return buildMovedPointAsset(home);
                });

                setProjectHomes(updatedProjectHomes);

                if (activeProjectId) {
                  void saveProjectHomes(
                    activeProjectId,
                    stampHomesForActiveArea(updatedProjectHomes),
                    activeProjectAreaName,
                  ).catch((err) => {
                    console.error("Failed to save moved home position", err);
                    alert(
                      "The home moved on screen, but saving the project homes failed. Check the console before refreshing.",
                    );
                  });
                }
              }

              if (movedAsset) {
                writeAssetAuditLog({
                  asset: movedAsset,
                  action: "moved",
                  reason,
                  comment:
                    movedAsset.assetType === "home"
                      ? "Moved home position on the map. Existing DP assignment was preserved."
                      : undefined,
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
              polygonEditingEnabled={polygonBulkSelectEnabled}
              polygonBulkSelectEnabled={polygonBulkSelectEnabled}
              selectedAreaIds={selectedPolygonIds}
              onUnlockPolygon={setEditingAreaId}
              onSelect={handleSelectProject}
              onToggleSelect={togglePolygonBulkSelection}
              onEdit={handleEditAsset}
              onDelete={handleDeleteAsset}
            />
          )}

          <OpenreachOverlayLayer
            assets={renderOpenreachAssets}
            visibleLayers={openreachLayerVisibility}
            ductSelectionEnabled={
              mapMode === "draw-cable" &&
              shouldUseDuctTraceForInstallMethod(installMethod)
            }
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
            assets={renderProjectAssets}
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
                icon={measurePointIcon}
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
          onClose={closeMaintenanceHistory}
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
          layerCounts={layerCounts}
          measurementDistance={measuredDistance}
          measurementPointCount={measurePoints.length}
          isMeasuring={mapMode === "measure"}
          onStartMeasurement={() => setMapMode("measure")}
          onStopMeasurement={() => setMapMode("pick")}
          onUndoMeasurementPoint={handleUndoMeasurementPoint}
          onClearMeasurements={handleClearMeasurement}
        />
      </div>

      {!showMaintenancePanel && !(isFieldResponsiveMode && isMobile) && (
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

      <ResponsiveFieldPolish enabled={isFieldResponsiveMode} />

      {!showMaintenancePanel && isFieldResponsiveMode && (
        <OfflineFieldModeBanner
          isOffline={offlineFieldMode.isOffline}
          lastCachedAt={offlineFieldMode.lastCachedAt}
          cachedAssetCount={offlineFieldMode.cachedAssetCount}
          cachedHomeCount={offlineFieldMode.cachedHomeCount}
          onCacheNow={() => {
            const ok = offlineFieldMode.cacheFieldData();
            alert(
              ok
                ? "Field data cached on this device."
                : "Could not cache field data on this device.",
            );
          }}
          onClearCache={() => {
            const ok = offlineFieldMode.clearCachedFieldData();
            if (ok) alert("Field cache cleared from this device.");
          }}
        />
      )}

      {!showMaintenancePanel &&
        isFieldResponsiveMode &&
        currentEditingAsset && (
          <button
            type="button"
            onClick={() => setIsFieldPhotoPanelOpen(true)}
            style={{
              position: "absolute",
              right: 14,
              bottom: isMobile ? 224 : 154,
              zIndex: 1320,
              border: "1px solid #60a5fa",
              background: "#2563eb",
              color: "#ffffff",
              borderRadius: 999,
              padding: "10px 13px",
              fontWeight: 900,
              boxShadow: "0 12px 24px rgba(15,23,42,0.35)",
            }}
          >
            Photos
          </button>
        )}

      {!showMaintenancePanel && isFieldResponsiveMode && (
        <FieldPhotoCapturePanel
          isOpen={isFieldPhotoPanelOpen}
          assetName={currentEditingAsset?.name || null}
          onClose={() => setIsFieldPhotoPanelOpen(false)}
          onFilesSelected={(files) => {
            if (!files.length) return;
            console.log("Selected field photos", files);
          }}
        />
      )}

      {!showMaintenancePanel && isFieldResponsiveMode && (
        <FieldNavigationBar
          variant={isMobile ? "mobile" : "tablet"}
          hasSelectedAsset={Boolean(currentEditingAsset)}
          onGpsLocate={handleGpsLocate}
          onZoomToSelected={() => {
            if (currentEditingAsset) handleZoomToAsset(currentEditingAsset);
          }}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
        />
      )}

      {!showMaintenancePanel && isFieldResponsiveMode && (
        <FieldQuickActionDrawer
          variant={isMobile ? "mobile" : "tablet"}
          role={fieldQuickRole}
          isOpen={isFieldQuickDrawerOpen}
          currentAssetName={currentEditingAsset?.name || null}
          mapMode={mapMode}
          selectedMoveHomeCount={selectedMoveHomeIds.length}
          selectedDeleteHomeCount={selectedSurveyDeleteHomeIds.length}
          onToggle={() => setIsFieldQuickDrawerOpen((prev) => !prev)}
          onClose={() => setIsFieldQuickDrawerOpen(false)}
          onOpenPanel={() => setIsPanelOpen(true)}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
          onGpsLocate={handleGpsLocate}
          onToggleMoveHomes={handleToggleMoveHomesMode}
          onToggleDeleteHomes={handleToggleSurveyDeleteHomesMode}
          onOpenMaintenance={() => {
            if (currentEditingAsset) {
              openMaintenanceHistory(currentEditingAsset);
            } else {
              setIsPanelOpen(true);
            }
          }}
        />
      )}

      {!showMaintenancePanel &&
        isFieldResponsiveMode &&
        !isMobile &&
        currentEditingAsset && (
          <FieldSelectedAssetCard
            variant={isMobile ? "mobile" : "tablet"}
            role={fieldQuickRole}
            asset={currentEditingAsset}
            onOpenDetails={() => setIsPanelOpen(true)}
            onClearSelection={resetEditor}
            onOpenMaintenance={() =>
              openMaintenanceHistory(currentEditingAsset)
            }
          />
        )}

      {!showMaintenancePanel &&
        isMobile &&
        isFieldResponsiveMode &&
        currentEditingAsset && (
          <AssetBottomSheet
            role={fieldQuickRole}
            asset={currentEditingAsset}
            mapMode={mapMode}
            selectedMoveHomeCount={selectedMoveHomeIds.length}
            selectedDeleteHomeCount={selectedSurveyDeleteHomeIds.length}
            onOpenDetails={() => setIsPanelOpen(true)}
            onOpenMaintenance={() =>
              openMaintenanceHistory(currentEditingAsset)
            }
            onClose={resetEditor}
          />
        )}

      {!showMaintenancePanel && roleMobileMode === "survey" && (
        <SurveyMobileControls
          mapMode={mapMode}
          selectedMoveHomeCount={selectedMoveHomeIds.length}
          selectedDeleteHomeCount={selectedSurveyDeleteHomeIds.length}
          onOpenPanel={() => setIsPanelOpen(true)}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
          onGpsLocate={handleGpsLocate}
          onToggleMoveHomes={handleToggleMoveHomesMode}
          onToggleDeleteHomes={handleToggleSurveyDeleteHomesMode}
        />
      )}

      {!showMaintenancePanel && roleMobileMode === "maintenance" && (
        <MaintenanceMobileControls
          hasSelectedAsset={Boolean(currentEditingAsset)}
          onOpenPanel={() => setIsPanelOpen(true)}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
          onGpsLocate={handleGpsLocate}
          onOpenMaintenance={() => {
            if (currentEditingAsset) {
              openMaintenanceHistory(currentEditingAsset);
            } else {
              setIsPanelOpen(true);
            }
          }}
        />
      )}

      {!showMaintenancePanel && isSurveyTabletMode && (
        <SurveyTabletControls
          mapMode={mapMode}
          selectedMoveHomeCount={selectedMoveHomeIds.length}
          selectedDeleteHomeCount={selectedSurveyDeleteHomeIds.length}
          onOpenPanel={() => setIsPanelOpen(true)}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
          onGpsLocate={handleGpsLocate}
          onToggleMoveHomes={handleToggleMoveHomesMode}
          onToggleDeleteHomes={handleToggleSurveyDeleteHomesMode}
        />
      )}

      {!showMaintenancePanel && isMaintenanceTabletMode && (
        <MaintenanceTabletControls
          hasSelectedAsset={Boolean(currentEditingAsset)}
          onOpenPanel={() => setIsPanelOpen(true)}
          onOpenLayers={() => setIsLayersOpen((prev) => !prev)}
          onGpsLocate={handleGpsLocate}
          onOpenMaintenance={() => {
            if (currentEditingAsset) {
              openMaintenanceHistory(currentEditingAsset);
            } else {
              setIsPanelOpen(true);
            }
          }}
        />
      )}

      {!showMaintenancePanel &&
        (roleMobileMode === "survey" || isSurveyTabletMode) &&
        (mapMode === "move-homes" || mapMode === "survey-delete-homes") && (
          <FieldModeStatusPill
            variant={isMobile ? "mobile" : "tablet"}
            tone="survey"
            title={
              mapMode === "move-homes" ? "Move homes mode" : "Delete homes mode"
            }
            detail={
              mapMode === "move-homes"
                ? `${selectedMoveHomeIds.length} home${selectedMoveHomeIds.length === 1 ? "" : "s"} selected`
                : `${selectedSurveyDeleteHomeIds.length} home${selectedSurveyDeleteHomeIds.length === 1 ? "" : "s"} selected`
            }
            actionLabel="Exit"
            onAction={() => {
              if (mapMode === "move-homes") {
                handleToggleMoveHomesMode();
              } else {
                handleToggleSurveyDeleteHomesMode();
              }
            }}
          />
        )}

      {!showMaintenancePanel &&
        roleMobileMode !== "survey" &&
        roleMobileMode !== "maintenance" &&
        !isSurveyTabletMode &&
        !isMaintenanceTabletMode && (
          <>
            {canManageNetworkDesign && (
              <button
                onClick={handleSaveMapNow}
                disabled={isSavingMapNow}
                style={{
                  ...topMapButton,
                  right: isMobile ? 168 : isLayersOpen ? 512 : 168,
                  background: isSavingMapNow ? "#64748b" : "#16a34a",
                  cursor: isSavingMapNow ? "not-allowed" : "pointer",
                }}
              >
                {isSavingMapNow ? "Saving..." : "Save Map"}
              </button>
            )}

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
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3000,
            background: "#0f172a",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            boxSizing: "border-box",
          }}
        >
          <DistributionPointEditor
            asset={openDistributionPointAsset}
            allAssets={allMapAssets}
            onClose={() => {
              setOpenDistributionPointAsset(null);
              if (activeProjectArea && canManageNetworkDesign) {
                setIsProjectWorkspaceOpen(true);
              } else {
                setIsProjectWorkspaceOpen(false);
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
        </div>
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
            overflowX: isMobile ? "auto" : "hidden",
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
            overflowX: isMobile ? "auto" : "hidden",
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
  top: 75,
  left: 10,
  zIndex: 1000,
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
