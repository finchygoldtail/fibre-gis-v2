import { getTuplePathDistanceMeters } from "../../utils/mapMeasure";
import React, { useEffect, useMemo, useRef, useState } from "react";
import WorkspaceMap, {
  type JobPackMapCaptureRequest,
  type JobPackMapCaptureTarget,
  type WorkspaceLayerVisibility,
} from "./WorkspaceMap";
import type { OpenreachLayerVisibility } from "../map/layers/OpenreachOverlayLayer";
import AssetIntelligencePanel from "./AssetIntelligencePanel";
import WorkspaceTabContent from "./workspace/WorkspaceTabContent";
import { isOperationalAssetRegisterAsset } from "./workspace/OperationalAssetExplorer";
import AreaBulkStatusPanel from "./workspace/AreaBulkStatusPanel";
import LiveHomesControl from "./workspace/LiveHomesControl";
import type { SavedMapAsset } from "../map/types";
import { getAssetSearchText as assetSearchText } from "../../utils/assetDisplay";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { auditAreaAssets, type AuditIssue } from "../../services/areaAudit";
import {
  buildNetworkState,
  isDistributionPointAsset,
} from "../../services/network";
import {
  buildJobPackDraftFromLiveMap,
  exportQgisJobPackBundle,
} from "../../services/jobpacks";
import { getDpIntelligence } from "../../services/dpIntelligence";
import AuditModal from "../audits/AuditModal";
import AuditFormEngine from "../audits/AuditFormEngine";
import { walkOffAuditTemplate } from "../audits/auditTemplates";
import {
  createAssetChangeLog,
  createAuditFormLog,
  loadAssetAuditLogs,
  type AuditLog,
} from "../../services/auditService";
import AuditCommercialDashboard from "../audits/AuditCommercialDashboard";
import AuditPaymentBlockerPanel from "../audits/AuditPaymentBlockerPanel";
import AuditHistoryPanel from "../audits/AuditHistoryPanel";
import UserMenu from "../UserMenu";
import { useUserRole } from "../../context/UserRoleContext";
import { isHarrellicommsBusiness } from "../../utils/clientAccessControl";
import AreaOperationsCentre from "../operations/AreaOperationsCentre";
import EngineeringDeliveryWorkspace from "../delivery/EngineeringDeliveryWorkspace";
import {
  buildCanonicalHomeSummary,
  hasCanonicalHomeServiceException,
} from "./workspace/canonicalHomeStatus";
import PiaOperationsDashboard from "../map/pia/PiaOperationsDashboard";
import {
  buildPiaAcceptanceStats,
  getPiaAcceptanceDetails,
  getPiaAcceptanceStatus,
  isPiaAcceptanceAsset,
  type PiaAcceptanceStatus,
} from "../../services/piaIntelligence";
import {
  classifyAuditIssueCategory,
  getAuditIssueAssetLabel,
  getAuditIssueDescription,
  groupAuditIssuesByCategory,
  normaliseIssueSeverity,
  type QaIssueSeverity,
  type QaPanelViewMode,
} from "./workspace/qaIssueGrouping";
import {
  AssetDrilldownButton,
  InfoRow,
  IssueCard,
  SideGroup,
  StatCard,
} from "./workspace/WorkspaceUi";
import {
  buildAreaReadiness,
  backhaulDeliveryPhaseOptions,
  deliveryPhaseOptions,
  getBackhaulDeliveryPhaseConfig,
  getDeliveryPhaseConfig,
  getWorkspaceDeliveryPhase,
  readinessColour,
  readinessTone,
  type AreaReadinessState,
  type DeliveryPhaseId,
} from "./workspace/workspaceReadiness";
// =====================================================
// FILE: ProjectWorkspace.tsx
// PURPOSE: Dedicated project workspace shell for Alistra GIS.
//          This is the first UI migration away from one overloaded
//          map sidebar into a project-specific operations screen.
// Operational rollout KPI header, lighter workspace
//              layer defaults, and manager-first project visibility.
//              No storage/topology or cable logic changed in this file.
// =====================================================

type WorkspaceOperationPanel =
  | "none"
  | "projectDetails"
  | "rfsBreakdown"
  | "issues"
  | "topology"
  | "qa"
  | "trace"
  | "homesNotLive"
  | "homesLive"
  | "dpStatus"
  | "disconnected"
  | "capacity"
  | "addAsset"
  | "handover"
  | "report"
  | "piaQa";

type WorkspaceTab =
  | "overview"
  | "topology"
  | "qa"
  | "pia"
  | "build"
  | "assets"
  | "reports"
  | "commercial"
  | "operations"
  | "delivery"
  | "settings";

type ProjectWorkspaceStats = {
  homesPassed: number;
  homesConnected: number;
  rfsPercent: number;
  issueCount: number;
  topologyLinks: number;
  splicePoints: number;
  areaM2?: number;
  joints: number;
  dps: number;
  streetCabs: number;
  poles: number;
  chambers: number;
  cables: number;
  dropCables?: number;
  designCables?: number;
  routeLengthMeters: number;
  unmatchedCableIds?: number;
  fibreTrayRows?: number;
  mappedJoints?: number;
};

type ProjectWorkspaceProps = {
  projectName: string;
  status?: string;
  stats: ProjectWorkspaceStats;
  onBackToMap: () => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
  onOpenDuctEditor?: (asset: SavedMapAsset) => void;
  onOpenDistributionPointEditor?: (asset: SavedMapAsset) => void;
  onOpenAudit?: (asset: SavedMapAsset) => void;
  onExport?: () => void;
  onUpdateWorkspaceAsset?: (asset: SavedMapAsset) => void;
  activeBusinessId?: string | null;
  projectArea?: SavedMapAsset | null;
  projectAssets?: SavedMapAsset[];
  openreachAssets?: SavedMapAsset[];
  projectAreas?: SavedMapAsset[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    assetRefs?: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateJointInstallMethod?: (args: {
    assetIds: string[];
    installMethod: "Underground" | "Overhead";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateWorkStatus?: (args: {
    assetIds: string[];
    status: "planned" | "assigned" | "in-progress" | "complete" | "blocked";
    assignedTeam?: string;
    note: string;
  }) => void | Promise<void>;
  onRecordDailyProgress?: (args: {
    assetIds: string[];
    team: "civils" | "cabling" | "splicing";
    date: string;
    meters?: number;
    startMeter?: number;
    endMeter?: number;
    spliceCount?: number;
    crewName?: string;
    progressNote?: string;
    issueNote?: string;
    permitNumber?: string;
    permitStartDate?: string;
    permitEndDate?: string;
    note: string;
  }) => void | Promise<void>;
  onUpdateDpStatus?: (args: {
    assetId: string;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onClearDpFibreAllocations?: (args: {
    assetIds: string[];
    note: string;
  }) => void;
  onResolveDuplicateHomes?: (args: {
    groupId: string;
    canonicalHomeId: string;
    duplicateHomeIds: string[];
    note: string;
  }) => void;
  onAutoSpreadStackedHomes?: () => void | Promise<void>;
  onApplyAddressSheetAssignments?: (request: any) => void | Promise<void>;
  onApplySbRouteAssignments?: (request: any) => void | Promise<void>;
};

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "qa", label: "QA" },
  { id: "pia", label: "PIA" },
  { id: "build", label: "Build" },
  { id: "assets", label: "Assets" },
  { id: "reports", label: "Reports" },
  { id: "commercial", label: "Commercial" },
  { id: "operations", label: "Operations" },
  { id: "delivery", label: "Delivery" },
];

const defaultWorkspaceLayers: WorkspaceLayerVisibility = {
  // Keep the workspace fast on fibrehood open.
  // Heavy render layers stay available, but operators turn them on when needed.
  projectBoundary: true,
  areas: true,
  ducts: true,
  cables: false,
  dropCables: false,
  joints: true,
  dps: true,
  poles: false,
  chambers: false,
  streetCabs: false,
  dataCentres: true,
  homes: false,
  homesConnected: true,
  homesUnconnected: true,
  homesLive: true,
  homesNotLive: true,
  other: false,
};

const workspaceLayerOptions: {
  key: keyof WorkspaceLayerVisibility;
  label: string;
}[] = [
  { key: "projectBoundary", label: "Project Boundary" },
  { key: "areas", label: "Areas" },
  { key: "ducts", label: "Ducts" },
  { key: "cables", label: "Cables" },
  { key: "dropCables", label: "Home Drop Cables" },
  { key: "joints", label: "Joints" },
  { key: "dps", label: "DPs / CBTs / AFNs" },
  { key: "poles", label: "Poles" },
  { key: "chambers", label: "Chambers" },
  { key: "streetCabs", label: "Street Cabs" },
  { key: "dataCentres", label: "Data Centres" },
  { key: "homes", label: "Homes" },
  { key: "homesConnected", label: "Connected Homes" },
  { key: "homesUnconnected", label: "Unconnected Homes" },
  { key: "homesLive", label: "Live Homes" },
  { key: "homesNotLive", label: "Not Live Homes" },
  { key: "other", label: "Other Assets" },
];

const HARRELLICOMMS_BACKHAUL_HIDDEN_TABS = new Set<WorkspaceTab>([
  "delivery",
]);

const HARRELLICOMMS_BACKHAUL_HIDDEN_PANELS = new Set<WorkspaceOperationPanel>([
  "homesNotLive",
  "homesLive",
  "dpStatus",
  "capacity",
  "piaQa",
]);

function getAreaWorkType(area?: SavedMapAsset | null): "pia" | "data-centre" {
  const raw = String(
    (area as any)?.areaWorkType ||
      (area as any)?.properties?.areaWorkType ||
      "",
  )
    .trim()
    .toLowerCase();

  return raw === "data-centre" || raw === "data center" || raw === "backhaul"
    ? "data-centre"
    : "pia";
}

const defaultOpenreachLayers: OpenreachLayerVisibility = {
  // Openreach / PIA overlays can be very heavy, so default them off.
  ducts: false,
  trenches: false,
  spans: false,
  chambers: false,
  poles: false,
  labels: false,
};

const openreachLayerOptions: {
  key: keyof OpenreachLayerVisibility;
  label: string;
}[] = [
  { key: "ducts", label: "OR Ducts / Routes" },
  { key: "trenches", label: "OR Trenches" },
  { key: "spans", label: "OR Overhead Spans" },
  { key: "chambers", label: "OR Chambers" },
  { key: "poles", label: "OR Poles" },
  { key: "labels", label: "OR Route Labels" },
];

function formatLayerLabelWithCount(label: string, count?: number): string {
  return typeof count === "number" ? `${label} (${count})` : label;
}

function isWorkspaceHomeAssetForLayerCount(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (
    !asset ||
    isHomeDropCableAsset(asset) ||
    isWorkspaceDistributionPointAsset(asset) ||
    isDesignCableAsset(asset)
  )
    return false;
  const item = asset as any;
  const typeText = [
    item.assetType,
    item.type,
    item.homeType,
    item.name,
    item.label,
    item.category,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  const hasPointGeometry =
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number");

  if (!hasPointGeometry) return false;

  return Boolean(
    item.uprn ||
    item.UPRN ||
    item.properties?.UPRN ||
    item.properties?.uprn ||
    item.homeId ||
    typeText.includes("home") ||
    typeText.includes("premise") ||
    typeText.includes("property") ||
    typeText.includes("sdu") ||
    typeText.includes("flat"),
  );
}

function getWorkspaceLayerHomeKey(asset: SavedMapAsset): string {
  const item = asset as any;
  const raw =
    item.uprn ||
    item.UPRN ||
    item.properties?.UPRN ||
    item.properties?.uprn ||
    item.homeId ||
    item.address ||
    item.label ||
    item.name ||
    item.id;

  if (raw) return String(raw).trim().toLowerCase();

  if (asset.geometry?.type === "Point") {
    const [lat, lng] = asset.geometry.coordinates as [number, number];
    return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
  }

  return "";
}

function getWorkspaceAssetLayerText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.assetType,
    item.type,
    item.jointType,
    item.cableType,
    item.name,
    item.label,
    item.category,
    item.source,
    item.referenceSubtype,
    item.dpType,
    item.closureType,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function isWorkspaceOpenreachReferenceAsset(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset) return false;
  const text = getWorkspaceAssetLayerText(asset);
  const item = asset as any;

  return Boolean(
    item.isOpenreachReference ||
      item.readOnlyReference ||
      item.referenceAsset ||
      text.includes("openreach") ||
      text.includes("pia") ||
      text.includes(" or ") ||
      text.includes("pol:") ||
      text.includes("jc:") ||
      text.includes("ch:") ||
      text.includes("duct") ||
      text.includes("trench") ||
      text.includes("span") ||
      text.includes("suggested"),
  );
}

function isWorkspaceOpenreachPiaPointAsset(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset || !isWorkspaceOpenreachReferenceAsset(asset)) return false;
  const item = asset as any;
  const hasPointGeometry =
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number");

  if (!hasPointGeometry) return false;

  const text = getWorkspaceAssetLayerText(asset);
  return (
    text.includes("pole") ||
    text.includes("pol:") ||
    text.includes("chamber") ||
    text.includes("manhole") ||
    text.includes("jc:") ||
    text.includes("ch:")
  );
}

function isPiaReviewableWorkspaceAsset(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset) return false;

  const item = asset as any;
  const text = getWorkspaceAssetLayerText(asset);
  const titleText = [
    item.name,
    item.jointName,
    item.label,
    item.assetId,
    item.id,
    item.cableType,
    item.type,
    item.assetType,
    item.properties?.name,
    item.properties?.label,
    item.properties?.assetType,
    item.properties?.type,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  const combinedText = `${text} ${titleText}`;

  // Area polygons are project containers, not build evidence targets.
  if (
    item.areaLevel ||
    combinedText.includes("polygon") ||
    combinedText.includes("fibrehood") ||
    combinedText.includes("project boundary")
  ) {
    return false;
  }

  // PIA review is for physical PIA evidence assets only.
  // Keep homes, premises, UPRN records, service drops and network cables out
  // of the PIA queue so the PIA dashboard does not list home-drop records.
  if (
    combinedText.includes("uprn") ||
    combinedText.includes("premise") ||
    combinedText.includes("premises") ||
    combinedText.includes("home") ||
    combinedText.includes("drop") ||
    isWorkspaceHomeAssetForLayerCount(asset) ||
    isHomeDropCableAsset(asset) ||
    isDesignCableAsset(asset) ||
    isWorkspaceDistributionPointAsset(asset)
  ) {
    return false;
  }

  // PIA QA is intentionally scoped to poles/chambers and OR/PIA point
  // reference assets that represent poles/chambers/manholes. Do not include
  // arbitrary points, DPs, joints or cables.
  return isPiaAcceptanceAsset(asset as any) || isWorkspaceOpenreachPiaPointAsset(asset);
}

function mergeWorkspaceAssetsById(
  primaryAssets: SavedMapAsset[],
  referenceAssets: SavedMapAsset[],
): SavedMapAsset[] {
  const byId = new Map<string, SavedMapAsset>();

  primaryAssets.forEach((asset) => {
    if (asset?.id) byId.set(String(asset.id), asset);
  });

  referenceAssets.forEach((asset) => {
    if (!asset?.id) return;
    const existing = byId.get(String(asset.id));
    byId.set(String(asset.id), existing ? { ...asset, ...existing } : asset);
  });

  return Array.from(byId.values());
}

function syncWorkspaceDpStatus(
  asset: SavedMapAsset,
  status: string,
): SavedMapAsset {
  const item = asset as any;
  const nextDpDetails = {
    ...(item.dpDetails || item.properties?.dpDetails || {}),
    buildStatus: status,
  };

  return {
    ...item,
    status,
    buildStatus: status,
    dpDetails: nextDpDetails,
    properties: {
      ...(item.properties || {}),
      status,
      buildStatus: status,
      dpDetails: {
        ...((item.properties || {}).dpDetails || {}),
        ...nextDpDetails,
        buildStatus: status,
      },
    },
  } as SavedMapAsset;
}

function isHomeDropCableAsset(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset) return false;
  const item = asset as any;

  const hasLineGeometry = asset.geometry?.type === "LineString";
  const typeText = String(item.assetType || item.type || "").toLowerCase();
  const looksLikeCable =
    hasLineGeometry ||
    typeText.includes("cable") ||
    String(item.cableType || "").trim().length > 0;

  // IMPORTANT:
  // Homes normally have UPRN/home identifiers too. A homeId/uprn alone must
  // never make a point asset count as a drop cable. Only cable/line assets can
  // be counted as home drops.
  if (!looksLikeCable) return false;

  const text = [
    item.assetType,
    item.type,
    item.cableType,
    item.name,
    item.label,
    item.category,
    item.kind,
    item.installType,
    item.source,
    item.generatedBy,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    text.includes("drop") ||
    text.includes("home-drop") ||
    text.includes("home drop") ||
    text.includes("drop-cable") ||
    text.includes("drop cable") ||
    item.isDropCable === true ||
    item.isHomeDrop === true ||
    item.generatedDrop === true ||
    item.autoGeneratedDrop === true ||
    item.dropCable === true ||
    Boolean(
      item.homeId || item.connectedHomeId || item.toHomeId || item.fromHomeId,
    )
  );
}

function hasDrawableLineRoute(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const coordinates =
    asset.geometry?.type === "LineString"
      ? asset.geometry.coordinates
      : item.coordinates || item.route || item.path || item.points || item.properties?.coordinates;

  return Array.isArray(coordinates) && coordinates.length >= 2;
}

function isWorkspaceDuctAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const text = [
    item.assetType,
    item.type,
    item.jointType,
    item.name,
    item.label,
    item.category,
    item.properties?.assetType,
    item.properties?.type,
    item.properties?.name,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return text.includes("duct") && !isHomeDropCableAsset(asset);
}

function isDesignCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const type = String(item.assetType || item.type || "").toLowerCase();
  const hasLineGeometry = asset.geometry?.type === "LineString";
  const looksLikeCable = hasLineGeometry || type.includes("cable");
  return looksLikeCable && !isHomeDropCableAsset(asset) && !isWorkspaceDuctAsset(asset);
}

function isQgisExportableReferenceCable(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset || asset.geometry?.type !== "LineString") return false;
  if (isHomeDropCableAsset(asset)) return true;

  const item = asset as any;
  const text = [
    item.name,
    item.label,
    item.assetType,
    item.type,
    item.cableType,
    item.fibreCount,
    item.fiberCount,
    item.coreCount,
    item.size,
    item.category,
    item.kind,
    item.notes,
    item.properties?.name,
    item.properties?.label,
    item.properties?.assetType,
    item.properties?.type,
    item.properties?.cableType,
    item.properties?.fibreCount,
    item.properties?.fiberCount,
    item.properties?.coreCount,
    item.properties?.size,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  const looksLikeNetworkCable =
    /\b(?:12|24|36|48|96|144|288)\s*f\b/.test(text) ||
    text.includes("fulw") ||
    text.includes("ulw") ||
    text.includes("feeder") ||
    text.includes("distribution cable");

  return looksLikeNetworkCable;
}

function isWorkspaceDistributionPointAsset(
  asset: SavedMapAsset | null | undefined,
): boolean {
  if (!asset || isHomeDropCableAsset(asset)) return false;
  const item = asset as any;
  const typeText = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    item.name,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  const hasPointGeometry =
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number");

  if (!hasPointGeometry) return false;

  return (
    typeText.includes("distribution-point") ||
    typeText.includes("distribution point") ||
    typeText.includes("dp") ||
    typeText.includes("cbt") ||
    typeText.includes("afn")
  );
}

function normaliseOperationalDpStatus(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!raw) return "Planned";
  if (raw === "live") return "Live";
  if (raw === "bwip") return "BWIP";
  if (raw === "unserviceable") return "Unserviceable";
  if (
    raw === "lnrfs" ||
    raw === "live not ready" ||
    raw === "live not ready for service"
  ) {
    return "Live not ready for service";
  }
  if (raw === "planned") return "Planned";

  return String(value ?? "Planned").trim();
}

function getOperationalDpStatus(
  asset: SavedMapAsset | null | undefined,
): string {
  const item = asset as any;

  return normaliseOperationalDpStatus(
    item?.dpDetails?.buildStatus ||
      item?.properties?.dpDetails?.buildStatus ||
      item?.buildStatus ||
      item?.status ||
      item?.dpStatus ||
      item?.serviceStatus ||
      "Planned",
  );
}

function isLiveHomeAsset(asset: SavedMapAsset | null | undefined): boolean {
  const item = asset as any;
  const statusText = [
    item?.status,
    item?.buildStatus,
    item?.serviceStatus,
    item?.connectionStatus,
    item?.properties?.status,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    statusText.includes("live") ||
    statusText.includes("connected") ||
    Boolean(item?.connectedDpId || item?.connectedDP || item?.dpId)
  );
}

function normaliseWorkspaceHomeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function isDropCableLinkedToHome(
  drop: SavedMapAsset,
  home: SavedMapAsset,
): boolean {
  if (!isHomeDropCableAsset(drop)) return false;
  const dropItem = drop as any;
  const homeItem = home as any;
  const homeKeys = [
    home.id,
    homeItem.uprn,
    homeItem.UPRN,
    homeItem.properties?.UPRN,
    homeItem.properties?.uprn,
    homeItem.homeId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const dropKeys = [
    dropItem.fromAssetId,
    dropItem.toAssetId,
    dropItem.homeId,
    dropItem.connectedHomeId,
    dropItem.toHomeId,
    dropItem.fromHomeId,
    dropItem.uprn,
    dropItem.UPRN,
  ].map((value) => String(value || "").trim());

  return homeKeys.some((key) => dropKeys.includes(key));
}

function getWorkspaceHomeConnectionStatus(
  home: SavedMapAsset,
  allAssets: SavedMapAsset[],
): "unconnected" | "connected" | "live" {
  const item = home as any;
  const ownStatus = normaliseWorkspaceHomeStatus(
    item.customerStatus ||
      item.homeStatus ||
      item.status ||
      item.buildStatus ||
      item.serviceStatus ||
      item.connectionStatus ||
      item.properties?.status,
  );

  if (ownStatus === "live") return "live";
  if (ownStatus === "connected") return "connected";

  const metadataConnection = String(
    item.connection ||
      item.connectionStatus ||
      item.properties?.connection ||
      item.properties?.connectionStatus ||
      "",
  ).toLowerCase();
  if (
    item.connectedDpId ||
    item.properties?.connectedDpId ||
    item.connectedDP ||
    item.dpId ||
    metadataConnection === "connected"
  ) {
    return "connected";
  }

  const drop = allAssets.find((asset) => isDropCableLinkedToHome(asset, home));
  if (!drop) return "unconnected";

  const dropStatus = normaliseWorkspaceHomeStatus(
    (drop as any).customerStatus ||
      (drop as any).homeStatus ||
      (drop as any).status,
  );
  return dropStatus === "live" ? "live" : "connected";
}

function getWorkspaceDpCapacityRisk(
  asset: SavedMapAsset,
  allAssets: SavedMapAsset[] = [],
): {
  risk: "OK" | "WARN" | "FULL" | "OVER";
  warning: string;
  percent: number;
} {
  const intelligence = getDpIntelligence(asset, allAssets);

  return {
    risk: intelligence.capacityRisk,
    warning: intelligence.capacityWarning,
    percent: intelligence.capacityPercent,
  };
}

function getProjectAreaLabel(area: SavedMapAsset | null | undefined): string {
  const item = area as any;
  return String(
    item?.name ||
      item?.label ||
      item?.projectName ||
      item?.id ||
      "Selected project",
  );
}

function assetMatchKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getAssetIdentityKeys(
  asset: SavedMapAsset | null | undefined,
): string[] {
  if (!asset) return [];
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
    .map(assetMatchKey)
    .filter(Boolean);
}

function resolveFullProjectAsset(
  selectedAsset: SavedMapAsset | null,
  projectAssets: SavedMapAsset[],
): SavedMapAsset | null {
  if (!selectedAsset) return null;

  const selectedKeys = new Set(getAssetIdentityKeys(selectedAsset));

  const exactMatch = projectAssets.find((candidate) =>
    getAssetIdentityKeys(candidate).some((key) => selectedKeys.has(key)),
  );

  if (!exactMatch) return selectedAsset;

  return {
    ...selectedAsset,
    ...exactMatch,
    geometry: exactMatch.geometry || selectedAsset.geometry,
  } as SavedMapAsset;
}

function findWorkspaceAssetForIssue(
  issue: AuditIssue,
  assets: SavedMapAsset[],
): SavedMapAsset | null {
  const issueKeys = new Set(
    [
      issue.assetId,
      issue.assetName,
      (issue as any).id,
      (issue as any).asset?.id,
    ]
      .map(assetMatchKey)
      .filter(Boolean),
  );

  if (!issueKeys.size) return null;

  return (
    assets.find((asset) =>
      getAssetIdentityKeys(asset).some((key) => issueKeys.has(key)),
    ) || null
  );
}

function getWorkspaceAssetTitle(
  asset: SavedMapAsset | null | undefined,
): string {
  const item = (asset || {}) as any;
  return String(
    item.name ||
      item.jointName ||
      item.label ||
      item.cableId ||
      item.assetId ||
      item.id ||
      "Unnamed asset",
  );
}

function getWorkspaceAssetType(
  asset: SavedMapAsset | null | undefined,
): string {
  const item = (asset || {}) as any;
  return String(
    item.assetType || item.type || item.jointType || item.cableType || "Asset",
  );
}


type MappingRowsByAssetId = Record<string, any[][]>;

type MappingChunkDoc = {
  rowsJson?: string;
  rows?: any[];
  chunkIndex?: number;
};

function safeParseRowsJson(value: unknown): any[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadWorkspaceJointMappingRows(
  jointId: string,
): Promise<any[][]> {
  const chunksRef = collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "jointMappings",
    jointId,
    "chunks",
  );

  const snapshot = await getDocs(chunksRef);

  return snapshot.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as MappingChunkDoc;
      let rows: any[] = [];

      if (typeof data.rowsJson === "string") {
        rows = safeParseRowsJson(data.rowsJson);
      }

      if (!rows.length && Array.isArray(data.rows)) {
        rows = data.rows.map((row: any) =>
          Array.isArray(row)
            ? row
            : Array.isArray(row?.values)
              ? row.values
              : row,
        );
      }

      return {
        id: chunkDoc.id,
        index:
          typeof data.chunkIndex === "number"
            ? data.chunkIndex
            : Number(String(chunkDoc.id).replace("chunk_", "")),
        rows: Array.isArray(rows) ? rows : [],
      };
    })
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => chunk.rows)
    .filter((row) => Array.isArray(row));
}

function normaliseCableReference(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/-]+/g, "");
}

function rowText(row: any[]): string {
  return row.map((value) => String(value ?? "")).join(" ");
}

function fibreNumberFromRow(row: any[], fallbackIndex: number): string {
  const direct = row?.[1];
  const parsed = Number(direct);
  if (Number.isFinite(parsed) && parsed > 0) return String(parsed);
  return `row-${fallbackIndex}`;
}

function cableAliases(asset: SavedMapAsset): string[] {
  const item = asset as any;
  const rawValues = [item.name, item.cableId, item.cableName, item.id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const aliases = new Set<string>();

  rawValues.forEach((raw) => {
    const normalised = normaliseCableReference(raw);
    if (normalised.length >= 3) aliases.add(normalised);

    const shortCableMatches = raw.match(
      /(?:\d+f)?(?:ulw|lc|fc|link|feeder|spine|drop)\d{1,4}/gi,
    );
    shortCableMatches?.forEach((match) => {
      const next = normaliseCableReference(match);
      if (next.length >= 3) aliases.add(next);
    });
  });

  return Array.from(aliases);
}

function calculateUsedFibresFromMappings(
  cable: SavedMapAsset,
  rowsByAssetId: MappingRowsByAssetId,
): number | null {
  const aliases = cableAliases(cable);
  if (!aliases.length) return null;

  const matchedFibres = new Set<string>();

  Object.entries(rowsByAssetId).forEach(([jointId, rows]) => {
    rows.forEach((row, rowIndex) => {
      const normalisedText = normaliseCableReference(rowText(row));
      if (!aliases.some((alias) => normalisedText.includes(alias))) return;
      matchedFibres.add(`${jointId}:${fibreNumberFromRow(row, rowIndex)}`);
    });
  });

  return matchedFibres.size || null;
}

function enrichProjectAssetsWithMappings(
  assets: SavedMapAsset[],
  rowsByAssetId: MappingRowsByAssetId,
): SavedMapAsset[] {
  if (!Object.keys(rowsByAssetId).length) return assets;

  const withJointRows = assets.map((asset) => {
    const rows = rowsByAssetId[asset.id];
    if (!rows?.length) return asset;

    return {
      ...(asset as any),
      mappingRows: rows,
      mappingRowsCount: rows.length,
      mappingRowsSummary: {
        ...((asset as any).mappingRowsSummary || {}),
        rowCount: rows.length,
      },
    } as SavedMapAsset;
  });

  return withJointRows.map((asset) => {
    const item = asset as any;
    const assetType = String(item.assetType || item.type || "").toLowerCase();
    const isCable =
      assetType.includes("cable") || asset.geometry?.type === "LineString";
    if (!isCable) return asset;

    const usedFibres = calculateUsedFibresFromMappings(asset, rowsByAssetId);
    if (usedFibres === null) return asset;

    return {
      ...item,
      usedFibres,
      fibresUsed: usedFibres,
      usedCoreCount: usedFibres,
    } as SavedMapAsset;
  });
}

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-GB");
}


function formatDistance(meters: number | undefined) {
  const value = meters ?? 0;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}


function getLineDistanceMeters(points: [number, number][]): number {
  return getTuplePathDistanceMeters(points);
}

function getWorkspaceAssetRouteLengthMeters(asset: SavedMapAsset): number {
  const item = asset as any;
  const explicitLength = Number(
    item.routeLengthMeters ??
      item.lengthMeters ??
      item.distanceMeters ??
      item.distanceM ??
      item.properties?.routeLengthMeters ??
      item.properties?.lengthMeters,
  );

  if (Number.isFinite(explicitLength) && explicitLength > 0) {
    return explicitLength;
  }

  if (asset.geometry?.type !== "LineString") return 0;

  const coordinates = asset.geometry.coordinates as [number, number][];
  return getLineDistanceMeters(coordinates);
}

function normalisePolygonRingsFromGeometry(
  geometry: SavedMapAsset["geometry"] | undefined,
): [number, number][][] {
  if (!geometry) return [];

  const type = String((geometry as any).type || "");
  const coordinates = (geometry as any).coordinates;

  if (type === "Polygon" && Array.isArray(coordinates)) {
    return coordinates.filter(Array.isArray) as [number, number][][];
  }

  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    return coordinates
      .flatMap((polygon: any) => (Array.isArray(polygon) ? polygon : []))
      .filter(Array.isArray) as [number, number][][];
  }

  return [];
}

function getClosedRingDistanceMeters(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 2) return 0;

  const closedRing = [...ring];
  const first = closedRing[0];
  const last = closedRing[closedRing.length - 1];

  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    closedRing.push(first);
  }

  return getLineDistanceMeters(closedRing);
}

function getPolygonRingAreaSquareMeters(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;

  const radius = 6378137;
  const toRad = (value: number) => (value * Math.PI) / 180;
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [lat1, lng1] = ring[index];
    const [lat2, lng2] = ring[(index + 1) % ring.length];

    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      continue;
    }

    area +=
      toRad(lng2 - lng1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  return Math.abs((area * radius * radius) / 2);
}

function getWorkspaceAreaMetrics(area: SavedMapAsset | null | undefined): {
  areaSquareMeters: number;
  boundaryLengthMeters: number;
} {
  const rings = normalisePolygonRingsFromGeometry(area?.geometry);

  if (!rings.length) {
    return { areaSquareMeters: 0, boundaryLengthMeters: 0 };
  }

  // Imported APX AGs may arrive as MultiPolygons. Treat every ring as part of
  // the selected AG boundary so the KPI reflects the geometry on screen.
  return rings.reduce(
    (totals, ring) => ({
      areaSquareMeters:
        totals.areaSquareMeters + getPolygonRingAreaSquareMeters(ring),
      boundaryLengthMeters:
        totals.boundaryLengthMeters + getClosedRingDistanceMeters(ring),
    }),
    { areaSquareMeters: 0, boundaryLengthMeters: 0 },
  );
}

function formatAreaSize(squareMeters: number | undefined): string {
  const value = squareMeters ?? 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)} km²`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)} ha`;
  return `${Math.round(value).toLocaleString("en-GB")} m²`;
}

type TraceHighlightKind =
  | "selected"
  | "upstream"
  | "downstream"
  | "branch"
  | "home"
  | "fibre"
  | "qa";

function addTraceHighlight(
  highlights: Record<string, TraceHighlightKind>,
  asset: SavedMapAsset | null | undefined,
  kind: TraceHighlightKind,
) {
  if (!asset) return;

  const keys = getAssetIdentityKeys(asset);
  keys.forEach((key) => {
    if (!key) return;
    if (highlights[key] === "selected") return;
    highlights[key] = kind;
  });
}

function getTraceHighlightIdList(
  highlights: Record<string, TraceHighlightKind>,
): string[] {
  return Object.keys(highlights).filter(Boolean);
}

function useWorkspaceViewport() {
  const getWidth = () =>
    typeof window === "undefined" ? 1440 : window.innerWidth;
  const [width, setWidth] = useState<number>(getWidth);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return {
    width,
    isPhone: width < 768,
    isTablet: width >= 768 && width <= 1280,
    isCompact: width <= 1280,
  };
}

export default function ProjectWorkspace({
  projectName,
  status = "Build Phase",
  stats,
  onBackToMap,
  onOpenTrace,
  onOpenQA,
  onOpenFibreTopology,
  onOpenJointEditor,
  onOpenDuctEditor,
  onOpenDistributionPointEditor,
  onOpenAudit,
  onExport,
  onUpdateWorkspaceAsset,
  activeBusinessId,
  projectArea = null,
  projectAssets = [],
  openreachAssets = [],
  projectAreas = [],
  activeProjectId = null,
  onSelectProject,
  onBulkUpdateDpStatus,
  onBulkUpdateCablePiaNoi,
  onBulkUpdateJointInstallMethod,
  onBulkUpdateWorkStatus,
  onRecordDailyProgress,
  onUpdateDpStatus,
  onClearDpFibreAllocations,
  onResolveDuplicateHomes,
  onAutoSpreadStackedHomes,
  onApplyAddressSheetAssignments,
  onApplySbRouteAssignments,
}: ProjectWorkspaceProps) {
  const { isPhone, isTablet, isCompact } = useWorkspaceViewport();
  const { isAdmin, isSuperUser } = useUserRole();
  const canManageWalkOff = isAdmin || isSuperUser;
  const canViewCommercial = isAdmin || isSuperUser;
  const isHarrellicommsBackhaulWorkspace =
    isHarrellicommsBusiness(activeBusinessId) &&
    getAreaWorkType(projectArea) === "data-centre";
  const visibleWorkspaceTabs = useMemo(
    () =>
      tabs.filter((tab) => {
        if (isHarrellicommsBackhaulWorkspace && HARRELLICOMMS_BACKHAUL_HIDDEN_TABS.has(tab.id)) {
          return false;
        }
        return canViewCommercial || tab.id !== "commercial";
      }),
    [canViewCommercial, isHarrellicommsBackhaulWorkspace],
  );

  // Keep the Project Workspace as the desktop engineering view on mobile/tablet.
  // Same principle as FibreTrayEditor, StreetCabDesigner and ExchangeDesigner:
  // do not rebuild into mobile cards; scale the full workspace canvas and let users pan/scroll.
  const workspaceCanvasScale = isPhone ? 0.56 : isTablet ? 0.85 : 1;
  const useScaledWorkspaceCanvas = isPhone || isTablet;

  const [openreachLayers, setOpenreachLayers] =
    React.useState<OpenreachLayerVisibility>(defaultOpenreachLayers);

  const [selectedWorkspaceAsset, setSelectedWorkspaceAsset] =
    useState<SavedMapAsset | null>(null);
  const [localAssetOverrides, setLocalAssetOverrides] = useState<Record<string, SavedMapAsset>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [projectAreaSearchTerm, setProjectAreaSearchTerm] = useState("");
  const [projectAreaSearchFocused, setProjectAreaSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window === "undefined") return "overview";
    try {
      const requestedTab = window.localStorage.getItem(
        "alistra-workspace-return-tab",
      ) as WorkspaceTab | null;
      if (
        requestedTab &&
        visibleWorkspaceTabs.some((tab) => tab.id === requestedTab)
      ) {
        window.localStorage.removeItem("alistra-workspace-return-tab");
        return requestedTab;
      }
    } catch {
      // Ignore localStorage issues in private browsing.
    }
    return "overview";
  });
  const [mappingRowsByAssetId, setMappingRowsByAssetId] =
    useState<MappingRowsByAssetId>({});
  const [managerAreaPoints, setManagerAreaPoints] = useState<
    { lat: number; lng: number }[]
  >([]);
  const [isManagerAreaDrawing, setIsManagerAreaDrawing] = useState(false);
  const [mobileQuickPanel, setMobileQuickPanel] = useState<
    "none" | "dps" | "homes" | "qa" | "actions"
  >("none");
  const [piaAssetSearchTerm, setPiaAssetSearchTerm] = useState("");
  const [piaStatusFilter, setPiaStatusFilter] = useState<PiaAcceptanceStatus | "all">("all");
  const [piaContractorFilter, setPiaContractorFilter] = useState("all");


  useEffect(() => {
    if (!isPhone && mobileQuickPanel !== "none") setMobileQuickPanel("none");
  }, [isPhone, mobileQuickPanel]);

  const mappingAssetKey = useMemo(
    () =>
      projectAssets
        .filter((asset) =>
          Boolean(
            (asset as any).mappingRowsRef || (asset as any).mappingRowsCount,
          ),
        )
        .map(
          (asset) =>
            `${asset.id}:${(asset as any).mappingRowsCount || 0}:${(asset as any).updatedAt || ""}`,
        )
        .sort()
        .join("|"),
    [projectAssets],
  );

  useEffect(() => {
    let cancelled = false;

    const assetsWithSharedMappings = projectAssets.filter((asset) =>
      Boolean((asset as any).mappingRowsRef || (asset as any).mappingRowsCount),
    );

    if (!assetsWithSharedMappings.length) {
      setMappingRowsByAssetId((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return;
    }

    Promise.all(
      assetsWithSharedMappings.map(async (asset) => {
        try {
          const rows = await loadWorkspaceJointMappingRows(asset.id);
          return [asset.id, rows] as const;
        } catch (err) {
          console.error(
            `Failed to load workspace mapping rows for ${asset.name || asset.id}`,
            err,
          );
          return [asset.id, []] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;

      const next = Object.fromEntries(entries);
      const nextKey = entries
        .map(([assetId, rows]) => `${assetId}:${rows.length}`)
        .sort()
        .join("|");

      setMappingRowsByAssetId((prev) => {
        const prevKey = Object.entries(prev)
          .map(([assetId, rows]) => `${assetId}:${rows.length}`)
          .sort()
          .join("|");

        return prevKey === nextKey ? prev : next;
      });
    });

    return () => {
      cancelled = true;
    };
    // Depend on the stable mapping key only. projectAssets can be a new array
    // every render, and including it here caused the mapping load effect to
    // set state repeatedly and trip React's maximum update depth guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingAssetKey]);

  const workspaceAssets = useMemo(() => {
    const enrichedAssets = enrichProjectAssetsWithMappings(projectAssets, mappingRowsByAssetId);
    if (!Object.keys(localAssetOverrides).length) return enrichedAssets;

    return enrichedAssets.map((asset) => {
      const override = localAssetOverrides[asset.id];
      return override
        ? ({
            ...asset,
            ...override,
            geometry: override.geometry || asset.geometry,
          } as SavedMapAsset)
        : asset;
    });
  }, [projectAssets, mappingRowsByAssetId, localAssetOverrides]);

  const operationalWorkspaceAssets = useMemo(
    () => workspaceAssets.filter(isOperationalAssetRegisterAsset),
    [workspaceAssets],
  );
  const operationalWorkspaceAssetKeys = useMemo(() => {
    const keys = new Set<string>();
    operationalWorkspaceAssets.forEach((asset) => {
      getAssetIdentityKeys(asset).forEach((key) => keys.add(key));
    });
    return keys;
  }, [operationalWorkspaceAssets]);

  const openreachWorkspaceAssets = useMemo(
    () =>
      openreachAssets
        .filter(isWorkspaceOpenreachReferenceAsset)
        .map((asset) => {
          const override = localAssetOverrides[asset.id];
          return override
            ? ({
                ...asset,
                ...override,
                geometry: override.geometry || asset.geometry,
              } as SavedMapAsset)
            : asset;
        }),
    [openreachAssets, localAssetOverrides],
  );

  const allWorkspaceSelectableAssets = useMemo(
    () => mergeWorkspaceAssetsById(workspaceAssets, openreachWorkspaceAssets),
    [workspaceAssets, openreachWorkspaceAssets],
  );

  const canonicalHomeSummary = useMemo(
    () => buildCanonicalHomeSummary(workspaceAssets),
    [workspaceAssets],
  );

  const fullSelectedWorkspaceAsset = useMemo(
    () => resolveFullProjectAsset(selectedWorkspaceAsset, allWorkspaceSelectableAssets),
    [selectedWorkspaceAsset, allWorkspaceSelectableAssets],
  );
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<WorkspaceLayerVisibility>(
    defaultWorkspaceLayers,
  );
  const [jobPackCaptureRequest, setJobPackCaptureRequest] =
    useState<JobPackMapCaptureRequest | null>(null);
  const jobPackCaptureResolverRef = useRef<{
    target: JobPackMapCaptureTarget;
    resolve: (imageDataUrl: string) => void;
  } | null>(null);
  const [isHeaderQgisExporting, setIsHeaderQgisExporting] = useState(false);
  const [activeOperationPanel, setActiveOperationPanel] =
    useState<WorkspaceOperationPanel>("none");
  const [activeIssueSeverity, setActiveIssueSeverity] =
    useState<QaIssueSeverity | null>(null);
  const [activeIssueCategory, setActiveIssueCategory] = useState<string | null>(
    null,
  );
  const [qaPanelViewMode, setQaPanelViewMode] =
    useState<QaPanelViewMode>("navigator");
  const [issueNavigatorIndex, setIssueNavigatorIndex] = useState(0);
  const [workspaceHeavyPassReady, setWorkspaceHeavyPassReady] = useState(false);
  const [walkOffAuditOpen, setWalkOffAuditOpen] = useState(false);
  const [walkOffStatus, setWalkOffStatus] = useState<
    "Pending" | "Approved" | "Review Required" | "Blocked"
  >("Pending");
  const [walkOffSavedAt, setWalkOffSavedAt] = useState<string>("");
  const [latestWalkOffAudit, setLatestWalkOffAudit] =
    useState<AuditLog | null>(null);

  const requestSingleJobPackMapCapture = (target: JobPackMapCaptureTarget) =>
    new Promise<string>((resolve) => {
      jobPackCaptureResolverRef.current = { target, resolve };
      setJobPackCaptureRequest({ id: Date.now() + Math.floor(Math.random() * 1000), target });
    });

  const requestJobPackMapCaptures = async (targets: JobPackMapCaptureTarget[]) => {
    const captures: Partial<Record<JobPackMapCaptureTarget, string>> = {};
    const previousLayers = visibleLayers;

    setVisibleLayers({
      ...defaultWorkspaceLayers,
      projectBoundary: true,
      areas: true,
      ducts: true,
      cables: true,
      dropCables: false,
      joints: true,
      dps: true,
      poles: true,
      chambers: true,
      streetCabs: false,
      dataCentres: true,
      homes: false,
      other: false,
    });

    for (const target of targets) {
      captures[target] = await requestSingleJobPackMapCapture(target);
    }

    setJobPackCaptureRequest(null);
    setVisibleLayers(previousLayers);
    return captures;
  };

  const handleJobPackMapCaptured = (target: JobPackMapCaptureTarget, imageDataUrl: string) => {
    const resolver = jobPackCaptureResolverRef.current;
    if (!resolver || resolver.target !== target) return;
    jobPackCaptureResolverRef.current = null;
    resolver.resolve(imageDataUrl);
  };

  const clearWorkspaceOperationState = () => {
    setActiveOperationPanel("none");
    setActiveIssueSeverity(null);
    setActiveIssueCategory(null);
    setIssueNavigatorIndex(0);
  };

  const handleWorkspaceTabChange = (tab: WorkspaceTab) => {
    if (
      isHarrellicommsBackhaulWorkspace &&
      HARRELLICOMMS_BACKHAUL_HIDDEN_TABS.has(tab)
    ) {
      setActiveTab("overview");
      setSelectedWorkspaceAsset(null);
      clearWorkspaceOperationState();
      return;
    }
    if (tab === "commercial" && !canViewCommercial) {
      setActiveTab("overview");
      setSelectedWorkspaceAsset(null);
      clearWorkspaceOperationState();
      return;
    }
    setActiveTab(tab);
    setSelectedWorkspaceAsset(null);
    clearWorkspaceOperationState();
  };

  useEffect(() => {
    if (
      (activeTab === "commercial" && !canViewCommercial) ||
      (isHarrellicommsBackhaulWorkspace &&
        HARRELLICOMMS_BACKHAUL_HIDDEN_TABS.has(activeTab))
    ) {
      setActiveTab("overview");
      clearWorkspaceOperationState();
    }
  }, [activeTab, canViewCommercial, isHarrellicommsBackhaulWorkspace]);

  useEffect(() => {
    setWorkspaceHeavyPassReady(false);
    const timeoutId = window.setTimeout(() => {
      setWorkspaceHeavyPassReady(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeProjectId, projectArea?.id, projectName]);

  const needsQaAnalysis =
    workspaceHeavyPassReady &&
    (activeTab === "overview" ||
      activeTab === "qa" ||
      activeTab === "reports" ||
      activeOperationPanel === "qa" ||
      activeOperationPanel === "issues" ||
      activeOperationPanel === "handover" ||
      activeOperationPanel === "report");

  const needsNetworkAnalysis =
    workspaceHeavyPassReady &&
    (activeTab === "topology" ||
      activeTab === "pia" ||
      activeTab === "reports" ||
      activeOperationPanel === "topology" ||
      activeOperationPanel === "trace" ||
      activeOperationPanel === "disconnected" ||
      activeOperationPanel === "report" ||
      Boolean(fullSelectedWorkspaceAsset && activeTab !== "pia"));

  // =====================================================
  // QA AREA SCOPE GUARD
  // QA must only assess assets that belong to the currently selected
  // workspace area. Older generated drops / homes can carry neighbouring
  // area references in their DP, cable, home or drop metadata, so this guard
  // is deliberately broader than the map render filter.
  //
  // Supports:
  // - explicit projectId / areaId matches
  // - full codes such as BD-BAS-AG1, BD-CLH-AG3
  // - AG-only names such as "Clayton Heights AG3"
  // - legacy Baildon South / East / West names
  // =====================================================
  const qaWorkspaceAssets = useMemo(() => {
    const normaliseScopeText = (value: unknown) =>
      String(value || "")
        .toUpperCase()
        .replace(/[_/]+/g, "-")
        .replace(/\s+/g, " ")
        .trim();

    const projectText = [
      projectName,
      activeProjectId,
      (projectArea as any)?.id,
      (projectArea as any)?.projectId,
      (projectArea as any)?.areaId,
      (projectArea as any)?.name,
      (projectArea as any)?.label,
      (projectArea as any)?.projectName,
      (projectArea as any)?.areaName,
      (projectArea as any)?.code,
      (projectArea as any)?.areaCode,
    ]
      .map(normaliseScopeText)
      .filter(Boolean)
      .join(" ");

    const extractFullAreaCodes = (text: string): string[] => {
      const matches = text.match(/\b[A-Z]{2,4}-[A-Z]{2,6}-AG\d+\b/g) || [];
      return Array.from(new Set(matches));
    };

    const extractAgCodes = (text: string): string[] => {
      const matches = text.match(/\bAG\s*0*\d+\b/g) || [];
      return Array.from(
        new Set(matches.map((match) => match.replace(/\s+/g, ""))),
      );
    };

    const expectedFullCodes = new Set(extractFullAreaCodes(projectText));
    const expectedAgCodes = new Set(extractAgCodes(projectText));

    // Legacy friendly names that do not always include the BD code.
    if (projectText.includes("BAILDON SOUTH")) expectedFullCodes.add("BD-BAS-AG1");
    if (projectText.includes("BAILDON EAST")) expectedFullCodes.add("BD-BAE-AG1");
    if (projectText.includes("BAILDON WEST")) expectedFullCodes.add("BD-BAW-AG1");

    const currentProjectIds = new Set(
      [
        activeProjectId,
        (projectArea as any)?.id,
        (projectArea as any)?.projectId,
        (projectArea as any)?.areaId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );

    if (
      expectedFullCodes.size === 0 &&
      expectedAgCodes.size === 0 &&
      currentProjectIds.size === 0
    ) {
      return workspaceAssets;
    }

    return workspaceAssets.filter((asset: SavedMapAsset) => {
      const item = asset as any;

      const assetProjectIds = [
        item.projectId,
        item.areaId,
        item.projectAreaId,
        item.activeProjectId,
        item.properties?.projectId,
        item.properties?.areaId,
        item.properties?.projectAreaId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const hasExplicitProjectId = assetProjectIds.length > 0;
      const hasMatchingProjectId = assetProjectIds.some((id) =>
        currentProjectIds.has(id),
      );

      if (hasMatchingProjectId) return true;

      // If an asset is explicitly stamped to another area/project, exclude it
      // from this QA run.
      if (hasExplicitProjectId && currentProjectIds.size > 0) return false;

      const searchableText = [
        item.id,
        item.assetId,
        item.name,
        item.jointName,
        item.label,
        item.cableId,
        item.cableName,
        item.parentCableId,
        item.throughCable,
        item.throughCableId,
        item.feedCable,
        item.connectedDpId,
        item.connectedDP,
        item.dpId,
        item.fromAssetId,
        item.toAssetId,
        item.homeId,
        item.connectedHomeId,
        item.splitterBox,
        item.assignedSplitterBox,
        item.projectName,
        item.areaName,
        item.areaCode,
        item.properties?.connectedDpId,
        item.properties?.connectedDP,
        item.properties?.dpId,
        item.properties?.splitterBox,
        item.properties?.assignedSplitterBox,
        item.properties?.projectName,
        item.properties?.areaName,
        item.properties?.areaCode,
      ]
        .map(normaliseScopeText)
        .filter(Boolean)
        .join(" ");

      if (!searchableText) return true;

      const assetFullCodes = extractFullAreaCodes(searchableText);
      const assetAgCodes = extractAgCodes(searchableText);

      if (expectedFullCodes.size > 0 && assetFullCodes.length > 0) {
        return assetFullCodes.some((code) => expectedFullCodes.has(code));
      }

      if (expectedAgCodes.size > 0 && assetAgCodes.length > 0) {
        return assetAgCodes.some((code) => expectedAgCodes.has(code));
      }

      // If the asset clearly belongs to some other AG/area code but it did not
      // match this workspace, exclude it. This stops Clayton Heights QA from
      // pulling in BD-BAS / Baildon South drops and similar historic data.
      if (assetFullCodes.length > 0 || assetAgCodes.length > 0) return false;

      // Uncoded legacy assets are kept because they may still be valid assets
      // inside an area that has not been permanently stamped yet.
      return true;
    });
  }, [activeProjectId, projectArea, projectName, workspaceAssets]);

  const auditIssues = useMemo(() => {
    if (!needsQaAnalysis) return [];

    const rawIssues = auditAreaAssets(qaWorkspaceAssets, workspaceAssets);

    return rawIssues.filter((issue) => {
      const issueText = String(
        (issue as any).message ||
          (issue as any).title ||
          (issue as any).reason ||
          (issue as any).description ||
          issue.issue ||
          "",
      ).toLowerCase();

      const assetText = String(
        issue.assetType || issue.assetName || "",
      ).toLowerCase();

      const isHomeNameIssue =
        (issueText.includes("no name") ||
          issueText.includes("missing name") ||
          issueText.includes("unnamed")) &&
        (assetText.includes("home") ||
          assetText.includes("premise") ||
          assetText.includes("flat") ||
          assetText.includes("mdu"));

      // Ignore temporary unnamed-home QA issues
      if (isHomeNameIssue) {
        return false;
      }

      return true;
    });
  }, [needsQaAnalysis, qaWorkspaceAssets, workspaceAssets]);
  const emptyNetworkState = useMemo(() => buildNetworkState([]), []);
  const networkState = useMemo(
    () =>
      needsNetworkAnalysis
        ? buildNetworkState(operationalWorkspaceAssets)
        : emptyNetworkState,
    [emptyNetworkState, needsNetworkAnalysis, operationalWorkspaceAssets],
  );

  const networkGraph = networkState.graph;

  const disconnectedAssets = useMemo(
  () =>
    networkState.nodes.filter((node) => {
      const asset: any = node.asset;
      const assetKeys = getAssetIdentityKeys(asset);

      if (
        !isOperationalAssetRegisterAsset(asset) ||
        !assetKeys.some((key) => operationalWorkspaceAssetKeys.has(key))
      ) {
        return false;
      }

      // Ignore AFN/SB DPs because they may be fed
      // from a cable outside the current project area.
      const text = [
        asset?.closureType,
        asset?.dpType,
        asset?.jointType,
        asset?.name,
      ]
        .join(" ")
        .toLowerCase();

      if (
        text.includes("afn") ||
        text.includes("sb") ||
        text.includes("splitter")
      ) {
        return false;
      }

      return node.connectedTo.length === 0;
    }),
  [networkState, operationalWorkspaceAssetKeys],
);

  const areaDistributionPoints = useMemo(
    () => workspaceAssets.filter((asset) => isDistributionPointAsset(asset)),
    [workspaceAssets],
  );

  const handleClearAreaDpFibreAllocations = () => {
    const assetIds = areaDistributionPoints
      .map((asset) => asset.id)
      .filter(Boolean);

    if (!assetIds.length) {
      alert("No DPs were found inside this selected project area.");
      return;
    }

    const confirmed = window.confirm(
      `Clear fibre allocations from ${assetIds.length} DP${assetIds.length === 1 ? "" : "s"} in ${projectName}?\n\nThis keeps DP names, closure types, homes, photos, notes, status and selected through-cables. It only clears fibre allocation/routing state so Rebuild Chain can calculate cleanly.`,
    );

    if (!confirmed) return;

    const note = window.prompt(
      "Audit note required: why are you clearing DP fibre allocations in this area?",
      "Clear DP fibre allocations ready for Rebuild Chain",
    );

    if (note === null) return;

    const trimmed = note.trim();
    if (!trimmed) {
      alert("An audit note is required before clearing DP fibre allocations.");
      return;
    }

    onClearDpFibreAllocations?.({
      assetIds,
      note: trimmed,
    });
  };

  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (query.length < 2) return [];

    return workspaceAssets
      .filter((asset) => assetSearchText(asset).includes(query))
      .slice(0, 12);
  }, [workspaceAssets, searchTerm]);

  const designCableCount = useMemo(
    () => workspaceAssets.filter(isDesignCableAsset).length,
    [workspaceAssets],
  );

  const dropCableCount = useMemo(
    () => workspaceAssets.filter((asset) => isHomeDropCableAsset(asset) && hasDrawableLineRoute(asset)).length,
    [workspaceAssets],
  );

  const dpClosureCount = useMemo(
    () => workspaceAssets.filter(isWorkspaceDistributionPointAsset).length,
    [workspaceAssets],
  );

  const displayStats = useMemo(() => {
    const homesPassed = canonicalHomeSummary.homesPassed;
    const homesConnected = canonicalHomeSummary.homesConnected;
    const homesLive = canonicalHomeSummary.homesLive;
    const rfsPercent = homesPassed
      ? Math.round((homesLive / homesPassed) * 100)
      : 0;

    return {
      ...stats,
      homesPassed,
      homesConnected,
      rfsPercent,
      dps: dpClosureCount,
      cables: designCableCount,
      designCables: designCableCount,
      dropCables: dropCableCount,
      issueCount: auditIssues.length,
    };
  }, [
    stats,
    canonicalHomeSummary,
    dpClosureCount,
    designCableCount,
    dropCableCount,
    auditIssues.length,
  ]);


  const workspaceRouteLengthMeters = useMemo(
    () =>
      workspaceAssets
        .filter(isDesignCableAsset)
        .reduce(
          (total, asset) => total + getWorkspaceAssetRouteLengthMeters(asset),
          0,
        ),
    [workspaceAssets],
  );


  const workspaceAreaMetrics = useMemo(
    () => getWorkspaceAreaMetrics(projectArea),
    [projectArea],
  );

  const deliveryPhase = useMemo(
    () => getWorkspaceDeliveryPhase(projectArea, status),
    [projectArea, status],
  );

  const deliveryPhaseConfig = useMemo(
    () =>
      isHarrellicommsBackhaulWorkspace
        ? getBackhaulDeliveryPhaseConfig(deliveryPhase)
        : getDeliveryPhaseConfig(deliveryPhase),
    [deliveryPhase, isHarrellicommsBackhaulWorkspace],
  );
  const workspaceDeliveryPhaseOptions = isHarrellicommsBackhaulWorkspace
    ? backhaulDeliveryPhaseOptions
    : deliveryPhaseOptions;

  const effectiveWorkspaceStatus = deliveryPhaseConfig.statusLabel || status;

  const deliveryPhaseOverrideReason = String(
    (projectArea as any)?.deliveryPhaseOverrideReason ||
      (projectArea as any)?.properties?.deliveryPhaseOverrideReason ||
      "",
  ).trim();

  const handleDeliveryPhaseChange = (phaseId: DeliveryPhaseId) => {
    const phase = isHarrellicommsBackhaulWorkspace
      ? getBackhaulDeliveryPhaseConfig(phaseId)
      : getDeliveryPhaseConfig(phaseId);

    if (!canManageWalkOff) {
      alert("Administrator or Super User access required to change delivery stage.");
      return;
    }

    if (!projectArea?.id || !onUpdateWorkspaceAsset) {
      alert("Select a project area before changing the delivery phase.");
      return;
    }

    let reason = deliveryPhaseOverrideReason;
    if (!isHarrellicommsBackhaulWorkspace && (phase.allowsCustomerLiveWithoutPia || phase.allowsWalkOffWithoutPia)) {
      const enteredReason = window.prompt(
        `${phase.label} needs a manager note so the PIA exception is auditable.`,
        reason || "Customer service released while PIA evidence is being completed.",
      );
      if (enteredReason === null) return;
      reason = enteredReason.trim();
      if (!reason) {
        alert("A manager note is required for a PIA override phase.");
        return;
      }
    }

    const now = new Date().toISOString();
    const item = projectArea as any;
    const nextAsset = {
      ...item,
      status: phase.statusLabel,
      buildStatus: phase.statusLabel,
      deliveryPhase: phase.id,
      deliveryPhaseLabel: phase.label,
      deliveryPhaseOverrideReason: reason,
      deliveryPhaseUpdatedAt: now,
      piaGateOverride: phase.allowsCustomerLiveWithoutPia,
      piaWalkOffOverride: phase.allowsWalkOffWithoutPia,
      properties: {
        ...(item.properties || {}),
        status: phase.statusLabel,
        buildStatus: phase.statusLabel,
        deliveryPhase: phase.id,
        deliveryPhaseLabel: phase.label,
        deliveryPhaseOverrideReason: reason,
        deliveryPhaseUpdatedAt: now,
        piaGateOverride: phase.allowsCustomerLiveWithoutPia,
        piaWalkOffOverride: phase.allowsWalkOffWithoutPia,
      },
    } as SavedMapAsset;

    onUpdateWorkspaceAsset(nextAsset);
    setLocalAssetOverrides((current) => ({
      ...current,
      [nextAsset.id]: nextAsset,
    }));
  };

  // =====================================================
  // OPERATIONAL ROLLOUT KPI ENGINE
  // Derived only from already-scoped workspace assets so this
  // does not create a second persistence path or Firestore write flow.
  // =====================================================
  const rolloutKpis = useMemo(() => {
    const dpAssets = workspaceAssets.filter(isWorkspaceDistributionPointAsset);
    const homesPassed = canonicalHomeSummary.homesPassed;
    const homesLive = canonicalHomeSummary.homesLive;

    const dpStatusCounts = dpAssets.reduce(
      (counts, asset) => {
        const statusValue = getOperationalDpStatus(asset);

        if (statusValue === "Live") counts.live += 1;
        else if (statusValue === "BWIP") counts.bwip += 1;
        else if (statusValue === "Unserviceable") counts.unserviceable += 1;
        else if (statusValue === "Live not ready for service")
          counts.lnrfs += 1;
        else counts.planned += 1;

        return counts;
      },
      { live: 0, bwip: 0, lnrfs: 0, unserviceable: 0, planned: 0 },
    );

    const dpCapacityStates = dpAssets.map((asset) =>
      getWorkspaceDpCapacityRisk(asset, workspaceAssets),
    );
    const dpNearCapacity = dpCapacityStates.filter(
      (state) => state.risk === "WARN" || state.risk === "FULL",
    ).length;
    const dpOverCapacity = dpCapacityStates.filter(
      (state) => state.risk === "OVER",
    ).length;

    const dpTotal = dpAssets.length || Number(displayStats?.dps || 0);
    const buildCompletionPercent = dpTotal
      ? Math.round((dpStatusCounts.live / dpTotal) * 100)
      : 0;

    const homesNotLive = Math.max(homesPassed - homesLive, 0);

    return {
      homesPassed,
      homesLive,
      homesNotLive,
      rfsPercent: homesPassed ? Math.round((homesLive / homesPassed) * 100) : 0,
      dpTotal,
      dpLive: dpStatusCounts.live,
      dpBwip: dpStatusCounts.bwip,
      dpLnrfs: dpStatusCounts.lnrfs,
      dpUnserviceable: dpStatusCounts.unserviceable,
      dpPlanned: dpStatusCounts.planned,
      dpNearCapacity,
      dpOverCapacity,
      buildCompletionPercent,
      qaIssues: auditIssues.length || Number(displayStats?.issueCount || 0),
      disconnectedAssets: disconnectedAssets.length,
      routeLengthMeters: workspaceRouteLengthMeters,
    };
  }, [
    workspaceAssets,
    canonicalHomeSummary,
    displayStats,
    workspaceRouteLengthMeters,
    auditIssues.length,
    disconnectedAssets.length,
  ]);

  const operationalReadiness = useMemo(
    () =>
      buildAreaReadiness({
        rolloutKpis,
        auditIssues,
        status: effectiveWorkspaceStatus,
      }),
    [rolloutKpis, auditIssues, effectiveWorkspaceStatus],
  );

  const workspaceDisplayStats = useMemo(
    () => ({
      ...displayStats,
      rolloutKpis,
      operationalReadiness,
      deliveryPhase,
      deliveryPhaseLabel: deliveryPhaseConfig.label,
      deliveryPhaseDescription: deliveryPhaseConfig.description,
      deliveryPhaseOverrideReason,
      readinessState: operationalReadiness.state,
      readinessScore: operationalReadiness.score,
      readinessBlockers: operationalReadiness.blockers,
      readinessNextActions: operationalReadiness.nextActions,
    }),
    [
      displayStats,
      rolloutKpis,
      operationalReadiness,
      deliveryPhase,
      deliveryPhaseConfig,
      deliveryPhaseOverrideReason,
    ],
  );

  const issueBuckets = useMemo(
    () => ({
      high: auditIssues.filter(
        (issue) => normaliseIssueSeverity(issue.severity) === "high",
      ),
      medium: auditIssues.filter(
        (issue) => normaliseIssueSeverity(issue.severity) === "medium",
      ),
      low: auditIssues.filter(
        (issue) => normaliseIssueSeverity(issue.severity) === "low",
      ),
    }),
    [auditIssues],
  );

  const selectedIssueSeverity = useMemo<QaIssueSeverity | null>(() => {
    if (activeIssueSeverity) return activeIssueSeverity;
    if (issueBuckets.high.length) return "high";
    if (issueBuckets.medium.length) return "medium";
    if (issueBuckets.low.length) return "low";
    return null;
  }, [
    activeIssueSeverity,
    issueBuckets.high.length,
    issueBuckets.medium.length,
    issueBuckets.low.length,
  ]);

  const selectedSeverityIssues = useMemo(
    () =>
      selectedIssueSeverity ? issueBuckets[selectedIssueSeverity] : auditIssues,
    [auditIssues, issueBuckets, selectedIssueSeverity],
  );

  const qaIssueCategoryGroups = useMemo(
    () => groupAuditIssuesByCategory(selectedSeverityIssues),
    [selectedSeverityIssues],
  );

  const selectedIssueCategoryKey = useMemo(() => {
    if (
      activeIssueCategory &&
      qaIssueCategoryGroups.some((group) => group.key === activeIssueCategory)
    ) {
      return activeIssueCategory;
    }
    return qaIssueCategoryGroups[0]?.key ?? null;
  }, [activeIssueCategory, qaIssueCategoryGroups]);

  const selectedIssueCategoryGroup = useMemo(
    () =>
      qaIssueCategoryGroups.find(
        (group) => group.key === selectedIssueCategoryKey,
      ) || null,
    [qaIssueCategoryGroups, selectedIssueCategoryKey],
  );

  const selectedCategoryIssues = selectedIssueCategoryGroup?.issues || [];
  const selectedNavigatorIssue = selectedCategoryIssues.length
    ? selectedCategoryIssues[
        Math.min(issueNavigatorIndex, selectedCategoryIssues.length - 1)
      ]
    : null;

  useEffect(() => {
    setIssueNavigatorIndex(0);
  }, [selectedIssueSeverity, selectedIssueCategoryKey]);

  // =====================================================
  // KPI DRILL-DOWN DATA
  // These lists power the clickable KPI cards at the top of the workspace.
  // They are derived from the same scoped workspace assets already used by
  // the KPI engine, and do not create or change any storage path.
  // =====================================================
  const canonicalHomeAssets = useMemo(
    () => canonicalHomeSummary.homes,
    [canonicalHomeSummary],
  );

  const homesLiveAssets = useMemo(
    () =>
      canonicalHomeSummary.records
        .filter((record) => record.status !== "unconnected" && !record.serviceBlocked)
        .map((record) => record.home),
    [canonicalHomeSummary],
  );

  const homesNotLiveAssets = useMemo(
    () =>
      canonicalHomeSummary.records
        .filter((record) => record.status === "unconnected" || record.serviceBlocked)
        .map((record) => record.home),
    [canonicalHomeSummary],
  );

  const disconnectedWorkspaceAssets = useMemo(() => {
    return disconnectedAssets
      .map((node: any) => {
        if (node?.asset) return node.asset as SavedMapAsset;
        const rawId = String(node?.id || node?.assetId || node?.name || "")
          .trim()
          .toLowerCase();
        if (!rawId) return null;
        return (
          workspaceAssets.find((asset) =>
            getAssetIdentityKeys(asset).some((key) => key === rawId),
          ) || null
        );
      })
      .filter((asset): asset is SavedMapAsset => Boolean(asset));
  }, [disconnectedAssets, workspaceAssets]);

  const capacityRiskAssets = useMemo(
    () =>
      areaDistributionPoints
        .map((asset) => ({
          asset,
          capacity: getWorkspaceDpCapacityRisk(asset, workspaceAssets),
        }))
        .filter(
          ({ capacity }) =>
            capacity.risk === "WARN" ||
            capacity.risk === "FULL" ||
            capacity.risk === "OVER",
        ),
    [areaDistributionPoints, workspaceAssets],
  );

  const openKpiDrilldown = (
    panel: WorkspaceOperationPanel,
    tab: WorkspaceTab,
  ) => {
    setActiveTab(tab);
    setActiveIssueSeverity(null);
    setSelectedWorkspaceAsset(null);
    setSearchTerm("");
    setActiveOperationPanel(panel);
  };

  const traceHighlightKinds = useMemo(() => {
    const highlights: Record<string, TraceHighlightKind> = {};

    if (activeOperationPanel !== "trace" || !fullSelectedWorkspaceAsset) {
      return highlights;
    }

    addTraceHighlight(highlights, fullSelectedWorkspaceAsset, "selected");

    return highlights;
  }, [
    activeOperationPanel,
    fullSelectedWorkspaceAsset,
  ]);

  const traceHighlightedAssetIds = useMemo(
    () => getTraceHighlightIdList(traceHighlightKinds),
    [traceHighlightKinds],
  );

  const kpiDrilldownHighlightedAssetIds = useMemo(() => {
    const targets =
      activeOperationPanel === "homesNotLive"
        ? homesNotLiveAssets
        : activeOperationPanel === "homesLive"
          ? homesLiveAssets
          : activeOperationPanel === "disconnected"
            ? disconnectedWorkspaceAssets
            : activeOperationPanel === "capacity"
              ? capacityRiskAssets.map((row) => row.asset)
              : [];

    const ids = new Set<string>();
    targets.forEach((asset) => {
      getAssetIdentityKeys(asset).forEach((key) => ids.add(key));
    });
    return Array.from(ids);
  }, [
    activeOperationPanel,
    homesNotLiveAssets,
    homesLiveAssets,
    disconnectedWorkspaceAssets,
    capacityRiskAssets,
  ]);

  const workspaceHighlightedAssetIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...traceHighlightedAssetIds,
          ...kpiDrilldownHighlightedAssetIds,
        ]),
      ),
    [traceHighlightedAssetIds, kpiDrilldownHighlightedAssetIds],
  );

  const openOperationPanel = (
    panel: WorkspaceOperationPanel,
    tab?: WorkspaceTab,
  ) => {
    if (
      isHarrellicommsBackhaulWorkspace &&
      HARRELLICOMMS_BACKHAUL_HIDDEN_PANELS.has(panel)
    ) {
      setActiveTab("overview");
      setActiveOperationPanel("none");
      return;
    }
    if (tab) setActiveTab(tab);
    setActiveOperationPanel(panel);
  };

  const handleSearchSelect = (asset: SavedMapAsset) => {
    setSelectedWorkspaceAsset(asset);
    setSearchTerm(getWorkspaceAssetTitle(asset));
    setSearchFocused(false);
    setActiveOperationPanel("none");
    setActiveTab("assets");
  };

  const openInternalTraceTool = () => {
    setActiveTab("assets");
    setActiveOperationPanel("none");
  };

  const openIssueSeverity = (severity: QaIssueSeverity) => {
    setActiveIssueSeverity(severity);
    setActiveIssueCategory(null);
    setIssueNavigatorIndex(0);
    setActiveTab("qa");
    // QA now lives inside the QA tab itself. Do not open the old bottom
    // operation drawer or the user sees duplicate High/Medium/Low panels.
    setActiveOperationPanel("none");
  };

  const handleAuditIssueSelect = (issue: AuditIssue) => {
    const matchedAsset = findWorkspaceAssetForIssue(issue, workspaceAssets);
    if (matchedAsset) {
      setSelectedWorkspaceAsset(matchedAsset);
      setSearchTerm(getWorkspaceAssetTitle(matchedAsset));
    }
    setActiveTab("qa");
    // Keep QA review in the QA tab only; avoid duplicating the QA operation drawer.
    setActiveOperationPanel("none");
  };

  const openSelectedNavigatorIssue = () => {
    if (!selectedNavigatorIssue) return;
    handleAuditIssueSelect(selectedNavigatorIssue);
  };

  const moveNavigatorIssue = (direction: -1 | 1) => {
    if (!selectedCategoryIssues.length) return;
    setIssueNavigatorIndex((current) => {
      const next = current + direction;
      if (next < 0) return selectedCategoryIssues.length - 1;
      if (next >= selectedCategoryIssues.length) return 0;
      return next;
    });
  };

  const handleGenerateReport = () => {
    const normaliseCsvValue = (value: unknown): string => {
      if (value === undefined || value === null) return "";
      return String(value)
        .replace(/\r?\n|\r/g, " ")
        .trim();
    };

    const csvCell = (value: unknown): string => {
      const text = normaliseCsvValue(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const csvRow = (values: unknown[]): string => values.map(csvCell).join(",");

    const assetTypeBucket = (asset: SavedMapAsset): string => {
      if (isWorkspaceDistributionPointAsset(asset)) return "Distribution Point";
      if (isHomeDropCableAsset(asset)) return "Drop Cable";
      if (isDesignCableAsset(asset)) return "Design Cable";

      const rawType = String(getWorkspaceAssetType(asset)).toLowerCase();
      if (
        rawType.includes("joint") ||
        rawType.includes("cmj") ||
        rawType.includes("midj") ||
        rawType.includes("lmj")
      )
        return "Joint";
      if (rawType.includes("pole")) return "Pole";
      if (rawType.includes("chamber")) return "Chamber";
      if (rawType.includes("cab")) return "Street Cabinet";
      if (rawType.includes("home") || rawType.includes("premise"))
        return "Home";
      if (rawType.includes("area") || rawType.includes("polygon"))
        return "Area";
      return getWorkspaceAssetType(asset);
    };

    const assetStatus = (asset: SavedMapAsset): string => {
      const item = asset as any;
      if (isWorkspaceDistributionPointAsset(asset))
        return getOperationalDpStatus(asset);
      if (assetTypeBucket(asset) === "Home")
        return isLiveHomeAsset(asset)
          ? "Live / Connected"
          : String(
              item.status ||
                item.buildStatus ||
                item.serviceStatus ||
                "Not live",
            );
      return String(
        item.status ||
          item.buildStatus ||
          item.serviceStatus ||
          item.dpStatus ||
          "",
      );
    };

    const pointText = (asset: SavedMapAsset): string => {
      const item = asset as any;
      if (typeof item.lat === "number" && typeof item.lng === "number") {
        return `${item.lat},${item.lng}`;
      }
      if (
        asset.geometry?.type === "Point" &&
        Array.isArray(asset.geometry.coordinates)
      ) {
        return `${asset.geometry.coordinates[0]},${asset.geometry.coordinates[1]}`;
      }
      return "";
    };

    const dpAssets = workspaceAssets.filter(isWorkspaceDistributionPointAsset);
    const homeAssets = workspaceAssets.filter(
      (asset) => assetTypeBucket(asset) === "Home",
    );
    const designCableAssets = workspaceAssets.filter(isDesignCableAsset);
    const dropCableAssets = workspaceAssets.filter(isHomeDropCableAsset);

    const rows: unknown[][] = [];

    rows.push(["Alistra GIS Operational Rollout Report"]);
    rows.push(["Generated", new Date().toLocaleString("en-GB")]);
    rows.push(["Project", projectName]);
    rows.push(["Status", effectiveWorkspaceStatus]);
    rows.push(["Delivery phase", deliveryPhaseConfig.label]);
    rows.push(["Delivery phase note", deliveryPhaseOverrideReason || ""]);
    rows.push(["Readiness state", operationalReadiness.state]);
    rows.push(["Readiness score", `${operationalReadiness.score}%`]);
    rows.push(["Readiness summary", operationalReadiness.summary]);
    rows.push([]);

    rows.push(["SECTION", "Operational KPI Summary"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Readiness state", operationalReadiness.state]);
    rows.push(["Readiness score %", operationalReadiness.score]);
    rows.push(["Readiness summary", operationalReadiness.summary]);
    rows.push([
      "Readiness blockers",
      operationalReadiness.blockers.join(" | ") || "None",
    ]);
    rows.push(["Next actions", operationalReadiness.nextActions.join(" | ")]);
    rows.push(["Homes passed", rolloutKpis.homesPassed]);
    rows.push(["Homes live", rolloutKpis.homesLive]);
    rows.push(["Homes not live", rolloutKpis.homesNotLive]);
    rows.push(["RFS progress %", rolloutKpis.rfsPercent]);
    rows.push(["Build completion %", rolloutKpis.buildCompletionPercent]);
    rows.push(["DP total", rolloutKpis.dpTotal]);
    rows.push(["DP live", rolloutKpis.dpLive]);
    rows.push(["DP BWIP", rolloutKpis.dpBwip]);
    rows.push(["DP LNRFS", rolloutKpis.dpLnrfs]);
    rows.push(["DP unserviceable", rolloutKpis.dpUnserviceable]);
    rows.push(["DP planned", rolloutKpis.dpPlanned]);
    rows.push(["DP near capacity", rolloutKpis.dpNearCapacity]);
    rows.push(["DP over capacity", rolloutKpis.dpOverCapacity]);
    rows.push(["QA total issues", rolloutKpis.qaIssues]);
    rows.push(["QA high issues", issueBuckets.high.length]);
    rows.push(["QA medium issues", issueBuckets.medium.length]);
    rows.push(["QA low issues", issueBuckets.low.length]);
    rows.push(["Disconnected assets", rolloutKpis.disconnectedAssets]);
    rows.push(["Area size", formatAreaSize(workspaceAreaMetrics.areaSquareMeters)]);
    rows.push(["Boundary length", formatDistance(workspaceAreaMetrics.boundaryLengthMeters)]);
    rows.push(["Route length", formatDistance(rolloutKpis.routeLengthMeters)]);
    rows.push([]);

    rows.push(["SECTION", "Area Readiness Engine"]);
    rows.push(["Field", "Value"]);
    rows.push(["Readiness state", operationalReadiness.state]);
    rows.push(["Readiness score", `${operationalReadiness.score}%`]);
    rows.push(["Summary", operationalReadiness.summary]);
    rows.push(["QA high", operationalReadiness.qaHigh]);
    rows.push(["QA medium", operationalReadiness.qaMedium]);
    rows.push(["DP completion %", operationalReadiness.dpCompletionPercent]);
    rows.push(["RFS %", operationalReadiness.rfsPercent]);
    rows.push(["Disconnected assets", operationalReadiness.disconnectedAssets]);
    rows.push([
      "Blockers",
      operationalReadiness.blockers.join(" | ") || "None",
    ]);
    rows.push(["Next actions", operationalReadiness.nextActions.join(" | ")]);
    rows.push([]);

    rows.push(["SECTION", "Asset Totals"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Total assets", operationalWorkspaceAssets.length]);
    rows.push(["Joints", displayStats.joints]);
    rows.push(["DPs", displayStats.dps]);
    rows.push(["Street cabs", displayStats.streetCabs]);
    rows.push(["Poles", displayStats.poles]);
    rows.push(["Chambers", displayStats.chambers]);
    rows.push([
      "Design cables",
      displayStats.designCables ?? displayStats.cables,
    ]);
    rows.push(["Drop cables", displayStats.dropCables ?? 0]);
    rows.push(["Graph nodes", networkGraph.nodes.size]);
    rows.push(["Graph links", networkGraph.edges.size]);
    rows.push(["Network State used fibres", networkState.summary.usedFibres]);
    rows.push(["Network State spare fibres", networkState.summary.spareFibres]);
    rows.push([
      "Network State passthrough fibres",
      networkState.summary.passthroughFibres,
    ]);
    rows.push(["Network State warnings", networkState.summary.warnings]);
    rows.push(["Unmatched cable IDs", displayStats.unmatchedCableIds ?? 0]);
    rows.push([]);

    rows.push(["SECTION", "DP Live Status Register"]);
    rows.push([
      "DP name",
      "Status",
      "Closure / type",
      "Connected homes",
      "Capacity",
      "Free ports",
      "Capacity %",
      "Capacity warning",
      "Asset ID",
      "Map point",
    ]);
    dpAssets.forEach((asset) => {
      const item = asset as any;
      const details = item.dpDetails || item.properties?.dpDetails || {};
      const connectedHomes =
        details.connectedHomes ??
        details.connectionsToHomes ??
        item.connectedHomes ??
        item.homesConnected ??
        item.homeCount ??
        "";
      const capacity =
        details.capacity ??
        item.capacity ??
        item.portCapacity ??
        item.ports ??
        "";
      const freePorts =
        typeof Number(capacity) === "number" &&
        Number.isFinite(Number(capacity)) &&
        Number.isFinite(Number(connectedHomes))
          ? Math.max(Number(capacity) - Number(connectedHomes), 0)
          : (item.freePorts ?? details.freePorts ?? "");

      const capacityState = getWorkspaceDpCapacityRisk(asset);
      rows.push([
        getWorkspaceAssetTitle(asset),
        getOperationalDpStatus(asset),
        details.closureType ||
          details.networkArchitecture ||
          item.closureType ||
          item.dpType ||
          item.jointType ||
          "",
        connectedHomes,
        capacity,
        freePorts,
        capacityState.percent,
        capacityState.warning,
        item.id || item.assetId || "",
        pointText(asset),
      ]);
    });
    rows.push([]);

    rows.push(["SECTION", "Homes Live Register"]);
    rows.push([
      "Home / UPRN",
      "Status",
      "Connected DP",
      "Address",
      "Asset ID",
      "Map point",
    ]);
    homeAssets.forEach((asset) => {
      const item = asset as any;
      rows.push([
        item.uprn ||
          item.UPRN ||
          item.properties?.UPRN ||
          getWorkspaceAssetTitle(asset),
        isLiveHomeAsset(asset) ? "Live / Connected" : assetStatus(asset),
        item.connectedDpId ||
          item.connectedDP ||
          item.dpId ||
          item.properties?.connectedDpId ||
          "",
        item.address || item.properties?.address || "",
        item.id || item.assetId || "",
        pointText(asset),
      ]);
    });
    rows.push([]);

    rows.push(["SECTION", "Cable Register"]);
    rows.push([
      "Cable name",
      "Cable type",
      "Fibre count",
      "Used fibres",
      "Install method",
      "Length",
      "From",
      "To",
      "Asset ID",
    ]);
    [...designCableAssets, ...dropCableAssets].forEach((asset) => {
      const item = asset as any;
      rows.push([
        getWorkspaceAssetTitle(asset),
        item.cableType || assetTypeBucket(asset),
        item.fibreCount || item.fiberCount || item.coreCount || item.size || "",
        item.usedFibres ??
          item.usedFibers ??
          item.fibresUsed ??
          item.usedCoreCount ??
          "",
        item.installMethod || item.method || item.routeType || "",
        item.routeLengthMeters ||
          item.lengthMeters ||
          item.distanceMeters ||
          item.distanceM ||
          "",
        item.fromAssetId || item.fromId || item.aEnd || "",
        item.toAssetId || item.toId || item.bEnd || "",
        item.id || item.assetId || "",
      ]);
    });
    rows.push([]);

    rows.push(["SECTION", "QA Issues"]);
    rows.push(["Severity", "Asset", "Asset type", "Issue", "Asset ID"]);
    auditIssues.forEach((issue) => {
      const issueItem = issue as any;
      const matchedAsset = findWorkspaceAssetForIssue(issue, workspaceAssets);
      rows.push([
        issue.severity,
        matchedAsset
          ? getWorkspaceAssetTitle(matchedAsset)
          : issueItem.assetName || "",
        matchedAsset ? assetTypeBucket(matchedAsset) : "",
        issueItem.message ||
          issueItem.title ||
          issueItem.reason ||
          issueItem.description ||
          "",
        issue.assetId || (matchedAsset as any)?.id || "",
      ]);
    });

    const csvText = rows.map(csvRow).join("\n");
    const blob = new Blob([csvText], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-operational-rollout-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setActiveTab("reports");
    setActiveOperationPanel("none");
  };

  const issueTone = displayStats.issueCount > 0 ? "bad" : "good";
  const rfsTone =
    displayStats.rfsPercent >= 80
      ? "good"
      : displayStats.rfsPercent >= 50
        ? "warn"
        : "bad";

  const assetTiles = useMemo(
    () => [
      ["Joint Boxes", displayStats.joints],
      ["DPs / CBTs / AFNs", displayStats.dps],
      ["Drop Cables", displayStats.dropCables ?? 0],
      ["Design Cables", displayStats.designCables ?? displayStats.cables],
      ["Street Cabs", displayStats.streetCabs],
      ["Poles", displayStats.poles],
      ["Chambers", displayStats.chambers],
    ],
    [displayStats],
  );

  const workspaceProjectOptions = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    projectAreas.forEach((area) => {
      if (area?.id) byId.set(area.id, area);
    });

    if (projectArea?.id && !byId.has(projectArea.id)) {
      byId.set(projectArea.id, projectArea);
    }

    return Array.from(byId.values()).sort((a, b) =>
      getProjectAreaLabel(a).localeCompare(getProjectAreaLabel(b), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [projectAreas, projectArea]);

  const activeWorkspaceProjectId =
    activeProjectId || projectArea?.id || workspaceProjectOptions[0]?.id || "";


  const activeWorkspaceProjectLabel = useMemo(() => {
    const activeArea = workspaceProjectOptions.find(
      (area) => area.id === activeWorkspaceProjectId,
    );
    return activeArea ? getProjectAreaLabel(activeArea) : projectName;
  }, [activeWorkspaceProjectId, projectName, workspaceProjectOptions]);

  const filteredWorkspaceProjectOptions = useMemo(() => {
    const query = projectAreaSearchTerm.trim().toLowerCase();
    if (!query) return workspaceProjectOptions.slice(0, 60);

    return workspaceProjectOptions
      .filter((area) => {
        const item = area as any;
        const searchText = [
          getProjectAreaLabel(area),
          item.name,
          item.label,
          item.areaCode,
          item.code,
          item.projectName,
          item.fibrehood_code,
          item.ag_code,
          item.importedProperties?.ag_code,
          item.importedProperties?.fibrehood_code,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");

        return searchText.includes(query);
      })
      .slice(0, 60);
  }, [projectAreaSearchTerm, workspaceProjectOptions]);

  const handleWorkspaceProjectSelect = (nextProjectId: string) => {
    if (!nextProjectId || nextProjectId === activeWorkspaceProjectId) return;
    setSelectedWorkspaceAsset(null);
    setSearchTerm("");
    setSearchFocused(false);
    setActiveOperationPanel("none");
    setActiveIssueSeverity(null);
    setManagerAreaPoints([]);
    setIsManagerAreaDrawing(false);
    setProjectAreaSearchTerm("");
    setProjectAreaSearchFocused(false);
    onSelectProject?.(nextProjectId);
  };

  const handleHeaderQgisExport = async () => {
    if (isHeaderQgisExporting) return;

    const byId = new Map<string, SavedMapAsset>();
    const exportableReferenceCables = openreachWorkspaceAssets.filter(
      isQgisExportableReferenceCable,
    );
    [
      projectArea,
      ...workspaceAssets,
      ...exportableReferenceCables,
    ].forEach((asset) => {
      if (!asset?.id) return;
      byId.set(String(asset.id), asset);
    });

    const assetsForExport = Array.from(byId.values()).filter(
      (asset) => asset.geometry,
    );

    if (!assetsForExport.length) {
      alert("No map assets found for this project export.");
      return;
    }

    setIsHeaderQgisExporting(true);
    try {
      const draft = buildJobPackDraftFromLiveMap({
        areaId: activeWorkspaceProjectId || projectArea?.id || projectName,
        areaName: activeWorkspaceProjectLabel || projectName,
        revision: "QGIS",
        assets: assetsForExport,
      });
      await exportQgisJobPackBundle(draft);
    } catch (error) {
      console.error("QGIS export failed", error);
      alert(
        `QGIS export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      onExport?.();
    } finally {
      setIsHeaderQgisExporting(false);
    }
  };

  const workspaceMapRemountKey = [
    activeWorkspaceProjectId,
    projectArea?.id || "",
    projectName,
    projectArea?.geometry?.type || "",
    JSON.stringify(projectArea?.geometry?.coordinates || []),
  ].join("|");

  useEffect(() => {
    setSelectedWorkspaceAsset(null);
    setSearchTerm("");
    setSearchFocused(false);
    setActiveOperationPanel("none");
    setActiveIssueSeverity(null);
    setActiveIssueCategory(null);
    setIssueNavigatorIndex(0);
    setManagerAreaPoints([]);
    setIsManagerAreaDrawing(false);
    setLocalAssetOverrides({});
    setProjectAreaSearchTerm("");
    setProjectAreaSearchFocused(false);
  }, [activeWorkspaceProjectId, projectArea?.id, projectName]);

  const walkOffSnapshot = useMemo(
    () => ({
      projectName,
      status,
      readinessState: operationalReadiness.state,
      readinessScore: operationalReadiness.score,
      readinessBlockers: operationalReadiness.blockers,
      homesPassed: rolloutKpis.homesPassed,
      homesLive: rolloutKpis.homesLive,
      homesNotLive: rolloutKpis.homesNotLive,
      rfsPercent: rolloutKpis.rfsPercent,
      buildCompletionPercent: rolloutKpis.buildCompletionPercent,
      dpTotal: rolloutKpis.dpTotal,
      dpLive: rolloutKpis.dpLive,
      dpBwip: rolloutKpis.dpBwip,
      dpLnrfs: rolloutKpis.dpLnrfs,
      dpUnserviceable: rolloutKpis.dpUnserviceable,
      dpNearCapacity: rolloutKpis.dpNearCapacity,
      dpOverCapacity: rolloutKpis.dpOverCapacity,
      qaHigh: issueBuckets.high.length,
      qaMedium: issueBuckets.medium.length,
      qaLow: issueBuckets.low.length,
      qaTotal: auditIssues.length,
      disconnectedAssets: rolloutKpis.disconnectedAssets,
      routeLengthMeters: rolloutKpis.routeLengthMeters,
      assetTotals: {
        totalAssets: operationalWorkspaceAssets.length,
        joints: displayStats.joints,
        dps: displayStats.dps,
        poles: displayStats.poles,
        chambers: displayStats.chambers,
        designCables: displayStats.designCables ?? displayStats.cables,
        dropCables: displayStats.dropCables ?? 0,
      },
      capturedAt: new Date().toISOString(),
    }),
    [
      projectName,
      status,
      operationalReadiness,
      rolloutKpis,
      issueBuckets.high.length,
      issueBuckets.medium.length,
      issueBuckets.low.length,
      auditIssues.length,
      operationalWorkspaceAssets.length,
      displayStats,
    ],
  );

  const walkOffAreaAsset = useMemo(
    () =>
      ({
        ...(projectArea || {}),
        id:
          projectArea?.id || activeWorkspaceProjectId || `area-${projectName}`,
        name: projectArea ? getProjectAreaLabel(projectArea) : projectName,
        assetType: "area",
        type: "area",
        walkOffSnapshot,
      }) as SavedMapAsset,
    [projectArea, activeWorkspaceProjectId, projectName, walkOffSnapshot],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLatestWalkOffAudit() {
      const assetId = String(walkOffAreaAsset.id || "").trim();
      if (!assetId) {
        setLatestWalkOffAudit(null);
        return;
      }

      try {
        const logs = await loadAssetAuditLogs(assetId, 50);
        const latest = logs.find((log) => {
          const payload = log.after as any;
          return (
            log.context === walkOffAuditTemplate.auditType ||
            log.context === `${walkOffAuditTemplate.auditType}-cancelled` ||
            payload?.auditType === walkOffAuditTemplate.auditType ||
            payload?.auditTitle === walkOffAuditTemplate.title
          );
        });

        if (cancelled) return;

        if (latest) {
          const payload = latest.after as any;
          const result = String(payload?.result || "");
          const isCancelled =
            result === "Cancelled" ||
            latest.context === `${walkOffAuditTemplate.auditType}-cancelled`;

          setLatestWalkOffAudit(isCancelled ? null : latest);

          if (isCancelled) {
            setWalkOffStatus("Pending");
            setWalkOffSavedAt("");
            return;
          }

          setWalkOffStatus(
            result === "Pass"
              ? "Approved"
              : result === "Advisory"
                ? "Review Required"
                : result === "Fail"
                  ? "Blocked"
                  : "Pending",
          );
          setWalkOffSavedAt(
            latest.changedAt
              ? new Date(latest.changedAt).toLocaleString("en-GB")
              : "",
          );
        } else {
          setLatestWalkOffAudit(null);
          setWalkOffStatus("Pending");
          setWalkOffSavedAt("");
        }
      } catch (err) {
        console.warn("Failed to load latest Walk-Off audit", err);
      }
    }

    loadLatestWalkOffAudit();

    return () => {
      cancelled = true;
    };
  }, [walkOffAreaAsset.id]);

  const handleSaveWalkOffAudit = async (audit: any) => {
    if (!piaGatePassedForWalkOff) {
      alert("Walk-Off is locked until PIA has passed in full for this area.");
      return;
    }

    const savedWalkOffAudit = await createAuditFormLog({
      projectId:
        activeWorkspaceProjectId || activeProjectId || projectArea?.id || null,
      asset: walkOffAreaAsset,
      auditType: walkOffAuditTemplate.auditType,
      auditTitle: walkOffAuditTemplate.title,
      result: audit.result,
      answers: {
        ...(audit.answers || {}),
        areaSnapshot: walkOffSnapshot,
      },
      comments: audit.comments,
      signature: audit.signature,
      photos: audit.photos,
    });

    setLatestWalkOffAudit(savedWalkOffAudit);
    setWalkOffStatus(
      audit.result === "Pass"
        ? "Approved"
        : audit.result === "Advisory"
          ? "Review Required"
          : "Blocked",
    );
    setWalkOffSavedAt(new Date().toLocaleString("en-GB"));
    setWalkOffAuditOpen(false);
  };

  const handleCancelWalkOffAudit = async () => {
    if (!canManageWalkOff || !latestWalkOffAudit) return;

    const reason = window.prompt(
      "Reason for cancelling this Walk-Off audit? This will be kept in the audit history.",
    );
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) return;

    const confirmed = window.confirm(
      "Cancel the current Walk-Off audit and return the area to Pending?",
    );
    if (!confirmed) return;

    await createAssetChangeLog({
      projectId:
        activeWorkspaceProjectId || activeProjectId || projectArea?.id || null,
      asset: walkOffAreaAsset,
      action: "updated",
      reason: `${walkOffAuditTemplate.title} cancelled`,
      comment: cleanReason,
      context: `${walkOffAuditTemplate.auditType}-cancelled`,
      before: latestWalkOffAudit.after,
      after: {
        auditType: walkOffAuditTemplate.auditType,
        auditTitle: walkOffAuditTemplate.title,
        result: "Cancelled",
        cancelledAuditId: latestWalkOffAudit.id,
        cancelledAuditAt: latestWalkOffAudit.changedAt,
        cancellationReason: cleanReason,
      },
    });

    setLatestWalkOffAudit(null);
    setWalkOffStatus("Pending");
    setWalkOffSavedAt("");
  };

  const workspaceLayerCounts = useMemo(() => {
    const homesByKey = new Map<string, SavedMapAsset>();
    workspaceAssets
      .filter(isWorkspaceHomeAssetForLayerCount)
      .forEach((asset) => {
        const key = getWorkspaceLayerHomeKey(asset);
        if (key && !homesByKey.has(key)) homesByKey.set(key, asset);
      });

    const canonicalHomes = Array.from(homesByKey.values());
    const connectedHomes = canonicalHomes.filter(
      (asset) =>
        getWorkspaceHomeConnectionStatus(asset, workspaceAssets) !==
        "unconnected",
    );
    const unconnectedHomes = canonicalHomes.filter(
      (asset) =>
        getWorkspaceHomeConnectionStatus(asset, workspaceAssets) ===
        "unconnected",
    );
    const liveHomes = canonicalHomes.filter(
      (asset) =>
        getWorkspaceHomeConnectionStatus(asset, workspaceAssets) === "live",
    );
    const notLiveHomes = canonicalHomes.filter((asset) => {
      const status = getWorkspaceHomeConnectionStatus(asset, workspaceAssets);
      return status === "unconnected" || hasCanonicalHomeServiceException(asset);
    });

    const areaAssets = workspaceAssets.filter(
      (asset) =>
        asset.geometry?.type === "Polygon" && asset.id !== projectArea?.id,
    );
    const ductAssets = workspaceAssets.filter(isWorkspaceDuctAsset);
    const designCableAssets = workspaceAssets.filter(isDesignCableAsset);
    const dropCableAssets = workspaceAssets.filter(isHomeDropCableAsset);

    const hasPointGeometry = (asset: SavedMapAsset) => {
      const item = asset as any;
      return (
        asset.geometry?.type === "Point" ||
        (typeof item.lat === "number" && typeof item.lng === "number")
      );
    };

    const jointAssets = workspaceAssets.filter((asset) => {
      if (!hasPointGeometry(asset) || isWorkspaceDistributionPointAsset(asset))
        return false;
      const text = getWorkspaceAssetLayerText(asset);
      return (
        text.includes("joint") ||
        text.includes("cmj") ||
        text.includes("midj") ||
        text.includes("lmj") ||
        text.includes("mmj")
      );
    });

    const poleAssets = workspaceAssets.filter(
      (asset) =>
        hasPointGeometry(asset) &&
        getWorkspaceAssetLayerText(asset).includes("pole"),
    );
    const chamberAssets = workspaceAssets.filter((asset) => {
      const text = getWorkspaceAssetLayerText(asset);
      return (
        hasPointGeometry(asset) &&
        (text.includes("chamber") || text.includes("manhole"))
      );
    });
    const streetCabAssets = workspaceAssets.filter((asset) => {
      const text = getWorkspaceAssetLayerText(asset);
      return (
        text.includes("street cab") ||
        text.includes("streetcab") ||
        text.includes("cabinet")
      );
    });
    const dataCentreAssets = workspaceAssets.filter((asset) => {
      const text = getWorkspaceAssetLayerText(asset);
      return (
        hasPointGeometry(asset) &&
        (text.includes("data centre") ||
          text.includes("data center") ||
          text.includes("datacentre") ||
          text.includes("datacenter"))
      );
    });

    return {
      projectBoundary: projectArea ? 1 : 0,
      areas: areaAssets.length,
      ducts: ductAssets.length,
      cables: designCableAssets.length,
      dropCables: dropCableAssets.length,
      joints: jointAssets.length,
      dps: workspaceAssets.filter(isWorkspaceDistributionPointAsset).length,
      poles: poleAssets.length,
      chambers: chamberAssets.length,
      streetCabs: streetCabAssets.length,
      dataCentres: dataCentreAssets.length,
      homes: homesByKey.size,
      homesConnected: connectedHomes.length,
      homesUnconnected: unconnectedHomes.length,
      homesLive: liveHomes.length,
      homesNotLive: notLiveHomes.length,
      other: Math.max(
        0,
        workspaceAssets.length -
          areaAssets.length -
          ductAssets.length -
          designCableAssets.length -
          dropCableAssets.length -
          jointAssets.length -
          workspaceAssets.filter(isWorkspaceDistributionPointAsset).length -
          poleAssets.length -
          chamberAssets.length -
          streetCabAssets.length -
          dataCentreAssets.length -
          homesByKey.size,
      ),
    } as Record<keyof WorkspaceLayerVisibility, number>;
  }, [projectArea, workspaceAssets]);

  const openreachLayerCounts = useMemo(() => {
    const openreachAssets = openreachWorkspaceAssets;

    return {
      ducts: openreachAssets.filter(
        (asset) =>
          asset.geometry?.type === "LineString" &&
          !getWorkspaceAssetLayerText(asset).includes("trench") &&
          !getWorkspaceAssetLayerText(asset).includes("span"),
      ).length,
      trenches: openreachAssets.filter((asset) =>
        getWorkspaceAssetLayerText(asset).includes("trench"),
      ).length,
      spans: openreachAssets.filter(
        (asset) =>
          getWorkspaceAssetLayerText(asset).includes("span") ||
          getWorkspaceAssetLayerText(asset).includes("overhead"),
      ).length,
      chambers: openreachAssets.filter((asset) => {
        const text = getWorkspaceAssetLayerText(asset);
        return (
          text.includes("chamber") ||
          text.includes("manhole") ||
          text.includes("jc:") ||
          text.includes("ch:")
        );
      }).length,
      poles: openreachAssets.filter(
        (asset) =>
          getWorkspaceAssetLayerText(asset).includes("pole") ||
          getWorkspaceAssetLayerText(asset).includes("pol:"),
      ).length,
      labels: openreachAssets.filter(
        (asset) => asset.geometry?.type === "LineString",
      ).length,
    } as Record<keyof OpenreachLayerVisibility, number>;
  }, [openreachWorkspaceAssets]);

  const enabledWorkspaceLayerCount = workspaceLayerOptions.filter(
    (item) => visibleLayers[item.key],
  ).length;
  const enabledOpenreachLayerCount = openreachLayerOptions.filter(
    (item) => openreachLayers[item.key],
  ).length;
  const enabledLayerCount =
    enabledWorkspaceLayerCount + enabledOpenreachLayerCount;

  const toggleLayer = (key: keyof WorkspaceLayerVisibility) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleOpenreachLayer = (key: keyof OpenreachLayerVisibility) => {
    setOpenreachLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const showAllLayers = () => {
    setVisibleLayers(defaultWorkspaceLayers);
    setOpenreachLayers(defaultOpenreachLayers);
  };

  const hideAllLayers = () => {
    setVisibleLayers({
      ...defaultWorkspaceLayers,
      projectBoundary: true,
      areas: false,
      ducts: false,
      cables: false,
      dropCables: false,
      joints: false,
      dps: false,
      poles: false,
      chambers: false,
      streetCabs: false,
      dataCentres: false,
      homes: false,
      other: false,
    });
    setOpenreachLayers({
      ducts: false,
      trenches: false,
      spans: false,
      chambers: false,
      poles: false,
      labels: false,
    });
  };

  const showOnlyOpenreachLayers = () => {
    setVisibleLayers({
      ...defaultWorkspaceLayers,
      projectBoundary: false,
      areas: false,
      ducts: false,
      cables: false,
      dropCables: false,
      joints: false,
      dps: false,
      poles: false,
      chambers: false,
      streetCabs: false,
      dataCentres: false,
      homes: false,
      other: false,
    });
    setOpenreachLayers(defaultOpenreachLayers);
  };

  const mobileDpRows = useMemo(
    () =>
      areaDistributionPoints
        .map((asset) => ({
          asset,
          name: getWorkspaceAssetTitle(asset),
          status: getOperationalDpStatus(asset),
          capacity: getWorkspaceDpCapacityRisk(asset, workspaceAssets),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [areaDistributionPoints],
  );

  const selectedAssetTypeText = String(
    (fullSelectedWorkspaceAsset as any)?.assetType ||
      (fullSelectedWorkspaceAsset as any)?.type ||
      (fullSelectedWorkspaceAsset as any)?.jointType ||
      "",
  ).toLowerCase();

  const selectedAssetCanOpenEditor = Boolean(
    fullSelectedWorkspaceAsset &&
    onOpenJointEditor &&
    (selectedAssetTypeText.includes("joint") ||
      selectedAssetTypeText.includes("cab") ||
      selectedAssetTypeText.includes("exchange") ||
      selectedAssetTypeText.includes("data-centre") ||
      selectedAssetTypeText.includes("data centre") ||
      selectedAssetTypeText.includes("data center") ||
      selectedAssetTypeText.includes("cmj") ||
      selectedAssetTypeText.includes("midj") ||
      selectedAssetTypeText.includes("lmj")),
  );

  const handleMobileOpenSelectedEditor = () => {
    if (!fullSelectedWorkspaceAsset) return;

    if (selectedAssetCanOpenEditor) {
      onOpenJointEditor?.(fullSelectedWorkspaceAsset);
      return;
    }

    if (isWorkspaceDistributionPointAsset(fullSelectedWorkspaceAsset)) {
      onOpenDistributionPointEditor?.(fullSelectedWorkspaceAsset);
      return;
    }

    setActiveTab("topology");
    setActiveOperationPanel("trace");
  };

  const handleMobileDpStatusUpdate = (
    asset: SavedMapAsset,
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service",
  ) => {
    if (!onUpdateDpStatus) {
      return;
    }

    const note = window.prompt(
      `Manager note required: set ${getWorkspaceAssetTitle(asset)} to ${status}?`,
      `Mobile DP update: ${status}`,
    );

    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      alert("A manager note is required before changing DP status.");
      return;
    }

    const syncedAsset = syncWorkspaceDpStatus(asset, status);
    setSelectedWorkspaceAsset(syncedAsset);
    onUpdateDpStatus({ assetId: asset.id, status, note: trimmed });
  };

  const handleBulkCablePiaNoiUpdate = async (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => {
    const targetIds = new Set(args.assetIds.map(String).filter(Boolean));
    const trimmedPiaNoi = String(args.piaNoiNumber || "").trim();

    if (!targetIds.size) {
      alert("No cables were selected for the PIA NOI update.");
      return;
    }

    if (!trimmedPiaNoi) {
      alert("Enter a PIA NOI number before applying.");
      return;
    }

    const nextOverrides: Record<string, SavedMapAsset> = {};

    workspaceAssets.forEach((asset) => {
      if (!targetIds.has(String(asset.id || ""))) return;
      const item = asset as any;

      nextOverrides[asset.id] = {
        ...item,
        piaNoiNumber: trimmedPiaNoi,
        piaNOINumber: trimmedPiaNoi,
        noiNumber: trimmedPiaNoi,
        properties: {
          ...(item.properties || {}),
          piaNoiNumber: trimmedPiaNoi,
          piaNOINumber: trimmedPiaNoi,
          noiNumber: trimmedPiaNoi,
        },
      } as SavedMapAsset;
    });

    try {
      if (onBulkUpdateCablePiaNoi) {
        await onBulkUpdateCablePiaNoi({
          assetIds: Array.from(targetIds),
          piaNoiNumber: trimmedPiaNoi,
          note: args.note,
        });
      }
    } catch (error) {
      console.error("Bulk PIA NOI update failed", error);
      alert(
        error instanceof Error
          ? error.message
          : "Bulk PIA NOI update failed. Check the console before refreshing.",
      );
      return;
    }

    setLocalAssetOverrides((current) => ({
      ...current,
      ...nextOverrides,
    }));

    setSelectedWorkspaceAsset((current) => {
      if (!current || !targetIds.has(String(current.id || ""))) return current;
      return nextOverrides[current.id] || current;
    });

    alert(
      `Applied and saved PIA NOI ${trimmedPiaNoi} to ${Object.keys(nextOverrides).length} cable${Object.keys(nextOverrides).length === 1 ? "" : "s"}.`,
    );
  };


  const piaWorkspaceAssets = useMemo(
    () => allWorkspaceSelectableAssets.filter(isPiaReviewableWorkspaceAsset),
    [allWorkspaceSelectableAssets],
  );

  const piaQaStats = useMemo(
    () => buildPiaAcceptanceStats(piaWorkspaceAssets as any),
    [piaWorkspaceAssets],
  );

  const rawPiaGatePassedForWalkOff =
    piaQaStats.requiredTotal === 0 || piaQaStats.piaPass >= piaQaStats.requiredTotal;
  const piaGatePassedForWalkOff =
    rawPiaGatePassedForWalkOff || deliveryPhaseConfig.allowsWalkOffWithoutPia;
  const piaGateCustomerLiveOverride =
    !rawPiaGatePassedForWalkOff && deliveryPhaseConfig.allowsCustomerLiveWithoutPia;
  const piaGateBlockerText = rawPiaGatePassedForWalkOff
    ? "PIA passed in full. Walk-Off can start."
    : deliveryPhaseConfig.allowsWalkOffWithoutPia
      ? `PIA walk-off override active: ${deliveryPhaseOverrideReason || "manager approved"}`
      : piaGateCustomerLiveOverride
        ? `Customer live override active while PIA completes: ${piaQaStats.piaPass} / ${piaQaStats.requiredTotal} required assets passed.`
        : `PIA not complete: ${piaQaStats.piaPass} / ${piaQaStats.requiredTotal} required assets passed.`;

  const handleOpenWalkOffAudit = () => {
    if (!piaGatePassedForWalkOff) {
      alert("Walk-Off is locked until PIA has passed in full for this area.");
      setWalkOffAuditOpen(false);
      return;
    }

    setWalkOffAuditOpen(true);
  };

  const piaContractorOptions = useMemo(() => {
    const contractors = new Set<string>();
    piaWorkspaceAssets.forEach((asset) => {
      const details = getPiaAcceptanceDetails(asset as any);
      const contractor = String(details.contractorName || details.contractor || "").trim();
      if (contractor) contractors.add(contractor);
    });
    return Array.from(contractors).sort((a, b) => a.localeCompare(b));
  }, [piaWorkspaceAssets]);

  const filteredPiaWorkspaceAssets = useMemo(() => {
    const query = piaAssetSearchTerm.trim().toLowerCase();
    return piaWorkspaceAssets.filter((asset) => {
      const details = getPiaAcceptanceDetails(asset as any);
      const status = getPiaAcceptanceStatus(asset as any);
      const contractor = String(details.contractorName || details.contractor || "").trim();

      const matchesSearch =
        !query ||
        [
          getWorkspaceAssetTitle(asset),
          getWorkspaceAssetType(asset),
          contractor,
          details.piaReviewer,
          details.reviewer,
          asset.id,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ")
          .includes(query);

      const matchesStatus = piaStatusFilter === "all" || status === piaStatusFilter;
      const matchesContractor =
        piaContractorFilter === "all" || contractor === piaContractorFilter;

      return matchesSearch && matchesStatus && matchesContractor;
    });
  }, [piaWorkspaceAssets, piaAssetSearchTerm, piaStatusFilter, piaContractorFilter]);

  const updatePiaQaDetailsInWorkspace = (asset: SavedMapAsset, patch: Record<string, any>) => {
    const item = asset as any;
    const now = new Date().toISOString();
    const existingDetails = getPiaAcceptanceDetails(asset as any);
    const nextPiaQa = {
      ...existingDetails,
      ...patch,
      lastUpdatedAt: now,
    };
    const nextPhotos = Array.isArray(patch.photos)
      ? patch.photos
      : Array.isArray(patch.photoEvidence)
        ? patch.photoEvidence
        : item.photos || item.poleDetails?.photos || item.chamberDetails?.photos;
    const nextPhotoEvidence = Array.isArray(patch.photoEvidence)
      ? patch.photoEvidence
      : Array.isArray(patch.evidencePhotos)
        ? patch.evidencePhotos
        : nextPhotos;

    const nextAsset = {
      ...item,
      photos: nextPhotos,
      photoEvidence: nextPhotoEvidence,
      evidencePhotos: Array.isArray(patch.evidencePhotos)
        ? patch.evidencePhotos
        : item.evidencePhotos,
      uploadedEvidence: Array.isArray(patch.uploadedEvidence)
        ? patch.uploadedEvidence
        : item.uploadedEvidence,
      piaQa: nextPiaQa,
      piaQaDetails: nextPiaQa,
      properties: {
        ...(item.properties || {}),
        photos: nextPhotos,
        photoEvidence: nextPhotoEvidence,
        piaQa: nextPiaQa,
      },
      poleDetails:
        item.assetType === "pole" || item.poleDetails
          ? { ...(item.poleDetails || {}), photos: nextPhotos, piaQa: nextPiaQa }
          : item.poleDetails,
      chamberDetails:
        item.assetType === "chamber" || item.chamberDetails
          ? { ...(item.chamberDetails || {}), photos: nextPhotos, piaQa: nextPiaQa }
          : item.chamberDetails,
    } as SavedMapAsset;

    setLocalAssetOverrides((current) => ({
      ...current,
      [asset.id]: nextAsset,
    }));
    setSelectedWorkspaceAsset(nextAsset);
    onUpdateWorkspaceAsset?.(nextAsset);
  };

  const updatePiaQaStatusInWorkspace = (asset: SavedMapAsset, status: PiaAcceptanceStatus) => {
    updatePiaQaDetailsInWorkspace(asset, { status });
  };

  const openAssetInPiaReview = (asset: SavedMapAsset) => {
    const resolvedAsset = resolveFullProjectAsset(asset, allWorkspaceSelectableAssets) || asset;
    setSelectedWorkspaceAsset(resolvedAsset);
    setPiaAssetSearchTerm("");
    setPiaStatusFilter("all");
    setPiaContractorFilter("all");
    setActiveOperationPanel("none");
    setActiveTab("pia");
  };

  if (!isHarrellicommsBackhaulWorkspace && activeTab === "pia") {
    return (
      <PiaOperationsDashboard
        projectName={projectName}
        projectArea={projectArea}
        assets={allWorkspaceSelectableAssets}
        piaAssets={piaWorkspaceAssets}
        filteredPiaAssets={filteredPiaWorkspaceAssets}
        piaQaStats={piaQaStats}
        selectedAsset={fullSelectedWorkspaceAsset}
        searchTerm={piaAssetSearchTerm}
        statusFilter={piaStatusFilter}
        contractorFilter={piaContractorFilter}
        contractorOptions={piaContractorOptions}
        openreachLayers={openreachLayers}
        visibleLayers={{
          ...visibleLayers,
          projectBoundary: true,
          areas: true,
          ducts: false,
          poles: true,
          chambers: true,
          dps: false,
          joints: false,
          cables: false,
          dropCables: false,
          streetCabs: false,
          dataCentres: false,
          homes: false,
        }}
        networkState={networkState}
        traceHighlightedAssetIds={workspaceHighlightedAssetIds}
        traceHighlightKinds={traceHighlightKinds}
        onSearchTermChange={setPiaAssetSearchTerm}
        onStatusFilterChange={setPiaStatusFilter}
        onContractorFilterChange={setPiaContractorFilter}
        onSelectAsset={setSelectedWorkspaceAsset}
        onStatusChange={updatePiaQaStatusInWorkspace}
        onDetailsSave={updatePiaQaDetailsInWorkspace}
        onClose={() => setActiveTab("overview")}
        onExport={onExport}
      />
    );
  }

  const responsiveRoot: React.CSSProperties = {
    ...workspaceRoot,
  };

  const scaledWorkspaceViewport: React.CSSProperties = {
    ...workspaceRoot,
    width: "100%",
    height: "100%",
    overflowX: useScaledWorkspaceCanvas ? "auto" : "hidden",
    overflowY: useScaledWorkspaceCanvas ? "auto" : "hidden",
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-x pan-y",
    background: (workspaceRoot as any).background,
  };

  const scaledWorkspaceCanvas: React.CSSProperties = useScaledWorkspaceCanvas
    ? {
        width: isPhone ? 1680 : 1400,
        minWidth: isPhone ? 1680 : 1400,
        minHeight: isPhone ? 1180 : 1100,
        transform: `scale(${workspaceCanvasScale})`,
        transformOrigin: "top left",
      }
    : {
        width: "100%",
        height: "100%",
      };

  const responsiveTopHeader: React.CSSProperties = {
    ...topHeader,
  };

  const responsiveProjectHeaderBlock: React.CSSProperties = {
    ...projectHeaderBlock,
  };

  const responsiveProjectTitle: React.CSSProperties = {
    ...projectTitle,
  };

  const responsiveTopMetrics: React.CSSProperties = {
    ...topMetrics,
  };

  const responsiveHeaderActions: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  };

  const responsiveHeaderButton: React.CSSProperties = {
    ...smallButton,
  };

  const responsiveTabBar: React.CSSProperties = {
    ...tabBar,
    display: "none",
  };

  const responsiveWorkspaceBody: React.CSSProperties = {
    ...workspaceBody,
    gridTemplateColumns: isCompact
      ? "124px minmax(0, 1fr)"
      : "136px minmax(0, 1fr) 340px",
  };

  const responsiveContentGrid: React.CSSProperties = {
    ...contentGrid,
    gridTemplateColumns: "minmax(0, 1fr)",
    padding: "12px 0",
    overflow: "auto",
  };

  const responsiveMapPanel: React.CSSProperties = {
    ...mapPanel,
    gridColumn: "1 / -1",
  };

  const responsiveMapToolbar: React.CSSProperties = {
    ...mapToolbar,
  };

  const responsiveMapLiveWrap: React.CSSProperties = {
    ...mapLiveWrap,
  };

  const responsiveMapAssetInspector: React.CSSProperties = {
    ...mapAssetInspector,
  };

  const responsiveNextActionsPanel: React.CSSProperties = {
    ...nextActionsPanel,
    ...(isCompact
      ? {
          gridColumn: "2 / 3",
          borderLeft: "none",
          borderTop: "1px solid rgba(148, 163, 184, 0.16)",
          gridTemplateRows: "auto auto auto auto",
          maxHeight: "none",
        }
      : {}),
  };

  const responsiveWorkspaceDetailPanel: React.CSSProperties = {
    ...workspaceDetailPanel,
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "repeat(2, minmax(0, 1fr))",
  };

  const workspaceQuickActions: {
    label: string;
    helper: string;
    active: boolean;
    onClick: () => void;
  }[] = [
    {
      label: "QA Issues",
      helper: `${formatNumber(rolloutKpis.qaIssues)} issues`,
      active: activeTab === "qa",
      onClick: () => openOperationPanel("qa", "qa"),
    },
    {
      label: "Disconnected",
      helper: `${formatNumber(rolloutKpis.disconnectedAssets)} assets`,
      active: activeOperationPanel === "disconnected",
      onClick: () => openKpiDrilldown("disconnected", "assets"),
    },
    {
      label: "Capacity",
      helper: `${formatNumber(rolloutKpis.dpNearCapacity)} near cap`,
      active: activeOperationPanel === "capacity",
      onClick: () => openKpiDrilldown("capacity", "build"),
    },
    {
      label: "Live Homes",
      helper: `${formatNumber(rolloutKpis.homesLive)} live`,
      active: activeOperationPanel === "homesLive",
      onClick: () => openKpiDrilldown("homesLive", "build"),
    },
    {
      label: "Not Live",
      helper: `${formatNumber(rolloutKpis.homesNotLive)} homes`,
      active: activeOperationPanel === "homesNotLive",
      onClick: () => openKpiDrilldown("homesNotLive", "build"),
    },
    {
      label: "Assets",
      helper: `${formatNumber(operationalWorkspaceAssets.length)} total`,
      active: activeTab === "assets",
      onClick: () => openOperationPanel("projectDetails", "assets"),
    },
    {
      label: "Reports",
      helper: "Progress / permits",
      active: activeTab === "reports",
      onClick: () => {
        setActiveTab("reports");
        setActiveOperationPanel("none");
      },
    },
    {
      label: "Handover",
      helper: operationalReadiness.state,
      active: activeOperationPanel === "handover",
      onClick: () => openOperationPanel("handover", "overview"),
    },
  ];

  const visibleWorkspaceQuickActions = isHarrellicommsBackhaulWorkspace
    ? workspaceQuickActions.filter(
        (action) =>
          action.label !== "Capacity" &&
          action.label !== "Live Homes" &&
          action.label !== "Not Live",
      )
    : workspaceQuickActions;

  const nextActionItems = [
    {
      label: "QA Gate",
      value: rolloutKpis.qaIssues === 0 ? "Clear" : `${formatNumber(rolloutKpis.qaIssues)} issue(s)`,
      tone: rolloutKpis.qaIssues === 0 ? "good" : issueBuckets.high.length ? "bad" : "warn",
      action: "Review QA",
      onClick: () => openOperationPanel("qa", "qa"),
    },
    {
      label: "Walk-Off",
      value: walkOffStatus,
      tone: walkOffStatus === "Approved" ? "good" : piaGatePassedForWalkOff ? "warn" : "bad",
      action: piaGatePassedForWalkOff ? "Launch Audit" : "PIA Locked",
      onClick: handleOpenWalkOffAudit,
    },
    {
      label: "Commercial",
      value: operationalReadiness.blockers.length ? `${operationalReadiness.blockers.length} blocker(s)` : "Ready",
      tone: operationalReadiness.blockers.length ? "warn" : "good",
      action: "Open Board",
      onClick: () => handleWorkspaceTabChange("commercial"),
    },
    {
      label: "RFS",
      value: `${rolloutKpis.rfsPercent}%`,
      tone: rolloutKpis.rfsPercent >= 100 ? "good" : rolloutKpis.rfsPercent >= 80 ? "warn" : "bad",
      action: "View Readiness",
      onClick: () => openOperationPanel("rfsBreakdown", "build"),
    },
  ].filter((item) => canViewCommercial || item.label !== "Commercial");

  const shouldShowOperationPanel =
    activeOperationPanel !== "none" &&
    !(
      isHarrellicommsBackhaulWorkspace &&
      HARRELLICOMMS_BACKHAUL_HIDDEN_PANELS.has(activeOperationPanel)
    ) &&
    ((activeOperationPanel === "projectDetails" &&
      (activeTab === "overview" || activeTab === "assets")) ||
      (activeOperationPanel === "rfsBreakdown" &&
        (activeTab === "overview" || activeTab === "build")) ||
      (activeOperationPanel === "issues" && activeTab === "qa") ||
      ((activeOperationPanel === "topology" ||
        activeOperationPanel === "trace" ||
        activeOperationPanel === "disconnected") &&
        activeTab === "topology") ||
      ((activeOperationPanel === "homesNotLive" ||
        activeOperationPanel === "homesLive" ||
        activeOperationPanel === "capacity" ||
        activeOperationPanel === "addAsset") &&
        activeTab === "build") ||
      (activeOperationPanel === "handover" &&
        (activeTab === "overview" || activeTab === "reports")) ||
      (activeOperationPanel === "report" && activeTab === "reports"));

  const mobileWorkspaceTabs = [
    {
      label: "Summary",
      action: () => {
        setMobileQuickPanel("none");
        setActiveTab("overview");
        setActiveOperationPanel("none");
      },
    },
    {
      label: "DPs",
      action: () => {
        setMobileQuickPanel("dps");
        openOperationPanel("dpStatus", "overview");
      },
    },
    {
      label: "Homes",
      action: () => {
        setMobileQuickPanel("homes");
        openKpiDrilldown("homesNotLive", "build");
      },
    },
    {
      label: "Live",
      action: () => {
        setMobileQuickPanel("homes");
        openKpiDrilldown("homesLive", "build");
      },
    },
    {
      label: "QA",
      action: () => {
        setMobileQuickPanel("qa");
        openOperationPanel("qa", "qa");
      },
    },
    {
      label: "Map",
      action: () => {
        setMobileQuickPanel("none");
        setActiveTab("assets");
        setActiveOperationPanel("none");
      },
    },
  ].filter(
    (tab) =>
      !isHarrellicommsBackhaulWorkspace ||
      (tab.label !== "DPs" && tab.label !== "Homes" && tab.label !== "Live"),
  );

  return (
    <div style={scaledWorkspaceViewport}>
      <div style={scaledWorkspaceCanvas}>
        <div style={responsiveRoot}>
          {/* =====================================================
          PROJECT TOP HEADER
      ===================================================== */}
          <header style={responsiveTopHeader}>
            <div style={responsiveProjectHeaderBlock}>
              <div style={projectSwitcherRow}>
                <label
                  style={projectSwitcherLabel}
                  htmlFor="workspace-project-switcher"
                >
                  Project Area
                </label>
                {workspaceProjectOptions.length > 1 && onSelectProject ? (
                  <div style={projectSwitcherSearchWrap}>
                    <input
                      id="workspace-project-switcher"
                      value={
                        projectAreaSearchFocused || projectAreaSearchTerm
                          ? projectAreaSearchTerm
                          : activeWorkspaceProjectLabel
                      }
                      onChange={(event) => {
                        setProjectAreaSearchTerm(event.target.value);
                        setProjectAreaSearchFocused(true);
                      }}
                      onFocus={() => {
                        setProjectAreaSearchTerm("");
                        setProjectAreaSearchFocused(true);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setProjectAreaSearchFocused(false);
                          setProjectAreaSearchTerm("");
                        }, 160);
                      }}
                      placeholder="Search project areas..."
                      style={projectSwitcherSearchInput}
                      title="Search and switch project area without going back to the main map"
                      autoComplete="off"
                    />

                    {projectAreaSearchFocused && (
                      <div style={projectSwitcherResults}>
                        {filteredWorkspaceProjectOptions.length ? (
                          filteredWorkspaceProjectOptions.map((area) => {
                            const selected = area.id === activeWorkspaceProjectId;
                            return (
                              <button
                                key={area.id}
                                type="button"
                                style={{
                                  ...projectSwitcherResultButton,
                                  background: selected
                                    ? "rgba(37,99,235,0.35)"
                                    : projectSwitcherResultButton.background,
                                  color: selected ? "#bfdbfe" : "#e5e7eb",
                                }}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleWorkspaceProjectSelect(area.id);
                                }}
                              >
                                {getProjectAreaLabel(area)}
                              </button>
                            );
                          })
                        ) : (
                          <div style={projectSwitcherNoResults}>
                            No matching areas
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={projectSwitcherStatic}>{projectName}</div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <h1 style={responsiveProjectTitle}>{projectName}</h1>
                <span style={statusPill}>{effectiveWorkspaceStatus}</span>
                <span
                  style={{
                    ...readinessPill,
                    borderColor: readinessColour(operationalReadiness.state),
                    color: readinessColour(operationalReadiness.state),
                  }}
                >
                  {operationalReadiness.state}
                </span>
              </div>
              <div style={projectSubtitle}>Project Workspace</div>
            </div>

            <div style={responsiveTopMetrics}>
              <StatCard
                label="RFS"
                value={`${rolloutKpis.rfsPercent}%`}
                tone={rfsTone}
              />
              <StatCard
                label="Build Complete"
                value={`${rolloutKpis.buildCompletionPercent}%`}
                tone={
                  rolloutKpis.buildCompletionPercent >= 80
                    ? "good"
                    : rolloutKpis.buildCompletionPercent >= 50
                      ? "warn"
                      : "bad"
                }
              />
              <StatCard
                label="Readiness"
                value={`${operationalReadiness.score}%`}
                tone={readinessTone(operationalReadiness.state)}
              />
              <StatCard
                label="Homes Live"
                value={formatNumber(rolloutKpis.homesLive)}
                tone="good"
                active={activeOperationPanel === "homesLive"}
                title="Click to show live homes"
                onClick={() => openKpiDrilldown("homesLive", "build")}
              />
              <StatCard
                label="DPs Live"
                value={`${formatNumber(rolloutKpis.dpLive)} / ${formatNumber(rolloutKpis.dpTotal)}`}
                tone={
                  rolloutKpis.dpTotal > 0 &&
                  rolloutKpis.dpLive === rolloutKpis.dpTotal
                    ? "good"
                    : "warn"
                }
              />
              <StatCard
                label="QA Issues"
                value={formatNumber(rolloutKpis.qaIssues)}
                tone={rolloutKpis.qaIssues > 0 ? "bad" : "good"}
                active={
                  activeOperationPanel === "qa" ||
                  activeOperationPanel === "issues"
                }
                title="Click to open QA issues"
                onClick={() => openKpiDrilldown("qa", "qa")}
              />
            </div>

            <div style={responsiveHeaderActions}>
              <button
                type="button"
                style={responsiveHeaderButton}
                onClick={handleHeaderQgisExport}
                disabled={isHeaderQgisExporting}
              >
                {isHeaderQgisExporting ? "Exporting..." : "Export"}
              </button>
              <button
                type="button"
                style={responsiveHeaderButton}
                onClick={onBackToMap}
              >
                Back To Map
              </button>
              <UserMenu />
            </div>
          </header>

          {/* =====================================================
          WORKSPACE TAB BAR
      ===================================================== */}
          <nav style={responsiveTabBar}>
            {visibleWorkspaceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleWorkspaceTabChange(tab.id)}
                style={activeTab === tab.id ? activeTabButton : tabButton}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div style={responsiveWorkspaceBody}>
            <nav
              className="alistra-workspace-scrollless"
              style={workspaceQuickActionBar}
              aria-label="Workspace navigation"
            >
              <div style={railSectionTitle}>Workspace</div>
              {visibleWorkspaceTabs.map((tab) => (
                <button
                  key={`rail-tab-${tab.id}`}
                  type="button"
                  onClick={() => handleWorkspaceTabChange(tab.id)}
                  style={
                    activeTab === tab.id
                      ? quickActionButtonActive
                      : quickActionButton
                  }
                >
                  <span style={quickActionLabel}>{tab.label}</span>
                </button>
              ))}
              {!isHarrellicommsBackhaulWorkspace ? (
                <button
                  type="button"
                  onClick={() => openOperationPanel("dpStatus", "overview")}
                  style={
                    activeOperationPanel === "dpStatus"
                      ? quickActionButtonActive
                      : quickActionButton
                  }
                >
                  <span style={quickActionLabel}>DPs</span>
                  <span style={quickActionHelper}>
                    {formatNumber(rolloutKpis.dpTotal)} total
                  </span>
                </button>
              ) : null}

              <div style={railDivider} />
              <div style={railSectionTitle}>Focus</div>
              {visibleWorkspaceQuickActions.slice(0, 7).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  style={
                    action.active ? quickActionButtonActive : quickActionButton
                  }
                >
                  <span style={quickActionLabel}>{action.label}</span>
                  <span style={quickActionHelper}>{action.helper}</span>
                </button>
              ))}
            </nav>

            {/* =====================================================
            MAIN DASHBOARD CONTENT
        ===================================================== */}
            <main className="alistra-workspace-scrollless" style={responsiveContentGrid}>
              <section style={responsiveMapPanel}>
                <div style={responsiveMapToolbar}>
                  <div style={searchWrap}>
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && searchResults[0]) {
                          handleSearchSelect(searchResults[0]);
                        }
                        if (event.key === "Escape") {
                          setSearchFocused(false);
                        }
                      }}
                      placeholder="Search address, asset, cable..."
                      style={searchInput}
                    />
                    {searchFocused && searchResults.length > 0 && (
                      <div style={searchResultsPanel}>
                        {searchResults.map((asset) => (
                          <button
                            key={String(
                              (asset as any).id ||
                                (asset as any).assetId ||
                                getWorkspaceAssetTitle(asset),
                            )}
                            type="button"
                            style={searchResultButton}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSearchSelect(asset);
                            }}
                          >
                            <strong>{getWorkspaceAssetTitle(asset)}</strong>
                            <span>{getWorkspaceAssetType(asset)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={layerMenuWrap}>
                    <button
                      type="button"
                      style={layerButton}
                      onClick={() => setLayerMenuOpen((open) => !open)}
                    >
                      Layers ({enabledLayerCount}) ▾
                    </button>

                    {layerMenuOpen && (
                      <div style={layerMenu}>
                        <div style={layerMenuHeader}>Workspace Layers</div>
                        {workspaceLayerOptions.map((layer) => (
                          <label key={layer.key} style={layerRow}>
                            <input
                              type="checkbox"
                              checked={visibleLayers[layer.key]}
                              onChange={() => toggleLayer(layer.key)}
                            />
                            <span>
                              {formatLayerLabelWithCount(
                                layer.label,
                                workspaceLayerCounts[layer.key],
                              )}
                            </span>
                          </label>
                        ))}

                        <div style={layerMenuDivider} />
                        <div style={layerMenuHeader}>
                          Openreach / PIA Layers
                        </div>
                        {openreachLayerOptions.map((layer) => (
                          <label key={layer.key} style={layerRow}>
                            <input
                              type="checkbox"
                              checked={openreachLayers[layer.key]}
                              onChange={() => toggleOpenreachLayer(layer.key)}
                            />
                            <span>
                              {formatLayerLabelWithCount(
                                layer.label,
                                openreachLayerCounts[layer.key],
                              )}
                            </span>
                          </label>
                        ))}

                        <div style={layerMenuActions}>
                          <button
                            type="button"
                            style={miniLayerButton}
                            onClick={showAllLayers}
                          >
                            Show all
                          </button>
                          <button
                            type="button"
                            style={miniLayerButton}
                            onClick={hideAllLayers}
                          >
                            Boundary only
                          </button>
                        </div>
                        <button
                          type="button"
                          style={fullWidthMiniLayerButton}
                          onClick={showOnlyOpenreachLayers}
                        >
                          Openreach / PIA only
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={responsiveMapLiveWrap}>
                  <WorkspaceMap
                    key={workspaceMapRemountKey}
                    openreachLayers={openreachLayers}
                    projectName={projectName}
                    projectArea={projectArea}
                    assets={workspaceAssets}
                    openreachAssets={openreachWorkspaceAssets}
                    selectedAssetId={
                      fullSelectedWorkspaceAsset?.id ??
                      selectedWorkspaceAsset?.id ??
                      null
                    }
                    traceHighlightedAssetIds={workspaceHighlightedAssetIds}
                    traceHighlightKinds={traceHighlightKinds}
                    networkState={networkState}
                    managerAreaPoints={managerAreaPoints}
                    managerAreaDrawMode={isManagerAreaDrawing}
                    jobPackCaptureRequest={jobPackCaptureRequest}
                    onJobPackMapCaptured={handleJobPackMapCaptured}
                    onManagerAreaPointAdd={(point) => {
                      setManagerAreaPoints((prev) => [...prev, point]);
                    }}
                    onManagerAreaClear={() => {
                      setManagerAreaPoints([]);
                      setIsManagerAreaDrawing(false);
                    }}
                    showCableDistances
                    visibleLayers={visibleLayers}
                    onOpenDistributionPointEditor={(asset) => {
                      setSelectedWorkspaceAsset(asset);
                      setSearchTerm(getWorkspaceAssetTitle(asset));
                      onOpenDistributionPointEditor?.(asset);
                    }}
                    onAssetSelect={(asset) => {
                      const assetType = String(
                        (asset as any).assetType || (asset as any).type || "",
                      ).toLowerCase();

                      if (isPiaReviewableWorkspaceAsset(asset)) {
                        openAssetInPiaReview(asset);
                        return;
                      }

                      setSelectedWorkspaceAsset(asset);

                      if (
                        asset.geometry?.type === "LineString" ||
                        assetType.includes("cable")
                      ) {
                        setActiveTab("topology");
                        setActiveOperationPanel("trace");
                        return;
                      }

                      setActiveOperationPanel("none");
                    }}
                    onOpenAudit={onOpenAudit}
                  />

                  <div style={responsiveMapAssetInspector}>
                    <div
                      style={{
                        color: "#93c5fd",
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: 0.4,
                      }}
                    >
                      SELECTED ASSET
                    </div>
                    <div style={{ marginTop: 5, fontWeight: 900 }}>
                      {fullSelectedWorkspaceAsset
                        ? String(
                            (fullSelectedWorkspaceAsset as any).name ||
                              (fullSelectedWorkspaceAsset as any).jointName ||
                              fullSelectedWorkspaceAsset.id,
                          )
                        : "Click an asset"}
                    </div>
                    <div
                      style={{ marginTop: 3, color: "#cbd5e1", fontSize: 12 }}
                    >
                      {fullSelectedWorkspaceAsset
                        ? String(
                            (fullSelectedWorkspaceAsset as any).assetType ||
                              (fullSelectedWorkspaceAsset as any).jointType ||
                              "Asset",
                          )
                        : "Cable, DP, joint, pole, chamber or area"}
                    </div>
                  </div>
                </div>
              </section>

              {activeTab === "commercial" ? (
                <>
                  <section style={commercialStatsSidePanel}>
                    <div style={commercialHeaderRow}>
                      <div>
                        <div style={operationKicker}>COMMERCIAL</div>
                        <h3 style={commercialTitle}>Commercial Stats Board</h3>
                        <div style={commercialHint}>
                          Live area blockers, PIA gate, walk-off readiness and QA risk next to the map.
                        </div>
                      </div>
                      <span style={walkOffStatusPill(walkOffStatus)}>
                        {walkOffStatus}
                      </span>
                    </div>

                    <div style={commercialSideKpiGrid}>
                      <InfoRow
                        label="Walk-Off Status"
                        value={walkOffStatus}
                        highlight={walkOffStatus === "Approved"}
                      />
                      <InfoRow
                        label="PIA Gate"
                        value={piaGatePassedForWalkOff ? "Passed" : `${piaQaStats.piaPass} / ${piaQaStats.requiredTotal}`}
                        highlight={piaGatePassedForWalkOff}
                      />
                      <InfoRow
                        label="Readiness"
                        value={`${operationalReadiness.score}% · ${operationalReadiness.state}`}
                        highlight={
                          operationalReadiness.score >= 85 &&
                          operationalReadiness.blockers.length === 0
                        }
                      />
                      <InfoRow
                        label="High QA"
                        value={issueBuckets.high.length}
                        highlight={issueBuckets.high.length === 0}
                      />
                      <InfoRow
                        label="Medium QA"
                        value={issueBuckets.medium.length}
                        highlight={issueBuckets.medium.length === 0}
                      />
                      <InfoRow
                        label="DP Over Capacity"
                        value={rolloutKpis.dpOverCapacity}
                        highlight={rolloutKpis.dpOverCapacity === 0}
                      />
                      <InfoRow
                        label="Homes Live"
                        value={`${formatNumber(rolloutKpis.homesLive)} / ${formatNumber(rolloutKpis.homesPassed)}`}
                        highlight={
                          rolloutKpis.homesPassed > 0 &&
                          rolloutKpis.homesLive >= rolloutKpis.homesPassed
                        }
                      />
                      <InfoRow
                        label="Last Walk-Off"
                        value={walkOffSavedAt || "Not completed"}
                        highlight={Boolean(walkOffSavedAt)}
                      />
                    </div>

                    {!piaGatePassedForWalkOff ? (
                      <div style={commercialSideLockBox}>
                        <strong>Walk-Off locked</strong>
                        <span>PIA must fully pass before the audit can start.</span>
                      </div>
                    ) : null}
                  </section>

                  <section style={commercialBelowMapPanel}>
                    <AuditCommercialDashboard
                      projectAssets={workspaceAssets}
                      scopedToProject
                      refreshKey={walkOffSavedAt ? 1 : 0}
                      piaRequiredTotal={piaQaStats.requiredTotal}
                      piaPassed={piaQaStats.piaPass}
                      piaGatePassed={piaGatePassedForWalkOff}
                      walkOffStatus={walkOffStatus}
                      walkOffAuditLog={latestWalkOffAudit}
                      areaKey={activeWorkspaceProjectId || projectArea?.id || projectName || "commercial-area"}
                      areaName={projectArea?.name || projectName || "Current area"}
                      onSelectAssetId={(assetId) => {
                        const asset = workspaceAssets.find((candidate) =>
                          getAssetIdentityKeys(candidate).includes(
                            String(assetId).trim().toLowerCase(),
                          ),
                        );
                        if (asset) {
                          setSelectedWorkspaceAsset(asset);
                          setSearchTerm(getWorkspaceAssetTitle(asset));
                        }
                      }}
                    />

                    {selectedWorkspaceAsset ? (
                      <div style={commercialDetailGrid}>
                        <div style={commercialDetailCard}>
                          <div style={commercialDetailTitle}>
                            Selected Asset Payment Status
                          </div>
                          <div style={commercialSelectedAssetName}>
                            {getWorkspaceAssetTitle(selectedWorkspaceAsset)}
                          </div>
                          <AuditPaymentBlockerPanel
                            assetId={selectedWorkspaceAsset.id}
                            refreshKey={walkOffSavedAt ? 1 : 0}
                          />
                        </div>
                        <div style={commercialDetailCard}>
                          <AuditHistoryPanel
                            assetId={selectedWorkspaceAsset.id}
                            refreshKey={walkOffSavedAt ? 1 : 0}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={commercialEmptyBox}>
                        Select a blocker row to inspect asset payment status
                        and audit history.
                      </div>
                    )}
                  </section>
                </>
              ) : activeTab === "operations" ? (
                <section style={commercialBelowMapPanel}>
                  <AreaOperationsCentre
                    areaKey={activeWorkspaceProjectId || projectArea?.id || projectName || "current-area"}
                    areaName={projectArea?.name || projectName || "Current area"}
                    projectAssets={workspaceAssets}
                    onCaptureJobPackMaps={requestJobPackMapCaptures}
                    onSelectAsset={(asset) => {
                      setSelectedWorkspaceAsset(asset);
                      setSearchTerm(getWorkspaceAssetTitle(asset));
                    }}
                  />
                </section>
              ) : activeTab === "delivery" ? (
                <section style={commercialBelowMapPanel}>
                  <EngineeringDeliveryWorkspace
                    areaKey={activeWorkspaceProjectId || projectArea?.id || projectName || "current-area"}
                    areaName={projectArea?.name || projectName || "Current area"}
                    projectAssets={workspaceAssets}
                    onSelectAsset={(asset) => {
                      setSelectedWorkspaceAsset(asset);
                      setSearchTerm(getWorkspaceAssetTitle(asset));
                    }}
                  />
                </section>
              ) : activeOperationPanel === "dpStatus" ? (
                <section style={commercialBelowMapPanel}>
                  <div style={operationDrawerHeader}>
                    <div>
                      <div style={operationKicker}>DP OPERATIONS</div>
                      <h3 style={operationTitle}>Distribution Points</h3>
                    </div>
                    <button
                      type="button"
                      style={closePanelButton}
                      onClick={() => setActiveOperationPanel("none")}
                    >
                      ×
                    </button>
                  </div>

                  <div style={operationStack}>
                    <LiveHomesControl
                      projectAssets={workspaceAssets}
                      stats={workspaceDisplayStats}
                      onSelectAsset={(asset) => {
                        setSelectedWorkspaceAsset(asset);
                        setSearchTerm(getWorkspaceAssetTitle(asset));
                      }}
                      onOpenAsset={(asset) => {
                        setSelectedWorkspaceAsset(asset);
                        setSearchTerm(getWorkspaceAssetTitle(asset));
                        onOpenJointEditor?.(asset);
                      }}
                    />

                    <AreaBulkStatusPanel
                      projectAssets={workspaceAssets}
                      projectArea={projectArea}
                      drawnAreaPoints={managerAreaPoints}
                      isDrawingArea={isManagerAreaDrawing}
                      onStartDrawingArea={() => {
                        setManagerAreaPoints([]);
                        setIsManagerAreaDrawing(true);
                      }}
                      onStopDrawingArea={() => setIsManagerAreaDrawing(false)}
                      onClearDrawingArea={() => {
                        setManagerAreaPoints([]);
                        setIsManagerAreaDrawing(false);
                      }}
                      onBulkUpdateDpStatus={onBulkUpdateDpStatus}
                    />
                  </div>
                </section>
              ) : fullSelectedWorkspaceAsset && activeTab !== "pia" ? (
                <section style={intelligenceDock}>
                  <AssetIntelligencePanel
                    asset={fullSelectedWorkspaceAsset}
                    projectName={projectName}
                    projectAssets={workspaceAssets}
                    networkGraph={networkGraph}
                    dpStates={networkState.dpStates}
                    onClose={() => setSelectedWorkspaceAsset(null)}
                    onOpenTopology={openInternalTraceTool}
                    onOpenQA={() => {
                      setActiveTab("qa");
                      setActiveOperationPanel("none");
                    }}
                    onSelectAsset={setSelectedWorkspaceAsset}
                    onZoomAsset={setSelectedWorkspaceAsset}
                    onOpenJointEditor={onOpenJointEditor}
                    onOpenDuctEditor={(asset) => {
                      setSelectedWorkspaceAsset(asset);
                      onOpenDuctEditor?.(asset);
                    }}
                    onOpenDistributionPointEditor={(asset) => {
                      setSelectedWorkspaceAsset(asset);
                      onOpenDistributionPointEditor?.(asset);
                    }}
                    onUpdateDpStatus={({ asset, status, note }) => {
                      const syncedAsset = syncWorkspaceDpStatus(asset, status);
                      setSelectedWorkspaceAsset(syncedAsset);
                      onUpdateDpStatus?.({
                        assetId: asset.id,
                        status,
                        note,
                      });
                    }}
                  />
                </section>
              ) : (
                <>
                  <section style={responsiveWorkspaceDetailPanel}>
                    <WorkspaceTabContent
                      activeTab={activeTab}
                      projectName={projectName}
                      status={effectiveWorkspaceStatus}
                      stats={workspaceDisplayStats}
                      projectAssets={workspaceAssets}
                      projectArea={projectArea}
                      isBackhaulWorkspace={isHarrellicommsBackhaulWorkspace}
                      auditIssues={auditIssues}
                      disconnectedAssets={disconnectedAssets}
                      networkGraph={networkGraph}
                      managerAreaPoints={managerAreaPoints}
                      isManagerAreaDrawing={isManagerAreaDrawing}
                      onStartManagerAreaDrawing={() => {
                        setActiveTab("build");
                        setManagerAreaPoints([]);
                        setIsManagerAreaDrawing(true);
                      }}
                      onStopManagerAreaDrawing={() =>
                        setIsManagerAreaDrawing(false)
                      }
                      onClearManagerAreaDrawing={() => {
                        setManagerAreaPoints([]);
                        setIsManagerAreaDrawing(false);
                      }}
                      areaDistributionPoints={areaDistributionPoints}
                      onBulkUpdateDpStatus={onBulkUpdateDpStatus}
                      onBulkUpdateCablePiaNoi={
                        onBulkUpdateCablePiaNoi
                          ? handleBulkCablePiaNoiUpdate
                          : undefined
                      }
                      onBulkUpdateJointInstallMethod={onBulkUpdateJointInstallMethod}
                      onBulkUpdateWorkStatus={onBulkUpdateWorkStatus}
                      onRecordDailyProgress={onRecordDailyProgress}
                      onClearDpFibreAllocations={
                        handleClearAreaDpFibreAllocations
                      }
                      onResolveDuplicateHomes={onResolveDuplicateHomes}
                      onAutoSpreadStackedHomes={onAutoSpreadStackedHomes}
                      onApplyAddressSheetAssignments={
                        onApplyAddressSheetAssignments
                      }
                      onApplySbRouteAssignments={onApplySbRouteAssignments}
                      onSelectAsset={(asset) => {
                        setSelectedWorkspaceAsset(asset);
                        setSearchTerm(getWorkspaceAssetTitle(asset));
                      }}
                      onOpenJointEditor={onOpenJointEditor}
                      onOpenPanel={(panel, tab) =>
                        openOperationPanel(
                          panel as WorkspaceOperationPanel,
                          (tab || activeTab) as WorkspaceTab,
                        )
                      }
                      onOpenTrace={openInternalTraceTool}
                      onOpenQA={() => {
                        setActiveTab("qa");
                        setActiveOperationPanel("none");
                      }}
                      onOpenFibreTopology={onOpenFibreTopology || openInternalTraceTool}
                      onExport={onExport}
                      onBackToMap={onBackToMap}
                    />
                  </section>

                  {activeTab === "overview" && (
                  <section style={areaHandoverPanel}>
                      <div style={areaHandoverHeader}>
                        <div>
                          <div style={operationKicker}>AREA HANDOVER</div>
                          <h3 style={areaHandoverTitle}>
                            {isHarrellicommsBackhaulWorkspace
                              ? "Route Delivery Stage"
                              : "Delivery Stage / Commercial Sign-Off"}
                          </h3>
                          <div style={areaHandoverHint}>
                            {isHarrellicommsBackhaulWorkspace
                              ? "Track the backhaul route from survey through planned, in progress, built, walk-off, as-builts and handover."
                              : "Track the area from identification and survey gates through build, PIA, walk-off and final handover."}
                          </div>
                        </div>
                        <span style={walkOffStatusPill(walkOffStatus)}>
                          {walkOffStatus}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          padding: 12,
                          border: "1px solid rgba(96,165,250,0.25)",
                          background: "rgba(2, 6, 23, 0.22)",
                          borderRadius: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={operationKicker}>PHASE CONTROL</div>
                            <strong style={{ color: "#f8fafc" }}>
                              {deliveryPhaseConfig.label}
                            </strong>
                            <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>
                              {deliveryPhaseConfig.description}
                            </div>
                          </div>
                          {!isHarrellicommsBackhaulWorkspace && piaGateCustomerLiveOverride && (
                            <span style={walkOffStatusPill("Review Required")}>
                              PIA override active
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                            gap: 8,
                          }}
                        >
                          {workspaceDeliveryPhaseOptions.map((phase) => {
                            const selected = phase.id === deliveryPhase;
                            return (
                              <button
                                key={phase.id}
                                type="button"
                                style={{
                                  ...smallButton,
                                  width: "100%",
                                  background: selected ? "#1d4ed8" : "#111827",
                                  borderColor: selected
                                    ? "rgba(147,197,253,0.7)"
                                    : "rgba(148,163,184,0.22)",
                                  color: selected ? "#ffffff" : "#e5e7eb",
                                  opacity: canManageWalkOff ? 1 : 0.55,
                                  cursor: canManageWalkOff ? "pointer" : "not-allowed",
                                }}
                                disabled={!canManageWalkOff}
                                onClick={() => handleDeliveryPhaseChange(phase.id)}
                                title={
                                  canManageWalkOff
                                    ? phase.description
                                    : "Administrator or Super User access required"
                                }
                              >
                                {phase.gateLabel ? (
                                  <span
                                    style={{
                                      display: "block",
                                      color: selected ? "#bfdbfe" : "#93c5fd",
                                      fontSize: 10,
                                      fontWeight: 950,
                                      textTransform: "uppercase",
                                      marginBottom: 2,
                                    }}
                                  >
                                    {phase.gateLabel}
                                  </span>
                                ) : null}
                                <span>{phase.shortLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                        {!isHarrellicommsBackhaulWorkspace && deliveryPhaseOverrideReason && piaGateCustomerLiveOverride && (
                          <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                            Override note: {deliveryPhaseOverrideReason}
                          </div>
                        )}
                      </div>

                      <div style={areaHandoverGrid}>
                        {!isHarrellicommsBackhaulWorkspace ? (
                          <InfoRow
                            label="PIA Gate"
                            value={
                              rawPiaGatePassedForWalkOff
                                ? "Passed"
                                : deliveryPhaseConfig.allowsWalkOffWithoutPia
                                  ? "Override"
                                  : `${piaQaStats.piaPass} / ${piaQaStats.requiredTotal}`
                            }
                            highlight={piaGatePassedForWalkOff}
                          />
                        ) : (
                          <InfoRow
                            label="Route Stage"
                            value={deliveryPhaseConfig.shortLabel}
                            highlight={deliveryPhase !== "survey-stage"}
                          />
                        )}
                        <InfoRow
                          label="Readiness"
                          value={`${operationalReadiness.score}% · ${operationalReadiness.state}`}
                          highlight={
                            operationalReadiness.score >= 85 &&
                            operationalReadiness.blockers.length === 0
                          }
                        />
                        <InfoRow
                          label="Hard Blockers"
                          value={operationalReadiness.blockers.length || "None"}
                          highlight={operationalReadiness.blockers.length === 0}
                        />
                        <InfoRow
                          label="QA High / Medium"
                          value={`${issueBuckets.high.length} / ${issueBuckets.medium.length}`}
                          highlight={issueBuckets.high.length === 0}
                        />
                        {!isHarrellicommsBackhaulWorkspace ? (
                          <>
                            <InfoRow
                              label="Homes Live"
                              value={`${formatNumber(rolloutKpis.homesLive)} / ${formatNumber(rolloutKpis.homesPassed)}`}
                              highlight={
                                rolloutKpis.homesPassed > 0 &&
                                rolloutKpis.homesLive >= rolloutKpis.homesPassed
                              }
                            />
                            <InfoRow
                              label="DPs Live"
                              value={`${formatNumber(rolloutKpis.dpLive)} / ${formatNumber(rolloutKpis.dpTotal)}`}
                              highlight={
                                rolloutKpis.dpTotal > 0 &&
                                rolloutKpis.dpLive >= rolloutKpis.dpTotal
                              }
                            />
                          </>
                        ) : null}
                        <InfoRow
                          label="Last Walk-Off"
                          value={walkOffSavedAt || "Not completed"}
                          highlight={Boolean(walkOffSavedAt)}
                        />
                      </div>

                      {isHarrellicommsBackhaulWorkspace ? (
                        operationalReadiness.blockers.length ? (
                          <div style={handoverBlockerBox}>
                            <strong>Current blockers</strong>
                            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                              {operationalReadiness.blockers
                                .slice(0, 4)
                                .map((blocker) => (
                                  <li key={blocker}>{blocker}</li>
                                ))}
                            </ul>
                          </div>
                        ) : (
                          <div style={handoverGoodBox}>
                            Route delivery stage is tracking without hard readiness blockers.
                          </div>
                        )
                      ) : !piaGatePassedForWalkOff ? (
                        <div style={handoverBlockerBox}>
                          <strong>PIA gate blocker</strong>
                          <div style={{ marginTop: 8 }}>{piaGateBlockerText}</div>
                        </div>
                      ) : !rawPiaGatePassedForWalkOff && deliveryPhaseConfig.allowsWalkOffWithoutPia ? (
                        <div style={handoverGoodBox}>
                          Walk-Off is available through manager override. PIA is still
                          incomplete, so keep the override note with the audit evidence.
                        </div>
                      ) : operationalReadiness.blockers.length ? (
                        <div style={handoverBlockerBox}>
                          <strong>Current blockers</strong>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                            {operationalReadiness.blockers
                              .slice(0, 4)
                              .map((blocker) => (
                                <li key={blocker}>{blocker}</li>
                              ))}
                          </ul>
                        </div>
                      ) : (
                        <div style={handoverGoodBox}>
                          No hard readiness blockers detected and PIA has passed in full. Area is ready for
                          final walk-off review.
                        </div>
                      )}

                      <div style={areaHandoverActions}>
                        <button
                          type="button"
                          style={{
                            ...wideButton,
                            opacity: isHarrellicommsBackhaulWorkspace || piaGatePassedForWalkOff ? 1 : 0.48,
                            cursor: isHarrellicommsBackhaulWorkspace || piaGatePassedForWalkOff ? "pointer" : "not-allowed",
                          }}
                          disabled={!isHarrellicommsBackhaulWorkspace && !piaGatePassedForWalkOff}
                          title={piaGateBlockerText}
                          onClick={handleOpenWalkOffAudit}
                        >
                          {isHarrellicommsBackhaulWorkspace
                            ? "Launch Route Walk-Off"
                            : piaGatePassedForWalkOff
                              ? "Launch Walk-Off Audit"
                              : "Walk-Off Locked - PIA Not Passed"}
                        </button>
                        {canManageWalkOff && latestWalkOffAudit ? (
                          <button
                            type="button"
                            style={dangerWideButton}
                            onClick={handleCancelWalkOffAudit}
                          >
                            Cancel Current Walk-Off
                          </button>
                        ) : null}
                        <button
                          type="button"
                          style={wideButton}
                          onClick={() =>
                            openOperationPanel("handover", "overview")
                          }
                        >
                          View Handover Snapshot
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}

              {shouldShowOperationPanel && (
                <section style={operationDrawer}>
                  <div style={operationDrawerHeader}>
                    <div>
                      <div style={operationKicker}>OPERATION PANEL</div>
                      <h3 style={operationTitle}>
                        {activeOperationPanel === "projectDetails" &&
                          "Project Details"}
                        {activeOperationPanel === "rfsBreakdown" &&
                          "RFS Breakdown"}
                        {activeOperationPanel === "dpStatus" &&
                          "DP Operations"}
                        {activeOperationPanel === "issues" && "Area Issues"}
                        {activeOperationPanel === "qa" && "QA Validation"}
                        {activeOperationPanel === "homesNotLive" &&
                          "Homes Not Live"}
                        {activeOperationPanel === "homesLive" && "Live Homes"}
                        {activeOperationPanel === "disconnected" &&
                          "Disconnected Assets"}
                        {activeOperationPanel === "capacity" &&
                          "Capacity Risks"}
                        {activeOperationPanel === "addAsset" && "Add New Asset"}
                        {activeOperationPanel === "handover" && "Area Handover"}
                        {activeOperationPanel === "report" && "Project Report"}
                        {activeOperationPanel === "piaQa" && "PIA Acceptance"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      style={closePanelButton}
                      onClick={() => setActiveOperationPanel("none")}
                    >
                      ×
                    </button>
                  </div>

                  {activeOperationPanel === "projectDetails" && (
                    <div style={operationGrid}>
                      <InfoRow label="Project" value={projectName} />
                      <InfoRow label="Status" value={effectiveWorkspaceStatus} highlight />
                      <InfoRow
                        label="Homes"
                        value={`${formatNumber(displayStats.homesConnected)} / ${formatNumber(displayStats.homesPassed)}`}
                      />
                      <InfoRow
                        label="Area Size"
                        value={formatAreaSize(workspaceAreaMetrics.areaSquareMeters)}
                      />
                      <InfoRow
                        label="Boundary Length"
                        value={formatDistance(workspaceAreaMetrics.boundaryLengthMeters)}
                      />
                      <InfoRow
                        label="Route Length"
                        value={formatDistance(rolloutKpis.routeLengthMeters)}
                      />
                      <InfoRow
                        label="Total Assets"
                        value={formatNumber(operationalWorkspaceAssets.length)}
                      />
                      <InfoRow
                        label="Project Area"
                        value={
                          projectArea
                            ? String(
                                (projectArea as any).name ||
                                  (projectArea as any).label ||
                                  projectArea.id,
                              )
                            : "Not selected"
                        }
                      />
                    </div>
                  )}

                  {activeOperationPanel === "rfsBreakdown" && (
                    <div style={operationGrid}>
                      <InfoRow
                        label="RFS Progress"
                        value={`${displayStats.rfsPercent}%`}
                        highlight={displayStats.rfsPercent >= 80}
                      />
                      <InfoRow
                        label="Homes Passed"
                        value={formatNumber(displayStats.homesPassed)}
                      />
                      <InfoRow
                        label="Homes Connected"
                        value={formatNumber(displayStats.homesConnected)}
                      />
                      <InfoRow
                        label="Homes Remaining"
                        value={formatNumber(
                          Math.max(
                            0,
                            displayStats.homesPassed -
                              displayStats.homesConnected,
                          ),
                        )}
                      />
                      <InfoRow
                        label="Readiness State"
                        value={operationalReadiness.state}
                        highlight={
                          operationalReadiness.state === "Ready For Service" ||
                          operationalReadiness.state === "Live"
                        }
                      />
                      <InfoRow
                        label="Readiness Score"
                        value={`${operationalReadiness.score}%`}
                        highlight={operationalReadiness.score >= 85}
                      />
                      <InfoRow
                        label="Readiness Blockers"
                        value={
                          operationalReadiness.blockers.length
                            ? operationalReadiness.blockers.length
                            : "None"
                        }
                        highlight={operationalReadiness.blockers.length === 0}
                      />
                      <InfoRow label="Build Status" value={effectiveWorkspaceStatus} />
                    </div>
                  )}

                  {activeOperationPanel === "dpStatus" && (
                    <div style={operationStack}>
                      <LiveHomesControl
                        projectAssets={workspaceAssets}
                        stats={workspaceDisplayStats}
                        onSelectAsset={(asset) => {
                          setSelectedWorkspaceAsset(asset);
                          setSearchTerm(getWorkspaceAssetTitle(asset));
                        }}
                        onOpenAsset={(asset) => {
                          setSelectedWorkspaceAsset(asset);
                          setSearchTerm(getWorkspaceAssetTitle(asset));
                          onOpenJointEditor?.(asset);
                        }}
                      />

                      <AreaBulkStatusPanel
                        projectAssets={workspaceAssets}
                        projectArea={projectArea}
                        drawnAreaPoints={managerAreaPoints}
                        isDrawingArea={isManagerAreaDrawing}
                        onStartDrawingArea={() => {
                          setManagerAreaPoints([]);
                          setIsManagerAreaDrawing(true);
                        }}
                        onStopDrawingArea={() => setIsManagerAreaDrawing(false)}
                        onClearDrawingArea={() => {
                          setManagerAreaPoints([]);
                          setIsManagerAreaDrawing(false);
                        }}
                        onBulkUpdateDpStatus={onBulkUpdateDpStatus}
                      />
                    </div>
                  )}

                  {(activeOperationPanel === "issues" ||
                    activeOperationPanel === "qa") && (
                    <div style={operationStack}>
                      <div style={qaStickyHeader}>
                        <div style={issueGrid}>
                          <IssueCard
                            label="High"
                            value={issueBuckets.high.length}
                            tone="#7f1d1d"
                            active={selectedIssueSeverity === "high"}
                            onClick={() => openIssueSeverity("high")}
                          />
                          <IssueCard
                            label="Medium"
                            value={issueBuckets.medium.length}
                            tone="#78350f"
                            active={selectedIssueSeverity === "medium"}
                            onClick={() => openIssueSeverity("medium")}
                          />
                          <IssueCard
                            label="Low"
                            value={issueBuckets.low.length}
                            tone="#1e3a8a"
                            active={selectedIssueSeverity === "low"}
                            onClick={() => openIssueSeverity("low")}
                          />
                        </div>

                        <div style={qaToolbar}>
                          <div style={{ color: "#cbd5e1", fontWeight: 800 }}>
                            {selectedIssueSeverity
                              ? `${selectedIssueSeverity.toUpperCase()} issues — ${selectedSeverityIssues.length.toLocaleString("en-GB")}`
                              : "No QA severity selected"}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              style={{
                                ...qaModeButton,
                                ...(qaPanelViewMode === "navigator"
                                  ? qaModeButtonActive
                                  : {}),
                              }}
                              onClick={() => setQaPanelViewMode("navigator")}
                            >
                              Navigator View
                            </button>
                            <button
                              type="button"
                              style={{
                                ...qaModeButton,
                                ...(qaPanelViewMode === "list"
                                  ? qaModeButtonActive
                                  : {}),
                              }}
                              onClick={() => setQaPanelViewMode("list")}
                            >
                              List View
                            </button>
                          </div>
                        </div>
                      </div>

                      {auditIssues.length === 0 ? (
                        <div style={emptyPanel}>
                          No QA issues found for this project area.
                        </div>
                      ) : (
                        <>
                          <div style={qaCategoryGrid}>
                            {qaIssueCategoryGroups.length === 0 ? (
                              <div style={emptyPanel}>
                                No issues in this severity bucket.
                              </div>
                            ) : (
                              qaIssueCategoryGroups.map((group) => (
                                <button
                                  key={group.key}
                                  type="button"
                                  style={{
                                    ...qaCategoryCard,
                                    ...(selectedIssueCategoryKey === group.key
                                      ? qaCategoryCardActive
                                      : {}),
                                  }}
                                  onClick={() => {
                                    setActiveIssueCategory(group.key);
                                    setIssueNavigatorIndex(0);
                                    const firstIssue = group.issues[0];
                                    if (firstIssue)
                                      handleAuditIssueSelect(firstIssue);
                                  }}
                                >
                                  <span>{group.label}</span>
                                  <strong>
                                    {group.issues.length.toLocaleString(
                                      "en-GB",
                                    )}
                                  </strong>
                                </button>
                              ))
                            )}
                          </div>

                          {qaPanelViewMode === "navigator" ? (
                            <div style={qaNavigatorPanel}>
                              {selectedNavigatorIssue ? (
                                <>
                                  <div style={qaNavigatorTopline}>
                                    <span>
                                      {selectedIssueCategoryGroup?.label ||
                                        "QA Issue"}{" "}
                                      — Issue{" "}
                                      {Math.min(
                                        issueNavigatorIndex + 1,
                                        selectedCategoryIssues.length,
                                      )}{" "}
                                      of {selectedCategoryIssues.length}
                                    </span>
                                    <span>
                                      {String(
                                        selectedNavigatorIssue.severity ||
                                          selectedIssueSeverity ||
                                          "issue",
                                      ).toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={qaNavigatorAsset}>
                                    {getAuditIssueAssetLabel(
                                      selectedNavigatorIssue,
                                    )}
                                  </div>
                                  <div style={qaNavigatorIssue}>
                                    {getAuditIssueDescription(
                                      selectedNavigatorIssue,
                                    )}
                                  </div>
                                  <div style={qaNavigatorActions}>
                                    <button
                                      type="button"
                                      style={qaActionButton}
                                      onClick={() => moveNavigatorIssue(-1)}
                                    >
                                      ◀ Previous
                                    </button>
                                    <button
                                      type="button"
                                      style={qaPrimaryButton}
                                      onClick={openSelectedNavigatorIssue}
                                    >
                                      Zoom / Select Asset
                                    </button>
                                    <button
                                      type="button"
                                      style={qaActionButton}
                                      onClick={() => moveNavigatorIssue(1)}
                                    >
                                      Next ▶
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div style={emptyPanel}>
                                  Select a category to start reviewing issues.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={qaCompactList}>
                              {selectedCategoryIssues
                                .slice(0, 120)
                                .map((issue: AuditIssue, index: number) => {
                                  const matchedAsset =
                                    findWorkspaceAssetForIssue(
                                      issue,
                                      workspaceAssets,
                                    );
                                  const category =
                                    classifyAuditIssueCategory(issue);

                                  return (
                                    <button
                                      key={`${issue.assetId}-${getAuditIssueDescription(issue)}-${index}`}
                                      type="button"
                                      style={{
                                        ...qaCompactRow,
                                        cursor: matchedAsset
                                          ? "pointer"
                                          : "default",
                                      }}
                                      onClick={() =>
                                        handleAuditIssueSelect(issue)
                                      }
                                    >
                                      <strong>
                                        {String(
                                          issue.severity ||
                                            selectedIssueSeverity ||
                                            "issue",
                                        ).toUpperCase()}
                                      </strong>
                                      <span>{category.label}</span>
                                      <span>
                                        {getAuditIssueAssetLabel(issue)}
                                      </span>
                                      <small>
                                        {getAuditIssueDescription(issue)}
                                      </small>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {(activeOperationPanel === "homesNotLive" ||
                    activeOperationPanel === "homesLive") && (
                    <div style={operationStack}>
                      <div style={emptyPanel}>
                        {activeOperationPanel === "homesNotLive"
                          ? `${homesNotLiveAssets.length.toLocaleString("en-GB")} home(s) are not live in this area. Click a row to highlight it on the workspace map.`
                          : `${homesLiveAssets.length.toLocaleString("en-GB")} live home(s) found in this area. Click a row to highlight it on the workspace map.`}
                      </div>
                      <div style={operationList}>
                        {(activeOperationPanel === "homesNotLive"
                          ? homesNotLiveAssets
                          : homesLiveAssets
                        )
                          .slice(0, 80)
                          .map((asset) => (
                            <AssetDrilldownButton
                              key={asset.id}
                              asset={asset}
                              title={getWorkspaceAssetTitle(asset)}
                              assetType={getWorkspaceAssetType(asset)}
                              subtitle={getWorkspaceHomeConnectionStatus(
                                asset,
                                workspaceAssets,
                              ).toUpperCase()}
                              detail={String(
                                (asset as any).address ||
                                  (asset as any).uprn ||
                                  (asset as any).UPRN ||
                                  (asset as any).homeId ||
                                  asset.id,
                              )}
                              onClick={() => {
                                setSelectedWorkspaceAsset(asset);
                                setSearchTerm(getWorkspaceAssetTitle(asset));
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {activeOperationPanel === "disconnected" && (
                    <div style={operationStack}>
                      <div style={emptyPanel}>
                        {`${disconnectedWorkspaceAssets.length.toLocaleString("en-GB")} disconnected asset(s) found in this area. Click an asset to inspect it.`}
                      </div>
                      <div style={operationList}>
                        {disconnectedWorkspaceAssets.length === 0 ? (
                          <div style={emptyPanel}>
                            No disconnected assets found.
                          </div>
                        ) : (
                          disconnectedWorkspaceAssets
                            .slice(0, 80)
                            .map((asset) => (
                              <AssetDrilldownButton
                                key={asset.id}
                                asset={asset}
                                title={getWorkspaceAssetTitle(asset)}
                                assetType={getWorkspaceAssetType(asset)}
                                subtitle={getWorkspaceAssetType(asset)}
                                detail="Disconnected from current topology graph"
                                onClick={() => {
                                  setSelectedWorkspaceAsset(asset);
                                  setSearchTerm(getWorkspaceAssetTitle(asset));
                                  setActiveTab("topology");
                                }}
                              />
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeOperationPanel === "capacity" && (
                    <div style={operationStack}>
                      <div style={emptyPanel}>
                        {`${capacityRiskAssets.length.toLocaleString("en-GB")} DP(s) are near, full, or over capacity.`}
                      </div>
                      <div style={operationList}>
                        {capacityRiskAssets.length === 0 ? (
                          <div style={emptyPanel}>
                            No DP capacity risks found.
                          </div>
                        ) : (
                          capacityRiskAssets
                            .slice(0, 80)
                            .map(({ asset, capacity }) => (
                              <AssetDrilldownButton
                                key={asset.id}
                                asset={asset}
                                subtitle={`${capacity.risk} — ${capacity.percent}%`}
                                title={getWorkspaceAssetTitle(asset)}
                                assetType={getWorkspaceAssetType(asset)}
                                detail={capacity.warning}
                                onClick={() => {
                                  setSelectedWorkspaceAsset(asset);
                                  setSearchTerm(getWorkspaceAssetTitle(asset));
                                  setActiveTab("build");
                                }}
                              />
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeOperationPanel === "addAsset" && (
                    <div style={operationStack}>
                      <div style={emptyPanel}>
                        Asset creation still lives on the main map so the
                        existing right-click creation, snapping, cable drawing
                        and save logic stays protected.
                      </div>
                      <button
                        type="button"
                        style={wideButton}
                        onClick={onBackToMap}
                      >
                        Back To Map To Add Asset
                      </button>
                    </div>
                  )}

                  {activeOperationPanel === "handover" && (
                    <div style={operationStack}>
                      <div style={handoverSnapshotBox}>
                        <div style={areaHandoverHeader}>
                          <div>
                            <div style={operationKicker}>WALK-OFF SNAPSHOT</div>
                            <h3 style={areaHandoverTitle}>{projectName}</h3>
                          </div>
                          <span style={walkOffStatusPill(walkOffStatus)}>
                            {walkOffStatus}
                          </span>
                        </div>
                        <div style={operationGrid}>
                          <InfoRow
                            label="Readiness State"
                            value={operationalReadiness.state}
                            highlight={
                              operationalReadiness.state ===
                                "Ready For Service" ||
                              operationalReadiness.state === "Live"
                            }
                          />
                          <InfoRow
                            label="Readiness Score"
                            value={`${operationalReadiness.score}%`}
                            highlight={operationalReadiness.score >= 85}
                          />
                          <InfoRow
                            label="RFS"
                            value={`${rolloutKpis.rfsPercent}%`}
                            highlight={rolloutKpis.rfsPercent >= 95}
                          />
                          <InfoRow
                            label="Build Complete"
                            value={`${rolloutKpis.buildCompletionPercent}%`}
                            highlight={rolloutKpis.buildCompletionPercent >= 95}
                          />
                          <InfoRow
                            label="Homes Live"
                            value={`${formatNumber(rolloutKpis.homesLive)} / ${formatNumber(rolloutKpis.homesPassed)}`}
                          />
                          <InfoRow
                            label="DPs Live"
                            value={`${formatNumber(rolloutKpis.dpLive)} / ${formatNumber(rolloutKpis.dpTotal)}`}
                          />
                          <InfoRow
                            label="QA High"
                            value={issueBuckets.high.length}
                            highlight={issueBuckets.high.length === 0}
                          />
                          <InfoRow
                            label="QA Medium"
                            value={issueBuckets.medium.length}
                            highlight={issueBuckets.medium.length === 0}
                          />
                          <InfoRow
                            label="Disconnected"
                            value={rolloutKpis.disconnectedAssets}
                            highlight={rolloutKpis.disconnectedAssets === 0}
                          />
                          <InfoRow
                            label="DP Over Capacity"
                            value={rolloutKpis.dpOverCapacity}
                            highlight={rolloutKpis.dpOverCapacity === 0}
                          />
                          <InfoRow
                            label="Last Walk-Off"
                            value={walkOffSavedAt || "Not completed"}
                            highlight={Boolean(walkOffSavedAt)}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        style={{
                          ...wideButton,
                          opacity: piaGatePassedForWalkOff ? 1 : 0.48,
                          cursor: piaGatePassedForWalkOff ? "pointer" : "not-allowed",
                        }}
                        disabled={!piaGatePassedForWalkOff}
                        title={piaGateBlockerText}
                        onClick={handleOpenWalkOffAudit}
                      >
                        {piaGatePassedForWalkOff ? "Launch Walk-Off Audit" : "Walk-Off Locked - PIA Not Passed"}
                      </button>
                      {canManageWalkOff && latestWalkOffAudit ? (
                        <button
                          type="button"
                          style={dangerWideButton}
                          onClick={handleCancelWalkOffAudit}
                        >
                          Cancel Current Walk-Off
                        </button>
                      ) : null}
                      <button
                        type="button"
                        style={wideButton}
                        onClick={() => openOperationPanel("qa", "qa")}
                      >
                        Review QA Issues
                      </button>
                    </div>
                  )}

                </section>
              )}
            </main>

            <aside
              className="alistra-workspace-scrollless"
              style={responsiveNextActionsPanel}
              aria-label="Next actions"
            >
              <div style={nextActionsHeader}>
                <div>
                  <div style={operationKicker}>AREA CONTROL</div>
                  <h3 style={nextActionsTitle}>Next Actions</h3>
                </div>
                <span
                  style={{
                    ...readinessPill,
                    borderColor: readinessColour(operationalReadiness.state),
                    color: readinessColour(operationalReadiness.state),
                  }}
                >
                  {operationalReadiness.state}
                </span>
              </div>

              <div style={nextActionsSummaryGrid}>
                <InfoRow
                  label="Area Size"
                  value={formatAreaSize(workspaceAreaMetrics.areaSquareMeters)}
                />
                <InfoRow
                  label="Route"
                  value={formatDistance(rolloutKpis.routeLengthMeters)}
                />
                <InfoRow
                  label="Assets"
                  value={formatNumber(operationalWorkspaceAssets.length)}
                />
                <InfoRow
                  label="Disconnected"
                  value={formatNumber(rolloutKpis.disconnectedAssets)}
                  highlight={rolloutKpis.disconnectedAssets === 0}
                />
              </div>

              <div style={nextActionList}>
                {nextActionItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    style={nextActionButton(item.tone)}
                    onClick={item.onClick}
                  >
                    <span style={nextActionText}>
                      <strong>{item.label}</strong>
                      <small style={nextActionValue}>{item.value}</small>
                    </span>
                    <em style={nextActionCommand}>{item.action}</em>
                  </button>
                ))}
              </div>

              <div style={selectedAssetStrip}>
                <div style={operationKicker}>SELECTED ASSET</div>
                <strong>
                  {fullSelectedWorkspaceAsset
                    ? getWorkspaceAssetTitle(fullSelectedWorkspaceAsset)
                    : "Click an asset"}
                </strong>
                <span>
                  {fullSelectedWorkspaceAsset
                    ? getWorkspaceAssetType(fullSelectedWorkspaceAsset)
                    : "Cable, DP, joint, pole, chamber or area"}
                </span>
              </div>

              {operationalReadiness.blockers.length ? (
                <div style={nextBlockerBox}>
                  <strong>Readiness Blockers</strong>
                  <ul>
                    {operationalReadiness.blockers.slice(0, 4).map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={nextGoodBox}>
                  No hard readiness blockers detected.
                </div>
              )}
            </aside>
          </div>

          {false && isPhone && fullSelectedWorkspaceAsset && (
            <div style={mobileSelectedActionBar}>
              <div style={mobileSelectedSummary}>
                <strong>
                  {getWorkspaceAssetTitle(fullSelectedWorkspaceAsset)}
                </strong>
                <span>{getWorkspaceAssetType(fullSelectedWorkspaceAsset)}</span>
              </div>
              <button
                type="button"
                style={mobileActionButton}
                onClick={handleMobileOpenSelectedEditor}
              >
                Open
              </button>
              <button
                type="button"
                style={mobileActionButton}
                onClick={() => {
                  setActiveTab("topology");
                  setActiveOperationPanel("trace");
                }}
              >
                Trace
              </button>
              <button
                type="button"
                style={mobileActionButton}
                onClick={() => openOperationPanel("qa", "qa")}
              >
                QA
              </button>
              <button
                type="button"
                style={mobileCloseButton}
                onClick={() => setSelectedWorkspaceAsset(null)}
              >
                ×
              </button>
            </div>
          )}

          {false && isPhone && mobileQuickPanel !== "none" && (
            <div style={mobileQuickPanelWrap}>
              <div style={mobileQuickPanelHeader}>
                <strong>
                  {mobileQuickPanel === "dps" && "Mobile DP Operations"}
                  {mobileQuickPanel === "homes" && "Mobile Homes Dashboard"}
                  {mobileQuickPanel === "qa" && "Mobile QA"}
                  {mobileQuickPanel === "actions" && "Mobile Actions"}
                </strong>
                <button
                  type="button"
                  style={mobileCloseButton}
                  onClick={() => setMobileQuickPanel("none")}
                >
                  ×
                </button>
              </div>

              {mobileQuickPanel === "dps" && (
                <div style={mobileListPanel}>
                  {mobileDpRows.length ? (
                    mobileDpRows
                      .slice(0, 80)
                      .map(({ asset, name, status, capacity }) => (
                        <div key={asset.id} style={mobileDpCard}>
                          <button
                            type="button"
                            style={mobileDpMainButton}
                            onClick={() => {
                              setSelectedWorkspaceAsset(asset);
                              setSearchTerm(name);
                            }}
                          >
                            <strong>{name}</strong>
                            <span>
                              {status} · {capacity.warning} · {capacity.percent}
                              %
                            </span>
                          </button>
                          <div style={mobileStatusGrid}>
                            <button
                              type="button"
                              style={mobileStatusButtonGood}
                              onClick={() =>
                                handleMobileDpStatusUpdate(asset, "Live")
                              }
                            >
                              Live
                            </button>
                            <button
                              type="button"
                              style={mobileStatusButtonWarn}
                              onClick={() =>
                                handleMobileDpStatusUpdate(asset, "BWIP")
                              }
                            >
                              BWIP
                            </button>
                            <button
                              type="button"
                              style={mobileStatusButtonWarn}
                              onClick={() =>
                                handleMobileDpStatusUpdate(
                                  asset,
                                  "Live not ready for service",
                                )
                              }
                            >
                              LNRFS
                            </button>
                            <button
                              type="button"
                              style={mobileStatusButtonBad}
                              onClick={() =>
                                handleMobileDpStatusUpdate(
                                  asset,
                                  "Unserviceable",
                                )
                              }
                            >
                              Unserviceable
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div style={emptyPanel}>
                      No DPs found in this project area.
                    </div>
                  )}
                </div>
              )}

              {mobileQuickPanel === "homes" && (
                <div style={mobileHomesGrid}>
                  <InfoRow
                    label="Homes Passed"
                    value={formatNumber(rolloutKpis.homesPassed)}
                  />
                  <InfoRow
                    label="Homes Live"
                    value={formatNumber(rolloutKpis.homesLive)}
                    highlight
                  />
                  <InfoRow
                    label="Homes Not Live"
                    value={formatNumber(rolloutKpis.homesNotLive)}
                  />
                  <InfoRow
                    label="Connected Homes Layer"
                    value={formatNumber(workspaceLayerCounts.homesConnected)}
                  />
                  <InfoRow
                    label="Unconnected Homes Layer"
                    value={formatNumber(workspaceLayerCounts.homesUnconnected)}
                  />
                  <InfoRow
                    label="Live Homes Layer"
                    value={formatNumber(workspaceLayerCounts.homesLive)}
                    highlight
                  />
                  <button
                    type="button"
                    style={wideButton}
                    onClick={() => openKpiDrilldown("homesLive", "build")}
                  >
                    Show Live Homes
                  </button>
                  <button
                    type="button"
                    style={wideButton}
                    onClick={() => openKpiDrilldown("homesNotLive", "build")}
                  >
                    Show Homes Not Live
                  </button>
                </div>
              )}

              {mobileQuickPanel === "qa" && (
                <div style={mobileHomesGrid}>
                  <InfoRow
                    label="High Issues"
                    value={issueBuckets.high.length}
                  />
                  <InfoRow
                    label="Medium Issues"
                    value={issueBuckets.medium.length}
                  />
                  <InfoRow label="Low Issues" value={issueBuckets.low.length} />
                  <button
                    type="button"
                    style={wideButton}
                    onClick={() => openIssueSeverity("high")}
                  >
                    Open High QA
                  </button>
                  <button
                    type="button"
                    style={wideButton}
                    onClick={() => openIssueSeverity("medium")}
                  >
                    Open Medium QA
                  </button>
                  <button
                    type="button"
                    style={{
                      ...wideButton,
                      opacity: piaGatePassedForWalkOff ? 1 : 0.48,
                      cursor: piaGatePassedForWalkOff ? "pointer" : "not-allowed",
                    }}
                    disabled={!piaGatePassedForWalkOff}
                    title={piaGateBlockerText}
                    onClick={handleOpenWalkOffAudit}
                  >
                    {piaGatePassedForWalkOff ? "Launch Walk-Off Audit" : "Walk-Off Locked - PIA Not Passed"}
                  </button>
                </div>
              )}
            </div>
          )}

          <AuditModal
            title="Area Walk-Off Audit"
            open={walkOffAuditOpen && piaGatePassedForWalkOff}
            onClose={() => setWalkOffAuditOpen(false)}
          >
            <div style={handoverSnapshotBox}>
              <div style={operationKicker}>AUTO-POPULATED AREA SNAPSHOT</div>
              <div style={areaHandoverGrid}>
                <InfoRow label="Project" value={projectName} />
                <InfoRow
                  label="Readiness"
                  value={`${operationalReadiness.score}% · ${operationalReadiness.state}`}
                />
                <InfoRow
                  label="Homes Live"
                  value={`${formatNumber(rolloutKpis.homesLive)} / ${formatNumber(rolloutKpis.homesPassed)}`}
                />
                <InfoRow
                  label="DPs Live"
                  value={`${formatNumber(rolloutKpis.dpLive)} / ${formatNumber(rolloutKpis.dpTotal)}`}
                />
                <InfoRow
                  label="QA High / Medium"
                  value={`${issueBuckets.high.length} / ${issueBuckets.medium.length}`}
                />
                <InfoRow
                  label="Disconnected"
                  value={rolloutKpis.disconnectedAssets}
                />
              </div>
            </div>

            <AuditFormEngine
              template={walkOffAuditTemplate}
              assetId={walkOffAreaAsset.id}
              assetName={getWorkspaceAssetTitle(walkOffAreaAsset)}
              areaName={projectName}
              onSave={handleSaveWalkOffAudit}
              onClose={() => setWalkOffAuditOpen(false)}
            />
          </AuditModal>
        </div>
      </div>
    </div>
  );
}

const operationDrawer: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "#0f1b2d",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  borderRadius: 12,
  padding: 16,
};

const operationDrawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 14,
};

const operationKicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.5,
};

const operationTitle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 20,
};

const closePanelButton: React.CSSProperties = {
  background: "#132640",
  color: "#e5e7eb",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  width: 34,
  height: 34,
  padding: 0,
  fontSize: 22,
  lineHeight: "22px",
};

const operationGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
  gap: 10,
};

const operationStack: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const operationList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 320,
  overflow: "auto",
};

const emptyPanel: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: 14,
  color: "#cbd5e1",
};


const workspaceRoot: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 5000,
  background: "#07111f",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const topHeader: React.CSSProperties = {
  minHeight: 82,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 320px) minmax(0, 720px) auto",
  alignItems: "center",
  gap: 12,
  padding: "8px 14px 8px 16px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0a1424 100%)",
};

const projectTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.02,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};
const projectSubtitle: React.CSSProperties = {
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 12,
};

const projectHeaderBlock: React.CSSProperties = {
  minWidth: 0,
  maxWidth: 320,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const projectSwitcherRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "78px minmax(120px, 220px)",
  alignItems: "center",
  gap: 8,
};

const projectSwitcherLabel: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const projectSwitcherStatic: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.88)",
  color: "#e5e7eb",
  border: "1px solid rgba(59, 130, 246, 0.45)",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 900,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const projectSwitcherSelect: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  background: "#020617",
  color: "#e5e7eb",
  border: "1px solid rgba(59, 130, 246, 0.75)",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 900,
  outline: "none",
  boxShadow:
    "0 0 0 1px rgba(37,99,235,0.16), inset 0 1px 0 rgba(255,255,255,0.04)",
  cursor: "pointer",
};


const projectSwitcherSearchWrap: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  maxWidth: 220,
};

const projectSwitcherSearchInput: React.CSSProperties = {
  ...projectSwitcherSelect,
  cursor: "text",
  width: "100%",
  maxWidth: 220,
};

const projectSwitcherResults: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 5000,
  maxHeight: 320,
  overflowY: "auto",
  background: "#020617",
  border: "1px solid rgba(96,165,250,0.6)",
  borderRadius: 10,
  boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
  padding: 4,
};

const projectSwitcherResultButton: React.CSSProperties = {
  width: "100%",
  display: "block",
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "#e5e7eb",
  padding: "8px 10px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const projectSwitcherNoResults: React.CSSProperties = {
  color: "#94a3b8",
  padding: "10px 12px",
  fontSize: 12,
};
const statusPill: React.CSSProperties = {
  background: "rgba(34,197,94,0.18)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.25)",
  borderRadius: 7,
  padding: "4px 7px",
  fontSize: 10,
  fontWeight: 800,
};

const readinessPill: React.CSSProperties = {
  background: "rgba(15,23,42,0.68)",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 7,
  padding: "4px 7px",
  fontSize: 10,
  fontWeight: 900,
};
const topMetrics: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(98px, 1fr))",
  alignItems: "stretch",
  gap: 8,
  overflowX: "hidden",
  overflowY: "hidden",
  paddingBottom: 2,
  scrollbarWidth: "thin",
};
const smallButton: React.CSSProperties = {
  background: "#132640",
  color: "#e5e7eb",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 8,
  padding: "7px 10px",
  cursor: "pointer",
  fontWeight: 700,
};
const tabBar: React.CSSProperties = {
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 14px 0 152px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.13)",
  background: "rgba(11, 22, 38, 0.96)",
};
const tabButton: React.CSSProperties = {
  background: "transparent",
  color: "#cbd5e1",
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const commercialPanel: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.32)",
  background: "#0f1b2d",
  borderRadius: 12,
  padding: 16,
  marginTop: 14,
  display: "grid",
  gap: 14,
};

const commercialStatsSidePanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  gridRow: "span 2",
  border: "1px solid rgba(96,165,250,0.32)",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  borderRadius: 14,
  padding: 16,
  display: "grid",
  gap: 14,
  alignSelf: "stretch",
  minHeight: 360,
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};

const commercialBelowMapPanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid rgba(96,165,250,0.28)",
  background: "linear-gradient(180deg, #0b1626 0%, #081120 100%)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 14,
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};

const commercialSideKpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const commercialSideLockBox: React.CSSProperties = {
  display: "grid",
  gap: 4,
  color: "#fde68a",
  background: "rgba(251,191,36,0.08)",
  border: "1px solid rgba(251,191,36,0.35)",
  borderRadius: 10,
  padding: 12,
  fontSize: 13,
};

const commercialHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const commercialTitle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 20,
  fontWeight: 900,
};

const commercialHint: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  marginTop: 6,
};

const commercialKpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const commercialDetailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const commercialDetailCard: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 12,
  padding: 12,
};

const commercialDetailTitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const commercialSelectedAssetName: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 900,
  marginTop: 6,
};

const commercialEmptyBox: React.CSSProperties = {
  color: "#cbd5e1",
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 10,
  padding: 14,
};

const activeTabButton: React.CSSProperties = {
  ...tabButton,
  background: "rgba(37, 99, 235, 0.22)",
  color: "#93c5fd",
  boxShadow: "inset 0 -2px 0 #3b82f6",
};
const workspaceQuickActionBar: React.CSSProperties = {
  display: "grid",
  gridAutoRows: "min-content",
  alignContent: "start",
  gap: 5,
  padding: "10px 8px",
  background: "#07111f",
  borderRight: "1px solid rgba(148, 163, 184, 0.16)",
  overflow: "hidden",
  minHeight: 0,
};

const quickActionButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#111c30",
  color: "#cbd5e1",
  borderRadius: 8,
  padding: "6px 8px",
  cursor: "pointer",
  textAlign: "left",
  minHeight: 34,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 3,
};

const quickActionButtonActive: React.CSSProperties = {
  ...quickActionButton,
  borderColor: "#3b82f6",
  background: "rgba(37, 99, 235, 0.24)",
  color: "#dbeafe",
  boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.22)",
};

const quickActionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const quickActionHelper: React.CSSProperties = {
  fontSize: 10,
  color: "#94a3b8",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const railSectionTitle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "2px 0 1px",
};

const railDivider: React.CSSProperties = {
  height: 1,
  background: "rgba(148, 163, 184, 0.14)",
  margin: "4px 0",
};

const workspaceBody: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "1fr",
  minHeight: 0,
};
const leftRail: React.CSSProperties = {
  background: "linear-gradient(180deg, #07111f 0%, #050b14 100%)",
  borderRight: "1px solid rgba(148, 163, 184, 0.16)",
  padding: "12px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const brandBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 20,
};
const brandIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "#2563eb",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 900,
};
const contentGrid: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  display: "grid",
  gridTemplateColumns:
    "minmax(760px, 2.15fr) minmax(310px, 0.75fr) minmax(310px, 0.75fr)",
  gridAutoRows: "min-content",
  gap: 16,
  alignItems: "start",
  minHeight: 0,
};
const mapPanel: React.CSSProperties = {
  gridRow: "span 2",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};
const mapToolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 10,
};
const searchWrap: React.CSSProperties = { flex: 1, position: "relative" };
const searchInput: React.CSSProperties = {
  width: "100%",
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 8,
  color: "#e5e7eb",
  padding: "10px 12px",
  outline: "none",
};
const searchResultsPanel: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 44,
  zIndex: 1400,
  background: "rgba(2, 6, 23, 0.97)",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  borderRadius: 10,
  padding: 8,
  boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
};
const searchResultButton: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  textAlign: "left",
  background: "transparent",
  color: "#e5e7eb",
  border: "none",
  borderRadius: 8,
  padding: "9px 10px",
  cursor: "pointer",
};
const layerButton: React.CSSProperties = { ...smallButton, minWidth: 130 };
const layerMenuWrap: React.CSSProperties = { position: "relative" };
const layerMenu: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 44,
  zIndex: 1200,
  width: 260,
  maxHeight: 520,
  overflowY: "auto",
  background: "rgba(2, 6, 23, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 10,
  padding: 12,
  boxShadow: "0 16px 45px rgba(0,0,0,0.45)",
};
const layerMenuHeader: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.4,
  marginBottom: 8,
};
const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  color: "#e5e7eb",
  fontSize: 13,
  fontWeight: 700,
};
const layerMenuDivider: React.CSSProperties = {
  height: 1,
  background: "rgba(148, 163, 184, 0.18)",
  margin: "10px 0",
};
const layerMenuActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 10,
};
const miniLayerButton: React.CSSProperties = {
  ...smallButton,
  padding: "7px 8px",
  fontSize: 12,
  background: "#111827",
};
const fullWidthMiniLayerButton: React.CSSProperties = {
  ...miniLayerButton,
  width: "100%",
  marginTop: 8,
};
const mapLiveWrap: React.CSSProperties = {
  position: "relative",
  height: 620,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#020617",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
};
const mapAssetInspector: React.CSSProperties = {
  position: "absolute",
  right: 14,
  top: 14,
  zIndex: 800,
  minWidth: 190,
  maxWidth: 260,
  background: "rgba(2, 6, 23, 0.86)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 10,
  padding: 12,
  color: "#f8fafc",
  boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
};

const nextActionsPanel: React.CSSProperties = {
  background: "#08111f",
  borderLeft: "1px solid rgba(148, 163, 184, 0.16)",
  padding: 12,
  display: "grid",
  gridTemplateRows: "auto auto auto auto 1fr",
  gap: 10,
  minHeight: 0,
  overflow: "hidden",
};

const workspaceDetailPanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  alignItems: "start",
  minWidth: 0,
};

const nextActionsHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const nextActionsTitle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 18,
  fontWeight: 950,
  color: "#f8fafc",
};

const nextActionsSummaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const nextActionList: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const nextActionText: React.CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 0,
};

const nextActionValue: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const nextActionCommand: React.CSSProperties = {
  color: "#bfdbfe",
  fontSize: 11,
  fontStyle: "normal",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

function nextActionButton(tone: string): React.CSSProperties {
  const toneColour =
    tone === "good" ? "#22c55e" : tone === "bad" ? "#ef4444" : "#f59e0b";

  return {
    border: `1px solid ${toneColour}66`,
    background: "rgba(15, 23, 42, 0.82)",
    color: "#e5e7eb",
    borderRadius: 8,
    padding: "10px 11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    cursor: "pointer",
    textAlign: "left",
    boxShadow: `inset 3px 0 0 ${toneColour}`,
  };
}

const selectedAssetStrip: React.CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid rgba(96, 165, 250, 0.26)",
  background: "#0f1b2d",
  borderRadius: 8,
  padding: 12,
  color: "#e5e7eb",
};

const nextBlockerBox: React.CSSProperties = {
  border: "1px solid rgba(248, 113, 113, 0.34)",
  background: "rgba(127, 29, 29, 0.18)",
  color: "#fecaca",
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
  lineHeight: 1.45,
};

const nextGoodBox: React.CSSProperties = {
  border: "1px solid rgba(34, 197, 94, 0.3)",
  background: "rgba(20, 83, 45, 0.16)",
  color: "#bbf7d0",
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
};
const areaBoundary: React.CSSProperties = {
  position: "absolute",
  left: "7%",
  right: "7%",
  top: "16%",
  bottom: "18%",
  border: "4px solid #22c55e",
  transform: "skew(-8deg)",
  background: "rgba(34,197,94,0.08)",
};
const mockNetworkLineOne: React.CSSProperties = {
  position: "absolute",
  left: "15%",
  right: "13%",
  top: "48%",
  height: 4,
  background: "#60a5fa",
  transform: "rotate(-4deg)",
  boxShadow: "0 0 0 2px rgba(96,165,250,0.2)",
};
const mockNetworkLineTwo: React.CSSProperties = {
  position: "absolute",
  left: "22%",
  width: "55%",
  top: "62%",
  height: 4,
  background: "#facc15",
  transform: "rotate(15deg)",
};
const mockNetworkLineThree: React.CSSProperties = {
  position: "absolute",
  left: "45%",
  width: "35%",
  top: "35%",
  height: 4,
  background: "#a78bfa",
  transform: "rotate(64deg)",
};
const mapLabel: React.CSSProperties = {
  position: "absolute",
  left: "46%",
  top: "46%",
  fontWeight: 900,
  textShadow: "0 2px 4px #000",
};
const mapControls: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: 12,
  background: "rgba(15,23,42,0.9)",
  borderRadius: 8,
  padding: "8px 13px",
  lineHeight: 1.8,
  fontWeight: 900,
};
const legendButton: React.CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  ...smallButton,
};
const threeDButton: React.CSSProperties = {
  position: "absolute",
  right: 16,
  bottom: 16,
  ...smallButton,
};
const intelligenceDock: React.CSSProperties = {
  gridColumn: "1 / -1",
  gridRow: "span 4",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  overflow: "hidden",
  minHeight: 620,
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};
const summaryPanel: React.CSSProperties = {
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 14,
  padding: 16,
  minHeight: 170,
  boxShadow: "0 12px 30px rgba(0,0,0,0.14)",
};
const widePanel: React.CSSProperties = {
  ...summaryPanel,
  gridColumn: "span 1",
};


const areaHandoverPanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
};

const areaHandoverHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const areaHandoverTitle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 900,
};

const areaHandoverHint: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  marginTop: 4,
};

const areaHandoverGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const areaHandoverActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const handoverBlockerBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(127, 29, 29, 0.28)",
  border: "1px solid rgba(248, 113, 113, 0.42)",
  color: "#fecaca",
  fontSize: 13,
};

const handoverGoodBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(22, 101, 52, 0.18)",
  border: "1px solid rgba(74, 222, 128, 0.35)",
  color: "#bbf7d0",
  fontSize: 13,
};

const handoverSnapshotBox: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
};

function walkOffStatusPill(
  status: "Pending" | "Approved" | "Review Required" | "Blocked",
): React.CSSProperties {
  const good = status === "Approved";
  const bad = status === "Blocked";
  return {
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    color: good ? "#bbf7d0" : bad ? "#fecaca" : "#fde68a",
    background: good
      ? "rgba(22,101,52,0.28)"
      : bad
        ? "rgba(127,29,29,0.32)"
        : "rgba(120,53,15,0.28)",
    border: good
      ? "1px solid rgba(74,222,128,0.45)"
      : bad
        ? "1px solid rgba(248,113,113,0.45)"
        : "1px solid rgba(251,191,36,0.45)",
  };
}

const panelTitle: React.CSSProperties = { margin: "0 0 14px", fontSize: 18 };

const wideButton: React.CSSProperties = {
  ...smallButton,
  width: "100%",
  marginTop: 14,
  background: "#1e3a5f",
};

const dangerWideButton: React.CSSProperties = {
  ...wideButton,
  borderColor: "rgba(248, 113, 113, 0.42)",
  background: "rgba(127, 29, 29, 0.32)",
  color: "#fecaca",
};

const donutWrap: React.CSSProperties = {
  height: 120,
  display: "grid",
  placeItems: "center",
};

const donut: React.CSSProperties = {
  width: 94,
  height: 94,
  borderRadius: "50%",
  border: "16px solid #34d399",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  fontSize: 25,
};

const issueGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const qaStickyHeader: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "grid",
  gap: 10,
  background: "#0f1b2d",
  paddingBottom: 10,
};

const qaToolbar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: "10px 12px",
};

const qaModeButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#020617",
  color: "#cbd5e1",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const qaModeButtonActive: React.CSSProperties = {
  background: "#1d4ed8",
  color: "#ffffff",
  borderColor: "rgba(147, 197, 253, 0.65)",
};

const qaCategoryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const qaCategoryCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  color: "#e5e7eb",
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
  fontWeight: 900,
};

const qaCategoryCardActive: React.CSSProperties = {
  borderColor: "rgba(147, 197, 253, 0.85)",
  boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.25)",
  background: "rgba(30, 58, 138, 0.6)",
};

const qaNavigatorPanel: React.CSSProperties = {
  display: "grid",
  gap: 10,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 12,
  padding: 14,
};

const qaNavigatorTopline: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const qaNavigatorAsset: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 20,
  fontWeight: 900,
};

const qaNavigatorIssue: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 14,
  lineHeight: 1.45,
};

const qaNavigatorActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const qaActionButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "#020617",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const qaPrimaryButton: React.CSSProperties = {
  ...qaActionButton,
  background: "#1d4ed8",
  borderColor: "rgba(147, 197, 253, 0.45)",
};

const qaCompactList: React.CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 360,
  overflow: "auto",
};

const qaCompactRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px 160px 220px 1fr",
  alignItems: "center",
  gap: 10,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#e5e7eb",
  textAlign: "left",
};

const assetGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const assetTile: React.CSSProperties = {
  background: "rgba(17, 24, 39, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 12,
  padding: 13,
  minHeight: 74,
};

const quickActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 10,
};

const mobileSelectedActionBar: React.CSSProperties = {
  position: "fixed",
  left: 10,
  right: 10,
  bottom: 10,
  zIndex: 8000,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto auto auto",
  alignItems: "center",
  gap: 8,
  background: "rgba(7, 17, 31, 0.96)",
  border: "1px solid rgba(147, 197, 253, 0.45)",
  borderRadius: 16,
  padding: 10,
  boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
};

const mobileSelectedSummary: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: "#f8fafc",
  overflow: "hidden",
};

const mobileActionButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: "#1d4ed8",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 11px",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileCloseButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: "#020617",
  color: "#f8fafc",
  borderRadius: 12,
  width: 38,
  minWidth: 38,
  height: 38,
  fontSize: 22,
  lineHeight: "20px",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileQuickPanelWrap: React.CSSProperties = {
  position: "fixed",
  left: 10,
  right: 10,
  bottom: 88,
  zIndex: 7990,
  maxHeight: "58vh",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  background: "rgba(15, 27, 45, 0.98)",
  border: "1px solid rgba(96, 165, 250, 0.42)",
  borderRadius: 16,
  boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
};

const mobileQuickPanelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
};

const mobileListPanel: React.CSSProperties = {
  overflow: "auto",
  padding: 10,
  display: "grid",
  gap: 10,
};

const mobileDpCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8,
};

const mobileDpMainButton: React.CSSProperties = {
  display: "grid",
  gap: 3,
  width: "100%",
  border: "none",
  background: "transparent",
  color: "#f8fafc",
  textAlign: "left",
  padding: 0,
  cursor: "pointer",
};

const mobileStatusGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileStatusButtonBase: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 8px",
  fontWeight: 900,
  cursor: "pointer",
};

const mobileStatusButtonGood: React.CSSProperties = {
  ...mobileStatusButtonBase,
  background: "#166534",
};

const mobileStatusButtonWarn: React.CSSProperties = {
  ...mobileStatusButtonBase,
  background: "#92400e",
};

const mobileStatusButtonBad: React.CSSProperties = {
  ...mobileStatusButtonBase,
  background: "#991b1b",
};

const mobileHomesGrid: React.CSSProperties = {
  overflow: "auto",
  padding: 12,
  display: "grid",
  gap: 8,
};
