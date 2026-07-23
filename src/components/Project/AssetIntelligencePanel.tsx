// =====================================================
// FILE: AssetIntelligencePanel.tsx
// PURPOSE: Right-side engineering intelligence panel for
//          the Project Workspace. This keeps map rendering
//          separate from operational FTTP intelligence.
// Cleaner operational styling and spacing only.
//             No intelligence calculation logic changed.
// =====================================================

import { getDistanceMeters as haversineMeters } from "../../utils/mapMeasure";
import React, { useDeferredValue, useMemo, useState } from "react";
import type { SavedMapAsset } from "../map/types";
import { auditAreaAssets, type AuditIssue, type AuditSeverity } from "../../services/areaAudit";
import {
  buildSbFibreAllocation,
  formatFibreList,
  type SbFibreAllocation,
} from "./workspace/sbFibreAllocation";
import AuditModal from "../audits/AuditModal";
import AuditFormEngine from "../audits/AuditFormEngine";
import AuditHistoryPanel from "../audits/AuditHistoryPanel";
import AuditPaymentBlockerPanel from "../audits/AuditPaymentBlockerPanel";
import {
  chamberAuditTemplate,
  jointAuditTemplate,
  poleAuditTemplate,
} from "../audits/auditTemplates";
import { createAuditFormLog } from "../../services/auditService";
import { getDpIntelligence as getCentralDpIntelligence, isDpLikeAsset } from "../../services/dpIntelligence";
import { getJointIntelligence } from "../../services/jointIntelligence";
import type { NetworkGraph } from "../../services/networkGraph";
import type { DpRoutingState } from "../../services/network/types";

// =====================================================
// TYPES
// =====================================================

type AssetIntelligencePanelProps = {
  asset: SavedMapAsset | null;
  projectName: string;
  projectAssets: SavedMapAsset[];
  networkGraph?: NetworkGraph;
  dpStates?: Record<string, DpRoutingState>;
  onClose?: () => void;
  onOpenTopology?: () => void;
  onOpenQA?: () => void;
  onZoomAsset?: (asset: SavedMapAsset) => void;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
  onOpenDuctEditor?: (asset: SavedMapAsset) => void;
  onOpenDistributionPointEditor?: (asset: SavedMapAsset) => void;
  onUpdateDpStatus?: (args: {
    asset: SavedMapAsset;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
};

type RowValue = string | number | null | undefined;
type SeverityCounts = Record<AuditSeverity, number>;

// =====================================================
// HELPERS
// =====================================================

function read(asset: any, keys: string[], fallback: RowValue = "—"): RowValue {
  for (const key of keys) {
    const value = asset?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function readNested(asset: any, keys: string[], fallback: RowValue = "—"): RowValue {
  for (const key of keys) {
    const parts = key.split(".");
    let cursor = asset;
    for (const part of parts) {
      cursor = cursor?.[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return fallback;
}

function getAssetName(asset: SavedMapAsset | null): string {
  if (!asset) return "No asset selected";
  const item = asset as any;
  return String(read(item, ["name", "jointName", "label", "cableId", "id"], "Asset"));
}

function getAssetType(asset: SavedMapAsset | null): string {
  if (!asset) return "asset";
  const item = asset as any;
  return String(read(item, ["assetType", "type", "jointType"], "asset")).toLowerCase();
}

function getPrettyType(asset: SavedMapAsset | null): string {
  const raw = getAssetType(asset);
  if (raw.includes("duct")) return "Duct";
  if (raw.includes("cable") || raw.includes("line")) return "Cable";
  if (raw.includes("joint") || raw.includes("lmj") || raw.includes("midj") || raw.includes("cmj")) return "Joint";
  if (raw.includes("distribution") || raw === "dp" || raw.includes("cbt") || raw.includes("afn")) return "Distribution Point";
  if (raw.includes("pole")) return "Pole";
  if (raw.includes("chamber")) return "Chamber";
  if (raw.includes("street") || raw.includes("cab")) return "Street Cabinet";
  if (raw.includes("home") || raw.includes("premise")) return "Home";
  if (raw.includes("polygon") || raw.includes("area")) return "Area";
  return raw.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isDuct(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("duct");
}

function isCable(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("cable") || asset?.geometry?.type === "LineString";
}

function isDesignCable(asset: SavedMapAsset | null): boolean {
  return isCable(asset) && !isDropCable(asset);
}

function isJoint(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("joint") || type.includes("lmj") || type.includes("midj") || type.includes("cmj") || type.includes("ag");
}

function isDp(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  const item = asset as any;
  const closureType = String(
    item?.dpDetails?.closureType ||
      item?.dpDetails?.networkArchitecture ||
      item?.closureType ||
      item?.networkArchitecture ||
      "",
  ).toLowerCase();

  return (
    type.includes("distribution") ||
    type === "dp" ||
    type.includes("cbt") ||
    type.includes("afn") ||
    type.includes("mdu") ||
    closureType === "cbt" ||
    closureType === "afn" ||
    closureType === "mdu" ||
    closureType === "mdu_splitter"
  );
}

type OperationalDpStatus =
  | "Live"
  | "BWIP"
  | "Unserviceable"
  | "Live not ready for service";

function requestDpStatusNote(status: OperationalDpStatus, asset: SavedMapAsset): string | null {
  const note = window.prompt(
    `Manager note required: set ${getAssetName(asset)} to ${status}?`,
    `Set DP status to ${status}`,
  );

  if (note === null) return null;

  const trimmed = note.trim();
  if (!trimmed) {
    alert("A manager note is required before changing DP status.");
    return null;
  }

  return trimmed;
}

function isPole(asset: SavedMapAsset | null): boolean {
  return getAssetType(asset).includes("pole");
}

function isChamber(asset: SavedMapAsset | null): boolean {
  return getAssetType(asset).includes("chamber");
}

function isCabinet(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  return type.includes("cab") || type.includes("street");
}

function toNumber(value: any): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}


function getSplitterPortsFromRatio(value: unknown): number | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "—" || text === "-") return null;

  // Supports values like "1:8", "1 to 8", "1/8", "8 way", "8-way".
  const ratioMatch = text.match(/1\s*(?::|to|\/)\s*(\d+)/i);
  if (ratioMatch) {
    const ports = Number(ratioMatch[1]);
    return Number.isFinite(ports) && ports > 0 ? ports : null;
  }

  const wayMatch = text.match(/(\d+)\s*-?\s*way/i);
  if (wayMatch) {
    const ports = Number(wayMatch[1]);
    return Number.isFinite(ports) && ports > 0 ? ports : null;
  }

  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readFirstNumber(asset: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = asset?.[key];
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function readCableFibreCount(asset: SavedMapAsset | null | undefined): number | null {
  const item = asset as any;
  if (!item) return null;

  const haystack = [
    item.fibreCount,
    item.fiberCount,
    item.coreCount,
    item.size,
    item.name,
    item.cableId,
    item.cableName,
    item.label,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const match = haystack.match(/(?:^|[^0-9])(288|144|96|48|36|24|12)\s*F?(?:[^0-9]|$)/i);
  return match ? Number(match[1]) : null;
}

function formatDistanceMeters(value: any): string {
  const meters = toNumber(value);
  if (meters === null) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function pointFor(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  if (!asset) return null;
  const item = asset as any;
  if (typeof item.lat === "number" && typeof item.lng === "number") return { lat: item.lat, lng: item.lng };
  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates as any[];
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) return { lat: nextLat, lng: nextLng };
  }
  return null;
}

function linePoints(asset: SavedMapAsset | null): { lat: number; lng: number }[] {
  if (!asset || asset.geometry?.type !== "LineString") return [];
  return ((asset.geometry.coordinates || []) as any[])
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}


type CablePathIntelligence = {
  upstreamAsset: SavedMapAsset | null;
  downstreamAsset: SavedMapAsset | null;
  parentCable: SavedMapAsset | null;
  branchCables: SavedMapAsset[];
  connectedJoints: SavedMapAsset[];
  connectedDps: SavedMapAsset[];
  connectedHomes: SavedMapAsset[];
  nearbyRouteAssets: SavedMapAsset[];
  upstreamChain: SavedMapAsset[];
  downstreamChain: SavedMapAsset[];
  terminalAssets: SavedMapAsset[];
  passThroughJoints: SavedMapAsset[];
  fibreCapacity: number | null;
  usedFibres: number | null;
  remainingFibres: number | null;
  utilisationPercent: number | null;
  routeLengthMeters: number | null;
  spanCount: number;
  longestSpanMeters: number | null;
  averageSpanMeters: number | null;
  endpointGapStartMeters: number | null;
  endpointGapEndMeters: number | null;
  endpointSnapStatus: string;
  pathHealth: string;
  routeWarnings: string[];
};

function routeLength(asset: SavedMapAsset | null): number | null {
  const explicit = read(asset as any, ["routeLengthMeters", "lengthMeters", "distanceMeters", "measuredLengthMeters"], null);
  const explicitNumber = toNumber(explicit);

  if (explicitNumber !== null && explicitNumber > 0) return explicitNumber;

  const points = linePoints(asset);
  if (points.length < 2) return null;

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(points[index - 1], points[index]);
  }

  return total > 0 ? total : null;
}

function cableName(asset: SavedMapAsset | null): string {
  const item = asset as any;
  return String(read(item, ["cableId", "cableName", "name", "id"], ""));
}

function relatedByName(asset: SavedMapAsset | null, assets: SavedMapAsset[]): SavedMapAsset[] {
  const selectedName = cableName(asset).toLowerCase();
  if (!selectedName) return [];

  return assets
    .filter((candidate) => candidate.id !== asset?.id)
    .filter((candidate) => {
      const item = candidate as any;
      const haystack = [item.name, item.cableId, item.cableName, item.inCable, item.outCable, item.sourceCable, item.targetCable]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return Boolean(haystack && (haystack.includes(selectedName) || selectedName.includes(haystack)));
    })
    .slice(0, 5);
}

function nearbyPointAssets(asset: SavedMapAsset | null, assets: SavedMapAsset[], maxMeters = 18): SavedMapAsset[] {
  const points = linePoints(asset);
  if (!points.length) return [];

  return assets
    .filter((candidate) => candidate.id !== asset?.id)
    .filter((candidate) => !!pointFor(candidate))
    .map((candidate) => {
      const point = pointFor(candidate)!;
      const min = Math.min(...points.map((linePoint) => haversineMeters(point, linePoint)));
      return { candidate, min };
    })
    .filter(({ min }) => min <= maxMeters)
    .sort((a, b) => a.min - b.min)
    .map(({ candidate }) => candidate)
    .slice(0, 6);
}

function normaliseNumberList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Math.floor(item));
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\s]+/)
      .map((item) => Number(item.replace(/[^0-9.]/g, "")))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Math.floor(item));
  }

  return [];
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function readLocalDpInputFibres(asset: SavedMapAsset | null): number[] {
  const item = asset as any;
  if (!item) return [];

  const details = item.dpDetails || item.properties?.dpDetails || {};
  const afnDetails = details.afnDetails || item.afnDetails || item.properties?.afnDetails || {};

  return uniqueSortedNumbers([
    ...normaliseNumberList(item.allocatedInputFibres),
    ...normaliseNumberList(item.inputFibres),
    ...normaliseNumberList(item.usedInputFibres),
    ...normaliseNumberList(item.localInputFibres),
    ...normaliseNumberList(details.allocatedInputFibres),
    ...normaliseNumberList(details.inputFibres),
    ...normaliseNumberList(details.usedInputFibres),
    ...normaliseNumberList(afnDetails.allocatedInputFibres),
    ...normaliseNumberList(afnDetails.inputFibres),
    ...normaliseNumberList(afnDetails.usedInputFibres),
  ]);
}

function readCableCapacity(asset: SavedMapAsset | null | undefined): number | null {
  const item = asset as any;
  if (!item) return null;

  const raw = read(item, ["fibreCount", "fiberCount", "coreCount", "size", "capacity"], null);
  const fromRaw = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(fromRaw) && fromRaw > 0) return Math.floor(fromRaw);

  const fibres = normaliseNumberList(item.fibres || item.fibreRange || item.allocatedInputFibres);
  return fibres.length ? Math.max(...fibres) : null;
}

function findThroughCableAssetForDp(asset: SavedMapAsset | null, projectAssets: SavedMapAsset[]): SavedMapAsset | null {
  const item = asset as any;
  if (!item) return null;

  const details = item.dpDetails || item.properties?.dpDetails || {};
  const cableKeys = [
    item.throughCableId,
    item.throughCable,
    item.parentCableId,
    item.feedCable,
    details.throughCableId,
    details.throughCable,
    details.parentCableId,
    details.feedCable,
    details.afnDetails?.throughCableId,
    details.afnDetails?.throughCable,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (!cableKeys.length) return null;

  return projectAssets.find((candidate) => {
    const cable = candidate as any;
    const values = [candidate.id, cable.name, cable.cableId, cable.cableName, cable.label]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean);

    return cableKeys.some((key) => values.includes(key));
  }) || null;
}

function normaliseSbAllocationToLocalBranch(
  asset: SavedMapAsset | null,
  projectAssets: SavedMapAsset[],
  allocation: SbFibreAllocation | null,
): SbFibreAllocation | null {
  if (!asset || !allocation) return allocation;
  if (!isDp(asset)) return allocation;

  const localInputFibres = readLocalDpInputFibres(asset);
  if (!localInputFibres.length) return allocation;

  const throughCableAsset = findThroughCableAssetForDp(asset, projectAssets);
  const localCableCapacity = readCableCapacity(throughCableAsset) || allocation.fibreCapacity || Math.max(...localInputFibres);

  const existingLocalFibres = normaliseNumberList((allocation as any).localFibres);
  const hasMismatch = !existingLocalFibres.length || existingLocalFibres.some((fibre) => !localInputFibres.includes(fibre));
  if (!hasMismatch) return allocation;

  const existingLocalRows = Array.isArray((allocation as any).localRows)
    ? (allocation as any).localRows
    : Array.isArray((allocation as any).rows)
      ? (allocation as any).rows.filter((row: any) => row?.role === "LOCAL")
      : [];

  const localRows = localInputFibres.map((fibre, index) => {
    const sourceRow = existingLocalRows[index] || {};
    return {
      ...sourceRow,
      fibre,
      role: "LOCAL",
      destinationName: sourceRow.destinationName || getAssetName(asset),
      destinationAssetId: sourceRow.destinationAssetId || asset.id,
      sourceAssetName: throughCableAsset ? getAssetName(throughCableAsset) : sourceRow.sourceAssetName,
    };
  });

  const capacity = Number(localCableCapacity) || Math.max(...localInputFibres);
  const rows = Array.from({ length: Math.max(capacity, Math.max(...localInputFibres)) }, (_, index) => {
    const fibre = index + 1;
    const localRow = localRows.find((row: any) => Number(row.fibre) === fibre);
    if (localRow) return localRow;

    return {
      fibre,
      role: "SPARE",
      destinationName: "Spare on local branch cable",
      destinationAssetId: asset.id,
      sourceAssetName: throughCableAsset ? getAssetName(throughCableAsset) : undefined,
    };
  });

  return {
    ...(allocation as any),
    fibreCapacity: capacity,
    throughCableName: throughCableAsset ? getAssetName(throughCableAsset) : (allocation as any).throughCableName,
    localFibres: localInputFibres,
    localRows,
    passthroughRows: [],
    upstreamRows: [],
    spareRows: rows.filter((row: any) => row.role === "SPARE"),
    rows,
    warnings: [
      ...(((allocation as any).warnings || []) as string[]),
      "Showing saved local branch input fibres for this SB. Upstream parent fibres are renumbered onto the shoot-off cable.",
    ],
  } as SbFibreAllocation;
}

function severityRank(severity: AuditIssue["severity"]): number {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

function severityLabel(severity: AuditIssue["severity"]): string {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

function severityStyle(severity: AuditIssue["severity"]): React.CSSProperties {
  if (severity === "high") return highSeverityPill;
  if (severity === "medium") return mediumSeverityPill;
  return lowSeverityPill;
}

function copyText(value: string) {
  if (!value) return;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => undefined);
  }
}

function getAssetCopyText(asset: SavedMapAsset | null): string {
  if (!asset) return "";
  const item = asset as any;
  return [
    `Name: ${getAssetName(asset)}`,
    `Type: ${getPrettyType(asset)}`,
    `ID: ${String(item.id || item.assetId || "")}`,
    `Status: ${String(read(item, ["status", "dpStatus", "serviceStatus"], ""))}`,
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

function normaliseId(value: unknown): string {
  return String(value ?? "").trim();
}

function getCandidateIds(asset: SavedMapAsset | null): string[] {
  if (!asset) return [];
  const item = asset as any;
  return [
    item.id,
    item.assetId,
    item.name,
    item.cableId,
    item.cableName,
    item.jointName,
    item.label,
  ]
    .map(normaliseId)
    .filter(Boolean);
}

function assetMatchesAnyId(asset: SavedMapAsset | null, ids: string[]): boolean {
  if (!asset || !ids.length) return false;
  const candidates = getCandidateIds(asset).map((id) => id.toLowerCase());
  const lookup = ids.map((id) => normaliseId(id).toLowerCase()).filter(Boolean);
  return candidates.some((candidate) => lookup.includes(candidate));
}

function assetIdMatches(issueAssetId: string, asset: SavedMapAsset | null): boolean {
  if (!asset) return false;
  const issueId = normaliseId(issueAssetId).toLowerCase();
  if (!issueId) return false;
  return getCandidateIds(asset).some((id) => id.toLowerCase() === issueId);
}

function findAssetByAnyId(assets: SavedMapAsset[], ids: string[]): SavedMapAsset | null {
  return assets.find((candidate) => assetMatchesAnyId(candidate, ids)) || null;
}

function parseFibreNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).match(/\d+/);
  if (!match) return null;
  const next = Number(match[0]);
  return Number.isFinite(next) ? next : null;
}

function getCableEndpointIds(asset: SavedMapAsset | null): { fromIds: string[]; toIds: string[] } {
  const item = asset as any;
  const fromIds = [
    item?.fromAssetId,
    item?.fromId,
    item?.startAssetId,
    item?.sourceAssetId,
    item?.aEndAssetId,
    item?.aEnd,
    item?.fromJointId,
    item?.sourceJointId,
  ].map(normaliseId).filter(Boolean);

  const toIds = [
    item?.toAssetId,
    item?.toId,
    item?.endAssetId,
    item?.targetAssetId,
    item?.bEndAssetId,
    item?.bEnd,
    item?.toJointId,
    item?.targetJointId,
  ].map(normaliseId).filter(Boolean);

  return { fromIds, toIds };
}

function distanceToNearestPointOnCable(asset: SavedMapAsset | null, candidate: SavedMapAsset | null): number | null {
  const cablePoints = linePoints(asset);
  const point = pointFor(candidate);
  if (!cablePoints.length || !point) return null;
  return Math.min(...cablePoints.map((linePoint) => haversineMeters(point, linePoint)));
}

function isNetworkPointAsset(asset: SavedMapAsset | null): boolean {
  return isJoint(asset) || isDp(asset) || isPole(asset) || isChamber(asset) || isCabinet(asset);
}

function isHomeAsset(asset: SavedMapAsset | null): boolean {
  const type = getAssetType(asset);
  const data = asset as any;
  return type.includes("home") || type.includes("premise") || Boolean(data?.uprn || data?.UPRN || data?.properties?.UPRN);
}

function uniqueAssets(assets: SavedMapAsset[]): SavedMapAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = String((asset as any).id || (asset as any).assetId || getAssetName(asset));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstPoint(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  const points = linePoints(asset);
  return points.length ? points[0] : null;
}

function lastPoint(asset: SavedMapAsset | null): { lat: number; lng: number } | null {
  const points = linePoints(asset);
  return points.length ? points[points.length - 1] : null;
}

function getCableReferenceIds(asset: SavedMapAsset | null): string[] {
  const item = asset as any;
  return [
    item?.parentCableId,
    item?.parentCableName,
    item?.throughCableId,
    item?.sourceCable,
    item?.targetCable,
    item?.inCable,
    item?.outCable,
    item?.feedCableId,
    item?.feederCableId,
    item?.dropCableId,
    item?.cableId,
    item?.cableName,
  ].map(normaliseId).filter(Boolean);
}

function getEndpointReferenceIds(asset: SavedMapAsset | null): string[] {
  const endpoints = getCableEndpointIds(asset);
  return [...endpoints.fromIds, ...endpoints.toIds];
}


function isOverheadCable(asset: SavedMapAsset | null): boolean {
  const item = asset as any;
  const raw = String(read(item, [
    "installMethod",
    "method",
    "routeType",
    "installType",
    "cableInstallMethod",
    "installationMethod",
  ], "")).trim().toLowerCase();

  if (!raw) return false;
  if (raw.includes("underground") || raw === "ug" || raw.includes("duct") || raw.includes("direct bury") || raw.includes("buried")) return false;
  return raw === "oh" || raw.includes("overhead") || raw.includes("aerial") || raw.includes("pole") || raw.includes("span");
}

function routeStats(asset: SavedMapAsset | null): { spanCount: number; longestSpanMeters: number | null; averageSpanMeters: number | null } {
  const points = linePoints(asset);
  if (points.length < 2) return { spanCount: 0, longestSpanMeters: null, averageSpanMeters: null };
  const spans: number[] = [];
  for (let index = 1; index < points.length; index += 1) spans.push(haversineMeters(points[index - 1], points[index]));
  const total = spans.reduce((sum, span) => sum + span, 0);
  return {
    spanCount: spans.length,
    longestSpanMeters: spans.length ? Math.max(...spans) : null,
    averageSpanMeters: spans.length ? total / spans.length : null,
  };
}

function closestNetworkAssetToPoint(
  point: { lat: number; lng: number } | null,
  assets: SavedMapAsset[],
  excludeId: string | undefined,
  maxMeters = 22,
): { asset: SavedMapAsset | null; distance: number | null } {
  if (!point) return { asset: null, distance: null };

  const closest = assets
    .filter((candidate) => candidate.id !== excludeId && isNetworkPointAsset(candidate))
    .map((candidate) => {
      const candidatePoint = pointFor(candidate);
      return { candidate, distance: candidatePoint ? haversineMeters(point, candidatePoint) : Number.POSITIVE_INFINITY };
    })
    .filter(({ distance }) => distance <= maxMeters)
    .sort((a, b) => a.distance - b.distance)[0];

  return closest ? { asset: closest.candidate, distance: closest.distance } : { asset: null, distance: null };
}

function cableTouchesAsset(cable: SavedMapAsset | null, asset: SavedMapAsset | null, maxMeters = 22): boolean {
  if (!cable || !asset) return false;
  const point = pointFor(asset);
  if (point) {
    const distance = distanceToNearestPointOnCable(cable, asset);
    if (distance !== null && distance <= maxMeters) return true;
  }

  const endpointIds = getEndpointReferenceIds(cable);
  return assetMatchesAnyId(asset, endpointIds);
}

function findCableChain(
  selectedCable: SavedMapAsset,
  projectAssets: SavedMapAsset[],
  direction: "upstream" | "downstream",
): SavedMapAsset[] {
  const chain: SavedMapAsset[] = [];
  const seen = new Set<string>([String(selectedCable.id)]);
  let current: SavedMapAsset | null = selectedCable;

  for (let depth = 0; depth < 5; depth += 1) {
    const currentEndpoints = getCableEndpointIds(current);
    const lookupIds = direction === "upstream" ? currentEndpoints.fromIds : currentEndpoints.toIds;
    const lookupPoint = direction === "upstream" ? firstPoint(current) : lastPoint(current);

    const nextCable = projectAssets.find((candidate) => {
      if (!isDesignCable(candidate) || seen.has(String(candidate.id))) return false;
      const candidateEndpoints = getCableEndpointIds(candidate);
      const candidateOppositeIds = direction === "upstream" ? candidateEndpoints.toIds : candidateEndpoints.fromIds;
      const explicitTouch = lookupIds.length && candidateOppositeIds.some((id) => lookupIds.map((value) => value.toLowerCase()).includes(id.toLowerCase()));
      if (explicitTouch) return true;

      const candidatePoint = direction === "upstream" ? lastPoint(candidate) : firstPoint(candidate);
      return Boolean(lookupPoint && candidatePoint && haversineMeters(lookupPoint, candidatePoint) <= 22);
    });

    if (!nextCable) break;
    chain.push(nextCable);
    seen.add(String(nextCable.id));
    current = nextCable;
  }

  return chain;
}

function buildCablePathIntelligence(asset: SavedMapAsset | null, projectAssets: SavedMapAsset[]): CablePathIntelligence {
  const item = asset as any;
  const empty: CablePathIntelligence = {
    upstreamAsset: null,
    downstreamAsset: null,
    parentCable: null,
    branchCables: [],
    connectedJoints: [],
    connectedDps: [],
    connectedHomes: [],
    nearbyRouteAssets: [],
    upstreamChain: [],
    downstreamChain: [],
    terminalAssets: [],
    passThroughJoints: [],
    fibreCapacity: null,
    usedFibres: null,
    remainingFibres: null,
    utilisationPercent: null,
    routeLengthMeters: null,
    spanCount: 0,
    longestSpanMeters: null,
    averageSpanMeters: null,
    endpointGapStartMeters: null,
    endpointGapEndMeters: null,
    endpointSnapStatus: "No cable selected",
    pathHealth: "No cable selected",
    routeWarnings: [],
  };

  if (!asset || !isDesignCable(asset)) return empty;

  const cableIds = getCandidateIds(asset);
  const { fromIds, toIds } = getCableEndpointIds(asset);
  const startSnap = closestNetworkAssetToPoint(firstPoint(asset), projectAssets, asset.id);
  const endSnap = closestNetworkAssetToPoint(lastPoint(asset), projectAssets, asset.id);

  const upstreamAsset = findAssetByAnyId(projectAssets, fromIds) || startSnap.asset;
  const downstreamAsset = findAssetByAnyId(projectAssets, toIds) || endSnap.asset;

  const upstreamChain = findCableChain(asset, projectAssets, "upstream");
  const downstreamChain = findCableChain(asset, projectAssets, "downstream");

  const parentCable = findAssetByAnyId(projectAssets, [
    item?.parentCableId,
    item?.parentCableName,
    item?.throughCableId,
    item?.sourceCable,
    item?.inCable,
  ].map(normaliseId).filter(Boolean)) || upstreamChain[0] || null;

  const nearbyRouteAssetsWithDistance = projectAssets
    .filter((candidate) => candidate.id !== asset.id && isNetworkPointAsset(candidate))
    .map((candidate) => ({ candidate, distance: distanceToNearestPointOnCable(asset, candidate) }))
    .filter((entry): entry is { candidate: SavedMapAsset; distance: number } => entry.distance !== null && entry.distance <= 18)
    .sort((a, b) => a.distance - b.distance);

  const nearbyRouteAssets = uniqueAssets([
    ...(upstreamAsset ? [upstreamAsset] : []),
    ...(downstreamAsset ? [downstreamAsset] : []),
    ...nearbyRouteAssetsWithDistance.map((entry) => entry.candidate),
  ]).slice(0, 16);

  const connectedJoints = nearbyRouteAssets.filter(isJoint).slice(0, 12);

  const connectedDps = uniqueAssets([
    ...projectAssets
      .filter((candidate) => candidate.id !== asset.id && isDp(candidate))
      .filter((candidate) => {
        const data = candidate as any;
        if (assetMatchesAnyId(asset, [data.parentCableId, data.cableId, data.feedCableId, data.feederCableId, data.sourceCable].map(normaliseId))) return true;
        const distance = distanceToNearestPointOnCable(asset, candidate);
        return distance !== null && distance <= 18;
      }),
    ...nearbyRouteAssets.filter(isDp),
  ]).slice(0, 20);

  const connectedHomes = projectAssets
    .filter(isHomeAsset)
    .filter((candidate) => {
      const data = candidate as any;
      if (assetMatchesAnyId(asset, [data.parentCableId, data.cableId, data.dropCableId, data.feedCableId].map(normaliseId))) return true;
      return connectedDps.some((dp) => assetMatchesAnyId(dp, [data.dpId, data.parentDpId, data.connectedDpId, data.servingDpId, data.dpName].map(normaliseId)));
    })
    .slice(0, 40);

  const branchCables = uniqueAssets([
    ...projectAssets
      .filter((candidate) => candidate.id !== asset.id && isDesignCable(candidate))
      .filter((candidate) => {
        const data = candidate as any;
        if (assetMatchesAnyId(asset, [data.parentCableId, data.parentCableName, data.throughCableId, data.sourceCable, data.inCable].map(normaliseId))) return true;
        if (getCableReferenceIds(candidate).some((id) => cableIds.map((value) => value.toLowerCase()).includes(id.toLowerCase()))) return true;
        return nearbyRouteAssets.some((routeAsset) => cableTouchesAsset(candidate, routeAsset, 18));
      }),
  ]).slice(0, 16);

  const terminalAssets = uniqueAssets([upstreamAsset, downstreamAsset].filter(Boolean) as SavedMapAsset[]);
  const passThroughJoints = connectedJoints.filter((joint) => branchCables.some((branch) => cableTouchesAsset(branch, joint, 18))).slice(0, 10);

  const fibreCapacity = parseFibreNumber(read(item, ["fibreCount", "fiberCount", "coreCount", "size"], null));
  const usedFibres = parseFibreNumber(read(item, ["usedFibres", "usedFibers", "usedCoreCount", "fibresUsed", "allocatedFibres"], null));
  const remainingFibres = fibreCapacity !== null && usedFibres !== null ? Math.max(0, fibreCapacity - usedFibres) : null;
  const utilisationPercent = fibreCapacity && usedFibres !== null ? Math.min(100, Math.round((usedFibres / fibreCapacity) * 100)) : null;
  const routeLengthMeters = routeLength(asset);
  const stats = routeStats(asset);

  const routeWarnings: string[] = [];
  if (!fibreCapacity) routeWarnings.push("Fibre count missing");
  if (usedFibres === null) routeWarnings.push("Used fibres missing");
  if (!upstreamAsset) routeWarnings.push("Upstream endpoint not linked");
  if (!downstreamAsset) routeWarnings.push("Downstream endpoint not linked");
  if (!connectedJoints.length && !connectedDps.length) routeWarnings.push("No route assets detected on cable path");
  if (isOverheadCable(asset) && stats.longestSpanMeters !== null && stats.longestSpanMeters > 85) routeWarnings.push("Longest OH span is over 85m");
  if (fibreCapacity !== null && usedFibres !== null && usedFibres > fibreCapacity) routeWarnings.push("Used fibres exceed cable capacity");

  let endpointSnapStatus = "No endpoint references";
  if (fromIds.length || toIds.length) {
    if (upstreamAsset && downstreamAsset) endpointSnapStatus = "Both endpoints linked";
    else if (upstreamAsset || downstreamAsset) endpointSnapStatus = "One endpoint linked";
    else endpointSnapStatus = "Endpoint references not found";
  } else if (startSnap.asset || endSnap.asset) {
    if (startSnap.asset && endSnap.asset) endpointSnapStatus = "Likely snapped by map position";
    else endpointSnapStatus = "One endpoint likely snapped by map position";
  } else {
    endpointSnapStatus = "Needs endpoint snap check";
  }

  const pathHealth = routeWarnings.length
    ? `${routeWarnings.length} path warning${routeWarnings.length === 1 ? "" : "s"}`
    : "Cable path looks healthy";

  return {
    upstreamAsset,
    downstreamAsset,
    parentCable,
    branchCables,
    connectedJoints,
    connectedDps,
    connectedHomes,
    nearbyRouteAssets,
    upstreamChain,
    downstreamChain,
    terminalAssets,
    passThroughJoints,
    fibreCapacity,
    usedFibres,
    remainingFibres,
    utilisationPercent,
    routeLengthMeters,
    spanCount: stats.spanCount,
    longestSpanMeters: stats.longestSpanMeters,
    averageSpanMeters: stats.averageSpanMeters,
    endpointGapStartMeters: startSnap.distance,
    endpointGapEndMeters: endSnap.distance,
    endpointSnapStatus,
    pathHealth,
    routeWarnings,
  };
}



function isDropCable(asset: SavedMapAsset | null): boolean {
  const item = asset as any;
  const haystack = [
    item?.name,
    item?.cableId,
    item?.cableName,
    item?.assetType,
    item?.cableType,
    item?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes("drop") || haystack.includes("uprn");
}

function isTopologyNoise(asset: SavedMapAsset | null): boolean {
  return !asset || isDropCable(asset) || getPrettyType(asset).toLowerCase().includes("home");
}

function buildDpIntelligence(
  asset: SavedMapAsset | null,
  projectAssets: SavedMapAsset[],
  relatedAssets: SavedMapAsset[],
) {
  if (asset && isDpLikeAsset(asset)) {
    const intelligence = getCentralDpIntelligence(asset, projectAssets || []);

    return {
      dpType: intelligence.dpType,
      connectedHomes: intelligence.connectedHomes,
      capacity: intelligence.capacity,
      usedPorts: intelligence.usedPorts,
      freePorts: intelligence.freePorts,
      status: intelligence.status,
      throughCable: intelligence.incomingCableName || "—",
      fibres: intelligence.incomingCableFibreCount
        ? `${intelligence.incomingCableFibreCount}F incoming`
        : "—",
      capacityPercent: `${intelligence.capacityPercent}%`,
      capacityWarning: intelligence.capacityWarning,
      splitterRatio: intelligence.splitterRatio,
    };
  }

  const nearbyCables = relatedAssets.filter((candidate) => isCable(candidate));
  const throughCableAsset = nearbyCables.find((candidate) => !isDropCable(candidate)) || null;

  return {
    dpType: read(asset as any, ["dpType", "distributionPointType", "cbtType", "afnType", "type", "assetType"], "distribution-point"),
    connectedHomes: "—",
    capacity: "—",
    usedPorts: "—",
    freePorts: "—",
    status: read(asset as any, ["status", "dpStatus", "serviceStatus", "buildStatus"], "OK"),
    throughCable: throughCableAsset ? getAssetName(throughCableAsset) : "—",
    fibres: "—",
    capacityPercent: "—",
    capacityWarning: "Capacity unknown",
    splitterRatio: "—",
  };
}

function buildQaFlags(asset: SavedMapAsset | null): string[] {
  if (!asset) return [];
  const item = asset as any;
  const flags: string[] = [];

  if (isCable(asset)) {
    if (!read(item, ["name", "cableId", "cableName"], null)) flags.push("Cable has no cable ID/name");
    if (!read(item, ["fibreCount", "fiberCount", "coreCount", "size"], null)) flags.push("Fibre count missing");
    if (!read(item, ["installMethod", "method", "routeType"], null)) flags.push("Install method missing");
  }

  if (isJoint(asset) && !read(item, ["jointType", "assetType", "type"], null)) flags.push("Joint type missing");
  if (isDp(asset) && !read(item, ["status", "dpStatus", "serviceStatus"], null)) flags.push("DP status missing");
  if ((isPole(asset) || isChamber(asset)) && !pointFor(asset)) flags.push("No valid map position found");

  return flags;
}

function buildEngineeringRecommendations(asset: SavedMapAsset | null, cablePath: CablePathIntelligence, dpInfo: any, selectedQaIssues: AuditIssue[]): string[] {
  const recommendations: string[] = [];

  if (!asset) return recommendations;

  if (isCable(asset)) {
    if (!cablePath.upstreamAsset) recommendations.push("Snap or name the upstream endpoint so the cable can trace back through the topology.");
    if (!cablePath.downstreamAsset) recommendations.push("Snap or name the downstream endpoint so the next joint / DP can be resolved.");
    if (cablePath.usedFibres === null) recommendations.push("Add used-fibre count from the joint mapping so utilisation can be trusted.");
    if (cablePath.fibreCapacity !== null && cablePath.usedFibres !== null && cablePath.usedFibres > cablePath.fibreCapacity) recommendations.push("Used fibres exceed cable capacity — check tray allocation and cable size.");
    if (isOverheadCable(asset) && cablePath.longestSpanMeters !== null && cablePath.longestSpanMeters > 85) recommendations.push("Longest OH span is over 85m — review pole dip, route or chamber option.");
    if (!cablePath.connectedDps.length && !cablePath.connectedJoints.length) recommendations.push("No DPs or joints detected along this cable path within tolerance.");
  }

  if (isDp(asset)) {
    const capacityNumber = Number(dpInfo.capacity);
    const usedPortsNumber = Number(dpInfo.usedPorts);
    if (Number.isFinite(capacityNumber) && Number.isFinite(usedPortsNumber) && usedPortsNumber > capacityNumber) recommendations.push("DP used ports exceed capacity — check connected homes or DP type.");
    if (!dpInfo.throughCable || dpInfo.throughCable === "—") recommendations.push("DP has no visible through/feed cable link in this workspace.");
  }

  if (isJoint(asset)) {
    const item = asset as any;
    if (!item.mappingRows?.length && !item.mappingRowsCount) recommendations.push("Joint has no visible tray mapping rows — open Joint Editor and check imported Excel.");
    if (!item.importedFiles?.length) recommendations.push("No imported file history found for this joint.");
  }

  if (selectedQaIssues.some((issue) => issue.severity === "high")) recommendations.push("Resolve high severity QA issues before marking this asset build complete.");

  return Array.from(new Set(recommendations)).slice(0, 8);
}

// =====================================================
// COMPONENT
// =====================================================

export default function AssetIntelligencePanel({
  asset,
  projectName,
  projectAssets,
  networkGraph,
  dpStates,
  onClose,
  onOpenTopology,
  onOpenQA,
  onZoomAsset,
  onSelectAsset,
  onOpenJointEditor,
  onOpenDuctEditor,
  onOpenDistributionPointEditor,
  onUpdateDpStatus,
}: AssetIntelligencePanelProps) {
  const item = asset as any;
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditHistoryRefreshKey, setAuditHistoryRefreshKey] = useState(0);

  // PERF: indexed matching
  // Project Workspace can pass thousands of assets into this intelligence panel.
  // Defer and memoise the heavy derived lookups so search/selection stays responsive
  // while React catches up with route, QA and fibre intelligence calculations.
  const projectAssetsSafe = useMemo(() => projectAssets || [], [projectAssets]);
  const deferredProjectAssets = useDeferredValue(projectAssetsSafe);
  const selectedAssetType = useMemo(
    () => ({
      cable: isCable(asset),
      joint: isJoint(asset),
      dp: isDp(asset),
      pole: isPole(asset),
      chamber: isChamber(asset),
      cabinet: isCabinet(asset),
    }),
    [asset],
  );

  const canChangeDpStatus = selectedAssetType.dp && Boolean(onUpdateDpStatus);

  const selectedAuditTemplate = selectedAssetType.pole
    ? poleAuditTemplate
    : selectedAssetType.chamber
      ? chamberAuditTemplate
      : selectedAssetType.joint
        ? jointAuditTemplate
        : null;

  const applyDpStatus = (nextStatus: OperationalDpStatus) => {
    if (!asset || !onUpdateDpStatus) return;

    const note = requestDpStatusNote(nextStatus, asset);
    if (!note) return;

    onUpdateDpStatus({
      asset,
      status: nextStatus,
      note,
    });
  };

  const relatedAssets = useMemo(() => {
    if (!asset) return [];
    if (selectedAssetType.cable) {
      return [...nearbyPointAssets(asset, deferredProjectAssets), ...relatedByName(asset, deferredProjectAssets)]
        .filter((candidate) => !isTopologyNoise(candidate))
        .slice(0, 6);
    }
    const selectedPoint = pointFor(asset);
    if (!selectedPoint) return relatedByName(asset, deferredProjectAssets).filter((candidate) => !isTopologyNoise(candidate));
    return deferredProjectAssets
      .filter((candidate) => candidate.id !== asset.id)
      .filter((candidate) => !isTopologyNoise(candidate))
      .map((candidate) => {
        const point = pointFor(candidate);
        const line = linePoints(candidate);
        const distance = point
          ? haversineMeters(selectedPoint, point)
          : line.length
            ? Math.min(...line.map((linePoint) => haversineMeters(selectedPoint, linePoint)))
            : Number.POSITIVE_INFINITY;
        return { candidate, distance };
      })
      .filter(({ distance }) => distance <= 25)
      .sort((a, b) => a.distance - b.distance)
      .map(({ candidate }) => candidate)
      .slice(0, 6);
  }, [asset, deferredProjectAssets, selectedAssetType.cable]);

  const qaFlags = useMemo(() => buildQaFlags(asset), [asset]);

  const areaAuditIssues = useMemo(() => {
    return auditAreaAssets(deferredProjectAssets);
  }, [deferredProjectAssets]);

  const selectedQaIssues = useMemo(() => {
    if (!asset) return [];

    return areaAuditIssues
      .filter((issue) => assetIdMatches(issue.assetId, asset))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.issue.localeCompare(b.issue));
  }, [asset, areaAuditIssues]);

  const severityCounts = useMemo<SeverityCounts>(() => {
    return selectedQaIssues.reduce(
      (counts, issue) => {
        counts[issue.severity] += 1;
        return counts;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }, [selectedQaIssues]);


  const cablePath = useMemo(() => {
    if (!selectedAssetType.cable) return buildCablePathIntelligence(null, []);
    return buildCablePathIntelligence(asset, deferredProjectAssets);
  }, [asset, deferredProjectAssets, selectedAssetType.cable]);

  const dpInfo = useMemo(() => {
    return buildDpIntelligence(asset, deferredProjectAssets, relatedAssets);
  }, [asset, deferredProjectAssets, relatedAssets]);

  const sbFibreAllocation = useMemo(() => {
    if (!selectedAssetType.dp && !selectedAssetType.cable) return null;
    const allocation = buildSbFibreAllocation(asset, deferredProjectAssets);
    return normaliseSbAllocationToLocalBranch(asset, deferredProjectAssets, allocation);
  }, [asset, deferredProjectAssets, selectedAssetType.dp, selectedAssetType.cable]);

  const jointInfo = useMemo(() => {
    return getJointIntelligence(asset);
  }, [asset]);

  const engineeringRecommendations = useMemo(() => {
    return buildEngineeringRecommendations(asset, cablePath, dpInfo, selectedQaIssues);
  }, [asset, cablePath, dpInfo, selectedQaIssues]);

  if (!asset) {
    return (
      <aside style={panelRoot}>
        <div style={emptyState}>
          <div style={emptyIcon}>⌁</div>
          <h3 style={panelTitle}>Asset Intelligence</h3>
          <p style={mutedText}>Click a cable, joint, DP, pole, chamber, street cabinet, home or area on the workspace map.</p>
          <div style={hintBox}>Map = navigation<br />Right panel = engineering intelligence</div>
        </div>
      </aside>
    );
  }

  return (
    <aside style={panelRoot}>
      <div style={panelHeader}>
        <div>
          <div style={eyebrow}>{getPrettyType(asset)}</div>
          <h3 style={panelTitle}>{getAssetName(asset)}</h3>
          <div style={subTitle}>{projectName}</div>
        </div>
        <button type="button" style={closeButton} onClick={onClose} aria-label="Close asset intelligence panel">×</button>
      </div>

      <div style={pillRow}>
        <span style={statusPill}>{String(
          isDp(asset)
            ? read(item, ["dpDetails.buildStatus"], null) ||
              item?.dpDetails?.buildStatus ||
              item?.properties?.dpDetails?.buildStatus ||
              read(item, ["status", "buildStatus", "dpStatus", "serviceStatus"], "Live / Unknown")
            : read(item, ["status", "dpStatus", "serviceStatus"], "Live / Unknown"),
        )}</span>
        {isCable(asset) && <span style={typePill}>{String(read(item, ["installMethod", "method", "routeType"], "Route"))}</span>}
      </div>

      <PanelSection title="Asset Actions">
        <div style={operationsGrid}>
          <button type="button" style={operationButton} onClick={() => onSelectAsset?.(asset)}>Select</button>
          <button type="button" style={operationButton} onClick={() => onZoomAsset?.(asset)}>Zoom</button>
          <button type="button" style={operationButton} onClick={onOpenQA}>QA</button>
          {selectedAuditTemplate ? (
            <button type="button" style={liveOperationButton} onClick={() => setAuditOpen(true)}>Audit</button>
          ) : null}
          {isJoint(asset) ? (
            <button type="button" style={operationButton} onClick={() => onOpenJointEditor?.(asset)}>Open Joint</button>
          ) : null}
          {isDuct(asset) ? (
            <button type="button" style={liveOperationButton} onClick={() => onOpenDuctEditor?.(asset)}>Open Duct Editor</button>
          ) : null}
          {selectedAssetType.dp ? (
            <button type="button" style={liveOperationButton} onClick={() => onOpenDistributionPointEditor?.(asset)}>
              Open DP
            </button>
          ) : null}
          {canChangeDpStatus ? (
            <>
              <button type="button" style={liveOperationButton} onClick={() => applyDpStatus("Live")}>Set Live</button>
              <button type="button" style={operationButton} onClick={() => applyDpStatus("BWIP")}>Set BWIP</button>
              <select
                aria-label="More DP status actions"
                defaultValue=""
                style={statusActionSelect}
                onChange={(event) => {
                  const nextStatus = event.target.value as OperationalDpStatus | "";
                  event.currentTarget.value = "";
                  if (!nextStatus) return;
                  applyDpStatus(nextStatus);
                }}
              >
                <option value="">More status...</option>
                <option value="Live not ready for service">Set LNRFS</option>
                <option value="Unserviceable">Set Unserviceable</option>
              </select>
            </>
          ) : null}
          <button type="button" style={operationButton} onClick={() => copyText(getAssetCopyText(asset))}>Copy Info</button>
          <button type="button" style={dangerOperationButton} onClick={onClose}>Clear</button>
        </div>
      </PanelSection>

      <PanelSection title="Engineering Decision Support">
        {engineeringRecommendations.length ? (
          <div style={recommendationList}>
            {engineeringRecommendations.map((recommendation) => (
              <div key={recommendation} style={recommendationRow}>✓ {recommendation}</div>
            ))}
          </div>
        ) : (
          <div style={goodState}>No immediate engineering actions suggested for this asset.</div>
        )}
      </PanelSection>

      {isCable(asset) && (
        <PanelSection title="Cable Intelligence">
          <InfoRow label="Cable ID" value={read(item, ["cableId", "cableName", "name", "id"])} />
          <InfoRow label="Cable Type" value={read(item, ["cableType", "type", "assetType"])} />
          <InfoRow label="Fibre Count" value={read(item, ["fibreCount", "fiberCount", "coreCount", "size"])} />
          <InfoRow label="Used Fibres" value={cablePath.usedFibres ?? read(item, ["usedFibres", "usedFibers", "usedCoreCount", "fibresUsed"])} />
          <InfoRow label="Route Length" value={formatDistanceMeters(routeLength(asset))} />
          <InfoRow
            label="PIA / NOI"
            value={readNested(item, [
              "piaNoiNumber",
              "piaNOINumber",
              "noiNumber",
              "piaNoi",
              "pia",
              "noi",
              "piaStatus",
              "properties.piaNoiNumber",
              "properties.piaNOINumber",
              "properties.noiNumber",
              "properties.piaNoi",
              "properties.pia",
              "properties.noi",
              "properties.piaStatus",
            ])}
          />
        </PanelSection>
      )}

      {isDesignCable(asset) && (
        <PanelSection title="Cable Path Intelligence">
          <InfoRow label="Path Health" value={cablePath.pathHealth} />
          <InfoRow label="Upstream" value={cablePath.upstreamAsset ? getAssetName(cablePath.upstreamAsset) : "—"} />
          <InfoRow label="Downstream" value={cablePath.downstreamAsset ? getAssetName(cablePath.downstreamAsset) : "—"} />
          <InfoRow label="Parent Cable" value={cablePath.parentCable ? getAssetName(cablePath.parentCable) : "—"} />
          <InfoRow label="Upstream Chain" value={cablePath.upstreamChain.length} />
          <InfoRow label="Downstream Chain" value={cablePath.downstreamChain.length} />
          <InfoRow label="Branch Cables" value={cablePath.branchCables.length} />
          <InfoRow label="Connected Joints" value={cablePath.connectedJoints.length} />
          <InfoRow label="Connected DPs" value={cablePath.connectedDps.length} />
          <InfoRow label="Connected Homes" value={cablePath.connectedHomes.length} />
          <InfoRow label="Used / Capacity" value={cablePath.fibreCapacity === null && cablePath.usedFibres === null ? "—" : `${cablePath.usedFibres ?? "?"} / ${cablePath.fibreCapacity ?? "?"}`} />
          <InfoRow label="Remaining Fibres" value={cablePath.remainingFibres === null ? "—" : cablePath.remainingFibres} />
          <InfoRow label="Utilisation" value={cablePath.utilisationPercent === null ? "—" : `${cablePath.utilisationPercent}%`} />
          <InfoRow label="Route Length" value={formatDistanceMeters(cablePath.routeLengthMeters)} />
          <InfoRow label="Spans" value={cablePath.spanCount} />
          <InfoRow label="Longest Span" value={formatDistanceMeters(cablePath.longestSpanMeters)} />
          <InfoRow label="Average Span" value={formatDistanceMeters(cablePath.averageSpanMeters)} />
          <InfoRow label="Start Snap Gap" value={formatDistanceMeters(cablePath.endpointGapStartMeters)} />
          <InfoRow label="End Snap Gap" value={formatDistanceMeters(cablePath.endpointGapEndMeters)} />
          <InfoRow label="Endpoint Status" value={cablePath.endpointSnapStatus} />

          <MiniWarningList warnings={cablePath.routeWarnings} />
          <MiniAssetList title="Route Assets" assets={cablePath.nearbyRouteAssets} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="Connected Joints" assets={cablePath.connectedJoints} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="Pass-through / Branch Joints" assets={cablePath.passThroughJoints} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="Parent / Upstream Cables" assets={cablePath.upstreamChain} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="Downstream Cables" assets={cablePath.downstreamChain} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="Branch Cables" assets={cablePath.branchCables} onSelectAsset={onSelectAsset} />
          <MiniAssetList title="DPs Fed / Nearby" assets={cablePath.connectedDps} onSelectAsset={onSelectAsset} />
        </PanelSection>
      )}

      {isJoint(asset) && (
        <PanelSection title="Joint Intelligence">
          <InfoRow label="Joint Type" value={jointInfo.jointType} />
          <InfoRow label="Trays / Rows" value={jointInfo.trayRows} />
          <InfoRow label="Splice Count" value={jointInfo.spliceCount} />
          <InfoRow label="Fibres Used" value={jointInfo.usedFibres} />
          <InfoRow label="Imported Files" value={jointInfo.importedFiles} />
          <InfoRow label="Updated By" value={jointInfo.updatedBy} />
        </PanelSection>
      )}

      {isDp(asset) && (
        <PanelSection title="DP / CBT / AFN Intelligence">
          <InfoRow label="DP Type" value={dpInfo.dpType} />
          <InfoRow label="Connected Homes" value={dpInfo.connectedHomes} />
          <InfoRow label="Capacity" value={dpInfo.capacity} />
          <InfoRow label="Used Ports" value={dpInfo.usedPorts} />
          <InfoRow label="Free Ports" value={dpInfo.freePorts} />
          <InfoRow label="Capacity %" value={dpInfo.capacityPercent} />
          <InfoRow label="Capacity Warning" value={dpInfo.capacityWarning} />
          <InfoRow label="Splitter Ratio" value={dpInfo.splitterRatio} />
          <InfoRow label="Service Status" value={dpInfo.status} />
          <InfoRow label="Through Cable" value={dpInfo.throughCable} />
          <InfoRow label="Fibres" value={dpInfo.fibres} />
        </PanelSection>
      )}

      {sbFibreAllocation && (
        <SbFibreAllocationPanel allocation={sbFibreAllocation} />
      )}

      {(isPole(asset) || isChamber(asset) || isCabinet(asset)) && (
        <PanelSection title="Civil / Access Intelligence">
          <InfoRow label="Asset Type" value={read(item, ["assetType", "type", "jointType"])} />
          <InfoRow label="Reference" value={read(item, ["reference", "ref", "name", "id"])} />
          <InfoRow label="Install Status" value={read(item, ["status", "buildStatus", "surveyStatus"])} />
          <InfoRow label="Owner" value={read(item, ["owner", "networkOwner"])} />
          <InfoRow label="Condition" value={read(item, ["condition", "conditionStatus"])} />
        </PanelSection>
      )}

      {!isCable(asset) && !isJoint(asset) && !isDp(asset) && !isPole(asset) && !isChamber(asset) && !isCabinet(asset) && (
        <PanelSection title="Asset Details">
          <InfoRow label="Asset Type" value={read(item, ["assetType", "type", "jointType"])} />
          <InfoRow label="Name" value={read(item, ["name", "label", "id"])} />
          <InfoRow label="Status" value={read(item, ["status", "buildStatus", "surveyStatus"])} />
          <InfoRow label="Updated By" value={read(item, ["updatedByEmail", "updatedBy", "lastEditedBy"])} />
        </PanelSection>
      )}

      <PanelSection title="Maintenance Snapshot">
        <InfoRow label="Last Updated" value={read(item, ["updatedAt", "lastEditedAt", "modifiedAt", "createdAt"])} />
        <InfoRow label="Updated By" value={read(item, ["updatedByEmail", "updatedBy", "lastEditedBy", "createdByEmail"])} />
        <InfoRow label="Reason" value={read(item, ["lastChangeReason", "changeReason", "reason", "maintenanceReason"])} />
        <InfoRow label="Notes" value={read(item, ["maintenanceNotes", "notes", "comment", "description"])} />
      </PanelSection>

      <AuditPaymentBlockerPanel
        assetId={asset.id}
        refreshKey={auditHistoryRefreshKey}
      />

      <AuditHistoryPanel
        assetId={asset.id}
        refreshKey={auditHistoryRefreshKey}
      />

      <PanelSection title="Operational QA">
        <div style={severityGrid}>
          <SeverityCard label="High" value={severityCounts.high} tone="high" />
          <SeverityCard label="Medium" value={severityCounts.medium} tone="medium" />
          <SeverityCard label="Low" value={severityCounts.low} tone="low" />
        </div>

        {selectedQaIssues.length ? (
          <div style={qaIssueList}>
            {selectedQaIssues.slice(0, 8).map((issue, index) => (
              <div key={`${issue.assetId}-${issue.issue}-${index}`} style={qaIssueRow}>
                <div style={qaIssueTopLine}>
                  <span style={severityStyle(issue.severity)}>{severityLabel(issue.severity)}</span>
                  <span style={categoryPill}>{issue.category || "audit"}</span>
                </div>
                <div style={qaIssueText}>{issue.issue}</div>
              </div>
            ))}
            {selectedQaIssues.length > 8 ? (
              <div style={mutedText}>+{selectedQaIssues.length - 8} more QA issue{selectedQaIssues.length - 8 === 1 ? "" : "s"}</div>
            ) : null}
          </div>
        ) : (
          <div style={goodState}>No area-audit issues for this selected asset.</div>
        )}
      </PanelSection>

      <PanelSection title="Workspace Flags">
        {qaFlags.length ? (
          <div style={flagList}>
            {qaFlags.map((flag) => <div key={flag} style={flagRow}>⚠ {flag}</div>)}
          </div>
        ) : (
          <div style={goodState}>No immediate workspace flags.</div>
        )}
      </PanelSection>

      <div style={actionRow}>
        <button type="button" style={secondaryButton} onClick={onOpenQA}>Run QA</button>
      </div>

      <AuditModal
        open={auditOpen}
        title={selectedAuditTemplate?.title || "Asset Audit"}
        onClose={() => setAuditOpen(false)}
      >
        {selectedAuditTemplate ? (
          <AuditFormEngine
            template={selectedAuditTemplate}
            assetId={asset.id}
            assetName={getAssetName(asset)}
            areaName={projectName}
            onClose={() => setAuditOpen(false)}
            onSave={async (audit) => {
              await createAuditFormLog({
                asset,
                auditType: audit.auditType,
                auditTitle: selectedAuditTemplate.title,
                result: audit.result,
                answers: audit.answers || {},
                comments: audit.comments,
                signature: audit.signature,
                photos: audit.photos || [],
              });
              setAuditHistoryRefreshKey((current) => current + 1);
              setAuditOpen(false);
            }}
          />
        ) : null}
      </AuditModal>
    </aside>
  );
}

function SeverityCard({ label, value, tone }: { label: string; value: number; tone: AuditSeverity }) {
  const style = tone === "high" ? severityCardHigh : tone === "medium" ? severityCardMedium : severityCardLow;

  return (
    <div style={style}>
      <div style={severityCardLabel}>{label}</div>
      <div style={severityCardValue}>{value}</div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionWrap}>
      <h4 style={sectionTitle}>{title}</h4>
      {children}
    </section>
  );
}


function MiniAssetList({ title, assets, onSelectAsset }: { title: string; assets: SavedMapAsset[]; onSelectAsset?: (asset: SavedMapAsset) => void }) {
  if (!assets.length) return null;

  return (
    <div style={miniListWrap}>
      <div style={miniListTitle}>{title}</div>
      {assets.slice(0, 8).map((asset) => (
        <button key={asset.id} type="button" style={miniAssetButtonRow} onClick={() => onSelectAsset?.(asset)}>
          <span style={miniAssetType}>{getPrettyType(asset)}</span>
          <span style={miniAssetName}>{getAssetName(asset)}</span>
        </button>
      ))}
      {assets.length > 8 ? <div style={mutedText}>+{assets.length - 8} more</div> : null}
    </div>
  );
}

function MiniWarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return <div style={goodState}>No cable path warnings detected.</div>;

  return (
    <div style={miniWarningWrap}>
      {warnings.slice(0, 6).map((warning) => (
        <div key={warning} style={miniWarningRow}>⚠ {warning}</div>
      ))}
      {warnings.length > 6 ? <div style={mutedText}>+{warnings.length - 6} more warning{warnings.length - 6 === 1 ? "" : "s"}</div> : null}
    </div>
  );
}

function SbFibreAllocationPanel({ allocation }: { allocation: SbFibreAllocation }) {
  return (
    <PanelSection title="SB Fibre Allocation / Passthrough">
      <InfoRow label="Source" value={allocation.chainPosition} />
      <InfoRow label="Through Cable" value={allocation.throughCableName || "—"} />
      <InfoRow label="Cable Capacity" value={allocation.fibreCapacity || "—"} />
      <InfoRow label="Splitter Ratio" value={allocation.splitterRatio} />
      <InfoRow label="Homes Served" value={allocation.connectedHomes} />
      <InfoRow label="Used Here" value={formatFibreList(allocation.localFibres)} />
      <InfoRow label="Passthrough Downstream" value={allocation.passthroughRows.length ? formatFibreList(allocation.passthroughRows.map((row) => row.fibre)) : "None"} />
      <InfoRow label="Allocated Upstream" value={allocation.upstreamRows.length ? formatFibreList(allocation.upstreamRows.map((row) => row.fibre)) : "None"} />
      <InfoRow label="True Spare" value={allocation.spareRows.length ? formatFibreList(allocation.spareRows.map((row) => row.fibre)) : "None"} />

      {allocation.warnings.length ? (
        <div style={miniWarningWrap}>
          {allocation.warnings.map((warning) => (
            <div key={warning} style={miniWarningRow}>⚠ {warning}</div>
          ))}
        </div>
      ) : null}

      <div style={sbFibreTable}>
        <div style={sbFibreHeader}>Fibre</div>
        <div style={sbFibreHeader}>Use</div>
        <div style={sbFibreHeader}>Destination</div>

        {allocation.rows.slice(0, 96).map((row) => {
          const cellStyle =
            row.role === "LOCAL"
              ? sbFibreLocalCell
              : row.role === "PASSTHROUGH"
                ? sbFibrePassthroughCell
                : row.role === "UPSTREAM"
                  ? sbFibreUpstreamCell
                  : sbFibreSpareCell;
          const roleLabel =
            row.role === "LOCAL"
              ? "Used here"
              : row.role === "PASSTHROUGH"
                ? "Passthrough downstream"
                : row.role === "UPSTREAM"
                  ? "Allocated upstream"
                  : "True spare";

          return (
            <React.Fragment key={`${row.fibre}-${row.role}-${row.destinationAssetId}`}>
              <div style={cellStyle}>F{row.fibre}</div>
              <div style={cellStyle}>{roleLabel}</div>
              <div style={cellStyle}>
                {row.destinationName}
                {row.sourceAssetName ? (
                  <div style={mutedText}>Source: {row.sourceAssetName}</div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}

        {allocation.rows.length > 96 ? (
          <div style={sbFibreMoreCell}>+{allocation.rows.length - 96} more fibre rows hidden</div>
        ) : null}
      </div>
    </PanelSection>
  );
}

function InfoRow({ label, value }: { label: string; value: RowValue }) {
  return (
    <div style={infoRow}>
      <span style={infoLabel}>{label}</span>
      <strong style={infoValue}>{value === undefined || value === null || value === "" ? "—" : String(value)}</strong>
    </div>
  );
}

// =====================================================
// STYLES
// =====================================================


const recommendationList: React.CSSProperties = {
  display: "grid",
  gap: 7,
};

const recommendationRow: React.CSSProperties = {
  background: "rgba(14, 165, 233, 0.1)",
  border: "1px solid rgba(14, 165, 233, 0.22)",
  borderRadius: 9,
  padding: "9px 10px",
  color: "#dbeafe",
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 700,
};


const panelRoot: React.CSSProperties = {
  minHeight: 260,
  height: "100%",
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 18px 14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(2, 6, 23, 0.18)",
};

const eyebrow: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

const panelTitle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 20,
  lineHeight: 1.12,
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

const subTitle: React.CSSProperties = {
  marginTop: 5,
  color: "#94a3b8",
  fontSize: 12,
};

const closeButton: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "#111827",
  color: "#e5e7eb",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
};

const pillRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  padding: "12px 16px 0",
};

const statusPill: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.26)",
  color: "#86efac",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const typePill: React.CSSProperties = {
  ...statusPill,
  background: "rgba(59,130,246,0.16)",
  border: "1px solid rgba(59,130,246,0.28)",
  color: "#93c5fd",
};

const sectionWrap: React.CSSProperties = {
  padding: "16px 18px 0",
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 9px",
  color: "#e5e7eb",
  fontSize: 13,
  fontWeight: 900,
};

const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
  fontSize: 12,
};

const infoLabel: React.CSSProperties = {
  color: "#94a3b8",
};

const infoValue: React.CSSProperties = {
  color: "#f8fafc",
  textAlign: "right",
  maxWidth: 150,
  overflowWrap: "anywhere",
};

const mutedText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

const goodState: React.CSSProperties = {
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.16)",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const miniListWrap: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const miniListTitle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.35,
};

const miniAssetRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "82px 1fr",
  gap: 8,
  alignItems: "center",
  background: "rgba(2, 6, 23, 0.36)",
  border: "1px solid rgba(148, 163, 184, 0.10)",
  borderRadius: 8,
  padding: "7px 8px",
};
const miniAssetButtonRow: React.CSSProperties = {
  ...miniAssetRow,
  width: "100%",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const miniWarningWrap: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const miniWarningRow: React.CSSProperties = {
  background: "rgba(251,191,36,0.10)",
  border: "1px solid rgba(251,191,36,0.20)",
  color: "#fde68a",
  borderRadius: 8,
  padding: "7px 8px",
  fontSize: 11,
  fontWeight: 850,
};


const miniAssetType: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 10,
  fontWeight: 900,
};

const miniAssetName: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 11,
  fontWeight: 850,
  overflowWrap: "anywhere",
};

const flagList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const flagRow: React.CSSProperties = {
  background: "rgba(251,191,36,0.10)",
  border: "1px solid rgba(251,191,36,0.20)",
  color: "#fde68a",
  borderRadius: 8,
  padding: "8px 9px",
  fontSize: 12,
  fontWeight: 800,
};


const operationsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const operationButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.20)",
  background: "rgba(17, 24, 39, 0.92)",
  color: "#e5e7eb",
  borderRadius: 10,
  padding: "10px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const dangerOperationButton: React.CSSProperties = {
  ...operationButton,
  border: "1px solid rgba(248, 113, 113, 0.25)",
  background: "rgba(127, 29, 29, 0.38)",
  color: "#fecaca",
};

const liveOperationButton: React.CSSProperties = {
  ...operationButton,
  border: "1px solid rgba(34, 197, 94, 0.3)",
  background: "rgba(20, 83, 45, 0.38)",
  color: "#bbf7d0",
};

const warningOperationButton: React.CSSProperties = {
  ...operationButton,
  border: "1px solid rgba(251, 191, 36, 0.3)",
  background: "rgba(113, 63, 18, 0.38)",
  color: "#fde68a",
};

const statusActionSelect: React.CSSProperties = {
  ...operationButton,
  border: "1px solid rgba(251, 191, 36, 0.28)",
  background: "rgba(17, 24, 39, 0.96)",
  color: "#fde68a",
  appearance: "auto",
};

const severityGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  marginBottom: 10,
};

const severityCardBase: React.CSSProperties = {
  borderRadius: 9,
  padding: "9px 10px",
  minHeight: 58,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const severityCardHigh: React.CSSProperties = {
  ...severityCardBase,
  background: "rgba(127,29,29,0.82)",
  border: "1px solid rgba(248,113,113,0.25)",
};

const severityCardMedium: React.CSSProperties = {
  ...severityCardBase,
  background: "rgba(120,53,15,0.82)",
  border: "1px solid rgba(251,191,36,0.22)",
};

const severityCardLow: React.CSSProperties = {
  ...severityCardBase,
  background: "rgba(30,58,138,0.82)",
  border: "1px solid rgba(147,197,253,0.20)",
};

const severityCardLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: "#e5e7eb",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const severityCardValue: React.CSSProperties = {
  fontSize: 23,
  fontWeight: 950,
  color: "#ffffff",
};

const qaIssueList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const qaIssueRow: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.12)",
  borderRadius: 9,
  padding: "9px 10px",
};

const qaIssueTopLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 7,
};

const qaIssueText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 850,
  color: "#f8fafc",
  lineHeight: 1.35,
};

const severityPillBase: React.CSSProperties = {
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 10,
  fontWeight: 950,
  textTransform: "uppercase",
};

const highSeverityPill: React.CSSProperties = {
  ...severityPillBase,
  background: "rgba(239,68,68,0.18)",
  border: "1px solid rgba(248,113,113,0.32)",
  color: "#fecaca",
};

const mediumSeverityPill: React.CSSProperties = {
  ...severityPillBase,
  background: "rgba(245,158,11,0.16)",
  border: "1px solid rgba(251,191,36,0.28)",
  color: "#fde68a",
};

const lowSeverityPill: React.CSSProperties = {
  ...severityPillBase,
  background: "rgba(59,130,246,0.16)",
  border: "1px solid rgba(147,197,253,0.24)",
  color: "#bfdbfe",
};

const categoryPill: React.CSSProperties = {
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 10,
  fontWeight: 850,
  background: "rgba(148,163,184,0.12)",
  border: "1px solid rgba(148,163,184,0.18)",
  color: "#cbd5e1",
};



const sbFibreTable: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 110px 1fr",
  gap: 0,
  marginTop: 10,
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.16)",
};

const sbFibreHeader: React.CSSProperties = {
  padding: "8px 9px",
  background: "rgba(15, 23, 42, 0.92)",
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
};

const sbFibreCellBase: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  fontWeight: 800,
  borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
};

const sbFibrePassthroughCell: React.CSSProperties = {
  ...sbFibreCellBase,
  color: "#bfdbfe",
  background: "rgba(59, 130, 246, 0.08)",
};

const sbFibreLocalCell: React.CSSProperties = {
  ...sbFibreCellBase,
  color: "#bbf7d0",
  background: "rgba(34, 197, 94, 0.10)",
};

const sbFibreUpstreamCell: React.CSSProperties = {
  ...sbFibreCellBase,
  color: "#fed7aa",
  background: "rgba(249, 115, 22, 0.10)",
};

const sbFibreSpareCell: React.CSSProperties = {
  ...sbFibreCellBase,
  color: "#cbd5e1",
  background: "rgba(100, 116, 139, 0.08)",
};

const sbFibreMoreCell: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: "9px 10px",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(15, 23, 42, 0.72)",
};

const actionRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  padding: 16,
  marginTop: "auto",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid rgba(59,130,246,0.35)",
  background: "#1e3a8a",
  color: "#eff6ff",
  borderRadius: 8,
  padding: "9px 10px",
  cursor: "pointer",
  fontWeight: 900,
};

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.22)",
};

const emptyState: React.CSSProperties = {
  minHeight: 260,
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: 22,
};

const emptyIcon: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  background: "#2563eb",
  display: "grid",
  placeItems: "center",
  fontSize: 30,
  fontWeight: 900,
};

const hintBox: React.CSSProperties = {
  marginTop: 6,
  color: "#cbd5e1",
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};
