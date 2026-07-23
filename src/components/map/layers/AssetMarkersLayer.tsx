import React, { useMemo, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { getPaddedRenderBounds, isLatLngInsideRenderBounds } from "../utils/renderBounds";
import type { SavedMapAsset } from "../types";
import { getAssetTypeLabel } from "../../../utils/assetDisplay";
import {
  getPiaQaIconForAsset,
  getPiaQaStatusLabel,
  isPiaQaModeEnabled,
  shouldShowAssetForPiaQaFilters,
} from "../pia/piaQaWorkflow";
import {
  getAuditButtonLabel,
  hasAuditFormTemplate,
} from "../audit/mapAuditButton";
import {
  clusterHomeAssets,
  createHomeClusterIcon,
  createHomeStackIcon,
  getHomeClusterBounds,
  getHomeDisplayName,
  groupStackedHomeAssets,
  HOME_STACK_DISTANCE_METERS,
} from "./homeMarkerClusters";
import {
  buildParentSbPopupSummary,
  getDpUsage,
  getPrimaryManualSbRouteForDp,
  type ParentSbPopupSummary,
} from "./dpPopupSummary";
import {
  infoRow,
  renderDocuments,
  renderImagePreview,
  renderPhotoStrip,
} from "./assetPopupRenderHelpers";
import {
  getDailyProgressTeamColour,
  getDailyProgressTotals,
} from "../../Project/workspace/workspaceOperations";

type LayerVisibility = {
  agJoints: boolean;
  cmjJoints?: boolean;
  midjJoints?: boolean;
  mmjJoints?: boolean;
  lmjJoints?: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  ohDpJoints?: boolean;
  ugDpJoints?: boolean;
  chambers: boolean;
  cables: boolean;
  measurements: boolean;
  homes?: boolean;
  homesConnected?: boolean;
  homesUnconnected?: boolean;
  homesLive?: boolean;
  homesNotLive?: boolean;
  homesSdu?: boolean;
  homesMdu?: boolean;
  newPoles?: boolean;
  orPoles?: boolean;
  suggestedPoles?: boolean;
  orChambers?: boolean;
  suggestedChambers?: boolean;
  fw2?: boolean;
  fw4?: boolean;
  fw6?: boolean;
  fw10?: boolean;
  live?: boolean;
  bwip?: boolean;
  unserviceable?: boolean;
  liveNotReady?: boolean;
  piaContractorView?: boolean;
  piaQaView?: boolean;
  piaNotStarted?: boolean;
  piaPhotosUploaded?: boolean;
  piaContractorPass?: boolean;
  piaPleaseReview?: boolean;
  piaPass?: boolean;
  piaFail?: boolean;
};

type HomeMarkerStatus =
  | "unconnected"
  | "connected"
  | "live"
  | "exception";

type Props = {
  assets: SavedMapAsset[];
  visibleLayers: LayerVisibility;
  highlightedAssetId?: string | null;
  cableDrawingMode?: boolean;
  measurementMode?: boolean;
  onCablePointAsset?: (asset: SavedMapAsset) => void;
  onMeasurePointAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset: (asset: SavedMapAsset) => void;
  onOpenAudit?: (asset: SavedMapAsset) => void;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: SavedMapAsset) => void;
  canAuditJoints?: boolean;
  canDeleteAssets?: boolean;
  canMoveJoints?: boolean;
  onMoveAsset?: (id: string, lat: number, lng: number) => void;
  assetMovementEnabled?: boolean;
  activeMoveAssetId?: string;
  moveHomesMode?: boolean;
  surveyDeleteHomesMode?: boolean;
  selectedSurveyDeleteHomeIds?: string[];
  onToggleSurveyDeleteHome?: (asset: SavedMapAsset) => void;
  selectedMoveHomeIds?: string[];
  onToggleMoveHome?: (asset: SavedMapAsset) => void;
  onMoveHomesTargetDp?: (asset: SavedMapAsset) => void;
};

function createSquareIcon(background: string, border: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: ${background};
        border: 2px solid ${border};
        box-sizing: border-box;
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function createWifiSignalIcon(fill: string, border = "#111827", glow = "rgba(15, 23, 42, 0.35)") {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        transform: translateY(-1px);
        filter: drop-shadow(0 0 8px ${glow});
      ">
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3.25 8.4C8.1 4 15.9 4 20.75 8.4"
            fill="none"
            stroke="${border}"
            stroke-width="4.4"
            stroke-linecap="round"
          />
          <path
            d="M7 12.1c2.8-2.5 7.2-2.5 10 0"
            fill="none"
            stroke="${border}"
            stroke-width="4.4"
            stroke-linecap="round"
          />
          <path
            d="M10.1 15.8c1.1-.9 2.7-.9 3.8 0"
            fill="none"
            stroke="${border}"
            stroke-width="4.4"
            stroke-linecap="round"
          />
          <circle cx="12" cy="19.3" r="3.1" fill="${border}" />
          <path
            d="M3.25 8.4C8.1 4 15.9 4 20.75 8.4"
            fill="none"
            stroke="${fill}"
            stroke-width="2.7"
            stroke-linecap="round"
          />
          <path
            d="M7 12.1c2.8-2.5 7.2-2.5 10 0"
            fill="none"
            stroke="${fill}"
            stroke-width="2.7"
            stroke-linecap="round"
          />
          <path
            d="M10.1 15.8c1.1-.9 2.7-.9 3.8 0"
            fill="none"
            stroke="${fill}"
            stroke-width="2.7"
            stroke-linecap="round"
          />
          <circle
            cx="12"
            cy="19.3"
            r="2"
            fill="${fill}"
            stroke="${border}"
            stroke-width="1.1"
          />
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function createCircleIcon(background: string, border: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: ${background};
        border: 2px solid ${border};
        border-radius: 50%;
        box-sizing: border-box;
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function createHomeIcon(fill = "#94a3b8", border = "#111827", glow = "rgba(15, 23, 42, 0.35)") {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        transform: translateY(-1px);
        filter: drop-shadow(0 0 7px ${glow});
      ">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 10.6 12 3l9 7.6"
            fill="none"
            stroke="${border}"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M5.5 10.2V21h13V10.2L12 4.8 5.5 10.2Z"
            fill="${fill}"
            stroke="${border}"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M10 21v-6h4v6"
            fill="#f8fafc"
            stroke="${border}"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}


function normaliseStatus(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function getDistributionPointStatus(asset: SavedMapAsset): string {
  return normaliseStatus(
    (asset as any).status ||
      (asset as any).buildStatus ||
      asset.dpDetails?.buildStatus ||
      (asset.dpDetails as any)?.status
  );
}

function getDistributionPointColor(asset: SavedMapAsset): string {
  const status = getDistributionPointStatus(asset);

  if (status === "live") return "#16a34a";
  if (status === "bwip") return "#f59e0b";
  if (status === "unserviceable") return "#dc2626";
  if (status === "live_not_ready" || status === "live_not_ready_for_service") return "#7c3aed";

  return "#111111";
}

function getAssetLayerText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.assetType,
    item.type,
    item.jointType,
    item.name,
    item.jointName,
    item.label,
    item.installMethod,
    item.routeType,
    item.dpType,
    item.closureType,
    item.dpDetails?.closureType,
    item.dpDetails?.installMethod,
    item.dpDetails?.mounting,
    item.dpDetails?.locationType,
    item.dpDetails?.networkType,
    item.properties?.installMethod,
    item.properties?.routeType,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function isUndergroundDpAsset(asset: SavedMapAsset): boolean {
  const text = getAssetLayerText(asset);
  return (
    text.includes("underground") ||
    text.includes(" duct") ||
    text.includes(" ug ") ||
    text.includes("-ug") ||
    text.includes("ug-") ||
    text.endsWith(" ug")
  );
}

function jointSubtypeVisible(asset: SavedMapAsset, layers: any): boolean {
  const text = getAssetLayerText(asset);
  if (text.includes("midj")) return layers.midjJoints !== false;
  if (text.includes("mmj")) return layers.mmjJoints !== false;
  if (text.includes("lmj")) return layers.lmjJoints !== false;
  if (text.includes("cmj")) return layers.cmjJoints !== false;
  return true;
}

function getHomeLayerType(asset: SavedMapAsset): "sdu" | "mdu" {
  const raw = String(
    (asset as any).homeType ||
      (asset as any).propertyType ||
      (asset as any).buildingType ||
      (asset as any).building ||
      (asset as any).tags?.building ||
      asset.notes ||
      asset.name ||
      ""
  ).toLowerCase();

  if (
    raw.includes("flat") ||
    raw.includes("apartment") ||
    raw.includes("mdu") ||
    raw.includes("multi") ||
    raw.includes("residential")
  ) {
    return "mdu";
  }
  return "sdu";
}

function isReadOnlyOpenreachAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const haystack = [
    item.source,
    item.assetType,
    item.jointType,
    item.name,
    item.notes,
    item.description,
    item.piaRef,
    item.importedProperties?.Name,
    item.importedProperties?.name,
    item.importedProperties?.description,
    item.importedProperties?.Description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    item.readOnly === true ||
    haystack.includes("pia-overlay") ||
    haystack.includes("openreach") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:") ||
    haystack.includes("osp:") ||
    haystack.includes("missing pole")
  );
}

function getPointLatLng(asset: SavedMapAsset): [number, number] | null {
  const coordinates = asset.geometry?.coordinates;

  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const lat = Number(coordinates[0]);
    const lng = Number(coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }

  const lat = Number((asset as any).lat);
  const lng = Number((asset as any).lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];

  return null;
}

function isEngineeringCableDrawTargetAsset(asset: SavedMapAsset): boolean {
  const assetType = String((asset as any).assetType || "").toLowerCase();
  const jointType = String((asset as any).jointType || "").toLowerCase();
  const name = String((asset as any).name || "").toLowerCase();

  // Cable drawing must keep every valid network endpoint visible/selectable.
  // Previously this only returned joints, which made DPs/SBs and poles vanish
  // as soon as cable drawing started.
  if (assetType === "distribution-point" || assetType === "dp") return true;
  if (assetType === "pole") return true;
  if (assetType === "chamber") return true;
  if (assetType === "street-cab") return true;
  if (assetType === "ag-joint" || assetType === "joint" || assetType.includes("joint")) return true;
  if (jointType.includes("joint")) return true;

  return (
    name.includes("sb") ||
    name.includes("cmj") ||
    name.includes("mmj") ||
    name.includes("lmj") ||
    name.includes("midj")
  );
}


const streetCabIcon = createSquareIcon("#2563eb", "#ffffff");
const chamberIcon = createSquareIcon("#6b7280", "#ffffff");
const agJointIcon = createCircleIcon("#10b981", "#ffffff");
const poleIcon = createCircleIcon("#8b5a2b", "#ffffff");

function isVisible(asset: SavedMapAsset, visibleLayers: LayerVisibility): boolean {
  const layers = visibleLayers as any;

  switch (asset.assetType) {
    case "street-cab":
      return visibleLayers.streetCabs;

    case "pole": {
      if (!visibleLayers.poles) return false;

      const poleType = String(
        (asset as any).poleType ||
          asset.poleDetails?.poleType ||
          (asset.poleDetails as any)?.type ||
          (asset.poleDetails as any)?.status ||
          asset.notes ||
          asset.name ||
          ""
      ).toLowerCase();

      if (poleType.includes("suggested") && layers.suggestedPoles === false) return false;
      if ((poleType.includes("new") || poleType.includes("proposed")) && layers.newPoles === false) return false;
      if ((poleType.includes("or") || poleType.includes("existing")) && layers.orPoles === false) return false;
      if (!shouldShowAssetForPiaQaFilters(asset, layers)) return false;

      return true;
    }

    case "distribution-point": {
      if (!visibleLayers.distributionPoints) return false;
      const isUg = isUndergroundDpAsset(asset);
      if (isUg && layers.ugDpJoints === false) return false;
      if (!isUg && layers.ohDpJoints === false) return false;

      const status = getDistributionPointStatus(asset);
      if (status === "live" && layers.live === false) return false;
      if (status === "bwip" && layers.bwip === false) return false;
      if (status === "unserviceable" && layers.unserviceable === false) return false;
      if ((status === "live_not_ready" || status === "live_not_ready_for_service") && layers.liveNotReady === false) return false;

      return true;
    }

    case "chamber": {
      if (!visibleLayers.chambers) return false;

      const chamberType = String(
        asset.chamberDetails?.chamberType ||
          (asset as any).chamberType ||
          asset.chamberDetails?.size ||
          asset.notes ||
          asset.name ||
          ""
      ).toLowerCase();

      if (chamberType.includes("suggested") && layers.suggestedChambers === false) return false;
      if (chamberType.includes("or") && layers.orChambers === false) return false;
      if (chamberType.includes("fw2") && layers.fw2 === false) return false;
      if (chamberType.includes("fw4") && layers.fw4 === false) return false;
      if (chamberType.includes("fw6") && layers.fw6 === false) return false;
      if (chamberType.includes("fw10") && layers.fw10 === false) return false;
      if (!shouldShowAssetForPiaQaFilters(asset, layers)) return false;

      return true;
    }

    case "home": {
      if (visibleLayers.homes === false) return false;

      const homeType = getHomeLayerType(asset);
      if (homeType === "mdu") return layers.homesMdu !== false;
      return layers.homesSdu !== false;
    }

    case "cable":
      return false;

    case "ag-joint":
    default:
      if (!visibleLayers.agJoints) return false;
      if (!jointSubtypeVisible(asset, layers)) return false;
      {
        const isUg = isUndergroundDpAsset(asset);
        if (isUg && layers.ugDpJoints === false) return false;
        if (!isUg && layers.ohDpJoints === false) return false;
      }
      return true;
  }
}

function isDropCable(asset: SavedMapAsset): boolean {
  return (
    asset.assetType === "cable" &&
    String((asset as any).cableType || "").trim().toLowerCase() === "drop"
  );
}

function getHomeConnectionStatus(
  home: SavedMapAsset,
  allAssets: SavedMapAsset[]
): Exclude<HomeMarkerStatus, "exception"> {
  const ownStatus = normaliseStatus(
    (home as any).customerStatus ||
      (home as any).homeStatus ||
      (home as any).status ||
      (home as any).buildStatus
  );

  if (ownStatus === "live") return "live";

  // A home can be connected either by an actual drop-cable record OR by
  // metadata stamped when auto-drop generation runs. Keep both paths so the
  // popup/icon stays correct even if legacy/hidden drops are being cleaned up.
  const metadataConnection = String((home as any).connection || "").toLowerCase();
  if ((home as any).connectedDpId || metadataConnection === "connected") {
    return "connected";
  }

  const drop = allAssets.find(
    (asset) =>
      isDropCable(asset) &&
      (((asset as any).fromAssetId === home.id) || ((asset as any).toAssetId === home.id))
  );

  if (!drop) return "unconnected";

  const dropStatus = normaliseStatus(
    (drop as any).customerStatus || (drop as any).homeStatus || (drop as any).status
  );

  return dropStatus === "live" ? "live" : "connected";
}

const homeLiveIcon = createHomeIcon("#16a34a", "#064e3b", "rgba(22, 163, 74, 0.85)");
const homeConnectedIcon = createHomeIcon("#f59e0b", "#92400e", "rgba(245, 158, 11, 0.85)");
const homeUnconnectedIcon = createHomeIcon("#ef4444", "#7f1d1d", "rgba(239, 68, 68, 0.95)");
const homeExceptionIcon = createHomeIcon("#a855f7", "#581c87", "rgba(168, 85, 247, 0.95)");
const homeMoveSelectedIcon = createHomeIcon("#38bdf8", "#075985");
const homePositionMoveIcon = createHomeIcon("#38bdf8", "#075985", "rgba(56, 189, 248, 0.95)");

function getHomeServiceStatus(home: SavedMapAsset): string {
  return normaliseStatus(
    (home as any).serviceStatus ||
      (home as any).properties?.serviceStatus ||
      "",
  );
}

function hasHomeServiceException(home: SavedMapAsset): boolean {
  const status = getHomeServiceStatus(home);
  return Boolean(status && status !== "serviceable");
}

function formatHomeServiceStatus(home: SavedMapAsset): string {
  const status = getHomeServiceStatus(home);
  if (status === "needsdpmove" || status === "needs_dp_move") return "Needs DP move";
  if (status === "needssurvey" || status === "needs_survey") return "Needs survey";
  if (status === "treecutting" || status === "tree_cutting") return "Tree cutting required";
  if (status === "wayleaveneeded" || status === "wayleave_needed") return "Wayleave needed";
  if (status === "noaccess" || status === "no_access") return "No access";
  if (status === "blocked") return "Blocked";
  if (status === "other") return "Other";
  return status ? status.replace(/_/g, " ") : "Serviceable";
}

function getHomeIconForStatus(status: HomeMarkerStatus) {
  if (status === "exception") return homeExceptionIcon;
  if (status === "live") return homeLiveIcon;
  if (status === "connected") return homeConnectedIcon;
  return homeUnconnectedIcon;
}

function getHomeConnectedDp(home: SavedMapAsset, allAssets: SavedMapAsset[]): SavedMapAsset | null {
  const manualDpId = String((home as any).connectedDpId || "");
  if (manualDpId) {
    return allAssets.find(
      (asset) => asset.assetType === "distribution-point" && asset.id === manualDpId
    ) || null;
  }

  const drop = allAssets.find(
    (asset) =>
      isDropCable(asset) &&
      (((asset as any).fromAssetId === home.id) || ((asset as any).toAssetId === home.id))
  );

  if (!drop) return null;

  const dpId =
    (drop as any).fromAssetId === home.id
      ? (drop as any).toAssetId
      : (drop as any).fromAssetId;

  return allAssets.find(
    (asset) => asset.assetType === "distribution-point" && asset.id === dpId
  ) || null;
}

function getDistributionPoints(allAssets: SavedMapAsset[]): SavedMapAsset[] {
  return allAssets
    .filter((asset) => asset.assetType === "distribution-point")
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}


type HomeRenderIndexes = {
  homeStatusById: Map<string, HomeMarkerStatus>;
  connectedDpByHomeId: Map<string, SavedMapAsset | null>;
};

function getDropEndpointIds(drop: any): { fromId: string; toId: string } {
  return {
    fromId: String(drop?.fromAssetId || drop?.fromId || drop?.sourceAssetId || drop?.sourceId || "").trim(),
    toId: String(drop?.toAssetId || drop?.toId || drop?.targetAssetId || drop?.targetId || "").trim(),
  };
}

function buildHomeRenderIndexes(allAssets: SavedMapAsset[]): HomeRenderIndexes {
  const homeIds = new Set<string>();
  const dpById = new Map<string, SavedMapAsset>();
  const liveDropHomeIds = new Set<string>();
  const connectedDpIdByHomeId = new Map<string, string>();

  allAssets.forEach((asset) => {
    if (asset.assetType === "home") {
      homeIds.add(asset.id);
      return;
    }

    if (asset.assetType === "distribution-point") {
      dpById.set(asset.id, asset);
      return;
    }
  });

  allAssets.forEach((asset) => {
    if (!isDropCable(asset)) return;

    const { fromId, toId } = getDropEndpointIds(asset as any);
    if (!fromId || !toId) return;

    const fromIsHome = homeIds.has(fromId);
    const toIsHome = homeIds.has(toId);
    const fromIsDp = dpById.has(fromId);
    const toIsDp = dpById.has(toId);

    const homeId = fromIsHome ? fromId : toIsHome ? toId : "";
    const dpId = fromIsDp ? fromId : toIsDp ? toId : "";
    if (!homeId) return;

    if (dpId && !connectedDpIdByHomeId.has(homeId)) {
      connectedDpIdByHomeId.set(homeId, dpId);
    }

    const dropStatus = normaliseStatus(
      (asset as any).customerStatus || (asset as any).homeStatus || (asset as any).status,
    );

    if (dropStatus === "live") {
      liveDropHomeIds.add(homeId);
    }
  });

  const homeStatusById = new Map<string, HomeMarkerStatus>();
  const connectedDpByHomeId = new Map<string, SavedMapAsset | null>();

  allAssets.forEach((asset) => {
    if (asset.assetType !== "home") return;

    const ownStatus = normaliseStatus(
      (asset as any).customerStatus ||
        (asset as any).homeStatus ||
        (asset as any).status ||
        (asset as any).buildStatus ||
        (asset as any).serviceStatus ||
        (asset as any).properties?.status ||
        (asset as any).properties?.buildStatus ||
        (asset as any).properties?.serviceStatus,
    );

    const manualDpId = String((asset as any).connectedDpId || "").trim();
    const metadataConnection = String((asset as any).connection || "").toLowerCase();
    const dropDpId = connectedDpIdByHomeId.get(asset.id) || "";
    const connectedDpId = manualDpId || dropDpId;

    const status = hasHomeServiceException(asset)
      ? "exception"
      : ownStatus === "live" || liveDropHomeIds.has(asset.id)
        ? "live"
        : connectedDpId || metadataConnection === "connected"
          ? "connected"
          : "unconnected";

    homeStatusById.set(asset.id, status);
    connectedDpByHomeId.set(asset.id, connectedDpId ? dpById.get(connectedDpId) || null : null);
  });

  return { homeStatusById, connectedDpByHomeId };
}

function getIconForAsset(
  asset: SavedMapAsset,
  allAssets: SavedMapAsset[],
  visibleLayers?: LayerVisibility,
  cachedHomeStatus?: HomeMarkerStatus,
) {
  if (asset.assetType === "distribution-point") {
    return createWifiSignalIcon(getDistributionPointColor(asset), "#ffffff");
  }
  if (asset.assetType === "street-cab") return streetCabIcon;
  if ((asset.assetType === "chamber" || asset.assetType === "pole") && isPiaQaModeEnabled(visibleLayers || {})) {
    return getPiaQaIconForAsset(asset);
  }
  if (asset.assetType === "chamber") return chamberIcon;
  if (asset.assetType === "pole") return poleIcon;
  if (asset.assetType === "home") return getHomeIconForStatus(cachedHomeStatus || getHomeConnectionStatus(asset, allAssets));
  return agJointIcon;
}

function createHighlightedIcon(baseIcon: L.DivIcon) {
  const html = baseIcon.options.html || "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
      ">
        <div style="
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 4px solid #facc15;
          box-shadow: 0 0 0 6px rgba(250,204,21,0.35), 0 0 26px rgba(250,204,21,0.95);
          animation: alistra-search-pulse 1s ease-in-out infinite;
        "></div>
        <div style="
          position: relative;
          z-index: 2;
        ">
          ${html}
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

function createCableDrawIcon(baseIcon: L.DivIcon) {
  const html = baseIcon.options.html || "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position: relative;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
      ">
        <div style="
          position: absolute;
          inset: 1px;
          border-radius: 999px;
          border: 3px solid #38bdf8;
          box-shadow: 0 0 0 5px rgba(56,189,248,0.25), 0 0 20px rgba(56,189,248,0.85);
          animation: alistra-cable-draw-pulse 1.1s ease-in-out infinite;
        "></div>
        <div style="
          position: relative;
          z-index: 2;
        ">
          ${html}
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

export default function AssetMarkersLayer({
  assets,
  visibleLayers,
  highlightedAssetId,
  cableDrawingMode = false,
  measurementMode = false,
  onCablePointAsset,
  onMeasurePointAsset,
  onOpenAsset,
  onOpenAudit,
  onDeleteAsset,
  onEditAsset,
  canAuditJoints = true,
  canDeleteAssets = true,
  canMoveJoints = true,
  onMoveAsset,
  assetMovementEnabled = false,
  activeMoveAssetId,
  moveHomesMode = false,
  surveyDeleteHomesMode = false,
  selectedMoveHomeIds = [],
  selectedSurveyDeleteHomeIds = [],
  onToggleMoveHome,
  onToggleSurveyDeleteHome,
  onMoveHomesTargetDp,
}: Props) {
  const map = useMap();
  const [mapView, setMapView] = useState(() => ({
    zoom: map.getZoom(),
    bounds: map.getBounds(),
  }));
  const [positionMoveHomeId, setPositionMoveHomeId] = useState<string | null>(null);
React.useEffect(() => {
  if (document.getElementById("alistra-search-pulse-style")) return;

  const style = document.createElement("style");
  style.id = "alistra-search-pulse-style";
  style.innerHTML = `
    @keyframes alistra-search-pulse {
      0% {
        transform: scale(0.75);
        opacity: 0.45;
      }
      50% {
        transform: scale(1.15);
        opacity: 1;
      }
      100% {
        transform: scale(0.75);
        opacity: 0.45;
      }
    }

    @keyframes alistra-cable-draw-pulse {
      0% {
        transform: scale(0.75);
        opacity: 0.45;
      }
      50% {
        transform: scale(1.15);
        opacity: 1;
      }
      100% {
        transform: scale(0.75);
        opacity: 0.45;
      }
    }
  `;

  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}, []);
  const renderBounds = useMemo(() => getPaddedRenderBounds(mapView.bounds), [mapView.bounds]);

  // =====================================================
  // MARKER RENDER INDEXES
  // Build expensive lookup data once per asset change instead of re-scanning
  // the full asset list for every visible marker/popup render.
  // =====================================================
  const distributionPoints = useMemo(() => getDistributionPoints(assets), [assets]);

  const homeRenderIndexes = useMemo(() => buildHomeRenderIndexes(assets), [assets]);
  const homeStatusById = homeRenderIndexes.homeStatusById;
  const homeConnectedDpById = homeRenderIndexes.connectedDpByHomeId;

  useMapEvents({
    moveend: () => setMapView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    zoomend: () => setMapView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    click: (event) => {
      if (!positionMoveHomeId) return;

      onMoveAsset?.(positionMoveHomeId, event.latlng.lat, event.latlng.lng);
      setPositionMoveHomeId(null);
      map.closePopup();
    },
  });

  const pointAssets = useMemo(() => {
  const homesEnabled = visibleLayers.homes !== false;
  const layers = visibleLayers as any;

  return assets.filter((asset) => {
    if (asset.geometry?.type !== "Point") return false;

    const latLng = getPointLatLng(asset);
    if (!latLng) return false;
    if (!isLatLngInsideRenderBounds(latLng, renderBounds)) return false;

    // Openreach / PIA reference assets render in OpenreachOverlayLayer only.
    // They must never appear as editable blue/default map markers here.
    if (isReadOnlyOpenreachAsset(asset)) return false;

    // Engineering drawing mode keeps the global map uncluttered while drawing
    // long feeder/link routes: show only joints as cable snap targets.
    if (cableDrawingMode) {
      return isEngineeringCableDrawTargetAsset(asset);
    }

    // Handle homes separately so SDU/MDU filters don't accidentally hide them.
    if (asset.assetType === "home") {
      if (!homesEnabled) return false;

      const homeStatus = homeStatusById.get(asset.id) || "unconnected";
      const homeNotLive = homeStatus === "unconnected" || homeStatus === "exception";
      if (homeStatus === "live" && layers.homesLive === false) return false;
      if (homeStatus === "connected" && layers.homesConnected === false) return false;
      if (homeStatus === "unconnected" && layers.homesUnconnected === false) return false;
      if (homeNotLive && layers.homesNotLive === false) return false;

      const homeType = getHomeLayerType(asset);
      if (homeType === "mdu" && layers.homesMdu === false) return false;
      if (homeType === "sdu" && layers.homesSdu === false) return false;

      // keep homes visible when zoomed in
      if (mapView.zoom < 10) return false;

      return true;
    }

    // Normal asset visibility
    if (!isVisible(asset, visibleLayers)) return false;

    return true;
  });
}, [assets, visibleLayers, mapView.zoom, renderBounds, homeStatusById, cableDrawingMode]);

  const nonHomePointAssets = useMemo(
    () => pointAssets.filter((asset) => asset.assetType !== "home"),
    [pointAssets]
  );

  const visibleDpAssets = useMemo(
    () => nonHomePointAssets.filter((asset) => asset.assetType === "distribution-point"),
    [nonHomePointAssets],
  );

  const dpUsageById = useMemo(() => {
    const next = new Map<string, ReturnType<typeof getDpUsage>>();
    visibleDpAssets.forEach((dp) => {
      next.set(dp.id, getDpUsage(dp, assets));
    });
    return next;
  }, [visibleDpAssets, assets]);

  const parentSbSummaryById = useMemo(() => {
    const next = new Map<string, ParentSbPopupSummary | null>();
    visibleDpAssets.forEach((dp) => {
      next.set(dp.id, buildParentSbPopupSummary(dp, assets));
    });
    return next;
  }, [visibleDpAssets, assets]);

  const homePointAssets = useMemo(
    () => pointAssets.filter((asset) => asset.assetType === "home"),
    [pointAssets]
  );

  const homeStacks = useMemo(
    () => groupStackedHomeAssets(homePointAssets),
    [homePointAssets]
  );

  const stackedHomeIds = useMemo(
    () => new Set(homeStacks.flatMap((stack) => stack.assets.map((home) => home.id))),
    [homeStacks]
  );

  const nonStackedHomePointAssets = useMemo(
    () => homePointAssets.filter((home) => !stackedHomeIds.has(home.id)),
    [homePointAssets, stackedHomeIds]
  );

  const homeClusters = useMemo(
    () => clusterHomeAssets(nonStackedHomePointAssets, map),
    [nonStackedHomePointAssets, map, mapView.zoom, mapView.bounds]
  );

  const renderAssetMarker = (asset: SavedMapAsset) => {
    const latLng = getPointLatLng(asset);
    if (!latLng) return null;
    const [lat, lng] = latLng;
    const isSelectedMoveHome = moveHomesMode && asset.assetType === "home" && selectedMoveHomeIds.includes(asset.id);
    const isPositionMoveHome = asset.assetType === "home" && positionMoveHomeId === asset.id;
    const isSelectedSurveyDeleteHome = surveyDeleteHomesMode && asset.assetType === "home" && selectedSurveyDeleteHomeIds.includes(asset.id);
    const cachedHomeStatus = asset.assetType === "home" ? homeStatusById.get(asset.id) : undefined;
    const assetTypeText = String(
      (asset as any).assetType ||
        (asset as any).type ||
        (asset as any).jointType ||
        "",
    ).toLowerCase();
    const isJointAsset =
      asset.assetType === "ag-joint" ||
      assetTypeText.includes("joint") ||
      assetTypeText.includes("cmj") ||
      assetTypeText.includes("midj") ||
      assetTypeText.includes("lmj");
    const isMidjAsset = [
      (asset as any).assetType,
      (asset as any).type,
      (asset as any).jointType,
      (asset as any).name,
      (asset as any).jointName,
      (asset as any).label,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ")
      .includes("midj");
    const canShowAuditAction =
      hasAuditFormTemplate(asset) && (canAuditJoints || !isJointAsset);
    const baseIcon = isSelectedSurveyDeleteHome
  ? homeUnconnectedIcon
  : isPositionMoveHome
    ? homePositionMoveIcon
    : isSelectedMoveHome
      ? homeMoveSelectedIcon
      : getIconForAsset(asset, assets, visibleLayers, cachedHomeStatus);

const shouldCableHighlight =
  cableDrawingMode &&
  asset.assetType !== "home" &&
  asset.assetType !== "area";

const icon = asset.id === highlightedAssetId
  ? createHighlightedIcon(baseIcon as L.DivIcon)
  : shouldCableHighlight
    ? createCableDrawIcon(baseIcon as L.DivIcon)
    : baseIcon;
    const connectedDp = asset.assetType === "home" ? homeConnectedDpById.get(asset.id) || null : null;
    const dpUsage = asset.assetType === "distribution-point" ? dpUsageById.get(asset.id) || null : null;
    const parentSbSummary = asset.assetType === "distribution-point" ? parentSbSummaryById.get(asset.id) || null : null;
    const connectionMode = String((asset as any).connectionMode || "auto").toLowerCase() === "manual" ? "manual" : "auto";
    const dailyProgress = getDailyProgressTotals(asset);

    return (
      <React.Fragment key={`asset-marker-wrap-${asset.id}`}>
        <Marker
          key={asset.id}
          position={[lat, lng]}
          icon={icon}
          draggable={assetMovementEnabled && activeMoveAssetId === asset.id && asset.assetType !== "home"}
          eventHandlers={{
          dragend: (e) => {
            if (!assetMovementEnabled || activeMoveAssetId !== asset.id) return;
            const marker = e.target as L.Marker;
            const position = marker.getLatLng();

            onMoveAsset?.(asset.id, position.lat, position.lng);
          },
          click: (event) => {
            if (measurementMode) {
              event.originalEvent?.stopPropagation();
              onMeasurePointAsset?.(asset);
              return;
            }

            if (cableDrawingMode) {
              event.originalEvent?.stopPropagation();
              if (asset.assetType !== "home" && asset.assetType !== "area") {
                onCablePointAsset?.(asset);
              }
              return;
            }

  if (surveyDeleteHomesMode) {
    if (asset.assetType === "home") {
      onToggleSurveyDeleteHome?.(asset);
    }
    return;
  }

  if (moveHomesMode) {
    if (asset.assetType === "home") {
      onToggleMoveHome?.(asset);
      return;
    }

    if (asset.assetType === "distribution-point") {
      onMoveHomesTargetDp?.(asset);
    }

    return;
  }

  onEditAsset(asset);
},
          }}
        >
          {!cableDrawingMode ? (
          <Popup minWidth={260}>
            <div style={popupCardStyle}>
              <div style={titleStyle}>{asset.name}</div>
              <div style={subTitleStyle}>{getAssetTypeLabel(asset)}</div>
              {(asset.assetType === "pole" || asset.assetType === "chamber") && isPiaQaModeEnabled(visibleLayers as any) ? (
                <div style={{ fontSize: "0.78rem", fontWeight: 900, color: "#9a3412" }}>
                  PIA QA: {getPiaQaStatusLabel(asset)}
                </div>
              ) : null}
              {dailyProgress.spliceCount > 0 ? (
                <div style={{ fontSize: "0.78rem", fontWeight: 900, color: getDailyProgressTeamColour("splicing") }}>
                  Today spliced: {dailyProgress.spliceCount}
                </div>
              ) : null}

            <div style={sectionStyle}>
              {infoRow("Coordinates", `${lat.toFixed(5)}, ${lng.toFixed(5)}`)}

              {asset.assetType === "pole" ? (
                <>
                  {infoRow("Size", asset.poleDetails?.size)}
                  {infoRow("Year", asset.poleDetails?.year)}
                  {infoRow("Location", asset.poleDetails?.locationType)}
                  {infoRow("Test Date", asset.poleDetails?.testDate)}
                  {infoRow("Special Markings", asset.poleDetails?.specialMarkings)}
                </>
              ) : null}

              {asset.assetType === "distribution-point" ? (
                <>
                  {infoRow("Build Status", asset.dpDetails?.buildStatus)}
                  {infoRow("DP Type", asset.dpDetails?.closureType)}
                  {infoRow("Homes", dpUsage?.used ?? asset.dpDetails?.connectionsToHomes)}
                  {dpUsage ? (
                    dpUsage.isMdu ? (
                      <>
                        {infoRow("Feed Fibres", dpUsage.mduFeedFibres)}
                        {infoRow("Connected", dpUsage.used)}
                        {infoRow("Spare Feed", dpUsage.free)}
                        {infoRow("Status", dpUsage.overCapacity ? "Over capacity" : "OK")}
                      </>
                    ) : (
                      <>
                        {infoRow("Capacity", dpUsage.capacity)}
                        {infoRow("Used Ports", dpUsage.used)}
                        {infoRow("Free Ports", dpUsage.free)}
                        {infoRow("Status", dpUsage.overCapacity ? "Over capacity" : "OK")}
                      </>
                    )
                  ) : null}

                  {asset.dpDetails?.closureType === "AFN" && (
                    <>
                      <br />
                      <b>AFN Splitter</b>
                      <br />
                      {parentSbSummary ? (
                        <>
                          Parent SB: {parentSbSummary.parentName} → {parentSbSummary.childName}
                          <br />
                          Fibres needed: {parentSbSummary.fibresNeeded}
                          <br />
                          Mapping: {parentSbSummary.mappingRows.length
                            ? parentSbSummary.mappingRows
                                .map((row) => `F${row.parent}→F${row.local}`)
                                .join(", ")
                            : `${parentSbSummary.parentFibres.join(", ") || "-"} → ${parentSbSummary.localFibres.join(", ") || "-"}`}
                          <br />
                        </>
                      ) : null}
                      Supporting cable: {(parentSbSummary && getPrimaryManualSbRouteForDp(asset as any)?.supportingCableName) || "optional / not set"}
                      <br />
                      Local splitter fibres: {dpUsage?.inputFibres?.length ? dpUsage.inputFibres.join(", ") : asset.dpDetails.afnDetails?.inputFibres?.join(", ") || "-"}
                      <br />
                      Splice fibres: {dpUsage?.spliceFibres?.length ? dpUsage.spliceFibres.join(", ") : (asset.dpDetails.afnDetails as any)?.spliceFibres?.join(", ") || "-"}
                    </>
                  )}

                  {infoRow("Power 1", asset.dpDetails?.powerReadings?.[0])}
                  {infoRow("Power 2", asset.dpDetails?.powerReadings?.[1])}
                  {infoRow("Power 3", asset.dpDetails?.powerReadings?.[2])}
                  {infoRow("Power 4", asset.dpDetails?.powerReadings?.[3])}
                </>
              ) : null}

              {asset.assetType === "chamber" ? (
                <>
                  {infoRow("Type", asset.chamberDetails?.chamberType)}
                  {infoRow("Size", asset.chamberDetails?.size)}
                  {infoRow("Depth", asset.chamberDetails?.depth)}
                  {infoRow("Lid Type", asset.chamberDetails?.lidType)}
                  {infoRow("Condition", asset.chamberDetails?.condition)}
                  {infoRow("Ducts", asset.chamberDetails?.connectedDucts)}
                </>
              ) : null}

              {asset.assetType === "home" ? (
                <>
                  {infoRow("Source", asset.source || "OpenStreetMap")}
                  {infoRow("Connection", getHomeConnectionStatus(asset, assets))}
                  {hasHomeServiceException(asset)
                    ? infoRow("Service", formatHomeServiceStatus(asset))
                    : null}
                  {hasHomeServiceException(asset)
                    ? infoRow("Reason", (asset as any).blockedReason || (asset as any).properties?.blockedReason)
                    : null}
                  {hasHomeServiceException(asset)
                    ? infoRow("Recommended DP", (asset as any).recommendedDpId || (asset as any).properties?.recommendedDpId)
                    : null}
                  {infoRow("Mode", connectionMode === "manual" ? "Manual" : "Auto")}
                  {infoRow("Connected DP", connectedDp?.name || ((asset as any).connectedDpId ? "Unknown DP" : "Not connected"))}
                  {moveHomesMode ? infoRow("Move Selection", isSelectedMoveHome ? "Selected" : "Click home to select") : null}
                  {surveyDeleteHomesMode ? infoRow("Survey Delete", isSelectedSurveyDeleteHome ? "Selected for delete" : "Click home to select") : null}
                  {infoRow("OSM ID", asset.osmId)}
                  {(asset as any).serviceNote || (asset as any).properties?.serviceNote ? (
                    <div style={sectionStyle}>
                      <div style={sectionLabelStyle}>Engineer Note</div>
                      <div style={notesStyle}>
                        {(asset as any).serviceNote || (asset as any).properties?.serviceNote}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                      Manual DP override
                    </label>

                    <select
                      value={(asset as any).connectedDpId || ""}
                      onChange={(event) => {
                        const nextDpId = event.target.value;
                        onEditAsset({
                          ...asset,
                          connectedDpId: nextDpId || undefined,
                          connectionMode: nextDpId ? "manual" : "auto",
                        } as SavedMapAsset);
                      }}
                      style={{
                        width: "100%",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: "0.82rem",
                        background: "white",
                        color: "#111827",
                      }}
                    >
                      <option value="">Auto / no manual override</option>
                      {distributionPoints.map((dp) => (
                        <option key={dp.id} value={dp.id}>
                          {dp.name || dp.id}
                        </option>
                      ))}
                    </select>

                    {connectionMode === "manual" || (asset as any).connectedDpId ? (
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() =>
                          onEditAsset({
                            ...asset,
                            connectedDpId: undefined,
                            connectionMode: "auto",
                          } as SavedMapAsset)
                        }
                      >
                        Reset to auto
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {asset.assetType === "ag-joint" || asset.assetType === "street-cab" ? (
                infoRow("Rows", (asset as any).mappingRowsCount ?? (asset as any).mappingRowsSummary?.rowCount ?? asset.mappingRows?.length ?? 0)
              ) : null}
            </div>

            {asset.assetType === "distribution-point"
              ? renderImagePreview(asset.dpDetails?.image, "Distribution point")
              : null}

            {asset.assetType === "pole"
              ? renderPhotoStrip(asset.poleDetails?.photos)
              : null}

            {asset.assetType === "pole"
              ? renderDocuments(asset.poleDetails?.documents)
              : null}

            {asset.assetType === "chamber"
              ? renderPhotoStrip(asset.chamberDetails?.photos)
              : null}

            {asset.assetType === "chamber"
              ? renderDocuments(asset.chamberDetails?.documents)
              : null}

            {asset.notes ? (
              <div style={sectionStyle}>
                <div style={sectionLabelStyle}>Notes</div>
                <div style={notesStyle}>{asset.notes}</div>
              </div>
            ) : null}

            <div style={actionsStyle}>
              {asset.assetType === "ag-joint" || asset.assetType === "street-cab" ? (
                <button style={actionButtonStyle} onClick={() => onOpenAsset(asset)}>
                  {asset.assetType === "ag-joint"
                    ? isMidjAsset
                      ? "Open MidJ"
                      : "Open Fibre Tray"
                    : "Open Operations"}
                </button>
              ) : null}

              {canShowAuditAction ? (
                <button style={actionButtonStyle} onClick={() => onOpenAudit?.(asset)}>
                  {getAuditButtonLabel(asset)}
                </button>
              ) : null}

              {asset.assetType === "home" ? (
                <button
                  style={positionMoveHomeId === asset.id ? secondaryButtonStyle : actionButtonStyle}
                  onClick={() => {
                    setPositionMoveHomeId((current) => (current === asset.id ? null : asset.id));
                    map.closePopup();
                  }}
                >
                  {positionMoveHomeId === asset.id ? "Cancel Position Move" : "Move Position"}
                </button>
              ) : null}

              {moveHomesMode && asset.assetType === "home" ? (
                <button style={actionButtonStyle} onClick={() => onToggleMoveHome?.(asset)}>
                  {isSelectedMoveHome ? "Unselect DP Move" : "Select for DP Move"}
                </button>
              ) : null}

              {surveyDeleteHomesMode && asset.assetType === "home" ? (
                <button style={deleteButtonStyle} onClick={() => onToggleSurveyDeleteHome?.(asset)}>
                  {isSelectedSurveyDeleteHome ? "Unselect Delete" : "Select for Delete"}
                </button>
              ) : null}

              {moveHomesMode && asset.assetType === "distribution-point" ? (
                <button style={actionButtonStyle} onClick={() => onMoveHomesTargetDp?.(asset)}>
                  Move Selected Here
                </button>
              ) : null}

              {isJointAsset && !canMoveJoints ? null : (
                <button style={actionButtonStyle} onClick={() => onEditAsset(asset)}>
                  {isJointAsset
                    ? "Move Joint"
                    : asset.assetType === "cable"
                    ? "Edit Details"
                    : "Edit Details"}
                </button>
              )}

              {canDeleteAssets ? (
                <button style={deleteButtonStyle} onClick={() => onDeleteAsset(asset.id)}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>
          </Popup>
          ) : null}
        </Marker>
        {!cableDrawingMode && dailyProgress.spliceCount > 0 ? (
          <Marker
            position={[lat, lng]}
            interactive={false}
            icon={L.divIcon({
              className: "alistra-daily-splice-label",
              html: `<div style="transform:translate(12px,-28px);background:${getDailyProgressTeamColour("splicing")};color:#fff;border:1px solid rgba(251,207,232,0.85);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.28);">SPLICE ${dailyProgress.spliceCount}</div>`,
              iconSize: [1, 1],
              iconAnchor: [0, 0],
            })}
          />
        ) : null}
      </React.Fragment>
    );
  };


  const renderHomeStackMarker = (stack: HomeStack) => {
    return (
      <Marker
        key={stack.id}
        position={stack.position}
        icon={createHomeStackIcon(stack.assets.length)}
      >
        <Popup minWidth={310} maxWidth={360}>
          <div style={popupCardStyle}>
            <div style={titleStyle}>Stacked homes detected</div>
            <div style={subTitleStyle}>
              {stack.assets.length} homes are sitting within {HOME_STACK_DISTANCE_METERS}m of each other.
            </div>
            <div style={{ ...sectionStyle, maxHeight: 260, overflowY: "auto" }}>
              {stack.assets.map((home, index) => {
                const status = homeStatusById.get(home.id) || "unconnected";
                const position = getPointLatLng(home);
                const isSelectedMoveHome = moveHomesMode && selectedMoveHomeIds.includes(home.id);
                const isPositionMoveHome = positionMoveHomeId === home.id;

                return (
                  <div
                    key={home.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: 8,
                      background: index === 0 ? "#f8fafc" : "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#111827", fontSize: "0.86rem" }}>
                      {getHomeDisplayName(home)}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                      Status: {status} · {position ? `${position[0].toFixed(6)}, ${position[1].toFixed(6)}` : "No coordinates"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" style={actionButtonStyle} onClick={() => onEditAsset(home)}>
                        Open
                      </button>
                      <button
                        type="button"
                        style={isPositionMoveHome ? secondaryButtonStyle : actionButtonStyle}
                        onClick={() => {
                          setPositionMoveHomeId((current) => (current === home.id ? null : home.id));
                          map.closePopup();
                        }}
                      >
                        {isPositionMoveHome ? "Cancel Position Move" : "Move Position"}
                      </button>
                      <button type="button" style={actionButtonStyle} onClick={() => onToggleMoveHome?.(home)}>
                        {isSelectedMoveHome ? "Selected for DP Move" : "Change DP"}
                      </button>
                      <button
                        type="button"
                        style={deleteButtonStyle}
                        onClick={() => {
                          if (window.confirm(`Delete duplicate home ${getHomeDisplayName(home)}?`)) {
                            onDeleteAsset(home.id);
                          }
                        }}
                      >
                        Delete Duplicate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => map.setView(stack.position, Math.max(map.getZoom(), 20), { animate: true })}
            >
              Zoom to stack
            </button>
          </div>
        </Popup>
      </Marker>
    );
  };

  return (
    <>
      {positionMoveHomeId ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "#0f172a",
            color: "#ffffff",
            border: "1px solid #38bdf8",
            borderRadius: 999,
            padding: "7px 12px",
            fontSize: "0.78rem",
            fontWeight: 800,
            boxShadow: "0 8px 20px rgba(15,23,42,0.28)",
            pointerEvents: "none",
          }}
        >
          Click the new position for this home
        </div>
      ) : null}

      {nonHomePointAssets.map(renderAssetMarker)}

      {homeStacks.map(renderHomeStackMarker)}

      {homeClusters.map((cluster) => {
        if (cluster.assets.length === 1) {
          return renderAssetMarker(cluster.assets[0]);
        }

        return (
          <Marker
            key={cluster.id}
            position={cluster.position}
            icon={createHomeClusterIcon(cluster.assets.length)}
            eventHandlers={{
              click: () => {
                const bounds = getHomeClusterBounds(cluster);

                if (bounds && bounds.isValid()) {
                  map.fitBounds(bounds, {
                    padding: [48, 48],
                    maxZoom: 19,
                    animate: true,
                  });
                  return;
                }

                map.setView(cluster.position, Math.min(map.getZoom() + 2, 20), { animate: true });
              },
            }}
          />
        );
      })}
    </>
  );

}

const popupCardStyle: React.CSSProperties = {
  minWidth: 240,
  maxWidth: 260,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "system-ui, sans-serif",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "1rem",
  color: "#111827",
};

const subTitleStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#475569",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: 2,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "#334155",
};

const notesStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#111827",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 10px",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 8,
  flexWrap: "wrap",
};

const actionButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.82rem",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "#475569",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.82rem",
};

const deleteButtonStyle: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.82rem",
};
