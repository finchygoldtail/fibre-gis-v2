import React, { useEffect, useMemo, useState } from "react";
import WorkspaceMap, { type WorkspaceLayerVisibility } from "./WorkspaceMap";
import type { OpenreachLayerVisibility } from "../map/OpenreachOverlayLayer";
import AssetIntelligencePanel from "./AssetIntelligencePanel";
import TraceTopologyPanel from "../topology/TraceTopologyPanel";
import WorkspaceTabContent from "./workspace/WorkspaceTabContent";
import type { SavedMapAsset } from "../map/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { auditAreaAssets, type AuditIssue } from "../../services/areaAudit";
import { buildTopologyTrace } from "../../services/topologyTraceService";
import { buildNetworkState, isDistributionPointAsset } from "../../services/network";

// =====================================================
// FILE: ProjectWorkspace.tsx
// PURPOSE: Dedicated project workspace shell for Alistra GIS.
//          This is the first UI migration away from one overloaded
//          map sidebar into a project-specific operations screen.
// PHASE 7D.1: Operational rollout KPI header, lighter workspace
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
  | "addAsset"
  | "report";

type WorkspaceTab =
  | "overview"
  | "topology"
  | "qa"
  | "build"
  | "maintenance"
  | "assets"
  | "fibre"
  | "reports"
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
  onExport?: () => void;
  projectArea?: SavedMapAsset | null;
  projectAssets?: SavedMapAsset[];
  projectAreas?: SavedMapAsset[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onUpdateDpStatus?: (args: {
    assetId: string;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onClearDpFibreAllocations?: (args: {
    assetIds: string[];
    note: string;
  }) => void;
};

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "topology", label: "Topology" },
  { id: "qa", label: "QA" },
  { id: "build", label: "Build" },
  { id: "maintenance", label: "Maintenance" },
  { id: "assets", label: "Assets" },
  { id: "fibre", label: "Fibre" },
  { id: "reports", label: "Reports" },
];

const defaultWorkspaceLayers: WorkspaceLayerVisibility = {
  // PHASE 7D.1: keep the workspace fast on fibrehood open.
  // Heavy render layers stay available, but operators turn them on when needed.
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
  other: false,
};

const workspaceLayerOptions: {
  key: keyof WorkspaceLayerVisibility;
  label: string;
}[] = [
  { key: "projectBoundary", label: "Project Boundary" },
  { key: "areas", label: "Areas" },
  { key: "cables", label: "Cables" },
  { key: "dropCables", label: "Home Drop Cables" },
  { key: "joints", label: "Joints" },
  { key: "dps", label: "DPs / CBTs / AFNs" },
  { key: "poles", label: "Poles" },
  { key: "chambers", label: "Chambers" },
  { key: "streetCabs", label: "Street Cabs" },
  { key: "homes", label: "Homes" },
  { key: "other", label: "Other Assets" },
];

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


function syncWorkspaceDpStatus(asset: SavedMapAsset, status: string): SavedMapAsset {
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
    Boolean(item.homeId || item.uprn || item.connectedHomeId)
  );
}

function isDesignCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const type = String(item.assetType || item.type || "").toLowerCase();
  const hasLineGeometry = asset.geometry?.type === "LineString";
  const looksLikeCable = hasLineGeometry || type.includes("cable");
  return looksLikeCable && !isHomeDropCableAsset(asset);
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
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw) return "Planned";
  if (raw === "live") return "Live";
  if (raw === "bwip") return "BWIP";
  if (raw === "unserviceable") return "Unserviceable";
  if (raw === "lnrfs" || raw === "live not ready" || raw === "live not ready for service") {
    return "Live not ready for service";
  }
  if (raw === "planned") return "Planned";

  return String(value ?? "Planned").trim();
}

function getOperationalDpStatus(asset: SavedMapAsset | null | undefined): string {
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


function getWorkspaceDpCapacityRisk(asset: SavedMapAsset): { risk: "OK" | "WARN" | "FULL" | "OVER"; warning: string; percent: number } {
  const item = asset as any;
  const details = item.dpDetails || item.properties?.dpDetails || {};
  const closure = String(details.closureType || details.networkArchitecture || item.closureType || item.dpType || item.jointType || "").toLowerCase();
  const connectedHomes = Number(details.connectedHomes ?? details.connectionsToHomes ?? item.connectedHomes ?? item.homesConnected ?? item.homeCount ?? 0);
  const used = Number.isFinite(connectedHomes) ? connectedHomes : 0;
  const rawCapacity = Number(item.capacity ?? item.dpCapacity ?? item.ports ?? details.capacity ?? details.connectionsToHomes ?? 0);
  const capacity = Number.isFinite(rawCapacity) && rawCapacity > 0
    ? rawCapacity
    : closure.includes("cbt")
      ? 12
      : closure.includes("afn") || closure.includes("mdu_splitter")
        ? Math.max(16, used)
        : Math.max(used, 0);

  if (capacity <= 0) return { risk: "WARN", warning: "No capacity set", percent: 0 };
  const percent = Math.round((used / capacity) * 100);
  if (used > capacity) return { risk: "OVER", warning: "Over capacity", percent };
  if (used === capacity) return { risk: "FULL", warning: "Full", percent };
  if (percent >= 80) return { risk: "WARN", warning: "Near capacity", percent };
  return { risk: "OK", warning: "Capacity OK", percent };
}

type AreaReadinessState =
  | "Survey"
  | "Build"
  | "Testing"
  | "Ready For Service"
  | "Live"
  | "Blocked"
  | "Maintenance Hold";

type AreaReadiness = {
  state: AreaReadinessState;
  score: number;
  summary: string;
  blockers: string[];
  nextActions: string[];
  qaHigh: number;
  qaMedium: number;
  dpCompletionPercent: number;
  rfsPercent: number;
  disconnectedAssets: number;
};

function readinessTone(state: AreaReadinessState): "default" | "good" | "warn" | "bad" {
  if (state === "Live" || state === "Ready For Service") return "good";
  if (state === "Testing" || state === "Build") return "warn";
  if (state === "Blocked" || state === "Maintenance Hold") return "bad";
  return "default";
}

function readinessColour(state: AreaReadinessState): string {
  if (state === "Live") return "#22c55e";
  if (state === "Ready For Service") return "#4ade80";
  if (state === "Testing") return "#38bdf8";
  if (state === "Build") return "#fbbf24";
  if (state === "Blocked") return "#fb7185";
  if (state === "Maintenance Hold") return "#f97316";
  return "#94a3b8";
}

function buildAreaReadiness(args: {
  rolloutKpis: {
    homesPassed: number;
    homesLive: number;
    rfsPercent: number;
    dpTotal: number;
    dpLive: number;
    dpBwip: number;
    dpLnrfs: number;
    dpUnserviceable: number;
    dpPlanned: number;
    buildCompletionPercent: number;
    qaIssues: number;
    disconnectedAssets: number;
    dpNearCapacity?: number;
    dpOverCapacity?: number;
  };
  auditIssues: AuditIssue[];
  status?: string;
}): AreaReadiness {
  const { rolloutKpis, auditIssues, status } = args;
  const statusText = String(status || "").toLowerCase();
  const qaHigh = auditIssues.filter((issue) => issue.severity === "high").length;
  const qaMedium = auditIssues.filter((issue) => issue.severity === "medium").length;
  const blockers: string[] = [];
  const nextActions: string[] = [];

  if (statusText.includes("maintenance")) {
    blockers.push("Area is currently marked as maintenance / hold.");
  }

  if ((rolloutKpis.dpOverCapacity || 0) > 0) {
    blockers.push(`${rolloutKpis.dpOverCapacity} DP(s) are over capacity.`);
    nextActions.push("Resolve oversubscribed DPs before Phase 8 DP operations handover.");
  }

  if ((rolloutKpis.dpNearCapacity || 0) > 0) {
    nextActions.push(`${rolloutKpis.dpNearCapacity} DP(s) are at or near capacity; review splitter/port reserve.`);
  }

  if (rolloutKpis.dpUnserviceable > 0) {
    blockers.push(`${rolloutKpis.dpUnserviceable} DP(s) are unserviceable.`);
    nextActions.push("Clear or reclassify unserviceable DPs before RFS sign-off.");
  }

  if (qaHigh > 0) {
    blockers.push(`${qaHigh} high QA issue(s) need resolving.`);
    nextActions.push("Resolve high severity QA issues.");
  }

  if (rolloutKpis.disconnectedAssets > 0) {
    blockers.push(`${rolloutKpis.disconnectedAssets} disconnected asset(s) in topology.`);
    nextActions.push("Fix disconnected assets or confirm they are intentionally isolated.");
  }

  if (rolloutKpis.dpLnrfs > 0) {
    blockers.push(`${rolloutKpis.dpLnrfs} DP(s) are live but not ready for service.`);
    nextActions.push("Complete LNRFS checks and move ready DPs to Live.");
  }

  if (rolloutKpis.dpBwip > 0) {
    nextActions.push("Finish BWIP DPs and update live status when build is complete.");
  }

  if (rolloutKpis.dpPlanned > 0) {
    nextActions.push("Progress planned DPs through build and test workflow.");
  }

  if (qaMedium > 0) {
    nextActions.push("Review medium QA issues before handover.");
  }

  const hardBlocked =
    statusText.includes("block") ||
    statusText.includes("hold") ||
    statusText.includes("maintenance") ||
    (rolloutKpis.dpOverCapacity || 0) > 0 ||
    rolloutKpis.dpUnserviceable > 0 ||
    qaHigh > 0 ||
    rolloutKpis.disconnectedAssets > 0;

  let state: AreaReadinessState = "Survey";

  if (statusText.includes("maintenance")) {
    state = "Maintenance Hold";
  } else if (hardBlocked) {
    state = "Blocked";
  } else if (
    rolloutKpis.dpTotal > 0 &&
    rolloutKpis.dpLive === rolloutKpis.dpTotal &&
    rolloutKpis.rfsPercent >= 95
  ) {
    state = "Live";
  } else if (
    rolloutKpis.buildCompletionPercent >= 95 &&
    rolloutKpis.rfsPercent >= 90 &&
    rolloutKpis.dpLnrfs === 0
  ) {
    state = "Ready For Service";
  } else if (
    rolloutKpis.buildCompletionPercent >= 70 ||
    rolloutKpis.rfsPercent >= 70 ||
    rolloutKpis.dpLnrfs > 0
  ) {
    state = "Testing";
  } else if (
    rolloutKpis.dpTotal > 0 ||
    rolloutKpis.dpBwip > 0 ||
    rolloutKpis.buildCompletionPercent > 0
  ) {
    state = "Build";
  }

  const blockerPenalty = Math.min(blockers.length * 12, 45);
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        rolloutKpis.buildCompletionPercent * 0.45 +
          rolloutKpis.rfsPercent * 0.45 +
          (rolloutKpis.dpTotal > 0 ? 10 : 0) -
          blockerPenalty,
      ),
    ),
  );

  if (!nextActions.length) {
    nextActions.push("Area is operationally ready for final review / handover.");
  }

  const summary =
    state === "Live"
      ? "All key rollout indicators show this area as live."
      : state === "Ready For Service"
        ? "Area is ready for RFS review with no hard blockers detected."
        : state === "Testing"
          ? "Build is mostly complete; testing and final QA remain."
          : state === "Build"
            ? "Area is in build with rollout work still in progress."
            : state === "Blocked"
              ? "Area has operational blockers that prevent RFS / live sign-off."
              : state === "Maintenance Hold"
                ? "Area is on maintenance hold."
                : "Area is still in survey / early planning.";

  return {
    state,
    score,
    summary,
    blockers,
    nextActions,
    qaHigh,
    qaMedium,
    dpCompletionPercent: rolloutKpis.buildCompletionPercent,
    rfsPercent: rolloutKpis.rfsPercent,
    disconnectedAssets: rolloutKpis.disconnectedAssets,
  };
}

function getProjectAreaLabel(area: SavedMapAsset | null | undefined): string {
  const item = area as any;
  return String(item?.name || item?.label || item?.projectName || item?.id || "Selected project");
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
    [issue.assetId, issue.assetName, (issue as any).id, (issue as any).asset?.id]
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

function assetSearchText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.id,
    item.assetId,
    item.name,
    item.jointName,
    item.label,
    item.cableId,
    item.cableName,
    item.assetType,
    item.type,
    item.jointType,
    item.cableType,
    item.address,
    item.uprn,
    item.status,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
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

async function loadWorkspaceJointMappingRows(jointId: string): Promise<any[][]> {
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
          Array.isArray(row) ? row : Array.isArray(row?.values) ? row.values : row,
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

    const shortCableMatches = raw.match(/(?:\d+f)?(?:ulw|lc|fc|link|feeder|spine|drop)\d{1,4}/gi);
    shortCableMatches?.forEach((match) => {
      const next = normaliseCableReference(match);
      if (next.length >= 3) aliases.add(next);
    });
  });

  return Array.from(aliases);
}

function calculateUsedFibresFromMappings(cable: SavedMapAsset, rowsByAssetId: MappingRowsByAssetId): number | null {
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
    const isCable = assetType.includes("cable") || asset.geometry?.type === "LineString";
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

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneColour =
    tone === "good"
      ? "#4ade80"
      : tone === "warn"
        ? "#fbbf24"
        : tone === "bad"
          ? "#fb7185"
          : "#e5e7eb";
  return (
    <div style={metricCard}>
      <div style={metricLabel}>{label}</div>
      <div style={{ ...metricValue, color: toneColour }}>{value}</div>
    </div>
  );
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

export default function ProjectWorkspace({
  projectName,
  status = "Build Phase",
  stats,
  onBackToMap,
  onOpenTrace,
  onOpenQA,
  onOpenFibreTopology,
  onOpenJointEditor,
  onExport,
  projectArea = null,
  projectAssets = [],
  projectAreas = [],
  activeProjectId = null,
  onSelectProject,
  onBulkUpdateDpStatus,
  onUpdateDpStatus,
  onClearDpFibreAllocations,
}: ProjectWorkspaceProps) {
  const [openreachLayers, setOpenreachLayers] =
    React.useState<OpenreachLayerVisibility>(defaultOpenreachLayers);

  const [selectedWorkspaceAsset, setSelectedWorkspaceAsset] =
    useState<SavedMapAsset | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window === "undefined") return "overview";
    try {
      const requestedTab = window.localStorage.getItem("alistra-workspace-return-tab") as WorkspaceTab | null;
      if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) {
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

  const mappingAssetKey = useMemo(
    () =>
      projectAssets
        .filter((asset) => Boolean((asset as any).mappingRowsRef || (asset as any).mappingRowsCount))
        .map((asset) => `${asset.id}:${(asset as any).mappingRowsCount || 0}:${(asset as any).updatedAt || ""}`)
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
      setMappingRowsByAssetId({});
      return;
    }

    Promise.all(
      assetsWithSharedMappings.map(async (asset) => {
        try {
          const rows = await loadWorkspaceJointMappingRows(asset.id);
          return [asset.id, rows] as const;
        } catch (err) {
          console.error(`Failed to load workspace mapping rows for ${asset.name || asset.id}`, err);
          return [asset.id, []] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setMappingRowsByAssetId(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [mappingAssetKey, projectAssets]);

  const workspaceAssets = useMemo(
    () => enrichProjectAssetsWithMappings(projectAssets, mappingRowsByAssetId),
    [projectAssets, mappingRowsByAssetId],
  );

  const fullSelectedWorkspaceAsset = useMemo(
    () => resolveFullProjectAsset(selectedWorkspaceAsset, workspaceAssets),
    [selectedWorkspaceAsset, workspaceAssets],
  );
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<WorkspaceLayerVisibility>(
    defaultWorkspaceLayers,
  );
  const [activeOperationPanel, setActiveOperationPanel] =
    useState<WorkspaceOperationPanel>("none");
  const [activeIssueSeverity, setActiveIssueSeverity] =
    useState<"high" | "medium" | "low" | null>(null);

  const auditIssues = useMemo(() => {
  const rawIssues = auditAreaAssets(workspaceAssets);

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
      issue.assetType ||
      issue.assetName ||
      "",
    ).toLowerCase();

    const isHomeNameIssue =
      (
        issueText.includes("no name") ||
        issueText.includes("missing name") ||
        issueText.includes("unnamed")
      ) &&
      (
        assetText.includes("home") ||
        assetText.includes("premise") ||
        assetText.includes("flat") ||
        assetText.includes("mdu")
      );

    // Ignore temporary unnamed-home QA issues
    if (isHomeNameIssue) {
      return false;
    }

    return true;
  });
}, [workspaceAssets]);
  const networkState = useMemo(
    () => buildNetworkState(workspaceAssets),
    [workspaceAssets],
  );

  const networkGraph = networkState.graph;

  const disconnectedAssets = useMemo(
    () => networkState.nodes.filter((node) => node.connectedTo.length === 0),
    [networkState],
  );

  const areaDistributionPoints = useMemo(
    () => workspaceAssets.filter((asset) => isDistributionPointAsset(asset)),
    [workspaceAssets],
  );

  const handleClearAreaDpFibreAllocations = () => {
    const assetIds = areaDistributionPoints.map((asset) => asset.id).filter(Boolean);

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
    () => workspaceAssets.filter(isHomeDropCableAsset).length,
    [workspaceAssets],
  );

  const dpClosureCount = useMemo(
    () => workspaceAssets.filter(isWorkspaceDistributionPointAsset).length,
    [workspaceAssets],
  );

  const displayStats = useMemo(
    () => ({
      ...stats,
      dps: dpClosureCount,
      cables: designCableCount,
      designCables: designCableCount,
      dropCables: dropCableCount,
    }),
    [stats, dpClosureCount, designCableCount, dropCableCount],
  );

  // =====================================================
  // PHASE 7D.1 — OPERATIONAL ROLLOUT KPI ENGINE
  // Derived only from already-scoped workspace assets so this
  // does not create a second persistence path or Firestore write flow.
  // =====================================================
  const rolloutKpis = useMemo(() => {
    const dpAssets = workspaceAssets.filter(isWorkspaceDistributionPointAsset);
    const homesPassed = Number(displayStats?.homesPassed || 0);
    const fallbackHomesLive = Number(displayStats?.homesConnected || 0);
    const uniqueHomeAssets = new Map<string, SavedMapAsset>();

workspaceAssets.forEach((asset) => {
  const item = asset as any;

  const assetType = String(
    item.assetType ||
    item.type ||
    "",
  ).toLowerCase();

  // Ignore cables and infrastructure
  if (
    assetType.includes("cable") ||
    assetType.includes("joint") ||
    assetType.includes("pole") ||
    assetType.includes("chamber") ||
    assetType.includes("cab")
  ) {
    return;
  }

  // Use best unique identifier possible
  const key =
    item.uprn ||
    item.UPRN ||
    item.address ||
    `${item.lat}-${item.lng}`;

  if (!key) return;

  if (!uniqueHomeAssets.has(String(key))) {
    uniqueHomeAssets.set(String(key), asset);
  }
});

const homesLiveFromAssets =
  Array.from(uniqueHomeAssets.values()).filter(
    isLiveHomeAsset,
  ).length;

const homesLive = Math.max(
  fallbackHomesLive,
  homesLiveFromAssets,
);

    const dpStatusCounts = dpAssets.reduce(
      (counts, asset) => {
        const statusValue = getOperationalDpStatus(asset);

        if (statusValue === "Live") counts.live += 1;
        else if (statusValue === "BWIP") counts.bwip += 1;
        else if (statusValue === "Unserviceable") counts.unserviceable += 1;
        else if (statusValue === "Live not ready for service") counts.lnrfs += 1;
        else counts.planned += 1;

        return counts;
      },
      { live: 0, bwip: 0, lnrfs: 0, unserviceable: 0, planned: 0 },
    );

    const dpCapacityStates = dpAssets.map(getWorkspaceDpCapacityRisk);
    const dpNearCapacity = dpCapacityStates.filter((state) => state.risk === "WARN" || state.risk === "FULL").length;
    const dpOverCapacity = dpCapacityStates.filter((state) => state.risk === "OVER").length;

    const dpTotal = dpAssets.length || Number(displayStats?.dps || 0);
    const buildCompletionPercent = dpTotal
      ? Math.round((dpStatusCounts.live / dpTotal) * 100)
      : 0;

    const homesNotLive = Math.max(homesPassed - homesLive, 0);

    return {
      homesPassed,
      homesLive,
      homesNotLive,
      rfsPercent: Number(displayStats?.rfsPercent || 0),
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
      routeLengthMeters: Number(displayStats?.routeLengthMeters || 0),
    };
  }, [workspaceAssets, displayStats, auditIssues.length, disconnectedAssets.length]);

  const operationalReadiness = useMemo(
    () =>
      buildAreaReadiness({
        rolloutKpis,
        auditIssues,
        status,
      }),
    [rolloutKpis, auditIssues, status],
  );

  const workspaceDisplayStats = useMemo(
    () => ({
      ...displayStats,
      rolloutKpis,
      operationalReadiness,
      readinessState: operationalReadiness.state,
      readinessScore: operationalReadiness.score,
      readinessBlockers: operationalReadiness.blockers,
      readinessNextActions: operationalReadiness.nextActions,
    }),
    [displayStats, rolloutKpis, operationalReadiness],
  );

  const issueBuckets = useMemo(
    () => ({
      high: auditIssues.filter((issue) => issue.severity === "high"),
      medium: auditIssues.filter((issue) => issue.severity === "medium"),
      low: auditIssues.filter((issue) => issue.severity === "low"),
    }),
    [auditIssues],
  );

  const traceHighlightKinds = useMemo(() => {
    const highlights: Record<string, TraceHighlightKind> = {};

    if (activeOperationPanel !== "trace" || !fullSelectedWorkspaceAsset) {
      return highlights;
    }

    const trace = buildTopologyTrace({
      selectedAsset: fullSelectedWorkspaceAsset,
      assets: workspaceAssets,
      graph: networkGraph,
      auditIssues,
    });

    addTraceHighlight(highlights, fullSelectedWorkspaceAsset, "selected");
    trace.upstream.forEach((row) => addTraceHighlight(highlights, row.asset, "upstream"));
    trace.downstream.forEach((row) => addTraceHighlight(highlights, row.asset, "downstream"));
    trace.branches.forEach((row) => addTraceHighlight(highlights, row.asset, "branch"));
    trace.homes.forEach((row) => addTraceHighlight(highlights, row.asset, "home"));
    trace.fibre.forEach((row) => addTraceHighlight(highlights, row.asset, "fibre"));
    trace.qa.forEach((row) => addTraceHighlight(highlights, row.asset, "qa"));

    return highlights;
  }, [
    activeOperationPanel,
    fullSelectedWorkspaceAsset,
    workspaceAssets,
    networkGraph,
    auditIssues,
  ]);

  const traceHighlightedAssetIds = useMemo(
    () => getTraceHighlightIdList(traceHighlightKinds),
    [traceHighlightKinds],
  );

  const openOperationPanel = (
    panel: WorkspaceOperationPanel,
    tab?: WorkspaceTab,
  ) => {
    if (tab) setActiveTab(tab);
    setActiveOperationPanel(panel);
  };

  const handleSearchSelect = (asset: SavedMapAsset) => {
    setSelectedWorkspaceAsset(asset);
    setSearchTerm(getWorkspaceAssetTitle(asset));
    setSearchFocused(false);
    setActiveOperationPanel("trace");
    setActiveTab("topology");
  };

  const openInternalTraceTool = () => {
    setActiveTab("topology");
    setActiveOperationPanel("trace");
  };

  const openIssueSeverity = (severity: "high" | "medium" | "low") => {
    setActiveIssueSeverity(severity);
    setActiveTab("qa");
    setActiveOperationPanel("qa");
  };

  const handleAuditIssueSelect = (issue: AuditIssue) => {
    const matchedAsset = findWorkspaceAssetForIssue(issue, workspaceAssets);
    if (matchedAsset) {
      setSelectedWorkspaceAsset(matchedAsset);
      setSearchTerm(getWorkspaceAssetTitle(matchedAsset));
    }
    setActiveTab("qa");
    setActiveOperationPanel("qa");
  };

  const handleGenerateReport = () => {
    const normaliseCsvValue = (value: unknown): string => {
      if (value === undefined || value === null) return "";
      return String(value).replace(/\r?\n|\r/g, " ").trim();
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
      if (rawType.includes("joint") || rawType.includes("cmj") || rawType.includes("lmj")) return "Joint";
      if (rawType.includes("pole")) return "Pole";
      if (rawType.includes("chamber")) return "Chamber";
      if (rawType.includes("cab")) return "Street Cabinet";
      if (rawType.includes("home") || rawType.includes("premise")) return "Home";
      if (rawType.includes("area") || rawType.includes("polygon")) return "Area";
      return getWorkspaceAssetType(asset);
    };

    const assetStatus = (asset: SavedMapAsset): string => {
      const item = asset as any;
      if (isWorkspaceDistributionPointAsset(asset)) return getOperationalDpStatus(asset);
      if (assetTypeBucket(asset) === "Home") return isLiveHomeAsset(asset) ? "Live / Connected" : String(item.status || item.buildStatus || item.serviceStatus || "Not live");
      return String(item.status || item.buildStatus || item.serviceStatus || item.dpStatus || "");
    };

    const pointText = (asset: SavedMapAsset): string => {
      const item = asset as any;
      if (typeof item.lat === "number" && typeof item.lng === "number") {
        return `${item.lat},${item.lng}`;
      }
      if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
        return `${asset.geometry.coordinates[0]},${asset.geometry.coordinates[1]}`;
      }
      return "";
    };

    const dpAssets = workspaceAssets.filter(isWorkspaceDistributionPointAsset);
    const homeAssets = workspaceAssets.filter((asset) => assetTypeBucket(asset) === "Home");
    const designCableAssets = workspaceAssets.filter(isDesignCableAsset);
    const dropCableAssets = workspaceAssets.filter(isHomeDropCableAsset);

    const rows: unknown[][] = [];

    rows.push(["Alistra GIS Operational Rollout Report"]);
    rows.push(["Generated", new Date().toLocaleString("en-GB")]);
    rows.push(["Project", projectName]);
    rows.push(["Status", status]);
    rows.push(["Readiness state", operationalReadiness.state]);
    rows.push(["Readiness score", `${operationalReadiness.score}%`]);
    rows.push(["Readiness summary", operationalReadiness.summary]);
    rows.push([]);

    rows.push(["SECTION", "Operational KPI Summary"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Readiness state", operationalReadiness.state]);
    rows.push(["Readiness score %", operationalReadiness.score]);
    rows.push(["Readiness summary", operationalReadiness.summary]);
    rows.push(["Readiness blockers", operationalReadiness.blockers.join(" | ") || "None"]);
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
    rows.push(["Blockers", operationalReadiness.blockers.join(" | ") || "None"]);
    rows.push(["Next actions", operationalReadiness.nextActions.join(" | ")]);
    rows.push([]);

    rows.push(["SECTION", "Asset Totals"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Total assets", workspaceAssets.length]);
    rows.push(["Joints", displayStats.joints]);
    rows.push(["DPs", displayStats.dps]);
    rows.push(["Street cabs", displayStats.streetCabs]);
    rows.push(["Poles", displayStats.poles]);
    rows.push(["Chambers", displayStats.chambers]);
    rows.push(["Design cables", displayStats.designCables ?? displayStats.cables]);
    rows.push(["Drop cables", displayStats.dropCables ?? 0]);
    rows.push(["Graph nodes", networkGraph.nodes.size]);
    rows.push(["Graph links", networkGraph.edges.size]);
    rows.push(["Network State used fibres", networkState.summary.usedFibres]);
    rows.push(["Network State spare fibres", networkState.summary.spareFibres]);
    rows.push(["Network State passthrough fibres", networkState.summary.passthroughFibres]);
    rows.push(["Network State warnings", networkState.summary.warnings]);
    rows.push(["Unmatched cable IDs", displayStats.unmatchedCableIds ?? 0]);
    rows.push([]);

    rows.push(["SECTION", "DP Live Status Register"]);
    rows.push(["DP name", "Status", "Closure / type", "Connected homes", "Capacity", "Free ports", "Capacity %", "Capacity warning", "Asset ID", "Map point"]);
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
      const capacity = details.capacity ?? item.capacity ?? item.portCapacity ?? item.ports ?? "";
      const freePorts =
        typeof Number(capacity) === "number" && Number.isFinite(Number(capacity)) && Number.isFinite(Number(connectedHomes))
          ? Math.max(Number(capacity) - Number(connectedHomes), 0)
          : item.freePorts ?? details.freePorts ?? "";

      const capacityState = getWorkspaceDpCapacityRisk(asset);
      rows.push([
        getWorkspaceAssetTitle(asset),
        getOperationalDpStatus(asset),
        details.closureType || details.networkArchitecture || item.closureType || item.dpType || item.jointType || "",
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
    rows.push(["Home / UPRN", "Status", "Connected DP", "Address", "Asset ID", "Map point"]);
    homeAssets.forEach((asset) => {
      const item = asset as any;
      rows.push([
        item.uprn || item.UPRN || item.properties?.UPRN || getWorkspaceAssetTitle(asset),
        isLiveHomeAsset(asset) ? "Live / Connected" : assetStatus(asset),
        item.connectedDpId || item.connectedDP || item.dpId || item.properties?.connectedDpId || "",
        item.address || item.properties?.address || "",
        item.id || item.assetId || "",
        pointText(asset),
      ]);
    });
    rows.push([]);

    rows.push(["SECTION", "Cable Register"]);
    rows.push(["Cable name", "Cable type", "Fibre count", "Used fibres", "Install method", "Length", "From", "To", "Asset ID"]);
    [...designCableAssets, ...dropCableAssets].forEach((asset) => {
      const item = asset as any;
      rows.push([
        getWorkspaceAssetTitle(asset),
        item.cableType || assetTypeBucket(asset),
        item.fibreCount || item.fiberCount || item.coreCount || item.size || "",
        item.usedFibres ?? item.usedFibers ?? item.fibresUsed ?? item.usedCoreCount ?? "",
        item.installMethod || item.method || item.routeType || "",
        item.routeLengthMeters || item.lengthMeters || item.distanceMeters || item.distanceM || "",
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
        matchedAsset ? getWorkspaceAssetTitle(matchedAsset) : issueItem.assetName || "",
        matchedAsset ? assetTypeBucket(matchedAsset) : "",
        issueItem.message || issueItem.title || issueItem.reason || issueItem.description || "",
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
    openOperationPanel("report", "reports");
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
      cables: false,
      dropCables: false,
      joints: false,
      dps: false,
      poles: false,
      chambers: false,
      streetCabs: false,
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
      cables: false,
      dropCables: false,
      joints: false,
      dps: false,
      poles: false,
      chambers: false,
      streetCabs: false,
      homes: false,
      other: false,
    });
    setOpenreachLayers(defaultOpenreachLayers);
  };

  return (
    <div style={workspaceRoot}>
      {/* =====================================================
          PROJECT TOP HEADER
      ===================================================== */}
      <header style={topHeader}>
        <div style={{ minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={projectTitle}>{projectName}</h1>
            <span style={statusPill}>{status}</span>
            <span style={{ ...readinessPill, borderColor: readinessColour(operationalReadiness.state), color: readinessColour(operationalReadiness.state) }}>
              {operationalReadiness.state}
            </span>
          </div>
          <div style={projectSubtitle}>Project Workspace</div>
          {projectAreas.length > 1 ? (
            <select
              value={activeProjectId || projectArea?.id || ""}
              onChange={(event) => {
                const nextProjectId = event.target.value;
                if (!nextProjectId) return;
                setSelectedWorkspaceAsset(null);
                setActiveOperationPanel("none");
                setManagerAreaPoints([]);
                setIsManagerAreaDrawing(false);
                onSelectProject?.(nextProjectId);
              }}
              style={projectSwitcherSelect}
              title="Switch project area"
            >
              {projectAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {getProjectAreaLabel(area)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div style={topMetrics}>
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
            label="Homes Passed"
            value={formatNumber(rolloutKpis.homesPassed)}
          />
          <StatCard
            label="Homes Live"
            value={formatNumber(rolloutKpis.homesLive)}
            tone="good"
          />
          <StatCard
            label="Homes Not Live"
            value={formatNumber(rolloutKpis.homesNotLive)}
            tone={rolloutKpis.homesNotLive > 0 ? "warn" : "good"}
          />
          <StatCard
            label="DPs Live"
            value={`${formatNumber(rolloutKpis.dpLive)} / ${formatNumber(rolloutKpis.dpTotal)}`}
            tone={rolloutKpis.dpTotal > 0 && rolloutKpis.dpLive === rolloutKpis.dpTotal ? "good" : "warn"}
          />
          <StatCard
            label="DPs BWIP"
            value={formatNumber(rolloutKpis.dpBwip)}
            tone={rolloutKpis.dpBwip > 0 ? "warn" : "default"}
          />
          <StatCard
            label="DPs LNRFS"
            value={formatNumber(rolloutKpis.dpLnrfs)}
            tone={rolloutKpis.dpLnrfs > 0 ? "warn" : "default"}
          />
          <StatCard
            label="Unserviceable"
            value={formatNumber(rolloutKpis.dpUnserviceable)}
            tone={rolloutKpis.dpUnserviceable > 0 ? "bad" : "good"}
          />
          <StatCard
            label="Near Capacity"
            value={formatNumber(rolloutKpis.dpNearCapacity)}
            tone={rolloutKpis.dpNearCapacity > 0 ? "warn" : "good"}
          />
          <StatCard
            label="Over Capacity"
            value={formatNumber(rolloutKpis.dpOverCapacity)}
            tone={rolloutKpis.dpOverCapacity > 0 ? "bad" : "good"}
          />
          <StatCard
            label="QA Issues"
            value={formatNumber(rolloutKpis.qaIssues)}
            tone={rolloutKpis.qaIssues > 0 ? "bad" : "good"}
          />
          <StatCard
            label="Disconnected"
            value={formatNumber(rolloutKpis.disconnectedAssets)}
            tone={rolloutKpis.disconnectedAssets > 0 ? "warn" : "good"}
          />
          <StatCard
            label="Route Length"
            value={formatDistance(rolloutKpis.routeLengthMeters)}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={smallButton} onClick={onExport}>
            Export
          </button>
          <button type="button" style={smallButton} onClick={onBackToMap}>
            Back To Map
          </button>
        </div>
      </header>

      {/* =====================================================
          WORKSPACE TAB BAR
      ===================================================== */}
      <nav style={tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={activeTab === tab.id ? activeTabButton : tabButton}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={workspaceBody}>
        {/* =====================================================
            LEFT WORKFLOW NAV
        ===================================================== */}
        <aside style={leftRail}>
          <div style={brandBlock}>
            <div style={brandIcon}>⌁</div>
            <div>
              <div style={{ fontWeight: 800 }}>Network</div>
              <div style={{ fontWeight: 800 }}>Operations</div>
            </div>
          </div>

          <SideGroup
            title="NETWORK OPERATIONS"
            items={[
              ["Topology", () => openOperationPanel("topology", "topology")],
              ["QA Status", () => openOperationPanel("qa", "qa")],
              [
                "Fibre Tray Topology",
                () => {
                  setActiveTab("fibre");
                  onOpenFibreTopology?.();
                },
              ],
              ["Disconnected Assets", () => openOperationPanel("qa", "qa")],
              ["Over Capacity", () => openOperationPanel("issues", "qa")],
            ]}
          />

          <SideGroup
            title="PROJECT MANAGEMENT"
            items={[
              [
                "Build Progress",
                () => openOperationPanel("rfsBreakdown", "build"),
              ],
              [
                "Maintenance",
                () => openOperationPanel("issues", "maintenance"),
              ],
              ["Assets", () => openOperationPanel("projectDetails", "assets")],
              ["Reports", () => openOperationPanel("report", "reports")],
            ]}
          />

          <div style={{ marginTop: "auto" }}>
            <button type="button" style={railButton} onClick={onBackToMap}>
              ← Back to global map
            </button>
          </div>
        </aside>

        {/* =====================================================
            MAIN DASHBOARD CONTENT
        ===================================================== */}
        <main style={contentGrid}>
          <section style={mapPanel}>
            <div style={mapToolbar}>
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
                        <span>{layer.label}</span>
                      </label>
                    ))}

                    <div style={layerMenuDivider} />
                    <div style={layerMenuHeader}>Openreach / PIA Layers</div>
                    {openreachLayerOptions.map((layer) => (
                      <label key={layer.key} style={layerRow}>
                        <input
                          type="checkbox"
                          checked={openreachLayers[layer.key]}
                          onChange={() => toggleOpenreachLayer(layer.key)}
                        />
                        <span>{layer.label}</span>
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
            <div style={mapLiveWrap}>
              <WorkspaceMap
                openreachLayers={openreachLayers}
                projectName={projectName}
                projectArea={projectArea}
                assets={workspaceAssets}
                selectedAssetId={
                  fullSelectedWorkspaceAsset?.id ??
                  selectedWorkspaceAsset?.id ??
                  null
                }
                traceHighlightedAssetIds={traceHighlightedAssetIds}
                traceHighlightKinds={traceHighlightKinds}
                networkState={networkState}
                managerAreaPoints={managerAreaPoints}
                managerAreaDrawMode={isManagerAreaDrawing}
                onManagerAreaPointAdd={(point) => {
                  setManagerAreaPoints((prev) => [...prev, point]);
                }}
                onManagerAreaClear={() => {
                  setManagerAreaPoints([]);
                  setIsManagerAreaDrawing(false);
                }}
                showCableDistances
                visibleLayers={visibleLayers}
                onAssetSelect={(asset) => {
                  const assetType = String((asset as any).assetType || (asset as any).type || "").toLowerCase();
                  setSelectedWorkspaceAsset(asset);

                  if (assetType === "ag-joint" || assetType === "joint" || assetType.includes("joint")) {
                    onOpenJointEditor?.(asset);
                    return;
                  }

                  if (asset.geometry?.type === "LineString" || assetType.includes("cable")) {
                    setActiveTab("topology");
                    setActiveOperationPanel("trace");
                    return;
                  }

                  setActiveOperationPanel("none");
                }}
              />

              <div style={mapAssetInspector}>
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
                <div style={{ marginTop: 3, color: "#cbd5e1", fontSize: 12 }}>
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

          {fullSelectedWorkspaceAsset ? (
            <section style={intelligenceDock}>
              <AssetIntelligencePanel
                asset={fullSelectedWorkspaceAsset}
                projectName={projectName}
                projectAssets={workspaceAssets}
                onClose={() => setSelectedWorkspaceAsset(null)}
                onOpenTopology={openInternalTraceTool}
                onOpenQA={() => openOperationPanel("qa", "qa")}
                onSelectAsset={setSelectedWorkspaceAsset}
                onZoomAsset={setSelectedWorkspaceAsset}
                onOpenJointEditor={onOpenJointEditor}
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
            <WorkspaceTabContent
              activeTab={activeTab}
              projectName={projectName}
              status={status}
              stats={workspaceDisplayStats}
              projectAssets={workspaceAssets}
              projectArea={projectArea}
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
              onStopManagerAreaDrawing={() => setIsManagerAreaDrawing(false)}
              onClearManagerAreaDrawing={() => {
                setManagerAreaPoints([]);
                setIsManagerAreaDrawing(false);
              }}
              areaDistributionPoints={areaDistributionPoints}
              onBulkUpdateDpStatus={onBulkUpdateDpStatus}
              onClearDpFibreAllocations={handleClearAreaDpFibreAllocations}
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
              onOpenQA={() => openOperationPanel("qa", "qa")}
              onOpenFibreTopology={openInternalTraceTool}
              onExport={onExport}
              onBackToMap={onBackToMap}
            />
          )}

          {activeOperationPanel !== "none" && (
            <section style={operationDrawer}>
              <div style={operationDrawerHeader}>
                <div>
                  <div style={operationKicker}>OPERATION PANEL</div>
                  <h3 style={operationTitle}>
                    {activeOperationPanel === "projectDetails" &&
                      "Project Details"}
                    {activeOperationPanel === "rfsBreakdown" && "RFS Breakdown"}
                    {activeOperationPanel === "issues" && "Area Issues"}
                    {activeOperationPanel === "topology" && "Topology"}
                    {activeOperationPanel === "qa" && "QA Validation"}
                    {activeOperationPanel === "trace" && "Trace Fibre Route"}
                    {activeOperationPanel === "addAsset" && "Add New Asset"}
                    {activeOperationPanel === "report" && "Project Report"}
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
                  <InfoRow label="Status" value={status} highlight />
                  <InfoRow
                    label="Homes"
                    value={`${formatNumber(displayStats.homesConnected)} / ${formatNumber(displayStats.homesPassed)}`}
                  />
                  <InfoRow
                    label="Route Length"
                    value={formatDistance(displayStats.routeLengthMeters)}
                  />
                  <InfoRow
                    label="Total Assets"
                    value={formatNumber(workspaceAssets.length)}
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
                        displayStats.homesPassed - displayStats.homesConnected,
                      ),
                    )}
                  />
                  <InfoRow label="Readiness State" value={operationalReadiness.state} highlight={operationalReadiness.state === "Ready For Service" || operationalReadiness.state === "Live"} />
                  <InfoRow label="Readiness Score" value={`${operationalReadiness.score}%`} highlight={operationalReadiness.score >= 85} />
                  <InfoRow label="Readiness Blockers" value={operationalReadiness.blockers.length ? operationalReadiness.blockers.length : "None"} highlight={operationalReadiness.blockers.length === 0} />
                  <InfoRow label="Build Status" value={status} />
                </div>
              )}

              {(activeOperationPanel === "issues" ||
                activeOperationPanel === "qa") && (
                <div style={operationStack}>
                  <div style={issueGrid}>
                    <IssueCard
                      label="High"
                      value={issueBuckets.high.length}
                      tone="#7f1d1d"
                      active={activeIssueSeverity === "high"}
                      onClick={() => openIssueSeverity("high")}
                    />
                    <IssueCard
                      label="Medium"
                      value={issueBuckets.medium.length}
                      tone="#78350f"
                      active={activeIssueSeverity === "medium"}
                      onClick={() => openIssueSeverity("medium")}
                    />
                    <IssueCard
                      label="Low"
                      value={issueBuckets.low.length}
                      tone="#1e3a8a"
                      active={activeIssueSeverity === "low"}
                      onClick={() => openIssueSeverity("low")}
                    />
                  </div>
                  {activeIssueSeverity ? (
                    <div style={emptyPanel}>
                      Showing {activeIssueSeverity.toUpperCase()} issues only. Click another severity card to switch.
                    </div>
                  ) : null}
                  <div style={operationList}>
                    {auditIssues.length === 0 ? (
                      <div style={emptyPanel}>
                        No QA issues found for this project area.
                      </div>
                    ) : (
                      (activeIssueSeverity
                        ? issueBuckets[activeIssueSeverity]
                        : auditIssues
                      )
                        .slice(0, 30)
                        .map((issue: AuditIssue, index: number) => {
                          const matchedAsset = findWorkspaceAssetForIssue(issue, workspaceAssets);

                          return (
                            <button
                              key={`${issue.assetId}-${issue.issue}-${index}`}
                              type="button"
                              style={{
                                ...operationListItem,
                                textAlign: "left",
                                cursor: matchedAsset ? "pointer" : "default",
                              }}
                              onClick={() => handleAuditIssueSelect(issue)}
                            >
                              <strong>
                                {issue.severity.toUpperCase()} — {issue.category}
                              </strong>
                              <span>
                                {issue.assetName ||
                                  issue.assetId ||
                                  "Unknown asset"}
                              </span>
                              <small>{issue.issue}</small>
                              <small style={{ color: matchedAsset ? "#93c5fd" : "#64748b" }}>
                                {matchedAsset ? "Click to select asset and show it on the workspace map" : "Asset not found in current project scope"}
                              </small>
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {activeOperationPanel === "topology" && (
                <div style={operationGrid}>
                  <InfoRow
                    label="Graph Nodes"
                    value={formatNumber(networkGraph.nodes.size)}
                  />
                  <InfoRow
                    label="Graph Links"
                    value={formatNumber(networkGraph.edges.size)}
                  />
                  <InfoRow
                    label="Mapped Joints"
                    value={formatNumber(
                      stats.mappedJoints ?? displayStats.joints,
                    )}
                  />
                  <InfoRow
                    label="Route Links"
                    value={formatNumber(displayStats.topologyLinks)}
                  />
                  <InfoRow
                    label="Disconnected Assets"
                    value={formatNumber(disconnectedAssets.length)}
                  />
                  <InfoRow
                    label="Unmatched Cable IDs"
                    value={formatNumber(displayStats.unmatchedCableIds ?? 0)}
                  />
                  <button
                    type="button"
                    style={wideButton}
                    onClick={onOpenFibreTopology}
                  >
                    Open Fibre Tray Topology
                  </button>
                </div>
              )}

              {activeOperationPanel === "trace" && (
                <TraceTopologyPanel
                  selectedAsset={fullSelectedWorkspaceAsset}
                  assets={workspaceAssets}
                  networkGraph={networkGraph}
                  auditIssues={auditIssues}
                  onSelectAsset={(asset) => {
                    setSelectedWorkspaceAsset(asset);
                    setSearchTerm(getWorkspaceAssetTitle(asset));
                    setActiveTab("topology");
                    setActiveOperationPanel("trace");
                  }}
                />
              )}

              {activeOperationPanel === "addAsset" && (
                <div style={operationStack}>
                  <div style={emptyPanel}>
                    Asset creation still lives on the main map so the existing
                    right-click creation, snapping, cable drawing and save logic
                    stays protected.
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

              {activeOperationPanel === "report" && (
                <div style={operationStack}>
                  <div style={emptyPanel}>
                    Project report is ready. Use Generate Report to download a
                    current text report, or Export Project Data for the existing
                    export workflow.
                  </div>
                  <button
                    type="button"
                    style={wideButton}
                    onClick={handleGenerateReport}
                  >
                    Download Report
                  </button>
                  <button type="button" style={wideButton} onClick={onExport}>
                    Export Project Data
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SideGroup({
  title,
  items,
}: {
  title: string;
  items: [string, () => void][];
}) {
  return (
    <div style={sideGroup}>
      <div style={sideGroupTitle}>{title}</div>
      {items.map(([label, onClick]) => (
        <button key={label} type="button" style={railButton} onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div style={infoRow}>
      <span style={{ color: "#cbd5e1" }}>{label}</span>
      <strong style={{ color: highlight ? "#4ade80" : "#f8fafc" }}>
        {value}
      </strong>
    </div>
  );
}

function IssueCard({
  label,
  value,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      style={{
        ...issueCard,
        background: tone,
        border: active ? "2px solid #93c5fd" : "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        textAlign: "left",
        color: "#fff",
      }}
      onClick={onClick}
    >
      <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      <small style={{ opacity: 0.75 }}>Open assets</small>
    </button>
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

const operationListItem: React.CSSProperties = {
  display: "grid",
  gap: 4,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: 12,
  color: "#e5e7eb",
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
  background:
    "radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 32%), #07111f",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const topHeader: React.CSSProperties = {
  minHeight: 126,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 0.58fr) minmax(720px, 2.7fr) auto",
  alignItems: "center",
  gap: 16,
  padding: "14px 18px 14px 24px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0a1424 100%)",
};

const projectTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.05,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};
const projectSubtitle: React.CSSProperties = {
  marginTop: 6,
  color: "#94a3b8",
  fontSize: 14,
};

const projectSwitcherSelect: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  maxWidth: 260,
  background: "#020617",
  color: "#e5e7eb",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: "9px 11px",
  fontWeight: 850,
  outline: "none",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};
const statusPill: React.CSSProperties = {
  background: "rgba(34,197,94,0.18)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.25)",
  borderRadius: 7,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 800,
};

const readinessPill: React.CSSProperties = {
  background: "rgba(15,23,42,0.68)",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 7,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 900,
};
const topMetrics: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(118px, 1fr))",
  gap: 10,
  alignItems: "stretch",
};
const metricCard: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.90), rgba(15, 23, 42, 0.68))",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 12,
  padding: "11px 13px",
  minHeight: 62,
  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
};
const metricLabel: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 11,
  marginBottom: 5,
};
const metricValue: React.CSSProperties = {
  fontSize: 21,
  fontWeight: 950,
  lineHeight: 1.05,
};
const smallButton: React.CSSProperties = {
  background: "#132640",
  color: "#e5e7eb",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 700,
};
const tabBar: React.CSSProperties = {
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 18px 0 176px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.13)",
  background: "rgba(11, 22, 38, 0.96)",
};
const tabButton: React.CSSProperties = {
  background: "transparent",
  color: "#cbd5e1",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 700,
};
const activeTabButton: React.CSSProperties = {
  ...tabButton,
  background: "rgba(37, 99, 235, 0.22)",
  color: "#93c5fd",
  boxShadow: "inset 0 -2px 0 #3b82f6",
};
const workspaceBody: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "176px 1fr",
  minHeight: 0,
};
const leftRail: React.CSSProperties = {
  background: "linear-gradient(180deg, #07111f 0%, #050b14 100%)",
  borderRight: "1px solid rgba(148, 163, 184, 0.16)",
  padding: "16px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 18,
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
const sideGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const sideGroupTitle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.5,
  margin: "8px 0",
};
const railButton: React.CSSProperties = {
  textAlign: "left",
  background: "transparent",
  color: "#cbd5e1",
  border: "none",
  borderRadius: 8,
  padding: "9px 10px",
  cursor: "pointer",
  fontWeight: 650,
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
  height: 548,
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
  gridColumn: "span 2",
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
const panelTitle: React.CSSProperties = { margin: "0 0 14px", fontSize: 18 };
const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 0",
  fontSize: 13,
};
const wideButton: React.CSSProperties = {
  ...smallButton,
  width: "100%",
  marginTop: 14,
  background: "#1e3a5f",
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
const issueCard: React.CSSProperties = {
  borderRadius: 8,
  padding: 12,
  minHeight: 68,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
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
const quickAction: React.CSSProperties = {
  ...smallButton,
  minHeight: 54,
  background: "#111827",
};
