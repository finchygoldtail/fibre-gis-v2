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
import { getAssetDisplayName as getAssetSearchLabel, getAssetSearchText as buildAssetSearchText } from "../utils/assetDisplay";
import { useUserRole } from "../context/UserRoleContext";
import { useJointMappings } from "./map/hooks/useJointMappings";
import { useOpenreachAssets } from "./map/hooks/useOpenreachAssets";
import {
  DEFAULT_VISIBLE_LAYERS,
  useLayerVisibility,
  type LayerVisibility,
} from "./map/hooks/useLayerVisibility";
import { useProjectHomesController } from "./map/homes/useProjectHomesController";
import { useHomeImportTools } from "./map/homes/useHomeImportTools";
import { useAreaDrawingTools } from "./map/areas/useAreaDrawingTools";
import { useHomeWorkflowControllers } from "./map/homes/useHomeWorkflowControllers";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import AreaPolygonsLayer from "./map/layers/AreaPolygonsLayer";
import AdminPanels from "./map/panels/AdminPanels";
import WorkspacePanels from "./map/panels/WorkspacePanels";
import { usePolygonAdminTools } from "./map/admin/usePolygonAdminTools";
import { useAreaRepairTools } from "./map/admin/useAreaRepairTools";
import { useOrReferenceAdminTools } from "./map/admin/useOrReferenceAdminTools";
import ExchangeDesigner from "./exchange/ExchangeDesigner";
import { formatDistance, getPathDistanceMeters } from "../utils/mapMeasure";
import { getNextAssetName } from "../utils/mapAssetNames";
import { saveMapAssetsViaCoordinator } from "../services/mapSaveCoordinator";
import { wipeLegacyFirestoreMapData } from "../services/mapAssetStorage";
import MapContextMenu, { type MapContextAction } from "./map/MapContextMenu";
import LayerControls from "./map/panels/LayerControls";
import MapToolbar from "./map/panels/MapToolbar";
import ImportExportPanel from "./map/panels/ImportExportPanel";
import AssetMarkersLayer from "./map/layers/AssetMarkersLayer";
import CableLinesLayer from "./map/cables/CableLinesLayer";
import OpenreachOverlayLayer from "./map/layers/OpenreachOverlayLayer";
import LiveUsersLayer from "./map/layers/LiveUsersLayer";
import CableDetailsModal from "./map/CableDetailsModal";
import { loadMapView, saveMapView } from "./map/mapViewMemory";
import PoleDetailsModal from "./map/modals/PoleDetailsModal";
import DistributionPointDetailsModal from "./map/modals/DistributionPointDetailsModal";
import ChamberDetailsModal, {
  type ChamberDetails,
} from "./map/modals/ChamberDetailsModal";
import MaintenanceAuditOverlay from "./map/audit/MaintenanceAuditOverlay";
import MapAssetAuditFormOverlay from "./map/audit/MapAssetAuditFormOverlay";
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
import { clearDpFibreAllocationsForAssets } from "../services/network";

import { routePointsToRoads } from "./map/utils/routeToRoads";
import type { OsmBounds } from "./map/utils/loadOsmBuildings";
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
  getAssignedDpId,
  getHomeKeySet,
  isDropCableRelatedToHomeKeys,
} from "./map/homes/homeReassignment";
import {
  findDpAtCableEnd,
  findDpsAlongCable,
  getAssetPoint,
  isDropCable,
  sanitiseCableRouteCoordinates,
} from "./map/utils/mapAssetGeometry";
import StreetCabDesigner from "./streetcab/StreetCabDesigner";
import DistributionPointEditor from "./dp/DistributionPointEditor";
import { filterAssetsForProjectArea } from "./map/projects/projectAssetFilter";
import { useProjectAreaView } from "./map/projects/useProjectAreaView";
import { useProjectWorkspaceStats } from "./map/workspace/useProjectWorkspaceStats";
import { useLayerCounts } from "./map/layers/useLayerCounts";
import { useCableAllocationOptions } from "./map/cables/useCableAllocationOptions";
import { useCableWorkflow } from "./map/cables/useCableWorkflow";
import { findCableEndpointAssets } from "./map/cableUsage";
import {
  useMapDrawingState,
  type BasemapType,
  type MapMode,
} from "./map/hooks/useMapDrawingState";
import { useRoleMobileMode } from "./map/responsive/useRoleMobileMode";
import { useDeviceLayout } from "./map/responsive/useDeviceLayout";
import { useLiveUserLocationSharing } from "./map/hooks/useLiveUserLocationSharing";
import { isSpatialApiAsset } from "../services/spatialApi/spatialAssetAdapter";
import { spatialApiConfig } from "../services/spatialApi/spatialApiConfig";
import {
  deleteSpatialMapAsset,
  saveSpatialMapAssets,
  wipeSpatialMapData,
} from "../services/spatialApi/spatialAssetWriteService";
import { useSpatialViewportAssets } from "../services/spatialApi/useSpatialViewportAssets";
import SurveyMobileControls from "./map/responsive/mobile/SurveyMobileControls";
import MaintenanceMobileControls from "./map/responsive/mobile/MaintenanceMobileControls";
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
import { useMapImportExportTools } from "./map/import/useMapImportExportTools";
import { saveProjectHomes } from "./map/projects/projectHomesStorage";
import { ExchangeMarkersLayer } from "./map/ExchangeMarkersLayer";
import {
  useExchangeController,
  type ExchangeAsset,
} from "./map/exchange/useExchangeController";
import { useAssetEditorState } from "./map/editor/useAssetEditorState";
import { useAssetSelection } from "./map/editor/useAssetSelection";
import {
  getDpOperationalStatus,
  syncDpOperationalStatusOnAsset,
  useAssetSaveHandlers,
} from "./map/editor/useAssetSaveHandlers";
import { useEditorReset } from "./map/editor/useEditorReset";
import { useMapNavigation } from "./map/navigation/useMapNavigation";
import AssetDetailsSidebarSections from "./map/AssetDetailsSidebarSections";
import {
  getAssetKind,
  isChamberAsset,
  isDistributionPointAsset,
  isExchangeAsset,
  isJointAsset,
  isPoleAsset,
  isStreetCabAsset,
} from "./map/utils/mapAssetClassifiers";
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
  mergeAndSaveOrAssets,
  normaliseOpenreachAsset,
} from "../services/orAssetStorage";
import { withAreaAssetIndex } from "../services/areaAssetIndex";
import { DEFAULT_DISTRIBUTION_CLOSURE_TYPE } from "../services/assetNameValidation";
export type SavedJoint = SavedMapAsset;
export type { SavedMapAsset };

function mergeMapAssets(...groups: SavedMapAsset[][]): SavedMapAsset[] {
  const byId = new Map<string, SavedMapAsset>();
  groups.flat().forEach((asset) => {
    if (asset?.id) byId.set(asset.id, asset);
  });
  return Array.from(byId.values());
}

function isLocalGeoJsonImportAsset(asset: SavedMapAsset): boolean {
  const source = String((asset as any).source || "").toLowerCase();
  return source === "geojson-import" || source === "local-pending-postgis" || asset.assetType === "home";
}

function SpatialApiStatusPanel({
  enabled,
  loading,
  count,
  truncated,
  error,
}: {
  enabled: boolean;
  loading: boolean;
  count: number;
  truncated: boolean;
  error: string | null;
}) {
  if (!enabled) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 84,
        zIndex: 650,
        maxWidth: 360,
        padding: "9px 12px",
        borderRadius: 8,
        border: "1px solid rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.94)",
        color: "#e5e7eb",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
        fontSize: 12,
        lineHeight: 1.35,
        pointerEvents: "none",
      }}
    >
      <strong style={{ color: error ? "#fca5a5" : "#86efac" }}>
        Hetzner / PostGIS
      </strong>
      <span style={{ marginLeft: 8 }}>
        {error
          ? error
          : loading
            ? "Loading viewport..."
            : `${count} asset${count === 1 ? "" : "s"} in viewport`}
      </span>
      {truncated ? (
        <div style={{ color: "#facc15", marginTop: 4 }}>
          Result limit reached. Zoom in or reduce visible layers.
        </div>
      ) : null}
    </div>
  );
}

function DataSourceTogglePanel({
  showFirebaseAssets,
  showPostgisAssets,
  highlightPostgisAssets,
  postgisOnly,
  onShowFirebaseAssetsChange,
  onShowPostgisAssetsChange,
  onHighlightPostgisAssetsChange,
}: {
  showFirebaseAssets: boolean;
  showPostgisAssets: boolean;
  highlightPostgisAssets: boolean;
  postgisOnly: boolean;
  onShowFirebaseAssetsChange: (value: boolean) => void;
  onShowPostgisAssetsChange: (value: boolean) => void;
  onHighlightPostgisAssetsChange: (value: boolean) => void;
}) {
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#e5e7eb",
    cursor: "pointer",
    userSelect: "none",
  };

  const checkboxStyle: React.CSSProperties = {
    width: 14,
    height: 14,
    accentColor: "#22c55e",
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 128,
        zIndex: 650,
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.94)",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
      }}
    >
      <label style={rowStyle}>
        <input
          type="checkbox"
          checked={showFirebaseAssets}
          disabled={postgisOnly}
          onChange={(event) => onShowFirebaseAssetsChange(event.target.checked)}
          style={checkboxStyle}
        />
        {postgisOnly ? "Legacy/local assets disabled" : "Legacy/local assets"}
      </label>
      <label style={rowStyle}>
        <input
          type="checkbox"
          checked={showPostgisAssets}
          disabled={postgisOnly}
          onChange={(event) => onShowPostgisAssetsChange(event.target.checked)}
          style={checkboxStyle}
        />
        {postgisOnly ? "PostGIS authoritative assets" : "Hetzner / PostGIS assets"}
      </label>
      <label style={{ ...rowStyle, color: "#67e8f9" }}>
        <input
          type="checkbox"
          checked={highlightPostgisAssets}
          onChange={(event) => onHighlightPostgisAssetsChange(event.target.checked)}
          style={{ ...checkboxStyle, accentColor: "#06b6d4" }}
        />
        Highlight PostGIS
      </label>
    </div>
  );
}

function isEngineeringDrawingJointAsset(asset: SavedMapAsset): boolean {
  return isJointAsset(asset);
}

function isEngineeringDrawingDistributionPointAsset(asset: SavedMapAsset): boolean {
  return isDistributionPointAsset(asset);
}

function isEngineeringDrawingPoleAsset(asset: SavedMapAsset): boolean {
  return isPoleAsset(asset);
}

function isEngineeringDrawingChamberAsset(asset: SavedMapAsset): boolean {
  return isChamberAsset(asset);
}

function isEngineeringDrawingStreetCabAsset(asset: SavedMapAsset): boolean {
  return isStreetCabAsset(asset);
}

function getEngineeringDrawingCableFibreCount(asset: SavedMapAsset): number | null {
  const item = asset as any;
  const candidates = [
    item.fibreCount,
    item.fiberCount,
    item.size,
    item.cableSize,
    item.name,
    item.cableId,
    item.label,
  ];

  for (const candidate of candidates) {
    const match = String(candidate ?? "").toUpperCase().match(/(288|144|96|48|36|24|12)\s*F?/);
    if (match) return Number(match[1]);
  }

  return null;
}

function isEngineeringDrawingDropCable(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType || "").toLowerCase();
  const cableType = String(item.cableType || "").toLowerCase();
  const name = String(item.name || "").toLowerCase();

  return (
    assetType === "drop-cable" ||
    cableType.includes("drop") ||
    name.includes("drop") ||
    String(item.isDropCable || "").toLowerCase() === "true" ||
    String(item.autoGeneratedDrop || "").toLowerCase() === "true" ||
    Boolean(item.homeId || item.connectedHomeId || item.toHomeId || item.fromHomeId)
  );
}

function isEngineeringDrawingTrunkCableAsset(asset: SavedMapAsset): boolean {
  if (String((asset as any).assetType || "").toLowerCase() !== "cable") return false;
  if (asset.geometry?.type !== "LineString") return false;
  if (isEngineeringDrawingDropCable(asset)) return false;

  const fibreCount = getEngineeringDrawingCableFibreCount(asset);
  return fibreCount === 96 || fibreCount === 144 || fibreCount === 288;
}

function isEngineeringDrawingVisibleAsset(asset: SavedMapAsset): boolean {
  if (isExchangeAsset(asset)) return true;
  if (isEngineeringDrawingJointAsset(asset)) return true;
  if (isEngineeringDrawingDistributionPointAsset(asset)) return true;
  if (isEngineeringDrawingPoleAsset(asset)) return true;
  if (isEngineeringDrawingChamberAsset(asset)) return true;
  if (isEngineeringDrawingStreetCabAsset(asset)) return true;
  if (isEngineeringDrawingTrunkCableAsset(asset)) return true;

  return false;
}

function exchangeToNetworkAsset(exchange: ExchangeAsset): SavedMapAsset {
  return {
    id: exchange.id,
    name: exchange.name || exchange.code || "Exchange",
    assetType: "exchange" as any,
    jointType: "Exchange",
    code: exchange.code,
    notes: exchange.notes,
    projectId: exchange.projectId,
    geometry: {
      type: "Point",
      coordinates: [exchange.lat, exchange.lng],
    },
  } as SavedMapAsset;
}

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

type MainMapQaMode = "qa" | "piaQa";

const QA_MAP_LAYER_PRESET: LayerVisibility = {
  ...DEFAULT_VISIBLE_LAYERS,
  agJoints: true,
  distributionPoints: true,
};

const PIA_QA_LAYER_PRESET: LayerVisibility = {
  ...DEFAULT_VISIBLE_LAYERS,
  agJoints: false,
  distributionPoints: false,
  poles: true,
  chambers: true,
  cables: true,
  dropCables: false,
  feeders: true,
  links: true,
  ulw96: true,
  ulw48: true,
  ulw36: true,
  ulw24: true,
  ulw12: true,
  orPoles: true,
  orChambers: true,
  orDucts: true,
  orLabels: true,
  newPoles: true,
  suggestedPoles: true,
  suggestedChambers: true,
  suggestedDucts: true,
  piaQaView: true,
  piaContractorView: true,
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
  onCablePreviewPoint,
  onAreaPoint,
  onDriveToLocation,
  onRightClick,
}: {
  mode: MapMode;
  assets: SavedMapAsset[];
  snapEnabled: boolean;
  onPick: (pos: LatLngLiteral) => void;
  onMeasurePoint: (pos: LatLngLiteral) => void;
  onCablePoint: (pos: LatLngLiteral) => void;
  onCablePreviewPoint?: (pos: LatLngLiteral | null) => void;
  onAreaPoint: (pos: LatLngLiteral) => void;
  onDriveToLocation: (pos: LatLngLiteral) => void;
  onRightClick: (pos: LatLngLiteral, screen: { x: number; y: number }) => void;
}) {
  useMapEvents({
    click(e) {
      let point = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };

      if (mode === "drive-to-location") {
        onDriveToLocation(point);
        return;
      }

      if (mode === "measure") {
        onMeasurePoint(point);
        return;
      }

      if (mode === "draw-cable") {
        const snappedPoint = snapPointToAssets(
          point,
          assets.filter((asset) => asset.assetType !== "area"),
          snapEnabled,
          8,
        );
        onCablePoint(snappedPoint);
        onCablePreviewPoint?.(null);
        return;
      }

      if (mode === "draw-area") {
        onAreaPoint(point);
        return;
      }

      point = snapPointToAssets(point, assets, snapEnabled, 8);
      onPick(point);
    },
    mousemove(e) {
      if (mode !== "draw-cable") {
        onCablePreviewPoint?.(null);
        return;
      }

      const point = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };
      const snappedPoint = snapPointToAssets(
        point,
        assets.filter((asset) => asset.assetType !== "area"),
        snapEnabled,
        8,
      );
      onCablePreviewPoint?.(snappedPoint);
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
      geometryType === "multipolygon" ||
      jointType.includes("polygon") ||
      jointType.includes("area")
    ) {
      copy.assetType = "area";
    } else if (geometryType === "linestring" || geometryType === "multilinestring" || jointType.includes("cable")) {
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
  const { profile, permissions, isSuperUser, isAdmin, isMaintenanceUser } = useUserRole();
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
  const lastAssetPanelProjectIdRef = useRef<string | null>(activeProjectId);
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

  const exchangeNetworkAssets = useMemo(
    () => savedExchanges.map(exchangeToNetworkAsset),
    [savedExchanges],
  );

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
  const [mainMapQaMode, setMainMapQaMode] = useState<MainMapQaMode>("qa");
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [isAssetSearchFocused, setIsAssetSearchFocused] = useState(false);

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
  const canOpenFullProjectWorkspace =
    (canManageNetworkDesign || isAdmin || profile?.role === "client_admin") &&
    profile?.role !== "client_viewer" &&
    !isMobile;

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

  const { hydratedOperationalSavedJoints } = useJointMappings(operationalSavedJoints);

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
  const [auditFormAsset, setAuditFormAsset] = useState<SavedMapAsset | null>(null);

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
    () =>
      allMapAssets.find((asset) => asset.id === editingAssetId) ||
      openreachReferenceAssets.find((asset) => asset.id === editingAssetId) ||
      null,
    [allMapAssets, openreachReferenceAssets, editingAssetId],
  );

  const [drawCablePreviewPoint, setDrawCablePreviewPoint] =
    useState<LatLngLiteral | null>(null);

  useEffect(() => {
    if (mapMode !== "draw-cable" || draftCablePoints.length === 0) {
      setDrawCablePreviewPoint(null);
    }
  }, [mapMode, draftCablePoints.length]);

  const getCablePointFromAsset = (asset: SavedMapAsset): LatLngLiteral | null => {
    if (asset.geometry?.type !== "Point") return null;
    const coords = asset.geometry.coordinates as any;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return { lat: Number(coords[0]), lng: Number(coords[1]) };
  };

  const handleCableAssetPoint = (asset: SavedMapAsset) => {
    const point = getCablePointFromAsset(asset);
    if (!point) return;
    handleCablePoint(point);
    setDrawCablePreviewPoint(null);
  };

  const isEditingReferenceAsset = Boolean(
    currentEditingAsset && isOpenreachReferenceAsset(currentEditingAsset),
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

  const handleMainMapQaModeChange = (mode: MainMapQaMode) => {
    setMainMapQaMode(mode);
    setVisibleLayers(mode === "piaQa" ? PIA_QA_LAYER_PRESET : QA_MAP_LAYER_PRESET);
    if (mode === "qa" && isEditingReferenceAsset) {
      resetEditor();
    }
  };

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    if (lastAssetPanelProjectIdRef.current === activeProjectId) return;

    lastAssetPanelProjectIdRef.current = activeProjectId;
    setEditingAssetId(null);
    setEditingAreaId(null);
    setPickedLocation(null);
    setDraftCablePoints([]);
    setDraftAreaPoints([]);
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setMapMode("pick");
    setShowCableModal(false);
    setShowPoleModal(false);
    setShowDpModal(false);
    setShowChamberModal(false);
    setOpenStreetCabAsset(null);
    setOpenDistributionPointAsset(null);
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      latlng: null,
    });
    setIsPanelOpen(false);
  }, [
    activeProjectId,
    setDraftAreaPoints,
    setDraftCablePoints,
    setEditingAreaId,
    setEditingAssetId,
    setIsPanelOpen,
    setMapMode,
    setPickedLocation,
    setSelectedReferenceDuctId,
    setSelectedReferenceDuctName,
  ]);

  const isPostgisOnlyMapMode = spatialApiConfig.postgisOnly;
  const showSpatialDebugControls = false;
  const spatialViewport = useSpatialViewportAssets({
    businessId: "fibre-gis-v2",
    areaId: null,
    bounds: mapBounds,
    zoom: mapZoom,
    visibleLayers,
  });

  const [showFirebaseAssets, setShowFirebaseAssets] = useState(
    !isPostgisOnlyMapMode,
  );
  const [showPostgisAssets, setShowPostgisAssets] = useState(true);
  const [highlightPostgisAssets, setHighlightPostgisAssets] = useState(true);
  const [deletedPostgisAssetIds, setDeletedPostgisAssetIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!isPostgisOnlyMapMode) return;
    setShowFirebaseAssets(false);
    setShowPostgisAssets(true);
  }, [isPostgisOnlyMapMode]);

  const visibleSpatialAssets = useMemo(
    () =>
      showPostgisAssets
        ? spatialViewport.assets.filter((asset) => !deletedPostgisAssetIds.has(asset.id))
        : [],
    [deletedPostgisAssetIds, showPostgisAssets, spatialViewport.assets],
  );

  const projectViewMapAssets = useMemo(
    () =>
      isPostgisOnlyMapMode
        ? mergeMapAssets(allMapAssets, visibleSpatialAssets)
        : allMapAssets,
    [allMapAssets, isPostgisOnlyMapMode, visibleSpatialAssets],
  );

  // =====================================================
  // PROJECT AREA / VIEWPORT ASSET VIEW
  // Project scoping, viewport filtering and OR layer visibility are now kept
  // outside the main map component so this file stays easier to maintain.
  // In PostGIS-only mode, selectable/searchable project areas come from
  // the spatial API viewport rather than the old Firestore-local map state.
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
    allMapAssets: projectViewMapAssets,
    openreachReferenceAssets,
    activeProjectId,
    mapBounds,
    mapZoom,
    visibleLayers,
  });

  const {
    sharingEnabled: isSharingLocation,
    setSharingEnabled: setIsSharingLocation,
    shareError: locationShareError,
    liveUsers,
  } = useLiveUserLocationSharing({
    profile,
    activeProjectId,
    activeProjectName: activeProjectAreaName || activeProjectArea?.name || null,
    subscribeEnabled: visibleLayers.liveUsers !== false,
  });

  const networkSnapCandidateAssets = useMemo(
    () => [...snapCandidateAssets, ...exchangeNetworkAssets],
    [snapCandidateAssets, exchangeNetworkAssets],
  );

  const localImportedProjectAssets = isPostgisOnlyMapMode
    ? renderProjectAssets.filter(isLocalGeoJsonImportAsset)
    : [];
  const localImportedProjectAreas = isPostgisOnlyMapMode
    ? visibleProjectAreas.filter(isLocalGeoJsonImportAsset)
    : [];
  const visibleFirebaseProjectAssets = showFirebaseAssets
    ? renderProjectAssets
    : localImportedProjectAssets;
  const visibleExchangeNetworkAssets = showFirebaseAssets ? exchangeNetworkAssets : [];

  const renderProjectAssetsWithExchanges = useMemo(
    () => [...visibleFirebaseProjectAssets, ...visibleExchangeNetworkAssets],
    [visibleExchangeNetworkAssets, visibleFirebaseProjectAssets],
  );

  const renderProjectAssetsWithSpatial = useMemo(
    () => mergeMapAssets(visibleFirebaseProjectAssets, visibleSpatialAssets),
    [visibleFirebaseProjectAssets, visibleSpatialAssets],
  );

  const renderProjectAssetsWithExchangesAndSpatial = useMemo(
    () =>
      mergeMapAssets(
        visibleFirebaseProjectAssets,
        visibleExchangeNetworkAssets,
        visibleSpatialAssets,
      ),
    [visibleExchangeNetworkAssets, visibleFirebaseProjectAssets, visibleSpatialAssets],
  );

  const renderAreaAssetsWithSpatial = useMemo(
    () =>
      mergeMapAssets(
        showFirebaseAssets ? visibleProjectAreas : localImportedProjectAreas,
        showPostgisAssets
          ? visibleSpatialAssets.filter((asset) => asset.assetType === "area")
          : [],
      ),
    [localImportedProjectAreas, showFirebaseAssets, showPostgisAssets, visibleProjectAreas, visibleSpatialAssets],
  );

  const allNetworkAssetsWithExchanges = useMemo(
    () => [...allMapAssets, ...exchangeNetworkAssets],
    [allMapAssets, exchangeNetworkAssets],
  );

  const engineeringDrawingSourceAssets = useMemo(
    () => (activeProjectId ? renderProjectAssetsWithExchanges : allNetworkAssetsWithExchanges),
    [activeProjectId, allNetworkAssetsWithExchanges, renderProjectAssetsWithExchanges],
  );

  const engineeringDrawingAssets = useMemo(
    () =>
      mapMode === "draw-cable"
        ? engineeringDrawingSourceAssets.filter(isEngineeringDrawingVisibleAsset)
        : renderProjectAssetsWithExchangesAndSpatial,
    [
      engineeringDrawingSourceAssets,
      mapMode,
      renderProjectAssetsWithExchangesAndSpatial,
    ],
  );

  const engineeringDrawingSnapCandidateAssets = useMemo(
    () =>
      mapMode === "draw-cable"
        ? engineeringDrawingSourceAssets.filter(
            (asset) =>
              asset.geometry?.type === "Point" &&
              (isEngineeringDrawingJointAsset(asset) ||
                isEngineeringDrawingDistributionPointAsset(asset) ||
                isEngineeringDrawingPoleAsset(asset) ||
                isEngineeringDrawingChamberAsset(asset) ||
                isEngineeringDrawingStreetCabAsset(asset)),
          )
        : networkSnapCandidateAssets,
    [engineeringDrawingSourceAssets, mapMode, networkSnapCandidateAssets],
  );

  const visibleTopologyLinks = useMemo(
    () =>
      visibleProjectAssets.filter(
        (asset) => asset.geometry?.type === "LineString",
      ).length,
    [visibleProjectAssets],
  );

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
    savedJoints,
    setSavedJoints,
  });

  const persistMapAssetImmediately = async (
    asset: SavedMapAsset,
    options: {
      reason: string;
      source: string;
      isNew?: boolean;
      successMessage?: string;
    },
  ): Promise<SavedMapAsset> => {
    if (isOpenreachReferenceAsset(asset)) {
      const nextReferenceAsset = normaliseOpenreachAsset(asset);

      try {
        const merged = await mergeAndSaveOrAssets([nextReferenceAsset], {
          reason: options.reason,
        });
        setOrAssets(merged);
        if (options.successMessage) {
          alert(options.successMessage);
        }
      } catch (error) {
        console.error("Immediate reference asset save failed", error);
        alert(
          "This reference asset changed on screen, but its server save failed. Do not refresh until the save issue is checked.",
        );
      }

      return nextReferenceAsset;
    }

    const savedAsset = saveMapAssetToState(asset, {
      isNew: options.isNew,
    });

    if (options.successMessage) {
      alert(options.successMessage);
    }

    return savedAsset;
  };

  // =====================================================
  // PROJECT WORKSPACE SUMMARY STATS
  // Heavy derived statistics now live in a dedicated hook so
  // JointMapManager no longer owns this counting logic.
  // =====================================================
  const projectWorkspaceStats = useProjectWorkspaceStats({
    visibleProjectAssets,
    topologyLinks: visibleTopologyLinks,
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
    if (!activeProjectArea || !canOpenFullProjectWorkspace) {
      setIsProjectWorkspaceOpen(false);
      setIsProjectWorkspaceLoading(false);
      return;
    }

    setIsProjectWorkspaceLoading(false);
    setIsProjectWorkspaceOpen(true);
  }, [activeProjectArea?.id, canOpenFullProjectWorkspace]);

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

  const {
    polygonBulkSelectEnabled,
    setPolygonBulkSelectEnabled,
    selectedPolygonIds,
    togglePolygonBulkSelection,
    handleAdminRemoveImportedAreas,
    handleAdminSelectAllPolygons,
    handleAdminSelectVisiblePolygons,
    handleAdminSelectImportedPolygons,
    handleAdminClearPolygonSelection,
    handleAdminRemoveSelectedPolygons,
    handleAdminRemoveSelectedPolygon,
    handleAdminRemoveAllPolygons,
    handleAdminRemoveImportedDistributionPoints,
    handleAdminSetAllPolygonsToL3,
  } = usePolygonAdminTools({
    isAdmin,
    operationalSavedJoints,
    editingAssetId,
    getVisiblePolygonAreas: () =>
      visibleProjectAreas.filter((asset) =>
        isAreaVisibleForLevel(asset, visibleLayers),
      ),
    setSavedJoints,
    resetEditor,
  });

  const { handleAdminRepairAreaStamps } = useAreaRepairTools({
    isAdmin,
    activeProjectId,
    activeProjectArea,
    operationalSavedJoints,
    projectHomes,
    setProjectHomes,
    setLoadedHomesProjectId,
    setSavedJoints,
  });

  const {
    handleAdminDeleteAllOrReferenceAssets,
    handleDeletePiaOverlayForActiveProject,
  } = useOrReferenceAdminTools({
    isAdmin,
    activeProjectArea,
    openreachReferenceAssets,
    setOrAssets,
    setSavedJoints,
  });

  const handleAdminWipePostgisMapData = async () => {
    if (!isAdmin) return;

    if (!spatialApiConfig.enabled || !spatialApiConfig.writesEnabled) {
      alert("PostGIS writes are disabled, so the map reset cannot run.");
      return;
    }

    const typed = window.prompt(
      [
        "This will clear ALL map assets from PostGIS and the legacy map store.",
        "",
        "It also deletes exchange records and joint tray/mapping records.",
        "Street cabs, joints, homes, cables, chambers, poles, DPs and polygons stored as map assets will be removed.",
        "",
        "Type WIPE MAP DATA to continue.",
      ].join("\n"),
    );

    if (typed !== "WIPE MAP DATA") {
      if (typed !== null) alert("Map reset cancelled. The confirmation text did not match.");
      return;
    }

    try {
      const [postgisResult, firestoreResult] = await Promise.all([
        wipeSpatialMapData({
          businessId: "fibre-gis-v2",
          confirm: "WIPE MAP DATA",
          reason: "administrator-full-postgis-map-reset",
          includeExchangeRecords: true,
          includeJointMappingRecords: true,
        }),
        wipeLegacyFirestoreMapData(),
      ]);

      setSavedJoints([]);
      setProjectHomes([]);
      setLoadedHomesProjectId(null);
      setOrAssets([]);
      setDeletedPostgisAssetIds(new Set(visibleSpatialAssets.map((asset) => asset.id)));
      setShowFirebaseAssets(false);
      setOpenExchangeAsset(null);
      setEditingAssetId(null);
      setEditingAreaId(null);
      setPickedLocation(null);
      setOpenStreetCabAsset(null);
      setOpenDistributionPointAsset(null);

      alert(
        [
          "Map data wiped.",
          "",
          `PostGIS map assets deleted: ${postgisResult.mapAssetsDeleted}`,
          `PostGIS exchange/joint records deleted: ${postgisResult.appRecordsDeleted}`,
          `Firestore map docs deleted: ${firestoreResult.mapAssetDocsDeleted}`,
          `Firestore map chunks deleted: ${firestoreResult.mapAssetChunksDeleted}`,
          `Firestore joint mappings deleted: ${firestoreResult.jointMappingDocsDeleted}`,
          `Firestore joint mapping chunks deleted: ${firestoreResult.jointMappingChunksDeleted}`,
          `Firestore project home docs deleted: ${firestoreResult.projectHomeDocsDeleted}`,
          `Firestore project home chunks deleted: ${firestoreResult.projectHomeChunksDeleted}`,
          `Firestore delete blocks bypassed with empty writes: ${firestoreResult.deleteFailures}`,
          "",
          "The page will reload now.",
        ].join("\n"),
      );
      window.location.reload();
    } catch (error) {
      console.error("Failed to wipe map data", error);
      alert("Map reset failed. Check the console/API logs before trying again.");
    }
  };

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
    snapCandidateAssets: networkSnapCandidateAssets,
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

  const [highlightedSearchAssetId, setHighlightedSearchAssetId] = useState<
    string | null
  >(null);
  const assetSearchSource = useMemo(() => {
    if (activeProjectArea) {
      return [
        activeProjectArea,
        ...visibleProjectAssets,
        ...visibleOpenreachAssets,
      ];
    }

    return [...allMapAssets, ...openreachReferenceAssets];
  }, [
    activeProjectArea,
    visibleProjectAssets,
    visibleOpenreachAssets,
    allMapAssets,
    openreachReferenceAssets,
  ]);

  const assetSearchResults = useMemo(() => {
    const query = assetSearchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    return assetSearchSource
      .filter((asset) => buildAssetSearchText(asset).includes(query))
      .slice(0, 12);
  }, [assetSearchSource, assetSearchQuery]);

  const selectAssetSearchResult = (asset: SavedMapAsset) => {
    handleEditAsset(asset);
    handleZoomToAsset(asset);
    setAssetSearchQuery(getAssetSearchLabel(asset));
    setIsAssetSearchFocused(false);

    setHighlightedSearchAssetId(asset.id);

    window.setTimeout(() => {
      setHighlightedSearchAssetId((currentId) =>
        currentId === asset.id ? null : currentId,
      );
    }, 4500);
  };
  const assetSearchScopeLabel = activeProjectArea
    ? getAssetSearchLabel(activeProjectArea)
    : "Whole map";
  const handleAssetSearchSubmit = () => {
    const firstResult = assetSearchResults[0];
    if (firstResult) {
      selectAssetSearchResult(firstResult);
      return;
    }

    if (assetSearchQuery.trim().length >= 2) {
      alert("No matching asset, chamber, pole, DP, cable or address found.");
    }
  };

  // =====================================================
  // REBUILD THROUGH-CABLE RESERVATIONS
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

    let changed = false;
    const nextAssets = (savedJoints ?? []).map((asset) => {
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

    if (!changed) return;
    setSavedJoints(nextAssets);
    void saveMapAssetsViaCoordinator(nextAssets, {
      source: "joint-map-manager",
      reason: "through-cable reservation rebuild",
      allowDestructiveSave: false,
    }).catch((err) => {
      console.error("Failed to save through-cable reservation rebuild", err);
      alert("Reservation updates changed on screen, but saving to PostGIS failed.");
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

  const handleAdminToggleSurveyDeleteHomesMode = () => {
    if (!isAdmin) {
      alert("Administrator access required to delete homes.");
      return;
    }
    handleToggleSurveyDeleteHomesMode();
  };

  const handleAdminDeleteSelectedSurveyHomes = () => {
    if (!isAdmin) {
      alert("Administrator access required to delete homes.");
      return;
    }
    void handleDeleteSelectedSurveyHomes();
  };

  const { handleSaveEdits, handleSaveJoint, handleDeleteAsset } =
    useAssetSaveHandlers({
      activeProjectId,
      activeProjectAreaName,
      allocatedInputFibres,
      areaLevel,
      assetType,
      cablePiaNoiNumber,
      cableType,
      chamberDetails,
      currentMappingRows,
      draftAreaPoints,
      draftCablePoints,
      editingAssetId,
      fibreCount,
      getChangeReasonForCurrentMode,
      installMethod,
      jointName,
      jointType,
      notes,
      parentCableId,
      pickedLocation,
      poleDetails,
      dpDetails,
      projectHomes,
      resetEditor,
      saveMapAssetToState,
      savedJoints,
      setProjectHomes,
      setSavedJoints,
      stampHomesForActiveArea,
      writeAssetAuditLog,
    });

  const handleAdminDeleteAsset = (id: string) => {
    if (!isAdmin) {
      alert("Administrator access required to delete map assets.");
      return;
    }

    if (id.startsWith("postgis:") && isPostgisOnlyMapMode) {
      if (!window.confirm("Delete this asset from PostGIS?")) return;

      void deleteSpatialMapAsset(id, {
        businessId: "fibre-gis-v2",
        reason: "map-delete",
      })
        .then(() => {
          setDeletedPostgisAssetIds((current) => {
            const next = new Set(current);
            next.add(id);
            return next;
          });
          setSavedJoints((prev) => (prev ?? []).filter((asset) => asset.id !== id));
        })
        .catch((error) => {
          console.error("PostGIS asset delete failed", error);
          alert("Delete failed. The asset was not removed from PostGIS.");
        });
      return;
    }

    void handleDeleteAsset(id);
  };
  const handleSaveReferenceAssetEvidence = async () => {
    if (
      !currentEditingAsset ||
      !isOpenreachReferenceAsset(currentEditingAsset)
    ) {
      handleSaveEdits();
      return;
    }

    const nextReferenceAsset = normaliseOpenreachAsset({
      ...(currentEditingAsset as any),
      name: currentEditingAsset.name,
      notes,
      poleDetails:
        assetType === "pole"
          ? {
              ...((currentEditingAsset as any).poleDetails || {}),
              ...poleDetails,
            }
          : (currentEditingAsset as any).poleDetails,
      chamberDetails:
        assetType === "chamber"
          ? {
              ...((currentEditingAsset as any).chamberDetails || {}),
              ...chamberDetails,
            }
          : (currentEditingAsset as any).chamberDetails,
      dpDetails:
        assetType === "distribution-point"
          ? {
              ...((currentEditingAsset as any).dpDetails || {}),
              ...dpDetails,
            }
          : (currentEditingAsset as any).dpDetails,
      buildEvidence: {
        ...((currentEditingAsset as any).buildEvidence || {}),
        updatedAt: new Date().toISOString(),
      },
    } as SavedMapAsset);

    try {
      const merged = await mergeAndSaveOrAssets([nextReferenceAsset], {
        reason: "save PIA/build evidence on read-only reference asset",
      });
      setOrAssets(merged);
      alert(
        "Reference asset evidence saved. Geometry and OR details stayed locked.",
      );
    } catch (err) {
      console.error("Failed to save reference asset evidence", err);
      alert(
        "Could not save the OR asset evidence. Check the console before refreshing.",
      );
    }
  };

  const {
    handleFinishArea,
    handleUndoAreaPoint,
    handleClearArea,
    handleMoveAreaPoint,
  } = useAreaDrawingTools({
    draftAreaPoints,
    setDraftAreaPoints,
    jointName,
    savedJoints,
    notes,
    areaLevel,
    saveMapAssetToState,
    writeAssetAuditLog,
    getChangeReasonForCurrentMode,
    resetEditor,
  });

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
              networkSnapCandidateAssets,
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

      const endpointAssets = findCableEndpointAssets(
        allNetworkAssetsWithExchanges,
        routedCoordinates.map(([lat, lng]) => ({ lat, lng })),
        25,
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
        fromAssetId: endpointAssets.fromAssetId,
        toAssetId: endpointAssets.toAssetId,
        startAssetId: endpointAssets.fromAssetId,
        endAssetId: endpointAssets.toAssetId,
        fromAssetType: (endpointAssets.fromAsset as any)?.assetType,
        toAssetType: (endpointAssets.toAsset as any)?.assetType,
        fromAssetName: (endpointAssets.fromAsset as any)?.name,
        toAssetName: (endpointAssets.toAsset as any)?.name,
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

      const markedCableRecord = markAssetForLiveSync(
        withAreaAssetIndex(cableRecord, activeProjectId, activeProjectAreaName),
        true,
      );
      const markedAutoDrops = autoDrops.map((asset) =>
        markAssetForLiveSync(
          withAreaAssetIndex(asset, activeProjectId, activeProjectAreaName),
          true,
        ),
      );
      const newCableAssets = [markedCableRecord, ...markedAutoDrops];
      let nextCableSavedJoints: SavedMapAsset[] | null = null;

      setSavedJoints((prev) => {
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

        nextCableSavedJoints = [
          ...updatedExistingAssets,
          markedCableRecord,
          ...markedAutoDrops,
        ];
        return nextCableSavedJoints;
      });

      if (spatialApiConfig.enabled && spatialApiConfig.writesEnabled) {
        await saveSpatialMapAssets(newCableAssets, {
          businessId: "fibre-gis-v2",
          projectId: activeProjectId || undefined,
          areaId: activeProjectId || undefined,
          reason: "finish cable route",
        });
      } else if (nextCableSavedJoints) {
        await saveMapAssetsViaCoordinator(nextCableSavedJoints, {
          source: "joint-map-manager",
          reason: "finish cable route",
          allowDestructiveSave: false,
        });
      }

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

  const handleClearMeasurement = () => {
    setMeasurePoints([]);
    setMapMode("pick");
  };

  const handleDriveToLocation = (point: LatLngLiteral) => {
    const { lat, lng } = point;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
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

    if (type === "drive-to-location") {
      setMapMode("drive-to-location");
      setIsPanelOpen(false);
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
        closureType: DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
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

  const { handleLoadOsmHomes, loadGeoJsonHomes, loadGeoJsonHomesInView } =
    useHomeImportTools({
      activeProjectId,
      activeProjectArea,
      activeProjectAreaName,
      mapBounds,
      mapRef,
      allMapAssets,
      projectHomes,
      setProjectHomes,
      setLoadedHomesProjectId,
      setIsLoadingOsmHomes,
      stampHomesForActiveArea,
    });

  const {
    handleExportJson,
    handleExportGeoJson,
    loadPiaOverlayGeoJson,
    loadAnyGeoJsonMapAssets,
    handleImportJson,
  } = useMapImportExportTools({
    savedJoints,
    setSavedJoints,
    activeProjectId,
    activeProjectArea,
    activeProjectAreaName,
    projectHomes,
    setProjectHomes,
    loadedHomesProjectId,
    setLoadedHomesProjectId,
    setOrAssets,
    stampHomesForActiveArea,
    markAssetForLiveSync,
  });

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
  const handleWorkspaceBulkDpStatusUpdate = async (args: {
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

    const nextSavedJoints = (savedJoints ?? []).map((asset) => {
      const updatedAsset = updatedById.get(String(asset.id || ""));
      return updatedAsset || asset;
    });

    setSavedJoints(nextSavedJoints);

    try {
      await saveMapAssetsViaCoordinator(nextSavedJoints, {
        reason: `bulk-dp-status:${reason}`,
        source: "joint-map-manager",
      });
    } catch (error) {
      console.error("Bulk DP status map save failed", error);
      alert(
        "DP status was updated on screen, but the server save failed. Do not refresh until the save issue is checked.",
      );
      return;
    }

    alert(
      `Updated ${beforeAssets.length} DP${beforeAssets.length === 1 ? "" : "s"} to ${args.status}.`,
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
  };

  // =====================================================
  // PROJECT WORKSPACE — CLEAR DP FIBRE ALLOCATIONS IN AREA
  // Clears only operational fibre allocation/routing fields from DPs.
  // It does NOT delete DPs, homes, drops, geometry, status, notes,
  // photos or selected through-cable choices.
  // =====================================================
  // =====================================================
  // PROJECT WORKSPACE - PERSIST BULK CABLE PIA NOI
  // Called by Workspace -> Build -> Bulk PIA NOI. This updates the
  // saved cable assets so the NOI survives workspace refresh/reopen.
  // =====================================================
  const handleWorkspaceBulkCablePiaNoiUpdate = async (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => {
    const ids = new Set((args.assetIds || []).map(String).filter(Boolean));
    if (!ids.size) {
      alert("No cables selected for PIA NOI update.");
      return;
    }

    const piaNoiNumber = String(args.piaNoiNumber || "").trim();
    if (!piaNoiNumber) {
      alert("Enter a PIA NOI number before applying.");
      return;
    }

    const reason = String(args.note || "").trim();
    if (!reason) {
      alert("An audit note is required before applying a bulk PIA NOI update.");
      return;
    }

    const beforeAssets = (savedJoints ?? []).filter((asset) =>
      ids.has(String(asset.id || "")),
    );

    if (!beforeAssets.length) {
      alert("No matching saved cables were found for the PIA NOI update.");
      return;
    }

    const updatedById = new Map<string, SavedMapAsset>();

    beforeAssets.forEach((asset) => {
      const item = asset as any;
      const currentPiaNoi = String(
        item.piaNoiNumber ||
          item.properties?.piaNoiNumber ||
          item.piaNOINumber ||
          item.properties?.piaNOINumber ||
          item.noiNumber ||
          item.properties?.noiNumber ||
          "",
      ).trim();

      if (currentPiaNoi === piaNoiNumber) return;

      const rawNextAsset = {
        ...item,
        piaNoiNumber,
        piaNOINumber: piaNoiNumber,
        noiNumber: piaNoiNumber,
        properties: {
          ...(item.properties || {}),
          piaNoiNumber,
          piaNOINumber: piaNoiNumber,
          noiNumber: piaNoiNumber,
        },
      } as SavedMapAsset;

      const nextAsset = withAssetEditedMetadata(
        markAssetForLiveSync(rawNextAsset),
        "updated",
        reason,
      );

      updatedById.set(String(asset.id || ""), nextAsset);
    });

    if (!updatedById.size) {
      alert(`No PIA NOI changes were needed; selected cables already show ${piaNoiNumber}.`);
      return;
    }

    const nextSavedJoints = (savedJoints ?? []).map(
      (asset) => updatedById.get(String(asset.id || "")) || asset,
    );

    setSavedJoints(nextSavedJoints);

    beforeAssets.forEach((beforeAsset) => {
      const afterAsset = updatedById.get(String(beforeAsset.id || ""));
      if (!afterAsset) return;

      writeAssetAuditLog({
        asset: afterAsset,
        action: "updated",
        reason,
        comment:
          "Manager bulk PIA NOI update from Project Workspace Build tab.",
        before: {
          piaNoiNumber:
            (beforeAsset as any).piaNoiNumber ||
            (beforeAsset as any).properties?.piaNoiNumber ||
            "",
        },
        after: {
          piaNoiNumber:
            (afterAsset as any).piaNoiNumber ||
            (afterAsset as any).properties?.piaNoiNumber ||
            "",
        },
      });
    });

    try {
      await saveMapAssetsViaCoordinator(nextSavedJoints, {
        reason: `bulk-pia-noi:${reason}`,
        source: "joint-map-manager",
      });
    } catch (error) {
      console.error("Bulk PIA NOI map save failed", error);
      throw new Error(
        "PIA NOI was applied locally, but the map save failed. Check the console before refreshing.",
      );
    }
  };

  const handleWorkspaceClearDpFibreAllocations = async (args: {
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

    const nextSavedJoints = (savedJoints ?? []).map((asset) => {
      const updatedAsset = updatedById.get(String(asset.id || ""));
      return updatedAsset || asset;
    });

    setSavedJoints(nextSavedJoints);

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

    try {
      await saveMapAssetsViaCoordinator(nextSavedJoints, {
        reason: `clear-dp-fibre-allocations:${reason}`,
        source: "joint-map-manager",
      });
    } catch (error) {
      console.error("Clear DP fibre allocations map save failed", error);
      alert(
        "DP fibre allocations were cleared on screen, but the server save failed. Do not refresh until the save issue is checked.",
      );
      return;
    }

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
  const handleWorkspaceSbRouteAssignments = async (request: {
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

    const nextSavedJoints = (savedJoints ?? []).map(
      (asset) => updatedById.get(String(asset.id || "")) || asset,
    );

    setSavedJoints(nextSavedJoints);

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

    try {
      await saveMapAssetsViaCoordinator(nextSavedJoints, {
        reason: `fas-sb-route-import:${reason}`,
        source: "joint-map-manager",
      });
    } catch (error) {
      console.error("FAS SB route map save failed", error);
      alert(
        "FAS SB routes were applied on screen, but the server save failed. Do not refresh until the save issue is checked.",
      );
      return;
    }

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
  const handleWorkspaceSingleDpStatusUpdate = async (args: {
    assetId: string;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => {
    await handleWorkspaceBulkDpStatusUpdate({
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
                DEFAULT_DISTRIBUTION_CLOSURE_TYPE) as any,
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

    let nextAddressSheetAssets: SavedMapAsset[] | null = null;
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

      nextAddressSheetAssets = Array.from(byId.values());
      return nextAddressSheetAssets;
    });

    if (nextAddressSheetAssets) {
      await saveMapAssetsViaCoordinator(nextAddressSheetAssets, {
        source: "joint-map-manager",
        reason: "address sheet splitter assignment",
        allowDestructiveSave: false,
      });
    }

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

    const nextSpreadSavedJoints = (savedJoints ?? []).map((asset) => {
        const moved = movedById.get(asset.id);
        return moved ? markAssetForLiveSync(moved, false) : asset;
      });
    setSavedJoints(nextSpreadSavedJoints);

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
      try {
        await saveMapAssetsViaCoordinator(nextSpreadSavedJoints, {
          source: "joint-map-manager",
          reason,
          allowDestructiveSave: false,
        });
      } catch (err) {
        console.error("Failed to save auto-spread map assets", err);
        alert(
          "Homes moved on screen, but saving the map assets failed. Check the console before refreshing.",
        );
        return;
      }
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

  const handleBackToMapFromWorkspace = () => {
    setIsProjectWorkspaceOpen(false);

    window.setTimeout(() => {
      if (!mapRef.current || activeProjectArea?.geometry?.type !== "Polygon") {
        return;
      }

      const ring = activeProjectArea.geometry.coordinates?.[0] || [];
      const bounds = L.latLngBounds(
        ring
          .map(([lat, lng]: [number, number]) => [lat, lng] as [number, number])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
      );

      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 18,
          animate: false,
        });
      }
    }, 150);
  };

  if (
    (isProjectWorkspaceLoading || isProjectWorkspaceOpen) &&
    activeProjectArea &&
    canOpenFullProjectWorkspace
  ) {
    return (
      <WorkspacePanels
        isLoading={isProjectWorkspaceLoading}
        isOpen={isProjectWorkspaceOpen}
        isMobile={isMobile}
        activeProjectArea={activeProjectArea}
        projectWorkspaceStats={projectWorkspaceStats}
        visibleProjectAssets={visibleProjectAssets}
        visibleOpenreachAssets={visibleOpenreachAssets}
        projectAreas={projectAreas}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onBackToMap={handleBackToMapFromWorkspace}
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
        onOpenAudit={(asset) => setAuditFormAsset(asset)}
        onBulkUpdateDpStatus={handleWorkspaceBulkDpStatusUpdate}
        onBulkUpdateCablePiaNoi={handleWorkspaceBulkCablePiaNoiUpdate}
        onUpdateDpStatus={handleWorkspaceSingleDpStatusUpdate}
        onClearDpFibreAllocations={handleWorkspaceClearDpFibreAllocations}
        onApplyAddressSheetAssignments={handleWorkspaceAddressSheetAssignments}
        onApplySbRouteAssignments={handleWorkspaceSbRouteAssignments}
        onAutoSpreadStackedHomes={handleAutoSpreadStackedHomes}
        onExport={handleExportGeoJson}
        onUpdateWorkspaceAsset={(asset) => {
          void persistMapAssetImmediately(asset, {
            reason: "workspace-asset-update",
            source: "project-workspace",
          });
        }}
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
          EXCHANGE SIDE PANEL
          Opens when a ⭐ exchange marker is clicked.
          ===================================================== */}

      <div
        style={{
          ...panel,
          position: "absolute",
          top: isMobile ? "calc(env(safe-area-inset-top, 0px) + 78px)" : 0,
          left: 0,
          width: "360px",
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100% - env(safe-area-inset-top, 0px) - 78px)" : "100%",
          zIndex: 1500,
          overflowY: "auto",
          background: "#1f2937",
          boxSizing: "border-box",
          borderRight: "1px solid #374151",
          transform: isPanelOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 0.3s ease",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Assets Panel
            </div>
            <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeProjectArea ? activeProjectArea.name || "Selected area" : "Whole network"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPanelOpen(false)}
            style={{ ...btnSecondary, marginLeft: "auto", flexShrink: 0 }}
          >
            × Close
          </button>
        </div>


        <AdminPanels
          isAdmin={isAdmin}
          card={card}
          sectionSummary={sectionSummary}
          sectionBody={sectionBody}
          btnSecondary={btnSecondary}
          btnDanger={btnDanger}
          activeProjectArea={activeProjectArea}
          currentEditingAsset={currentEditingAsset}
          polygonBulkSelectEnabled={polygonBulkSelectEnabled}
          selectedPolygonCount={selectedPolygonIds.length}
          onTogglePolygonBulkSelect={() =>
            setPolygonBulkSelectEnabled((value) => !value)
          }
          onSelectVisiblePolygons={handleAdminSelectVisiblePolygons}
          onSelectImportedPolygons={handleAdminSelectImportedPolygons}
          onSelectAllPolygons={handleAdminSelectAllPolygons}
          onClearPolygonSelection={handleAdminClearPolygonSelection}
          onRemoveImportedAreas={handleAdminRemoveImportedAreas}
          onRemoveSelectedPolygons={handleAdminRemoveSelectedPolygons}
          onRemoveSelectedPolygon={handleAdminRemoveSelectedPolygon}
          onRemoveAllPolygons={handleAdminRemoveAllPolygons}
          onRemoveImportedDistributionPoints={handleAdminRemoveImportedDistributionPoints}
          onSetAllPolygonsToL3={handleAdminSetAllPolygonsToL3}
          onRepairAreaStamps={handleAdminRepairAreaStamps}
          onDeletePiaOverlayForActiveProject={
            handleDeletePiaOverlayForActiveProject
          }
          onDeleteAllOrReferenceAssets={handleAdminDeleteAllOrReferenceAssets}
          onWipePostgisMapData={handleAdminWipePostgisMapData}
        />

        {activeProjectArea && canOpenFullProjectWorkspace && (
          <button
            type="button"
            onClick={() => {
              if (!canOpenFullProjectWorkspace) {
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

        {canUseSurveyTools && isAdmin && (
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
                onClick={handleAdminToggleSurveyDeleteHomesMode}
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
                  onClick={handleAdminDeleteSelectedSurveyHomes}
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
                  {mainMapQaMode === "piaQa" ? (
                    <>
                      <div style={{ ...label, marginTop: 10 }}>
                        PIA NOI Number
                      </div>
                      <input
                        value={cablePiaNoiNumber}
                        onChange={(e) => setCablePiaNoiNumber(e.target.value)}
                        style={input}
                        placeholder="e.g. NOI-123456"
                      />
                    </>
                  ) : null}

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

              {isEditingReferenceAsset ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    border: "1px solid #7c3aed",
                    borderRadius: 10,
                    background: "rgba(124,58,237,0.12)",
                    color: "#ddd6fe",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Read-only reference asset</strong> — location and core
                  Openreach details stay locked. Build photos, PIA photos, QA
                  checks and notes can be saved against this asset.
                </div>
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
                visibleLayers={visibleLayers}
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
                  {isJointAsset(currentEditingAsset) ? (
                    <button
                      onClick={() =>
                        currentEditingAsset && onOpenJoint(currentEditingAsset)
                      }
                      style={{ ...btnPrimary, marginTop: 10 }}
                    >
                      Open Joint Editor
                    </button>
                  ) : null}

                  {isStreetCabAsset(currentEditingAsset) ? (
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

                  {isDistributionPointAsset(currentEditingAsset) ? (
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
                      onClick={() => setMapMode("drive-to-location")}
                      style={mapMode === "drive-to-location" ? btnPrimary : btnSecondary}
                    >
                      Drive To Location
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
                  <button
                    onClick={() =>
                      isEditingReferenceAsset
                        ? handleSaveReferenceAssetEvidence()
                        : handleSaveEdits()
                    }
                    style={btnPrimary}
                  >
                    {isEditingReferenceAsset ? "Save Evidence" : "Save Changes"}
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

              {mapMode === "drive-to-location" ? (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid #334155",
                    color: "#bfdbfe",
                    fontSize: 12,
                  }}
                >
                  Click a point on the map to open Google Maps directions.
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

        {isAdmin && (
          <ImportExportPanel
            isLoadingOsmHomes={isLoadingOsmHomes}
            isLoadingProjectHomes={isLoadingProjectHomes}
            onImportJson={handleImportJson}
            onExportJson={handleExportJson}
            onExportGeoJson={handleExportGeoJson}
            onLoadOsmHomes={handleLoadOsmHomes}
            onLoadAnyGeoJsonMapAssets={loadAnyGeoJsonMapAssets}
            cardStyle={card}
            sectionSummaryStyle={sectionSummary}
            sectionBodyStyle={sectionBody}
            labelStyle={label}
            primaryButtonStyle={btnPrimary}
            secondaryButtonStyle={btnSecondary}
          />
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
          zoomControl={false}
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
            assets={engineeringDrawingSnapCandidateAssets}
            snapEnabled={snapEnabled}
            onPick={setPickedLocation}
            onMeasurePoint={(point) =>
              setMeasurePoints((prev) => [...prev, point])
            }
            onCablePoint={handleCablePoint}
            onCablePreviewPoint={(point) => {
              setDrawCablePreviewPoint(
                mapMode === "draw-cable" && draftCablePoints.length > 0
                  ? point
                  : null,
              );
            }}
            onAreaPoint={handleAreaPoint}
            onDriveToLocation={handleDriveToLocation}
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
            assets={mapMode === "draw-cable" ? engineeringDrawingAssets : renderProjectAssetsWithSpatial}
            visibleLayers={visibleLayers}
            highlightedAssetId={highlightedSearchAssetId}
            highlightPostgisAssets={highlightPostgisAssets}
            cableDrawingMode={mapMode === "draw-cable"}
            onCablePointAsset={handleCableAssetPoint}
            onOpenAsset={(asset) => {
              if (isSpatialApiAsset(asset) && !isPostgisOnlyMapMode) {
                alert("This asset is loaded read-only from the spatial API.");
                return;
              }

              const routedKind = getAssetKind(asset);

              // WORKSPACE WIRING:
              // Open operational editors directly where possible.
              // This deliberately does not touch storage, cable drawing, drops, AFN/MDU logic,
              // or Firestore chunk persistence.
              if (routedKind === "joint") {
                onOpenJoint(asset);
                return;
              }

              if (routedKind === "street-cab") {
                setOpenStreetCabAsset(asset);
                return;
              }

              if (routedKind === "distribution-point") {
                setOpenDistributionPointAsset(asset);
                setShowDpModal(false);
                setIsPanelOpen(false);
                return;
              }

              handleEditAsset(asset);
              setIsPanelOpen(true);
            }}
            onOpenAudit={(asset) => setAuditFormAsset(asset)}
            onDeleteAsset={(id) => {
              if (id.startsWith("postgis:") && !isPostgisOnlyMapMode) return;
              handleAdminDeleteAsset(id);
            }}
            onEditAsset={(asset) => {
              if (isSpatialApiAsset(asset) && !isPostgisOnlyMapMode) {
                alert("This asset is loaded read-only from the spatial API.");
                return;
              }

              // Keep Edit Details as metadata editing.
              // The dedicated DP Operations editor is opened via the map Open/Operations path
              // and the side-panel "Open DP Operations Editor" button.
              // Do not route Edit Details into DistributionPointEditor.
              handleEditAsset(asset);
              setIsPanelOpen(true);
            }}
            canAuditJoints={!isMaintenanceUser}
            canDeleteAssets={isAdmin}
            canMoveJoints={isAdmin}
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
              const beforeLegacyId = String((beforeAsset as any)?.legacyAssetId || "").trim();
              const matchesMovedAssetId = (asset: SavedMapAsset) =>
                asset.id === id ||
                (beforeLegacyId && asset.id === beforeLegacyId) ||
                String((asset as any).legacyAssetId || "") === id;
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
              const movedHomeKeySet = movedAsset
                ? getHomeKeySet([movedAsset])
                : new Set<string>();
              const connectedDpId = beforeAsset
                ? getAssignedDpId(beforeAsset)
                : "";
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
                if (!isMovedHome || movedHomeKeySet.size === 0) {
                  return false;
                }

                return isDropCableRelatedToHomeKeys(asset, movedHomeKeySet);
              };

              setSavedJoints((prev) => {
                let foundInSavedJoints = false;

                const updated = (prev ?? [])
                  .filter(
                    (asset) => !shouldRemoveExistingDropForMovedHome(asset),
                  )
                  .map((asset) => {
                    if (!matchesMovedAssetId(asset)) return asset;
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

              if (movedAsset && beforeAsset?.assetType !== "home") {
                saveMapAssetToState(movedAsset, { isNew: false });
              }

              if (beforeAsset?.assetType === "home") {
                const updatedProjectHomes = (projectHomes ?? []).map((home) => {
                  if (!matchesMovedAssetId(home)) return home;
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

          {visibleLayers.liveUsers ? (
            <LiveUsersLayer
              users={liveUsers}
              currentUid={profile?.uid}
            />
          ) : null}

          {visibleLayers.areas && (
            <AreaPolygonsLayer
              areas={renderAreaAssetsWithSpatial.filter((asset) =>
                isAreaVisibleForLevel(asset, visibleLayers),
              )}
              activeProjectId={activeProjectId}
              highlightPostgisAssets={highlightPostgisAssets}
              editingAreaId={isAdmin ? editingAreaId : null}
              polygonEditingEnabled={isAdmin && polygonBulkSelectEnabled}
              polygonBulkSelectEnabled={isAdmin && polygonBulkSelectEnabled}
              selectedAreaIds={selectedPolygonIds}
              onUnlockPolygon={isAdmin ? setEditingAreaId : undefined}
              onSelect={handleSelectProject}
              onToggleSelect={isAdmin ? togglePolygonBulkSelection : undefined}
              onEdit={handleEditAsset}
              onDelete={handleAdminDeleteAsset}
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
            onSelectReferenceAsset={(asset) => {
              if (mapMode === "draw-cable") {
                handleCableAssetPoint(asset as SavedMapAsset);
                return;
              }

              setSelectedReferenceDuctId(null);
              handleEditAsset(asset);
              setHighlightedSearchAssetId(asset.id);
              handleZoomToAsset(asset);
              window.setTimeout(() => {
                setHighlightedSearchAssetId((currentId) =>
                  currentId === asset.id ? null : currentId,
                );
              }, 3500);
            }}
          />

          {/* OR / PIA assets are rendered read-only by OpenreachOverlayLayer above.
              Do not render fallback editable Leaflet markers here, otherwise
              Openreach poles/chambers appear as blue editable map pins. */}

          <CableLinesLayer
            assets={mapMode === "draw-cable" ? engineeringDrawingAssets : renderProjectAssetsWithExchangesAndSpatial}
            endpointAssetOptions={engineeringDrawingSourceAssets}
            cablesVisible={visibleLayers.cables}
            visibleLayers={visibleLayers}
            showCableDistances={visibleLayers.cableDistances}
            cableDrawingMode={mapMode === "draw-cable"}
            highlightPostgisAssets={highlightPostgisAssets}
            onDeleteAsset={(id) => {
              if (id.startsWith("postgis:") && !isPostgisOnlyMapMode) return;
              handleAdminDeleteAsset(id);
            }}
            onEditAsset={(asset) => {
              if (isSpatialApiAsset(asset) && !isPostgisOnlyMapMode) {
                alert("This cable is loaded read-only from the spatial API.");
                return;
              }
              handleEditAsset(asset);
            }}
            onUpdateAsset={(asset) => {
              if (isSpatialApiAsset(asset) && !isPostgisOnlyMapMode) return;
              saveMapAssetToState(asset, {
                isNew: false,
                message: "Cable endpoints updated.",
              });
            }}
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

          {mapMode === "draw-cable" &&
            draftCablePoints.length > 0 &&
            drawCablePreviewPoint && (
              <Polyline
                key="draft-cable-live-preview"
                positions={[
                  ...draftCablePoints.map(
                    (p) => [p.lat, p.lng] as [number, number],
                  ),
                  [drawCablePreviewPoint.lat, drawCablePreviewPoint.lng] as [
                    number,
                    number,
                  ],
                ]}
                pathOptions={{
                  color: "#38bdf8",
                  weight: 5,
                  dashArray: "8, 8",
                  opacity: 0.85,
                }}
                interactive={false}
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

        {showSpatialDebugControls ? (
          <SpatialApiStatusPanel
            enabled={spatialViewport.enabled}
            loading={spatialViewport.loading}
            count={spatialViewport.count}
            truncated={spatialViewport.truncated}
            error={spatialViewport.error}
          />
        ) : null}

        {showSpatialDebugControls && spatialViewport.enabled ? (
          <DataSourceTogglePanel
            showFirebaseAssets={showFirebaseAssets}
            showPostgisAssets={showPostgisAssets}
            highlightPostgisAssets={highlightPostgisAssets}
            postgisOnly={isPostgisOnlyMapMode}
            onShowFirebaseAssetsChange={setShowFirebaseAssets}
            onShowPostgisAssetsChange={setShowPostgisAssets}
            onHighlightPostgisAssetsChange={setHighlightPostgisAssets}
          />
        ) : null}

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

        <MapAssetAuditFormOverlay
          asset={auditFormAsset}
          areaName={activeProjectAreaName || activeProjectArea?.name || assetSearchScopeLabel}
          projectId={activeProjectId}
          onClose={() => setAuditFormAsset(null)}
        />
      </div>

      <LayerControls
        isOpen={isLayersOpen}
        qaMode={mainMapQaMode}
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
        isDrivingToLocation={mapMode === "drive-to-location"}
        onStartMeasurement={() => setMapMode("measure")}
        onStopMeasurement={() => setMapMode("pick")}
        onUndoMeasurementPoint={handleUndoMeasurementPoint}
        onClearMeasurements={handleClearMeasurement}
        onStartDriveToLocation={() => setMapMode("drive-to-location")}
        onStopDriveToLocation={() => setMapMode("pick")}
        onClose={() => setIsLayersOpen(false)}
      />

      {!showMaintenancePanel && !isFieldResponsiveMode && (
        <MapToolbar
          showAssetPanelButton={!isPanelOpen}
          onOpenAssetPanel={() => setIsPanelOpen(true)}
          qaMode={mainMapQaMode}
          onQaModeChange={handleMainMapQaModeChange}
          searchQuery={assetSearchQuery}
          setSearchQuery={setAssetSearchQuery}
          searchResults={assetSearchResults}
          selectedAssetId={editingAssetId}
          searchScopeLabel={assetSearchScopeLabel}
          onSearchSubmit={handleAssetSearchSubmit}
          onSelectSearchResult={selectAssetSearchResult}
          isSearchFocused={isAssetSearchFocused}
          setIsSearchFocused={setIsAssetSearchFocused}
          onGpsLocate={handleGpsLocate}
          isSharingLocation={isSharingLocation}
          liveUserCount={liveUsers.length}
          locationShareError={locationShareError}
          onToggleLocationSharing={() =>
            setIsSharingLocation((enabled) => !enabled)
          }
          isLayersOpen={isLayersOpen}
          onToggleLayers={() => setIsLayersOpen(!isLayersOpen)}
          areaKey={activeProjectId}
          areaName={assetSearchScopeLabel}
          projectAreas={projectAreas}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onClearProject={() => {
            activeProjectIdRef.current = null;
            setActiveProjectId(null);
            saveMapView({ activeProjectId: null });
          }}
        />
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
          isSharingLocation={isSharingLocation}
          liveUserCount={liveUsers.length}
          onToggleLocationSharing={() =>
            setIsSharingLocation((enabled) => !enabled)
          }
          onToggleMoveHomes={handleToggleMoveHomesMode}
          onToggleDeleteHomes={handleAdminToggleSurveyDeleteHomesMode}
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
          onToggleDeleteHomes={handleAdminToggleSurveyDeleteHomesMode}
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
          onToggleDeleteHomes={handleAdminToggleSurveyDeleteHomesMode}
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
                handleAdminToggleSurveyDeleteHomesMode();
              }
            }}
          />
        )}

      {openDistributionPointAsset && (
        <div
          style={mobileEditorOverlayStyle(isMobile)}
        >
          <DistributionPointEditor
            asset={openDistributionPointAsset}
            allAssets={allMapAssets}
            onClose={() => {
              setOpenDistributionPointAsset(null);
              if (activeProjectArea && canOpenFullProjectWorkspace) {
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

              void persistMapAssetImmediately(updatedAsset, {
                reason: "dp-routing-save",
                source: "distribution-point-editor",
                successMessage: "DP routing saved.",
              }).then(setOpenDistributionPointAsset);
            }}
          />
        </div>
      )}

      {openStreetCabAsset && (
        <div
          style={mobileEditorOverlayStyle(isMobile)}
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
            ...mobileEditorOverlayStyle(isMobile),
            overflow: "hidden",
            paddingBottom: 0,
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
// STYLES: DRAWER / TOP MAP ACTIONS
// =====================================================
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

function mobileEditorOverlayStyle(isMobile: boolean): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 3000,
    background: "#0f172a",
    height: "100dvh",
    maxHeight: "100dvh",
    overflowY: "auto",
    overflowX: isMobile ? "hidden" : "hidden",
    overscrollBehavior: "contain",
    paddingBottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 92px)" : "96px",
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
  };
}

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "0.95rem",
};
