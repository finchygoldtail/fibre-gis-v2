import { getTupleDistanceMeters as distanceBetweenLatLngMeters } from "../../utils/mapMeasure";
import React, { useMemo, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { getPaddedRenderBounds, isLatLngInsideRenderBounds } from "./utils/renderBounds";
import type { SavedMapAsset } from "./types";
import { getAssetTypeLabel } from "../../utils/assetDisplay";
import { getDpCapacitySummary } from "../../services/dpIntelligence";
import {
  getPiaQaIconForAsset,
  getPiaQaStatusLabel,
  isPiaQaModeEnabled,
  shouldShowAssetForPiaQaFilters,
} from "./pia/piaQaWorkflow";

type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
  measurements: boolean;
  homes?: boolean;
  homesConnected?: boolean;
  homesUnconnected?: boolean;
  homesLive?: boolean;
  homesSdu?: boolean;
  homesMdu?: boolean;
  homesFlats?: boolean;
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

type Props = {
  assets: SavedMapAsset[];
  visibleLayers: LayerVisibility;
  highlightedAssetId?: string | null;
  cableDrawingMode?: boolean;
  onCablePointAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset: (asset: SavedMapAsset) => void;
  onOpenAudit?: (asset: SavedMapAsset) => void;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: SavedMapAsset) => void;
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

function getAuditButtonLabel(asset: SavedMapAsset): string {
  const type = String(
    (asset as any).assetType || (asset as any).type || (asset as any).jointType || "",
  ).toLowerCase();
  if (type.includes("joint") || type.includes("cmj") || type.includes("lmj")) return "Audit Joint";
  if (type.includes("chamber")) return "Audit Chamber";
  if (type.includes("pole")) return "Audit Pole";
  if (type.includes("distribution") || type === "dp") return "Audit DP";
  if (type.includes("cab")) return "Audit Street Cab";
  if (type.includes("home")) return "Audit Home";
  return "Audit Asset";
}

function hasAuditFormTemplate(asset: SavedMapAsset): boolean {
  const type = String(
    (asset as any).assetType || (asset as any).type || (asset as any).jointType || "",
  ).toLowerCase();
  return (
    type.includes("joint") ||
    type.includes("cmj") ||
    type.includes("lmj") ||
    type.includes("chamber") ||
    type.includes("pole")
  );
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

function getHomeLayerType(asset: SavedMapAsset): "sdu" | "mdu" | "flats" {
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

  if (raw.includes("flat") || raw.includes("apartment")) return "flats";
  if (raw.includes("mdu") || raw.includes("multi") || raw.includes("residential")) return "mdu";
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

function isEngineeringDrawingJointAsset(asset: SavedMapAsset): boolean {
  const assetType = String((asset as any).assetType || "").toLowerCase();
  const jointType = String((asset as any).jointType || "").toLowerCase();
  const name = String((asset as any).name || "").toLowerCase();

  return (
    assetType === "ag-joint" ||
    assetType === "joint" ||
    assetType.includes("joint") ||
    jointType.includes("joint") ||
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
      if (homeType === "flats") return layers.homesFlats !== false;
      return layers.homesSdu !== false;
    }

    case "cable":
      return false;

    case "ag-joint":
    default:
      return visibleLayers.agJoints;
  }
}

function infoRow(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value}</span>
    </div>
  );
}

function renderImagePreview(src?: string, alt = "Preview") {
  if (!src) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          maxWidth: 220,
          height: 120,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid #374151",
          display: "block",
        }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function renderPhotoStrip(photos?: string[]) {
  if (!photos || photos.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Photos</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          marginTop: 6,
        }}
      >
        {photos.slice(0, 4).map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={`Photo ${index + 1}`}
            style={{
              width: "100%",
              height: 72,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid #374151",
              display: "block",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ))}
      </div>
    </div>
  );
}

function renderDocuments(documents?: string[]) {
  if (!documents || documents.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Documents</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {documents.map((doc, index) => (
          <div
            key={`${doc}-${index}`}
            style={{
              fontSize: "0.8rem",
              color: "#cbd5e1",
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            {doc.startsWith("http") ? (
              <a
                href={doc}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#93c5fd", textDecoration: "underline" }}
              >
                {decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Open document")}
              </a>
            ) : (
              doc
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
): "unconnected" | "connected" | "live" {
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
const homeMoveSelectedIcon = createHomeIcon("#38bdf8", "#075985");
const homePositionMoveIcon = createHomeIcon("#38bdf8", "#075985", "rgba(56, 189, 248, 0.95)");

function getHomeIconForStatus(status: "unconnected" | "connected" | "live") {
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
  homeStatusById: Map<string, "unconnected" | "connected" | "live">;
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

  const homeStatusById = new Map<string, "unconnected" | "connected" | "live">();
  const connectedDpByHomeId = new Map<string, SavedMapAsset | null>();

  allAssets.forEach((asset) => {
    if (asset.assetType !== "home") return;

    const ownStatus = normaliseStatus(
      (asset as any).customerStatus ||
        (asset as any).homeStatus ||
        (asset as any).status ||
        (asset as any).buildStatus,
    );

    const manualDpId = String((asset as any).connectedDpId || "").trim();
    const metadataConnection = String((asset as any).connection || "").toLowerCase();
    const dropDpId = connectedDpIdByHomeId.get(asset.id) || "";
    const connectedDpId = manualDpId || dropDpId;

    const status = ownStatus === "live" || liveDropHomeIds.has(asset.id)
      ? "live"
      : connectedDpId || metadataConnection === "connected"
        ? "connected"
        : "unconnected";

    homeStatusById.set(asset.id, status);
    connectedDpByHomeId.set(asset.id, connectedDpId ? dpById.get(connectedDpId) || null : null);
  });

  return { homeStatusById, connectedDpByHomeId };
}

function normaliseAssetRef(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsMatch(a: unknown, b: unknown): boolean {
  const left = normaliseAssetRef(a);
  const right = normaliseAssetRef(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function uniquePositiveNumbers(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}


function getManualSbRoutesFromDetails(details: any): any[] {
  const routes = details?.afnDetails?.sbToSbRoutes;
  return Array.isArray(routes) ? routes : [];
}

function getPrimaryManualSbRouteForDp(dp: any): any | null {
  const details = dp?.dpDetails || dp?.properties?.dpDetails || {};
  const routes = getManualSbRoutesFromDetails(details);
  if (!routes.length) return null;
  const dpRefs = [dp?.id, dp?.assetId, dp?.name, dp?.jointName, dp?.label, dp?.dpId]
    .map(normaliseAssetRef)
    .filter(Boolean);
  return routes.find((route) => {
    const routeRefs = [route?.toSbId, route?.toSbName].map(normaliseAssetRef).filter(Boolean);
    return routeRefs.length && routeRefs.some((routeRef) => dpRefs.some((dpRef) => refsMatch(routeRef, dpRef)));
  }) || routes[0];
}

function getAssetIdentityValues(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.dpId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function getHomeUniqueKey(asset: any): string {
  const raw =
    asset?.uprn ||
    asset?.UPRN ||
    asset?.properties?.UPRN ||
    asset?.properties?.uprn ||
    asset?.homeId ||
    asset?.id ||
    asset?.assetId ||
    asset?.name;

  return String(raw ?? "").trim().toLowerCase();
}

function getConnectedDpReference(asset: any): string {
  return String(
    asset?.connectedDpId ??
      asset?.dpId ??
      asset?.assignedDpId ??
      asset?.properties?.connectedDpId ??
      asset?.properties?.dpId ??
      asset?.properties?.assignedDpId ??
      "",
  ).trim();
}

function readPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    const text = String(value).trim();
    const match = text.match(/\d+/);
    const parsed = match ? Number(match[0]) : Number(text);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return 0;
}

function getSavedDpUsedPorts(dp: any, dpDetails: any, matchingDpState?: any): number {
  const savedConnectedHomes = Array.isArray(dp?.connectedHomes)
    ? dp.connectedHomes.length
    : Array.isArray(dpDetails?.connectedHomes)
      ? dpDetails.connectedHomes.length
      : 0;

  const savedConnectedHomeIds = Array.isArray(dp?.connectedHomeIds)
    ? dp.connectedHomeIds.length
    : Array.isArray(dpDetails?.connectedHomeIds)
      ? dpDetails.connectedHomeIds.length
      : 0;

  return readPositiveNumber(
    matchingDpState?.used,
    matchingDpState?.usedPorts,
    matchingDpState?.connectedHomes,
    matchingDpState?.connectedHomeCount,
    matchingDpState?.homeCount,
    dp?.usedPorts,
    dp?.usedPortCount,
    dp?.portsUsed,
    dp?.connectedHomesCount,
    dp?.connectedHomeCount,
    dp?.servedHomeCount,
    dp?.homesServed,
    dpDetails?.usedPorts,
    dpDetails?.usedPortCount,
    dpDetails?.portsUsed,
    dpDetails?.connectedHomesCount,
    dpDetails?.connectedHomeCount,
    dpDetails?.servedHomeCount,
    dpDetails?.homesServed,
    dpDetails?.autoFibrePlan?.usedPorts,
    dpDetails?.autoFibrePlan?.connectedHomes,
    savedConnectedHomes,
    savedConnectedHomeIds,
  );
}

function getSavedDpCapacity(dp: any, dpDetails: any, matchingDpState?: any): number {
  return readPositiveNumber(
    matchingDpState?.capacity,
    matchingDpState?.totalPorts,
    matchingDpState?.ports,
    dp?.capacity,
    dp?.dpCapacity,
    dp?.totalPorts,
    dp?.ports,
    dp?.connectionsToHomes,
    dpDetails?.capacity,
    dpDetails?.dpCapacity,
    dpDetails?.totalPorts,
    dpDetails?.ports,
    dpDetails?.connectionsToHomes,
    dpDetails?.autoFibrePlan?.capacity,
  );
}

function getDropHomeReference(drop: any, dpIdentityValues: string[]): string {
  const fromRefs = [
    drop?.fromAssetId,
    drop?.fromId,
    drop?.fromHomeId,
    drop?.fromAssetName,
    drop?.sourceAssetId,
    drop?.sourceId,
  ];

  const toRefs = [
    drop?.toAssetId,
    drop?.toId,
    drop?.toHomeId,
    drop?.toAssetName,
    drop?.targetAssetId,
    drop?.targetId,
  ];

  const fromIsDp = fromRefs.some((ref) =>
    dpIdentityValues.some((dpRef) => refsMatch(ref, dpRef)),
  );
  const toIsDp = toRefs.some((ref) =>
    dpIdentityValues.some((dpRef) => refsMatch(ref, dpRef)),
  );

  if (fromIsDp) {
    return String(
      drop?.toHomeId ||
        drop?.toAssetId ||
        drop?.toId ||
        drop?.targetAssetId ||
        drop?.targetId ||
        drop?.homeId ||
        drop?.connectedHomeId ||
        drop?.id ||
        "",
    ).trim();
  }

  if (toIsDp) {
    return String(
      drop?.fromHomeId ||
        drop?.fromAssetId ||
        drop?.fromId ||
        drop?.sourceAssetId ||
        drop?.sourceId ||
        drop?.homeId ||
        drop?.connectedHomeId ||
        drop?.id ||
        "",
    ).trim();
  }

  return "";
}

function getDpUsage(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
  networkState?: any,
) {
  const dpIdentityValues = getAssetIdentityValues(dp as any);
  const dpDetails = ((dp as any).dpDetails || (dp as any).properties?.dpDetails || {}) as any;
  const afnDetails = dpDetails.afnDetails || (dp as any).afnDetails || {};
  const mduDetails = dpDetails.mduDetails || (dp as any).mduDetails || {};

  const matchingDpState =
    (dp.id ? networkState?.dpStates?.[dp.id] : null) ||
    Object.values(networkState?.dpStates || {}).find((state: any) =>
      dpIdentityValues.some((dpRef) =>
        refsMatch(state?.assetId || state?.assetName || state?.dpName, dpRef),
      ),
    );

  const connectedHomeKeys = new Set<string>();

  allAssets.forEach((asset: any) => {
    if (asset?.assetType === "home") {
      const connectedDpRef = getConnectedDpReference(asset);
      if (!connectedDpRef) return;

      const belongsToThisDp = dpIdentityValues.some((dpRef) =>
        refsMatch(connectedDpRef, dpRef),
      );

      if (!belongsToThisDp) return;

      const key = getHomeUniqueKey(asset);
      if (key) connectedHomeKeys.add(key);
      return;
    }

    // The main map can be shown without all project homes loaded. In that case
    // use the saved drop-cable endpoints as a fallback so the DP popup does not
    // incorrectly show "0 used".
    if (isDropCable(asset as SavedMapAsset)) {
      const homeRef = getDropHomeReference(asset, dpIdentityValues);
      if (homeRef) connectedHomeKeys.add(homeRef.toLowerCase());
    }
  });

  const manualSbRoute = getPrimaryManualSbRouteForDp(dp as any);
  const manualLocalFibres = uniquePositiveNumbers([
    ...((Array.isArray(manualSbRoute?.localFibres) ? manualSbRoute.localFibres : []) as any[]),
  ]);
  const manualParentFibres = uniquePositiveNumbers([
    ...((Array.isArray(manualSbRoute?.parentFibres) ? manualSbRoute.parentFibres : []) as any[]),
  ]);

  const storedSpliceFibres = uniquePositiveNumbers([
    ...((Array.isArray(afnDetails.spliceFibres) ? afnDetails.spliceFibres : []) as any[]),
    ...((Array.isArray(manualSbRoute?.spliceFibres) ? manualSbRoute.spliceFibres : []) as any[]),
  ]);

  const storedInputFibres = uniquePositiveNumbers([
    ...((Array.isArray(afnDetails.inputFibres) ? afnDetails.inputFibres : []) as any[]),
    ...((Array.isArray(afnDetails.splitterFibres) ? afnDetails.splitterFibres : []) as any[]),
  ]);

  // SB routing is manual-authority. Joint/network matched fibres are not allowed
  // to overwrite the SB local splitter fibres shown on the map popup.
  const inputFibres = manualLocalFibres.length ? manualLocalFibres : storedInputFibres;
  const splitterFibres = inputFibres;

  const closureType = String(
    dpDetails.closureType ||
      dpDetails.networkArchitecture ||
      (dp as any).closureType ||
      (dp as any).dpType ||
      "",
  ).toUpperCase();

  const isMdu = closureType.includes("MDU");
  const savedUsed = getSavedDpUsedPorts(dp as any, dpDetails, matchingDpState);

  // Prefer actual loaded homes/drop endpoints. If the main map has not loaded
  // homes for the project, fall back to the saved workspace/intelligence count.
  // Capacity is now calculated through the shared DP intelligence service so
  // popups, editor panels and workspace panels stay aligned.
  const used = connectedHomeKeys.size || savedUsed;
  const capacitySummary = getDpCapacitySummary(dp, allAssets, {
    connectedHomeCount: used,
    splitterInputCount: splitterFibres.length,
    splitterOutputsPerInput: 8,
  });
  const capacity = capacitySummary.capacity;
  const free = capacitySummary.free;

  return {
    capacity,
    used,
    free,
    overCapacity: used > capacity,
    inputFibres,
    spliceFibres: storedSpliceFibres,
    isMdu,
    mduFeedFibres: capacity,
  };
}

type ParentSbPopupSummary = {
  parentName: string;
  childName: string;
  fibresNeeded: number;
  parentFibres: number[];
  localFibres: number[];
  mappingRows: { parent: number; local: number }[];
};

function getAssetDisplayName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return String(item?.name || item?.jointName || item?.label || item?.assetId || item?.id || "SB");
}

function findAssetByReferences(assets: SavedMapAsset[], references: unknown[]): SavedMapAsset | null {
  const refs = references.map(normaliseAssetRef).filter(Boolean);
  if (!refs.length) return null;

  return (
    assets.find((asset) =>
      getAssetIdentityValues(asset).some((identity) =>
        refs.some((reference) => refsMatch(identity, reference)),
      ),
    ) || null
  );
}

function buildParentSbPopupSummary(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
): ParentSbPopupSummary | null {
  const route = getPrimaryManualSbRouteForDp(dp as any);
  if (!route) return null;

  const allDps = allAssets.filter((asset) => asset.assetType === "distribution-point");
  const parent = findAssetByReferences(allDps, [route.fromSbId, route.fromSbName]);
  const child = findAssetByReferences(allDps, [route.toSbId, route.toSbName]) || dp;
  const parentFibres = uniquePositiveNumbers(Array.isArray(route.parentFibres) ? route.parentFibres : []);
  const localFibres = uniquePositiveNumbers(Array.isArray(route.localFibres) ? route.localFibres : []);
  const fibresNeeded = Math.max(parentFibres.length, localFibres.length);
  if (!fibresNeeded) return null;

  return {
    parentName: route.fromSbName || getAssetDisplayName(parent) || "Parent SB",
    childName: route.toSbName || getAssetDisplayName(child),
    fibresNeeded,
    parentFibres,
    localFibres,
    mappingRows: Array.from(
      { length: Math.min(parentFibres.length, localFibres.length) },
      (_, index) => ({ parent: parentFibres[index], local: localFibres[index] }),
    ),
  };
}


function getIconForAsset(
  asset: SavedMapAsset,
  allAssets: SavedMapAsset[],
  visibleLayers?: LayerVisibility,
  cachedHomeStatus?: "unconnected" | "connected" | "live",
) {
  if (asset.assetType === "distribution-point") {
    return createSquareIcon(getDistributionPointColor(asset), "#ffffff");
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


const homeClusterIconCache = new Map<string, L.DivIcon>();
const homeStackIconCache = new Map<string, L.DivIcon>();

function createHomeClusterIcon(count: number) {
  const size = count >= 100 ? 44 : count >= 25 ? 38 : 32;
  const cacheKey = `${size}:${count}`;
  const cached = homeClusterIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #334155;
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
        font-weight: 800;
        font-size: 0.8rem;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  homeClusterIconCache.set(cacheKey, icon);
  return icon;
}

type HomeCluster = {
  id: string;
  assets: SavedMapAsset[];
  position: [number, number];
};


type HomeStack = {
  id: string;
  assets: SavedMapAsset[];
  position: [number, number];
};

const HOME_STACK_DISTANCE_METERS = 1.75;

function createHomeStackIcon(count: number) {
  const size = count >= 10 ? 42 : 36;
  const cacheKey = `${size}:${count}`;
  const cached = homeStackIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #ef4444;
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 3px rgba(239,68,68,0.35), 0 8px 20px rgba(15,23,42,0.42);
        font-weight: 900;
        font-size: 0.82rem;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  homeStackIconCache.set(cacheKey, icon);
  return icon;
}

function getHomeDisplayName(home: SavedMapAsset): string {
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

function groupStackedHomeAssets(homes: SavedMapAsset[]): HomeStack[] {
  const positionsById = new Map<string, [number, number]>();
  const buckets = new Map<string, SavedMapAsset[]>();
  const cellSizeMeters = HOME_STACK_DISTANCE_METERS;
  const metersPerDegreeLat = 111_320;

  homes.forEach((home) => {
    const position = getPointLatLng(home);
    if (!position) return;

    positionsById.set(home.id, position);
    const [lat, lng] = position;
    const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
    const x = Math.floor((lng * metersPerDegreeLng) / cellSizeMeters);
    const y = Math.floor((lat * metersPerDegreeLat) / cellSizeMeters);
    const key = `${x}:${y}`;
    const bucket = buckets.get(key) || [];
    bucket.push(home);
    buckets.set(key, bucket);
  });

  const visited = new Set<string>();
  const stacks: HomeStack[] = [];

  homes.forEach((seed) => {
    if (visited.has(seed.id)) return;

    const seedPosition = positionsById.get(seed.id);
    if (!seedPosition) return;

    const [seedLat, seedLng] = seedPosition;
    const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((seedLat * Math.PI) / 180));
    const seedX = Math.floor((seedLng * metersPerDegreeLng) / cellSizeMeters);
    const seedY = Math.floor((seedLat * metersPerDegreeLat) / cellSizeMeters);
    const group: SavedMapAsset[] = [seed];
    visited.add(seed.id);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = buckets.get(`${seedX + dx}:${seedY + dy}`) || [];
        bucket.forEach((candidate) => {
          if (candidate.id === seed.id || visited.has(candidate.id)) return;
          const candidatePosition = positionsById.get(candidate.id);
          if (!candidatePosition) return;

          if (distanceBetweenLatLngMeters(seedPosition, candidatePosition) <= HOME_STACK_DISTANCE_METERS) {
            group.push(candidate);
            visited.add(candidate.id);
          }
        });
      }
    }

    if (group.length < 2) return;

    let latTotal = 0;
    let lngTotal = 0;
    group.forEach((home) => {
      const position = positionsById.get(home.id);
      if (!position) return;
      latTotal += position[0];
      lngTotal += position[1];
    });

    stacks.push({
      id: `home-stack-${group.map((home) => home.id).join("-")}`,
      assets: group,
      position: [latTotal / group.length, lngTotal / group.length],
    });
  });

  return stacks;
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

function getHomeClusterBounds(cluster: HomeCluster): L.LatLngBounds | null {
  const positions = cluster.assets
    .map((home) => getPointLatLng(home))
    .filter(Boolean) as [number, number][];

  if (positions.length === 0) return null;

  return L.latLngBounds(positions.map(([lat, lng]) => L.latLng(lat, lng)));
}

function clusterHomeAssets(homes: SavedMapAsset[], map: L.Map): HomeCluster[] {
  const zoom = map.getZoom();

  if (zoom >= 19 || homes.length < 2) {
    return homes
      .map((home) => {
        const position = getPointLatLng(home);
        if (!position) return null;
        return { id: home.id, assets: [home], position };
      })
      .filter(Boolean) as HomeCluster[];
  }

  const gridSize = zoom >= 17 ? 44 : zoom >= 15 ? 56 : 68;
  const buckets = new Map<string, SavedMapAsset[]>();

  homes.forEach((home) => {
    const position = getPointLatLng(home);
    if (!position) return;

    const point = map.latLngToLayerPoint(L.latLng(position[0], position[1]));
    const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(home);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    let latTotal = 0;
    let lngTotal = 0;

    bucket.forEach((home) => {
      const position = getPointLatLng(home);
      if (!position) return;
      latTotal += position[0];
      lngTotal += position[1];
    });

    return {
      id: `home-cluster-${key}-${bucket.length}`,
      assets: bucket,
      position: [latTotal / bucket.length, lngTotal / bucket.length],
    };
  });
}

export default function AssetMarkersLayer({
  assets,
  visibleLayers,
  highlightedAssetId,
  cableDrawingMode = false,
  onCablePointAsset,
  onOpenAsset,
  onOpenAudit,
  onDeleteAsset,
  onEditAsset,
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
      return isEngineeringDrawingJointAsset(asset);
    }

    // Handle homes separately so SDU/MDU/Flats filters don't accidentally hide them
    if (asset.assetType === "home") {
      if (!homesEnabled) return false;

      const homeStatus = homeStatusById.get(asset.id) || "unconnected";
      if (homeStatus === "live" && layers.homesLive === false) return false;
      if (homeStatus === "connected" && layers.homesConnected === false) return false;
      if (homeStatus === "unconnected" && layers.homesUnconnected === false) return false;

      const homeType = getHomeLayerType(asset);
      if (homeType === "mdu" && layers.homesMdu === false) return false;
      if (homeType === "flats" && layers.homesFlats === false) return false;
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

    return (
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
                  {infoRow("Mode", connectionMode === "manual" ? "Manual" : "Auto")}
                  {infoRow("Connected DP", connectedDp?.name || ((asset as any).connectedDpId ? "Unknown DP" : "Not connected"))}
                  {moveHomesMode ? infoRow("Move Selection", isSelectedMoveHome ? "Selected" : "Click home to select") : null}
                  {surveyDeleteHomesMode ? infoRow("Survey Delete", isSelectedSurveyDeleteHome ? "Selected for delete" : "Click home to select") : null}
                  {infoRow("OSM ID", asset.osmId)}

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
                  {asset.assetType === "ag-joint" ? "Open Fibre Tray" : "Open Operations"}
                </button>
              ) : null}

              {hasAuditFormTemplate(asset) ? (
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

              <button style={actionButtonStyle} onClick={() => onEditAsset(asset)}>
                {asset.assetType === "ag-joint" || String((asset as any).type || "").toLowerCase().includes("joint")
                  ? "Move Joint"
                  : asset.assetType === "cable"
                  ? "Edit Details"
                  : "Edit Details"}
              </button>

              <button style={deleteButtonStyle} onClick={() => onDeleteAsset(asset.id)}>
                Delete
              </button>
            </div>
          </div>
        </Popup>
        ) : null}
      </Marker>
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

const infoRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "92px 1fr",
  gap: 8,
  alignItems: "start",
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const infoValueStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#111827",
  wordBreak: "break-word",
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
