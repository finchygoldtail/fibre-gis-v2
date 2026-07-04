// =====================================================
// FILE: DistributionPointEditor.tsx
// PURPOSE: Dedicated operational editor for DPs / CBTs / AFNs / MDUs.
//          This is NOT the FibreTrayEditor. FibreTrayEditor remains for
//          CMJ / LMJ / MMJ splice continuity only.
// DP Operational Fibre Routing.
// =====================================================

import { getDistanceMeters as distanceMeters } from "../../utils/mapMeasure";
import React, { useEffect, useMemo, useState } from "react";
import type { DistributionPointDetails, SavedMapAsset } from "../map/types";
import { buildDpRoutingState, buildNetworkState } from "../../services/network";
import { getDpCapacityStateColour, getDpCapacitySummary } from "../../services/dpIntelligence";
import CapacityPanel from "./dp/CapacityPanel";
import RoutePanel from "./dp/RoutePanel";
import ConnectedHomesPanel from "./dp/ConnectedHomesPanel";
import FibreIntakePanel from "./dp/FibreIntakePanel";
import { useDeviceLayout } from "../map/responsive/useDeviceLayout";

type ConnectedHomeRow = {
  id: string;
  name: string;
  status: string;
  port?: number | string;
  dpId?: string;
};

type PortRoute = {
  port: number;
  routeType: "splitter" | "direct" | "splice" | "passthrough" | "spare";
  fibre?: number;
  fibreLabel?: string;
  fibreColour?: string;
  fibreTextColour?: string;
  home?: ConnectedHomeRow;
  cable?: SavedMapAsset | null;
};

type Props = {
  asset: SavedMapAsset | null;
  allAssets?: SavedMapAsset[];
  onClose?: () => void;
  onOpenTopology?: () => void;
  onSaveRouting?: (args: {
    asset: SavedMapAsset;
    nextDetails: DistributionPointDetails;
    note: string;
  }) => void;
};

type FibreColour = {
  name: string;
  colour: string;
  textColour: string;
};

type DraftRouting = {
  splitterFibres: number[];
  directFibres: number[];
  spliceFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  hasDownstreamCable: boolean;
};

type FibreViewMode =
  | "splitter"
  | "used"
  | "splice"
  | "passthrough"
  | "allocated"
  | "spare";

type ParentFibreMapping = {
  parentFibre: number;
  localFibre: number;
  parentAssetName?: string;
  childAssetName?: string;
};

type SbToSbFibreRoute = {
  id?: string;
  fromSbId?: string;
  fromSbName?: string;
  toSbId?: string;
  toSbName?: string;
  parentFibres?: number[];
  localFibres?: number[];
  supportingCableId?: string;
  supportingCableName?: string;
  note?: string;
};

function getStoredSbToSbRoutes(details: any): SbToSbFibreRoute[] {
  const routes = details?.afnDetails?.sbToSbRoutes;
  return Array.isArray(routes) ? routes : [];
}

function findStoredSbToSbRouteForAsset(details: any, asset: SavedMapAsset | null): SbToSbFibreRoute | null {
  const routes = getStoredSbToSbRoutes(details);
  if (!routes.length) return null;

  const assetRefs = [
    (asset as any)?.id,
    (asset as any)?.assetId,
    (asset as any)?.name,
    (asset as any)?.jointName,
    (asset as any)?.label,
  ].map(normaliseRef).filter(Boolean);

  return (
    routes.find((route) => {
      const toRefs = [route.toSbId, route.toSbName].map(normaliseRef).filter(Boolean);
      if (!toRefs.length) return true;
      return toRefs.some((ref) => assetRefs.some((assetRef) => refsMatch(ref, assetRef)));
    }) || routes[0]
  );
}

// =====================================================
// INTERNATIONAL / IEC 12-FIBRE COLOUR CODE
// Repeats every 12 fibres:
// 1 Blue, 2 Orange, 3 Green, 4 Brown, 5 Slate/Grey, 6 White,
// 7 Red, 8 Black, 9 Yellow, 10 Violet, 11 Pink/Rose, 12 Turquoise/Aqua.
// =====================================================
const FIBRE_COLOURS: FibreColour[] = [
  { name: "Blue", colour: "#2563eb", textColour: "#ffffff" },
  { name: "Orange", colour: "#f97316", textColour: "#111827" },
  { name: "Green", colour: "#22c55e", textColour: "#052e16" },
  { name: "Brown", colour: "#92400e", textColour: "#ffffff" },
  { name: "Slate", colour: "#94a3b8", textColour: "#020617" },
  { name: "White", colour: "#f8fafc", textColour: "#020617" },
  { name: "Red", colour: "#ef4444", textColour: "#ffffff" },
  { name: "Black", colour: "#111827", textColour: "#ffffff" },
  { name: "Yellow", colour: "#facc15", textColour: "#422006" },
  { name: "Violet", colour: "#a855f7", textColour: "#ffffff" },
  { name: "Pink", colour: "#ec4899", textColour: "#ffffff" },
  { name: "Turquoise", colour: "#06b6d4", textColour: "#042f2e" },
];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalise(value: unknown): string {
  return text(value).toLowerCase();
}

function normaliseRef(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsMatch(a: unknown, b: unknown): boolean {
  const left = normaliseRef(a);
  const right = normaliseRef(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values.map(Number).filter(Number.isFinite))).sort(
    (a, b) => a - b,
  );
}
function clampFibres(values: number[], maxFibre: number): number[] {
  return uniqueSorted(
    values.filter(
      (fibre) =>
        Number.isFinite(fibre) &&
        fibre >= 1 &&
        fibre <= maxFibre
    )
  );
}
function getFibreColour(fibreNumber: number): FibreColour {
  const index = Math.max(0, (Number(fibreNumber) - 1) % FIBRE_COLOURS.length);
  return FIBRE_COLOURS[index];
}

function buildParentFibreMappings(
  parentFibres: number[],
  localFibres: number[],
): ParentFibreMapping[] {
  const parents = uniqueSorted(parentFibres);
  const locals = uniqueSorted(localFibres);

  if (!parents.length || !locals.length) return [];

  const count = Math.min(parents.length, locals.length);
  const mappings = Array.from({ length: count }, (_, index) => ({
    parentFibre: parents[index],
    localFibre: locals[index],
  })).filter((row) => row.parentFibre !== row.localFibre);

  return mappings;
}

function parentFibreForLocalFibre(
  mappings: ParentFibreMapping[],
  localFibre: number,
): number | null {
  const match = mappings.find((row) => row.localFibre === localFibre);
  return match ? match.parentFibre : null;
}

function formatLocalFibreWithParent(
  localFibre: number,
  mappings: ParentFibreMapping[],
): string {
  const parentFibre = parentFibreForLocalFibre(mappings, localFibre);
  return parentFibre ? `F${parentFibre} → F${localFibre}` : `F${localFibre}`;
}


type AssetPoint = { lat: number; lng: number };

function getAssetPoint(asset: SavedMapAsset | null | undefined): AssetPoint | null {
  const item = asset as any;
  if (!item) return null;
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { lat: item.lat, lng: item.lng };
  }
  const coords = item.geometry?.coordinates;
  if (item.geometry?.type === "Point" && Array.isArray(coords)) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function getCableLinePoints(asset: SavedMapAsset | null | undefined): AssetPoint[] {
  const coords = (asset as any)?.geometry?.coordinates;
  if ((asset as any)?.geometry?.type !== "LineString" || !Array.isArray(coords)) return [];
  return coords
    .map((coord: any) => ({ lat: Number(coord?.[0]), lng: Number(coord?.[1]) }))
    .filter((point: AssetPoint) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function findParentDpForBranchCable(
  currentAsset: SavedMapAsset | null,
  throughCable: SavedMapAsset | null | undefined,
  allAssets: SavedMapAsset[],
): SavedMapAsset | null {
  if (!currentAsset || !throughCable) return null;
  const line = getCableLinePoints(throughCable);
  if (line.length < 2) return null;

  const start = line[0];
  const end = line[line.length - 1];

  const candidates = allAssets
    .filter((candidate) => candidate.id !== currentAsset.id)
    .filter((candidate) => isNavigableDistributionPoint(candidate))
    .map((candidate) => {
      const point = getAssetPoint(candidate);
      if (!point) return null;
      const minEndpointDistance = Math.min(
        distanceMeters(point, start),
        distanceMeters(point, end),
      );
      return { candidate, minEndpointDistance };
    })
    .filter((item): item is { candidate: SavedMapAsset; minEndpointDistance: number } => Boolean(item))
    .filter((item) => item.minEndpointDistance <= 28)
    .sort((a, b) => a.minEndpointDistance - b.minEndpointDistance);

  return candidates[0]?.candidate || null;
}

function getAssetTitle(asset: SavedMapAsset | null): string {
  const item = asset as any;
  return text(
    item?.name ||
      item?.jointName ||
      item?.label ||
      item?.assetId ||
      item?.id ||
      "Distribution Point",
  );
}

function getDpDetails(asset: SavedMapAsset | null): any {
  const item = asset as any;
  return item?.dpDetails || item?.properties?.dpDetails || {};
}

function getClosureType(asset: SavedMapAsset | null): string {
  const item = asset as any;
  const details = getDpDetails(asset);
  return text(
    details.closureType ||
      details.networkArchitecture ||
      item?.closureType ||
      item?.dpType ||
      item?.distributionPointType ||
      item?.jointType ||
      "CBT",
  ).toUpperCase();
}

function getOperationalStatus(asset: SavedMapAsset | null): string {
  const item = asset as any;
  const details = getDpDetails(asset);
  return text(
    details.buildStatus ||
      item?.buildStatus ||
      item?.status ||
      item?.serviceStatus ||
      item?.dpStatus ||
      "Planned",
  );
}

function getSbSortNumber(asset: SavedMapAsset | null | undefined): number | null {
  const title = getAssetTitle(asset || null);
  const match = title.match(/\bSB\s*0*(\d+)\b/i) || title.match(/SB0*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function getSbRunPrefix(asset: SavedMapAsset | null | undefined): string {
  const title = getAssetTitle(asset || null).toUpperCase();
  const match = title.match(/^(.*?)-?SB\s*0*\d+\b/i);
  if (match?.[1]) return normaliseRef(match[1]);
  return normaliseRef(title.replace(/SB\s*0*\d+.*$/i, ""));
}

function isNavigableDistributionPoint(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const title = getAssetTitle(asset).toUpperCase();
  const closure = getClosureType(asset);
  const item = asset as any;

  // Navigation must only step between real DP / AFN / CBT / MDU assets.
  // Drop cables include names like "SB01 Drop → UPRN", so a simple SB01
  // name match incorrectly jumps into a drop cable. Exclude line/drop/home assets
  // before checking SB naming.
  if (isDropCable(asset) || isHome(asset)) return false;
  if (asset.geometry?.type === "LineString") return false;

  const haystack = [
    title,
    closure,
    item?.assetType,
    item?.type,
    item?.dpType,
    item?.distributionPointType,
    item?.jointType,
    item?.closureType,
  ]
    .map(text)
    .join(" ")
    .toUpperCase();

  const looksLikeDp =
    haystack.includes("AFN") ||
    haystack.includes("CBT") ||
    haystack.includes("MDU") ||
    haystack.includes("DISTRIBUTION");

  const hasSbName = /\bSB\s*0*\d+\b/i.test(title) || /SB0*\d+/i.test(title);

  return looksLikeDp || hasSbName;
}

function getFibreCountFromCable(
  asset: SavedMapAsset | null | undefined,
): number {
  const item = asset as any;
  if (!item) return 0;

  const haystack = [
    item?.fibreCount,
    item?.fiberCount,
    item?.coreCount,
    item?.size,
    item?.name,
    item?.cableId,
    item?.cableName,
    item?.label,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");

  const match = haystack.match(/(?:^|[^0-9])(288|144|96|48|36|24|12)\s*F?(?:[^0-9]|$)/i);

  // Do not invent a 144F cable when the through-cable cannot be read.
  // Showing Unknown is safer than making SB/DP fibre intake look wrong.
  return match ? Number(match[1]) : 0;
}

function isHome(asset: SavedMapAsset): boolean {
  if (!asset || asset.geometry?.type === "LineString" || isDropCable(asset)) return false;

  const item = asset as any;
  const haystack = [
    item.assetType,
    item.type,
    item.homeType,
    item.name,
    item.label,
  ]
    .map(normalise)
    .join(" ");

  return (
    haystack.includes("home") ||
    haystack.includes("premise") ||
    haystack.includes("sdu") ||
    haystack.includes("mdu") ||
    haystack.includes("flat") ||
    Boolean(item.uprn || item.UPRN || item.properties?.UPRN)
  );
}

function isDropCable(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const haystack = [
    item.assetType,
    item.type,
    item.cableType,
    item.name,
    item.label,
    item.generatedBy,
  ]
    .map(normalise)
    .join(" ");

  return (
    asset.geometry?.type === "LineString" &&
    (haystack.includes("drop") ||
      item.isDropCable === true ||
      item.isHomeDrop === true ||
      item.generatedDrop === true ||
      item.autoGeneratedDrop === true ||
      Boolean(item.homeId || item.connectedHomeId || item.toHomeId))
  );
}

function assetKeys(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.dpId,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}

function homeKey(asset: any): string {
  return text(
    asset?.homeId ||
      asset?.connectedHomeId ||
      asset?.toHomeId ||
      asset?.toAssetId ||
      asset?.uprn ||
      asset?.UPRN ||
      asset?.properties?.UPRN ||
      asset?.id ||
      asset?.assetId,
  ).toLowerCase();
}

function getHomeIdentityKey(asset: any, fallback = ""): string {
  const explicit = text(
    asset?.uprn ||
      asset?.UPRN ||
      asset?.properties?.UPRN ||
      asset?.properties?.uprn ||
      asset?.homeId ||
      asset?.connectedHomeId ||
      asset?.toHomeId ||
      asset?.toAssetId ||
      asset?.address ||
      asset?.fullAddress ||
      "",
  );

  if (explicit) return normaliseRef(explicit);

  const nameText = text(asset?.name || asset?.label || asset?.cableName || "");
  const uprnMatch =
    nameText.match(/UPRN\s*([A-Z0-9]+)/i) ||
    nameText.match(/→\s*UPRN\s*([A-Z0-9]+)/i);

  if (uprnMatch?.[1]) return normaliseRef(uprnMatch[1]);

  const raw = text(
    asset?.fromHomeId ||
      asset?.fromAssetId ||
      asset?.id ||
      asset?.assetId ||
      nameText ||
      fallback,
  );

  return normaliseRef(raw) || text(fallback).toLowerCase();
}

function cableName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return text(
    item?.name ||
      item?.cableId ||
      item?.cableName ||
      item?.label ||
      item?.id ||
      "No cable connected",
  );
}


function isThroughCableCandidate(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  if (asset.geometry?.type !== "LineString") return false;
  if (isDropCable(asset)) return false;

  const item = asset as any;
  const haystack = [
    item.assetType,
    item.type,
    item.cableType,
    item.name,
    item.label,
    item.cableId,
  ]
    .map(normalise)
    .join(" ");

  return (
    haystack.includes("cable") ||
    haystack.includes("ulw") ||
    haystack.includes("feeder") ||
    haystack.includes("link") ||
    haystack.includes("spine") ||
    getFibreCountFromCable(asset) > 0
  );
}

function findCableByReference(
  allAssets: SavedMapAsset[],
  reference: unknown,
): SavedMapAsset | null {
  if (!text(reference) || text(reference) === "No through cable selected") return null;

  return (
    allAssets.find((candidate) =>
      isThroughCableCandidate(candidate) &&
      [
        candidate.id,
        (candidate as any).assetId,
        (candidate as any).name,
        (candidate as any).cableId,
        (candidate as any).cableName,
        (candidate as any).label,
      ]
        .filter(Boolean)
        .some((ref) => refsMatch(ref, reference)),
    ) || null
  );
}

function cableEndpointDistanceToPoint(
  cable: SavedMapAsset | null | undefined,
  point: AssetPoint | null,
): number {
  if (!cable || !point) return Number.POSITIVE_INFINITY;
  const line = getCableLinePoints(cable);
  if (line.length < 2) return Number.POSITIVE_INFINITY;

  return Math.min(distanceMeters(point, line[0]), distanceMeters(point, line[line.length - 1]));
}

function findParentCableForBranchCable(
  branchCable: SavedMapAsset | null | undefined,
  allAssets: SavedMapAsset[],
): SavedMapAsset | null {
  const item = branchCable as any;
  if (!branchCable) return null;

  const parentRefs = [
    item.parentCableId,
    item.parentCableName,
    item.parentCable,
    item.upstreamCableId,
    item.upstreamCableName,
    item.sourceCableId,
    item.sourceCableName,
  ].filter(Boolean);

  for (const ref of parentRefs) {
    const parent = findCableByReference(allAssets, ref);
    if (parent && parent.id !== branchCable.id) return parent;
  }

  return null;
}

function findBranchParentThroughCableForDp(
  dp: SavedMapAsset | null,
  allAssets: SavedMapAsset[],
): SavedMapAsset | null {
  const point = getAssetPoint(dp);
  if (!dp || !point) return null;

  const nearbyBranchCables = allAssets
    .filter(isThroughCableCandidate)
    .map((candidate) => ({
      candidate,
      endpointDistance: cableEndpointDistanceToPoint(candidate, point),
      fibreCount: getFibreCountFromCable(candidate),
      parentCable: findParentCableForBranchCable(candidate, allAssets),
    }))
    .filter((entry) => entry.parentCable && entry.endpointDistance <= 35)
    // Prefer the small branch cable that actually terminates at this SB, then
    // climb to its parent. This catches 12F/24F shoot-offs from a 96F spine.
    .sort((a, b) => {
      const aIsSmallBranch = a.fibreCount > 0 && a.fibreCount <= 24 ? 0 : 1;
      const bIsSmallBranch = b.fibreCount > 0 && b.fibreCount <= 24 ? 0 : 1;
      return aIsSmallBranch - bIsSmallBranch || a.endpointDistance - b.endpointDistance;
    });

  return nearbyBranchCables[0]?.parentCable || null;
}

function findNearestThroughCableForDp(
  dp: SavedMapAsset | null,
  allAssets: SavedMapAsset[],
): SavedMapAsset | null {
  const point = getAssetPoint(dp);
  if (!dp || !point) return null;

  const candidates = allAssets
    .filter(isThroughCableCandidate)
    .map((candidate) => ({
      candidate,
      endpointDistance: cableEndpointDistanceToPoint(candidate, point),
      fibreCount: getFibreCountFromCable(candidate),
    }))
    .filter((entry) => entry.endpointDistance <= 28)
    .sort((a, b) => {
      // Prefer larger spine/feeder cables over drop-sized tails when both touch
      // the same DP marker. This prevents a 12F branch from hiding the 96F
      // parent when no explicit through-cable has been saved yet.
      const fibreScore = b.fibreCount - a.fibreCount;
      return fibreScore || a.endpointDistance - b.endpointDistance;
    });

  return candidates[0]?.candidate || null;
}

function getDropCablesForDp(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
): SavedMapAsset[] {
  const dpLookup = new Set(assetKeys(dp));

  return allAssets.filter((asset: any) => {
    if (!isDropCable(asset)) return false;

    const dropDpKeys = [
      asset.dpId,
      asset.fromAssetId,
      asset.connectedDpId,
      asset.parentDpId,
      asset.sourceAssetId,
    ]
      .map((value) => text(value).toLowerCase())
      .filter(Boolean);

    return dropDpKeys.some((key) => dpLookup.has(key));
  });
}

function getConnectedHomes(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
): ConnectedHomeRow[] {
  const dpLookup = new Set(assetKeys(dp));
  const drops = getDropCablesForDp(dp, allAssets);
  const rowsByHomeKey = new Map<string, ConnectedHomeRow>();

  const addRow = (row: ConnectedHomeRow, key: string) => {
    const safeKey = getHomeIdentityKey(row, key);
    if (!safeKey || rowsByHomeKey.has(safeKey)) return;
    rowsByHomeKey.set(safeKey, row);
  };

  const homeKeysFromDrops = new Set<string>();
  drops.forEach((drop: any, index) => {
    const key = getHomeIdentityKey(drop, `drop-${index}`);
    if (key) homeKeysFromDrops.add(key);
  });

  // Drop cables are the strongest authority for a home's current DP.
  // Address-sheet imports can leave stale home metadata behind, so if a home
  // has a drop to another DP, do not also count it against this DP via old
  // connectedDpId / dpId / parentDpId fields.
  const allDropDpRefsByHomeKey = new Map<string, Set<string>>();
  allAssets
    .filter((candidate) => isDropCable(candidate))
    .forEach((drop: any, index) => {
      const key = getHomeIdentityKey(drop, `drop-${index}`);
      if (!key) return;

      const dpRefs = [
        drop.dpId,
        drop.fromAssetId,
        drop.connectedDpId,
        drop.parentDpId,
        drop.sourceAssetId,
      ]
        .map((value) => text(value).toLowerCase())
        .filter(Boolean);

      if (!dpRefs.length) return;

      const existing = allDropDpRefsByHomeKey.get(key) || new Set<string>();
      dpRefs.forEach((ref) => existing.add(ref));
      allDropDpRefsByHomeKey.set(key, existing);
    });

  allAssets
    .filter((candidate) => isHome(candidate))
    .forEach((home: any, index) => {
      const directDpKeys = [
        home.dpId,
        home.connectedDpId,
        home.connectedDP,
        home.parentDpId,
        home.servedByDp,
        home.properties?.dpId,
        home.properties?.connectedDpId,
        home.properties?.connectedDP,
        home.properties?.parentDpId,
        home.properties?.servedByDp,
      ]
        .map((value) => text(value).toLowerCase())
        .filter(Boolean);

      const linkedDirectly = directDpKeys.some((key) => dpLookup.has(key));
      const homeIdentity = getHomeIdentityKey(home, `home-${index}`);
      const linkedByDrop = homeIdentity ? homeKeysFromDrops.has(homeIdentity) : false;
      const dropDpRefs = homeIdentity ? allDropDpRefsByHomeKey.get(homeIdentity) : undefined;
      const hasDropForDifferentDp =
        Boolean(dropDpRefs?.size) &&
        !Array.from(dropDpRefs || []).some((ref) => dpLookup.has(ref));

      if (hasDropForDifferentDp) return;
      if (!linkedDirectly && !linkedByDrop) return;

      addRow(
        {
          id: text(home.id || home.assetId || home.uprn || home.UPRN || homeIdentity || index),
          name: text(
            home.name ||
              home.address ||
              home.fullAddress ||
              home.uprn ||
              home.UPRN ||
              home.id ||
              `Home ${rowsByHomeKey.size + 1}`,
          ),
          status: text(
            home.status ||
              home.serviceStatus ||
              home.connectionStatus ||
              (home.connectedDpId || home.dpId ? "Connected" : "Planned"),
          ),
          port: home.port || home.dpPort || rowsByHomeKey.size + 1,
          dpId: text(home.dpId || home.connectedDpId || home.connectedDP),
        },
        homeIdentity,
      );
    });

  // Some imported builds only have generated drop cables in the scoped workspace,
  // not separate home point assets. In that case, use the drops as a safe fallback.
  // IMPORTANT: if real home assets already linked to this DP, do NOT add every
  // historic/generated drop as another served home. Re-running address-sheet/drop
  // assignment can leave stale duplicate drop records, which was inflating SB09
  // from 21 real homes to 41 “connected” outputs.
  if (rowsByHomeKey.size === 0) {
    drops.forEach((drop: any, index) => {
      const key = getHomeIdentityKey(drop, `drop-${index}`);
      addRow(
        {
          id: text(
            drop.homeId ||
              drop.connectedHomeId ||
              drop.toHomeId ||
              drop.toAssetId ||
              drop.uprn ||
              drop.UPRN ||
              key ||
              index,
          ),
          name: text(
            drop.homeName ||
              drop.connectedHomeName ||
              drop.address ||
              drop.uprn ||
              drop.UPRN ||
              drop.name ||
              `Home ${rowsByHomeKey.size + 1}`,
          ),
          status: text(drop.homeStatus || drop.customerStatus || drop.status || "Connected"),
          port: drop.port || drop.dpPort || index + 1,
          dpId: text(drop.dpId || drop.fromAssetId || drop.connectedDpId || drop.parentDpId),
        },
        key,
      );
    });
  }

  return Array.from(rowsByHomeKey.values()).sort(
    (a, b) => Number(a.port || 0) - Number(b.port || 0),
  );
}

function getCapacity(
  asset: SavedMapAsset | null,
  connectedHomeCount: number,
  splitterInputCount = 0,
  splitterOutputsPerInput = 8,
) {
  return getDpCapacitySummary(asset, [], {
    connectedHomeCount,
    splitterInputCount,
    splitterOutputsPerInput,
  });
}

function getStateColour(state: string): string {
  return getDpCapacityStateColour(state);
}

function smallLabelStyle(): React.CSSProperties {
  return {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}

function metricValueStyle(colour = "#f8fafc"): React.CSSProperties {
  return {
    marginTop: 4,
    color: colour,
    fontSize: 24,
    fontWeight: 950,
    lineHeight: 1.05,
  };
}

function Metric({
  label,
  value,
  colour,
}: {
  label: string;
  value: React.ReactNode;
  colour?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.72)",
        border: "1px solid rgba(148,163,184,0.12)",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={smallLabelStyle()}>{label}</div>
      <div style={metricValueStyle(colour)}>{value}</div>
    </div>
  );
}

function buttonStyle(
  background: string,
  disabled = false,
): React.CSSProperties {
  return {
    background: disabled ? "#334155" : background,
    color: disabled ? "#94a3b8" : "#e5e7eb",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 10,
    padding: "10px 13px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 850,
  };
}

function isLiveStatus(value: string): boolean {
  const lower = normalise(value);
  return (
    lower.includes("live") ||
    lower.includes("connected") ||
    lower.includes("active")
  );
}

function buildInitialDraft(asset: SavedMapAsset | null): DraftRouting {
  const details = getDpDetails(asset);
  const afnDetails = details.afnDetails || {};
  const mduDetails = details.mduDetails || {};
  const inputFibres: number[] = Array.isArray(afnDetails.inputFibres)
    ? afnDetails.inputFibres.map(Number).filter(Number.isFinite)
    : Array.isArray(mduDetails.inputFibres)
      ? mduDetails.inputFibres.map(Number).filter(Number.isFinite)
      : [];

  const directFibres = Array.isArray(afnDetails.directOutputFibres)
    ? afnDetails.directOutputFibres.map(Number).filter(Number.isFinite)
    : Array.isArray(afnDetails.directFibres)
      ? afnDetails.directFibres.map(Number).filter(Number.isFinite)
      : [];

  const downstreamCableId =
    afnDetails.downstreamCableId ||
    afnDetails.outCableId ||
    afnDetails.nextCableId ||
    details.downstreamCableId ||
    details.outCableId ||
    (asset as any)?.downstreamCableId ||
    (asset as any)?.outCableId;

  const explicitSpliceFibres = Array.isArray(afnDetails.spliceFibres)
    ? afnDetails.spliceFibres.map(Number).filter(Number.isFinite)
    : [];

  const explicitPassthroughFibres = Array.isArray(afnDetails.passthroughFibres)
    ? afnDetails.passthroughFibres.map(Number).filter(Number.isFinite)
    : [];

  const explicitSpareFibres = Array.isArray(afnDetails.spareFibres)
    ? afnDetails.spareFibres.map(Number).filter(Number.isFinite)
    : [];

  return {
    splitterFibres: uniqueSorted(
      inputFibres.filter((fibre) => !directFibres.includes(fibre)),
    ),
    directFibres: uniqueSorted(
      inputFibres.filter((fibre) => directFibres.includes(fibre)),
    ),
    spliceFibres: uniqueSorted(explicitSpliceFibres),
    passthroughFibres: uniqueSorted(explicitPassthroughFibres),
    spareFibres: uniqueSorted(explicitSpareFibres),
    hasDownstreamCable: Boolean(downstreamCableId),
  };
}

function buildPortRoutes(args: {
  splitterInputFibres: number[];
  directFibres: number[];
  splitterOutputsPerFibre: number;
  connectedHomes: ConnectedHomeRow[];
  dropCables: SavedMapAsset[];
  parentFibreMappings?: ParentFibreMapping[];
}): PortRoute[] {
  const {
    splitterInputFibres,
    directFibres,
    splitterOutputsPerFibre,
    connectedHomes,
    dropCables,
    parentFibreMappings = [],
  } = args;

  const directRoutes = directFibres.map((directFibre, index): PortRoute => {
    const directColour = getFibreColour(directFibre);
    return {
      port: index + 1,
      routeType: "direct",
      fibre: directFibre,
      fibreLabel: `${formatLocalFibreWithParent(directFibre, parentFibreMappings)} (${directColour.name})`,
      fibreColour: directColour.colour,
      fibreTextColour: directColour.textColour,
      home: connectedHomes[index],
      cable: dropCables[index] || null,
    };
  });

  const splitterRoutes = splitterInputFibres.flatMap(
    (splitterFibre, fibreIndex) => {
      const splitterColour = getFibreColour(splitterFibre);
      return Array.from({ length: splitterOutputsPerFibre }).map(
        (_, outputIndex): PortRoute => {
          const portIndex =
            directRoutes.length +
            fibreIndex * splitterOutputsPerFibre +
            outputIndex;
          return {
            port: portIndex + 1,
            routeType: "splitter",
            fibre: splitterFibre,
            fibreLabel: `Splitter output from ${formatLocalFibreWithParent(splitterFibre, parentFibreMappings)} (${splitterColour.name})`,
            fibreColour: "#22c55e",
            fibreTextColour: "#ffffff",
            home: connectedHomes[portIndex],
            cable: dropCables[portIndex] || null,
          };
        },
      );
    },
  );

  // Keep the visual port map to the actual DP/SB output capacity.
  // Do not let every generated drop cable inflate this to 72/80/etc.
  // Served homes/drops are shown on the right, but the splitter view should
  // only draw the ports produced by the selected fibres in this SB.
  const designedOutputCount = directRoutes.length + splitterRoutes.length;
  const outputCount = Math.max(
    designedOutputCount,
    connectedHomes.length,
    1,
  );
  const routes = [...directRoutes, ...splitterRoutes];

  while (routes.length < outputCount) {
    const index = routes.length;
    routes.push({
      port: index + 1,
      routeType: "spare",
      fibreLabel: "Spare",
      home: connectedHomes[index],
      cable: dropCables[index] || null,
    });
  }

  return routes;
}

export default function DistributionPointEditor({
  asset: incomingAsset,
  allAssets = [],
  onClose,
  onOpenTopology,
  onSaveRouting,
}: Props) {
  const { isMobile } = useDeviceLayout();
  const [asset, setEditorAsset] = useState<SavedMapAsset | null>(incomingAsset);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [activeFibreView, setActiveFibreView] =
    useState<FibreViewMode>("splitter");
  const [mobilePanel, setMobilePanel] = useState<"fibres" | "summary" | "homes">("fibres");
  const [editMode, setEditMode] = useState(false);
  const [draftRouting, setDraftRouting] = useState<DraftRouting>(() =>
    buildInitialDraft(incomingAsset),
  );
  const [rangeStartFibre, setRangeStartFibre] = useState("");
  const [rangeEndFibre, setRangeEndFibre] = useState("");
  const [rangeRouteType, setRangeRouteType] = useState<"splitter" | "direct" | "splice" | "passthrough" | "spare">("passthrough");
  const [manualThroughCableId, setManualThroughCableId] = useState("");

  useEffect(() => {
    setEditorAsset(incomingAsset);
  }, [incomingAsset?.id]);

  useEffect(() => {
    setDraftRouting(buildInitialDraft(asset));
    setSelectedFibre(null);
    setSelectedPort(null);
    setActiveFibreView("splitter");
    setEditMode(false);
    setRangeStartFibre("");
    setRangeEndFibre("");
    setRangeRouteType("passthrough");
    setManualThroughCableId("");
  }, [asset?.id]);

  const connectedHomes = useMemo(
    () => (asset ? getConnectedHomes(asset, allAssets) : []),
    [asset, allAssets],
  );

  const dropCables = useMemo(
    () => (asset ? getDropCablesForDp(asset, allAssets) : []),
    [asset, allAssets],
  );

  const computedDpRoutingState = useMemo(
    () => (asset ? buildDpRoutingState(asset as any) : null),
    [asset],
  );

  const computedNetworkState = useMemo(
    () => buildNetworkState(allAssets as any),
    [allAssets],
  );

  const jointMatchedDpState = useMemo(() => {
    if (!asset) return null;
    const direct = computedNetworkState.dpStates?.[(asset as any).id];
    if (direct) return direct;

    const selectedKeys = [
      (asset as any).id,
      (asset as any).assetId,
      (asset as any).name,
      (asset as any).label,
    ].filter(Boolean);

    return (
      Object.values(computedNetworkState.dpStates || {}).find((state: any) =>
        selectedKeys.some((key) =>
          refsMatch(state.assetId || state.assetName, key),
        ),
      ) || null
    );
  }, [asset, computedNetworkState]);

  const siblingDps = useMemo(() => {
    if (!asset) return [];

    const currentPrefix = getSbRunPrefix(asset);
    const currentHasSbNumber = getSbSortNumber(asset) !== null;

    return allAssets
      .filter(isNavigableDistributionPoint)
      .filter((candidate) => {
        if (!currentHasSbNumber) return true;
        const candidateNumber = getSbSortNumber(candidate);
        if (candidateNumber === null) return false;
        return getSbRunPrefix(candidate) === currentPrefix;
      })
      .sort((left, right) => {
        const leftPrefix = getSbRunPrefix(left);
        const rightPrefix = getSbRunPrefix(right);
        if (leftPrefix !== rightPrefix) return leftPrefix.localeCompare(rightPrefix);

        const leftNumber = getSbSortNumber(left);
        const rightNumber = getSbSortNumber(right);
        if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;

        return getAssetTitle(left).localeCompare(getAssetTitle(right));
      });
  }, [allAssets, asset]);

  const currentSiblingIndex = useMemo(() => {
    if (!asset) return -1;
    const currentKeys = new Set(assetKeys(asset));
    return siblingDps.findIndex((candidate) =>
      assetKeys(candidate).some((key) => currentKeys.has(key)),
    );
  }, [asset, siblingDps]);

  const previousSiblingDp = currentSiblingIndex > 0 ? siblingDps[currentSiblingIndex - 1] : null;
  const nextSiblingDp =
    currentSiblingIndex >= 0 && currentSiblingIndex < siblingDps.length - 1
      ? siblingDps[currentSiblingIndex + 1]
      : null;

  const navigateToSiblingDp = (nextAsset: SavedMapAsset | null) => {
    if (!nextAsset) return;
    setEditorAsset(nextAsset);
    setSelectedFibre(null);
    setSelectedPort(null);
    setActiveFibreView("splitter");
    setEditMode(false);
    setManualThroughCableId("");
  };

  const selectableThroughCables = useMemo(
    () =>
      allAssets
        .filter(isThroughCableCandidate)
        .sort((left, right) => {
          const leftCount = getFibreCountFromCable(left);
          const rightCount = getFibreCountFromCable(right);
          if (rightCount !== leftCount) return rightCount - leftCount;
          return cableName(left).localeCompare(cableName(right));
        }),
    [allAssets],
  );

  if (!asset) return null;

  const details = getDpDetails(asset);
  const closureType = getClosureType(asset);
  const status = getOperationalStatus(asset);
  const afnDetails = details.afnDetails || {};
  const mduDetails = details.mduDetails || {};
  const splitterRatio =
    afnDetails.splitterRatio ||
    (closureType.includes("AFN")
      ? "1:8"
      : closureType.includes("MDU")
        ? "MDU"
        : "CBT");
  const rawSplitterOutputs = Number(afnDetails.splitterOutputs || 8);
  const splitterOutputsPerFibre =
    splitterRatio === "1:8" || closureType.includes("AFN")
      ? 8
      : Number.isFinite(rawSplitterOutputs) && rawSplitterOutputs > 0
        ? rawSplitterOutputs
        : 8;
  const manualSbRoute = findStoredSbToSbRouteForAsset(details, asset);
  const routedCableId =
    manualSbRoute?.supportingCableId ||
    manualSbRoute?.supportingCableName;

  const storedThroughCableId =
    afnDetails.throughCableId ||
    mduDetails.throughCableId ||
    details.throughCableId ||
    routedCableId ||
    "";

  const manualThroughCable = manualThroughCableId
    ? findCableByReference(allAssets, manualThroughCableId)
    : null;

  const storedThroughCable = findCableByReference(allAssets, storedThroughCableId);

  const branchParentThroughCable = !manualThroughCable && !storedThroughCable
    ? findBranchParentThroughCableForDp(asset, allAssets)
    : null;

  const nearestThroughCable = !manualThroughCable && !storedThroughCable && !branchParentThroughCable
    ? findNearestThroughCableForDp(asset, allAssets)
    : null;

  const throughCable =
    manualThroughCable || storedThroughCable || branchParentThroughCable || nearestThroughCable || null;

  const throughCableId =
    text(
      (throughCable as any)?.id ||
        (throughCable as any)?.assetId ||
        (throughCable as any)?.name ||
        (throughCable as any)?.cableId ||
        storedThroughCableId,
    ) || "No through cable selected";

  const throughCableSelectValue = text(
    manualThroughCableId ||
      storedThroughCableId ||
      (throughCable as any)?.id ||
      (throughCable as any)?.assetId ||
      (throughCable as any)?.name ||
      (throughCable as any)?.cableId ||
      "",
  );

  // A manual cable selection must be treated as a saveable change even when
  // no fibre route was edited. Compare the operator's selected cable only
  // against the stored cable reference, not against the currently displayed
  // throughCableId, because throughCableId updates immediately after selection.
  const storedThroughCableRef = text(storedThroughCableId || "");
  const selectedManualThroughCableRef = text(manualThroughCableId || "");
  const throughCableChanged =
    Boolean(selectedManualThroughCableRef) &&
    !refsMatch(selectedManualThroughCableRef, storedThroughCableRef);

  const incomingFibreCount = getFibreCountFromCable(throughCable);
  const incomingFibreCountLabel = incomingFibreCount > 0 ? `${incomingFibreCount}F` : "Unknown";
  const allCableFibres = Array.from(
    { length: Math.max(incomingFibreCount, 0) },
    (_, index) => index + 1,
  );

  const branchParentDp = findParentDpForBranchCable(asset, throughCable, allAssets);
  const branchParentName = branchParentDp ? getAssetTitle(branchParentDp) : "Parent SB";
  const currentSbName = getAssetTitle(asset);
  const manualSbParentFibres = uniqueSorted((manualSbRoute?.parentFibres || []) as number[]);
  const manualSbLocalFibres = uniqueSorted((manualSbRoute?.localFibres || []) as number[]);
  const storedSplitterFibres = uniqueSorted([
    ...((Array.isArray(afnDetails.splitterFibres) ? afnDetails.splitterFibres : []) as number[]),
    ...((Array.isArray(afnDetails.inputFibres) ? afnDetails.inputFibres : []) as number[]),
  ]);
  const storedSpliceFibres = uniqueSorted(
    (Array.isArray(afnDetails.spliceFibres) ? afnDetails.spliceFibres : []) as number[],
  );
  const currentAssetRefs = [
    asset?.id,
    (asset as any)?.assetId,
    (asset as any)?.name,
    (asset as any)?.jointName,
    (asset as any)?.label,
  ]
    .map(normaliseRef)
    .filter(Boolean);
  const manualRouteTargetsCurrent = [manualSbRoute?.toSbId, manualSbRoute?.toSbName]
    .map(normaliseRef)
    .filter(Boolean)
    .some((routeRef) => currentAssetRefs.some((assetRef) => refsMatch(routeRef, assetRef)));
  const manualRouteStartsAtCurrent = [manualSbRoute?.fromSbId, manualSbRoute?.fromSbName]
    .map(normaliseRef)
    .filter(Boolean)
    .some((routeRef) => currentAssetRefs.some((assetRef) => refsMatch(routeRef, assetRef)));
  const hasManualSbRoute =
    Boolean((details as any)?.afnDetails?.relationshipLed) &&
    Boolean(manualSbRoute) &&
    (manualSbParentFibres.length > 0 || manualSbLocalFibres.length > 0);
  const manualSbParentName = manualSbRoute?.fromSbName || branchParentName;
  const manualSbChildName = manualSbRoute?.toSbName || currentSbName;

  const jointMatchedFibres = uniqueSorted([
    ...(((jointMatchedDpState as any)?.jointMatchedFibres || []) as number[]),
    ...(((jointMatchedDpState as any)?.jointMatch?.fibres || []) as number[]),
  ]);

  const networkSplitterFibres = uniqueSorted(
    ((jointMatchedDpState as any)?.splitterFibres || []) as number[],
  );
  const networkDirectFibres = uniqueSorted(
    ((jointMatchedDpState as any)?.directFibres || []) as number[],
  );
  const networkPassthroughFibres = uniqueSorted(
    [
      ...(((jointMatchedDpState as any)?.passthroughFibres || []) as number[]),
      ...(((jointMatchedDpState as any)?.jointPassthroughFibres || []) as number[]),
    ] as number[],
  );

  // SB routing is manual-authority. Joint uploads / CMJ continuity remain useful
  // for tray records, but must not overwrite DP/SB route logic.
  const hasJointMappedFibres = false;

  const manualLocalRouteFibres = manualSbLocalFibres.length
    ? manualSbLocalFibres
    : manualSbParentFibres;

  // EDIT ROUTING MUST READ FROM draftRouting FIRST.
  // Imported/manual FAS state is the saved baseline, but once the operator clicks
  // Splitter / Direct / Splice / Passthrough / Spare, the grid must immediately
  // reflect the draft change before Save Routing is pressed.
  const displaySplitterFibres = editMode
    ? draftRouting.splitterFibres
    : storedSplitterFibres.length
      ? storedSplitterFibres
      : hasManualSbRoute && manualRouteTargetsCurrent
        ? manualLocalRouteFibres
        : hasJointMappedFibres
          ? networkSplitterFibres
          : draftRouting.splitterFibres;
  const displayDirectFibres = editMode
    ? draftRouting.directFibres
    : hasManualSbRoute
      ? []
      : hasJointMappedFibres
        ? networkDirectFibres
        : draftRouting.directFibres;
  const displaySpliceFibres = editMode
    ? draftRouting.spliceFibres
    : storedSpliceFibres.length
      ? storedSpliceFibres
      : hasManualSbRoute && manualRouteStartsAtCurrent
        ? manualSbParentFibres
        : draftRouting.spliceFibres;
  const displayPassthroughFibres = editMode
    ? draftRouting.passthroughFibres
    : hasManualSbRoute
      ? networkPassthroughFibres
      : hasJointMappedFibres
        ? networkPassthroughFibres
        : draftRouting.passthroughFibres;

  const clampToIncomingCable = (values: number[]): number[] =>
    incomingFibreCount > 0 ? clampFibres(values, incomingFibreCount) : uniqueSorted(values);

  const displaySplitterFibresOnCable = clampToIncomingCable(displaySplitterFibres);
  const displayDirectFibresOnCable = clampToIncomingCable(displayDirectFibres);
  const displaySpliceFibresOnCable = clampToIncomingCable(displaySpliceFibres);
  const displayPassthroughFibresOnCable = clampToIncomingCable(displayPassthroughFibres);

  const hasDirectFeeds = displayDirectFibresOnCable.length > 0;
  const hasSplitterFeeds = displaySplitterFibresOnCable.length > 0;
  const isHybridMduFeed =
    closureType.includes("MDU") && hasDirectFeeds && hasSplitterFeeds;
  const routeModeLabel = isHybridMduFeed
    ? "Hybrid MDU Feed"
    : closureType.includes("MDU") && hasSplitterFeeds
      ? "MDU Splitter Feed"
      : hasSplitterFeeds
        ? splitterRatio
        : hasDirectFeeds
          ? "Direct Feed"
          : splitterRatio;
  const splitterBlockLabel = isHybridMduFeed || closureType.includes("MDU")
    ? "1:8"
    : splitterRatio;

  const inputFibres = uniqueSorted([
    ...displaySplitterFibresOnCable,
    ...displayDirectFibresOnCable,
    ...displaySpliceFibresOnCable,
    ...displayPassthroughFibresOnCable,
  ]);

  const locallyConsumedFibres = uniqueSorted([
    ...displayDirectFibresOnCable,
    ...displaySplitterFibresOnCable,
    ...displaySpliceFibresOnCable,
  ]);

  // Shoot-off SBs are fed from parent fibres on the upstream/main run, then
  // renumbered onto the local branch cable. Example: parent F12/F13/F14 from
  // SB04 becomes local F1/F2/F3 into SB01. Main-run SBs keep their normal
  // numbering because parent and local fibres match, so no mapping is shown.
  const parentFibreMappings = hasManualSbRoute
    ? buildParentFibreMappings(
        manualSbParentFibres.length ? manualSbParentFibres : manualLocalRouteFibres,
        manualLocalRouteFibres,
      ).map((row) => ({
        ...row,
        parentAssetName: manualSbParentName,
        childAssetName: manualSbChildName,
      }))
    : hasJointMappedFibres
      ? buildParentFibreMappings(jointMatchedFibres, locallyConsumedFibres).map((row) => ({
          ...row,
          parentAssetName: branchParentName,
          childAssetName: currentSbName,
        }))
      : [];

  const usedFibresDisplayText = parentFibreMappings.length
    ? parentFibreMappings
        .map((row) => `F${row.parentFibre} → F${row.localFibre}`)
        .join(", ")
    : inputFibres.join(", " );

  const capacity = getCapacity(
    asset,
    connectedHomes.length,
    displaySplitterFibresOnCable.length + displayDirectFibresOnCable.length,
    splitterOutputsPerFibre,
  );

  const throughCableRefs = [
    throughCableId,
    (throughCable as any)?.id,
    (throughCable as any)?.assetId,
    (throughCable as any)?.name,
    (throughCable as any)?.cableId,
    (throughCable as any)?.label,
  ].filter(Boolean);

  const networkJointPassthroughFibres = uniqueSorted(
    ((jointMatchedDpState as any)?.jointPassthroughFibres || []) as number[],
  );
  const networkJointAllocatedElsewhereFibres = uniqueSorted(
    ((jointMatchedDpState as any)?.jointAllocatedElsewhereFibres ||
      []) as number[],
  );
  const networkHighestJointAllocatedFibre = Number(
    (jointMatchedDpState as any)?.jointHighestAllocatedFibre || 0,
  );

  // Fallback for older network-state builds: infer cable occupancy from all
  // joint assignments on the selected through cable. Newer builds provide the
  // precomputed fields above from the AG/LMJ/CMJ upload source of truth.
  const jointAssignmentsOnThroughCable = Object.values(
    computedNetworkState.jointToDpMatches?.assignmentsByDpId || {},
  ).filter((assignment: any) => {
    const refs = [
      ...(Array.isArray(assignment.sourceCableRefs)
        ? assignment.sourceCableRefs
        : []),
      ...(Array.isArray(assignment.targetCableRefs)
        ? assignment.targetCableRefs
        : []),
    ];

    if (!refs.length || !throughCableRefs.length) return true;

    return refs.some((ref: unknown) =>
      throughCableRefs.some((cableRef) => refsMatch(ref, cableRef)),
    );
  });

  const fallbackJointAllocatedFibresOnCable = uniqueSorted(
    jointAssignmentsOnThroughCable.flatMap((assignment: any) =>
      Array.isArray(assignment.fibres) ? assignment.fibres : [],
    ),
  );

  const localMinFibre = jointMatchedFibres.length
    ? Math.min(...jointMatchedFibres)
    : null;
  const localMaxFibre = jointMatchedFibres.length
    ? Math.max(...jointMatchedFibres)
    : null;
  const highestJointAllocatedFibre =
    networkHighestJointAllocatedFibre ||
    (fallbackJointAllocatedFibresOnCable.length
      ? Math.max(...fallbackJointAllocatedFibresOnCable)
      : null);

  const jointPassthroughFibres = hasJointMappedFibres
    ? displayPassthroughFibres
    : [];

  const jointAllocatedElsewhereFibres = hasJointMappedFibres
    ? networkJointAllocatedElsewhereFibres.length
      ? networkJointAllocatedElsewhereFibres
      : localMaxFibre !== null
        ? fallbackJointAllocatedFibresOnCable.filter(
            (fibre) =>
              fibre > localMaxFibre && !jointMatchedFibres.includes(fibre),
          )
        : []
    : [];

  const jointTrueSpareFibres =
    hasJointMappedFibres && highestJointAllocatedFibre !== null
      ? allCableFibres.filter((fibre) => fibre > highestJointAllocatedFibre)
      : [];

  const explicitlyClassifiedFibres = uniqueSorted([
    ...displaySplitterFibres,
    ...displayDirectFibres,
    ...displaySpliceFibres,
    ...displayPassthroughFibres,
    ...draftRouting.spareFibres,
  ]);

  const autoUnclassifiedFibres = allCableFibres.filter(
    (fibre) => !explicitlyClassifiedFibres.includes(fibre),
  );

  const rawPassthroughFibres = hasJointMappedFibres
    ? jointPassthroughFibres
    : draftRouting.hasDownstreamCable
      ? uniqueSorted([
          ...draftRouting.passthroughFibres,
          ...autoUnclassifiedFibres,
        ])
      : uniqueSorted(draftRouting.passthroughFibres);

  const rawSpareFibres = hasJointMappedFibres
    ? jointTrueSpareFibres
    : draftRouting.hasDownstreamCable
      ? uniqueSorted(draftRouting.spareFibres)
      : uniqueSorted([...draftRouting.spareFibres, ...autoUnclassifiedFibres]);

  const passthroughFibres = clampToIncomingCable(rawPassthroughFibres);
  const spareFibres = clampToIncomingCable(rawSpareFibres);

  const consumedFibreCount = uniqueSorted([
    ...displaySplitterFibresOnCable,
    ...displayDirectFibresOnCable,
    ...displaySpliceFibresOnCable,
  ]).length;
  const passthroughFibreCount = passthroughFibres.length;
  const spareEndOfLineFibreCount = spareFibres.length;
  const allocatedElsewhereFibreCount = jointAllocatedElsewhereFibres.length;
  const portRoutes = buildPortRoutes({
    splitterInputFibres: displaySplitterFibresOnCable,
    directFibres: displayDirectFibresOnCable,
    splitterOutputsPerFibre,
    connectedHomes,
    dropCables,
    parentFibreMappings,
  });
  const selectedRoute = selectedPort
    ? portRoutes.find((route) => route.port === selectedPort)
    : null;
  const selectedFibreColour = selectedFibre
    ? getFibreColour(selectedFibre)
    : null;
  const initialDraft = buildInitialDraft(asset);
  const hasDraftChanges =
    initialDraft.hasDownstreamCable !== draftRouting.hasDownstreamCable ||
    initialDraft.splitterFibres.join(",") !==
      draftRouting.splitterFibres.join(",") ||
    initialDraft.directFibres.join(",") !==
      draftRouting.directFibres.join(",") ||
    initialDraft.spliceFibres.join(",") !==
      draftRouting.spliceFibres.join(",") ||
    initialDraft.passthroughFibres.join(",") !==
      draftRouting.passthroughFibres.join(",") ||
    initialDraft.spareFibres.join(",") !== draftRouting.spareFibres.join(",") ||
    throughCableChanged;

  const setFibreRoute = (
    fibre: number,
    route: "splitter" | "direct" | "splice" | "passthrough" | "spare",
  ) => {
    setDraftRouting((prev) => {
      const withoutFibre = {
        ...prev,
        splitterFibres: prev.splitterFibres.filter((item) => item !== fibre),
        directFibres: prev.directFibres.filter((item) => item !== fibre),
        spliceFibres: prev.spliceFibres.filter((item) => item !== fibre),
        passthroughFibres: prev.passthroughFibres.filter(
          (item) => item !== fibre,
        ),
        spareFibres: prev.spareFibres.filter((item) => item !== fibre),
      };

      if (route === "splitter") {
        return {
          ...withoutFibre,
          splitterFibres: uniqueSorted([...withoutFibre.splitterFibres, fibre]),
        };
      }

      if (route === "direct") {
        return {
          ...withoutFibre,
          directFibres: uniqueSorted([...withoutFibre.directFibres, fibre]),
        };
      }


      if (route === "splice") {
        return {
          ...withoutFibre,
          hasDownstreamCable: true,
          spliceFibres: uniqueSorted([...withoutFibre.spliceFibres, fibre]),
        };
      }

      if (route === "passthrough") {
        return {
          ...withoutFibre,
          hasDownstreamCable: true,
          passthroughFibres: uniqueSorted([
            ...withoutFibre.passthroughFibres,
            fibre,
          ]),
        };
      }

      return {
        ...withoutFibre,
        spareFibres: uniqueSorted([...withoutFibre.spareFibres, fibre]),
      };
    });
    setSelectedFibre(fibre);
  };

  const setFibreRangeRoute = () => {
    if (!editMode) return;

    const start = Number(String(rangeStartFibre).replace(/[^0-9]/g, ""));
    const end = Number(String(rangeEndFibre || rangeStartFibre).replace(/[^0-9]/g, ""));

    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
      alert("Enter a valid fibre range, for example 1 to 12.");
      return;
    }

    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const fibres = allCableFibres.filter((fibre) => fibre >= low && fibre <= high);

    if (!fibres.length) {
      alert(`No fibres found between ${low} and ${high} on this cable.`);
      return;
    }

    setDraftRouting((prev) => {
      const withoutRange = {
        ...prev,
        splitterFibres: prev.splitterFibres.filter((item) => !fibres.includes(item)),
        directFibres: prev.directFibres.filter((item) => !fibres.includes(item)),
        spliceFibres: prev.spliceFibres.filter((item) => !fibres.includes(item)),
        passthroughFibres: prev.passthroughFibres.filter((item) => !fibres.includes(item)),
        spareFibres: prev.spareFibres.filter((item) => !fibres.includes(item)),
      };

      if (rangeRouteType === "splitter") {
        return {
          ...withoutRange,
          splitterFibres: uniqueSorted([...withoutRange.splitterFibres, ...fibres]),
        };
      }

      if (rangeRouteType === "direct") {
        return {
          ...withoutRange,
          directFibres: uniqueSorted([...withoutRange.directFibres, ...fibres]),
        };
      }

      if (rangeRouteType === "splice") {
        return {
          ...withoutRange,
          hasDownstreamCable: true,
          spliceFibres: uniqueSorted([...withoutRange.spliceFibres, ...fibres]),
        };
      }

      if (rangeRouteType === "passthrough") {
        return {
          ...withoutRange,
          hasDownstreamCable: true,
          passthroughFibres: uniqueSorted([...withoutRange.passthroughFibres, ...fibres]),
        };
      }

      return {
        ...withoutRange,
        spareFibres: uniqueSorted([...withoutRange.spareFibres, ...fibres]),
      };
    });

    setSelectedFibre(fibres[fibres.length - 1] || null);
  };


  const saveRouting = () => {
    if (!onSaveRouting || !hasDraftChanges) return;

    const maxCableFibre = incomingFibreCount || 999;

    const cleanedSplitterFibres = clampFibres(
      draftRouting.splitterFibres,
      maxCableFibre,
    );
    const cleanedDirectFibres = clampFibres(
      draftRouting.directFibres,
      maxCableFibre,
    );
    const cleanedSpliceFibres = clampFibres(
      draftRouting.spliceFibres,
      maxCableFibre,
    );
    const cleanedPassthroughFibres = clampFibres(
      passthroughFibres,
      maxCableFibre,
    );
    const cleanedSpareFibres = clampFibres(
      spareFibres,
      maxCableFibre,
    );

    const nextInputFibres = uniqueSorted([
      ...cleanedSplitterFibres,
      ...cleanedDirectFibres,
    ]);
    const cleanedFibreCountUsed =
      nextInputFibres.length + cleanedSpliceFibres.length;
    const nextThroughCableId =
      throughCableId === "No through cable selected" ? undefined : throughCableId;

    const nextDetails: DistributionPointDetails = {
      ...(details as DistributionPointDetails),
      closureType: (details.closureType || closureType || "AFN") as any,
      connectionsToHomes: Number(
        details.connectionsToHomes || capacity.capacity || 0,
      ),
      powerReadings: Array.isArray(details.powerReadings)
        ? details.powerReadings
        : [],
      throughCableId: nextThroughCableId,
      afnDetails: {
        ...(afnDetails || {}),
        enabled: true,
        throughCableId: nextThroughCableId,
        splitterRatio: "1:8",
        splitterOutputs: splitterOutputsPerFibre,
        inputFibres: nextInputFibres,
        splitterFibres: cleanedSplitterFibres,
        spliceFibres: cleanedSpliceFibres,
        fibreCountUsed: cleanedFibreCountUsed,
        directOutputFibres: cleanedDirectFibres,
        directFibres: cleanedDirectFibres,
        passthroughFibres: cleanedPassthroughFibres,
        spareFibres: cleanedSpareFibres,
        downstreamCableId: draftRouting.hasDownstreamCable
          ? afnDetails.downstreamCableId ||
            afnDetails.outCableId ||
            afnDetails.nextCableId ||
            "downstream-unassigned"
          : undefined,
      } as any,
      mduDetails: {
        ...(mduDetails || {}),
        throughCableId: nextThroughCableId,
        inputFibres: nextInputFibres,
        directFibres: cleanedDirectFibres,
        passthroughFibres: cleanedPassthroughFibres,
        spareFibres: cleanedSpareFibres,
        totalReservedFibres: cleanedFibreCountUsed,
      } as any,
    };

    onSaveRouting({
      asset,
      nextDetails,
      note: "Updated DP operational fibre routing",
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 6500,
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 32%), #020617",
        color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          fontFamily:
            "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          paddingBottom: isMobile ? 76 : 0,
      }}
    >
      <header
        style={{
          minHeight: isMobile ? 64 : 76,
          padding: isMobile ? "10px 12px" : "14px 20px",
          borderBottom: "1px solid rgba(148,163,184,0.16)",
          background: "rgba(15, 23, 42, 0.92)",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "320px 1fr auto",
          alignItems: "center",
          gap: isMobile ? 10 : 18,
        }}
      >
        <div>
          <div style={{ ...smallLabelStyle(), color: "#38bdf8" }}>
            DP Operations
          </div>
          <h1
            style={{
              margin: "5px 0 0",
              fontSize: isMobile ? 18 : 25,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
            }}
          >
            {getAssetTitle(asset)}
          </h1>
          <div style={{ marginTop: 6, color: "#cbd5e1", fontSize: 14 }}>
            {closureType} ·{" "}
            <span style={{ color: status === "Live" ? "#4ade80" : "#fbbf24" }}>
              {status}
            </span>
          </div>
        </div>

        <div
          style={{
            display: isMobile ? "none" : "flex",
            justifyContent: "center",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ ...smallLabelStyle(), color: "#93c5fd" }}>
            Through Cable
          </div>
          <strong style={{ color: "#38bdf8", fontSize: 17 }}>
            {text(
              (throughCable as any)?.name ||
                (throughCable as any)?.cableId ||
                throughCableId,
            )}
          </strong>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 8 : 10,
            flexWrap: isMobile ? "wrap" : "nowrap",
            minWidth: 0,
          }}
        >
          <button
            type="button"
            disabled={!previousSiblingDp}
            onClick={() => navigateToSiblingDp(previousSiblingDp)}
            title={
              previousSiblingDp
                ? `Open ${getAssetTitle(previousSiblingDp)}`
                : "No previous SB in this run"
            }
            style={buttonStyle("#132640", !previousSiblingDp)}
          >
            ← Previous SB
          </button>
          <button
            type="button"
            disabled={!nextSiblingDp}
            onClick={() => navigateToSiblingDp(nextSiblingDp)}
            title={
              nextSiblingDp
                ? `Open ${getAssetTitle(nextSiblingDp)}`
                : "No next SB in this run"
            }
            style={buttonStyle("#132640", !nextSiblingDp)}
          >
            Next SB →
          </button>
          {onOpenTopology ? (
            <button
              type="button"
              onClick={onOpenTopology}
              style={buttonStyle("#132640")}
            >
              Trace Topology
            </button>
          ) : null}
          {editMode ? (
            <>
              <button
                type="button"
                onClick={saveRouting}
                disabled={!hasDraftChanges || !onSaveRouting}
                style={buttonStyle(
                  "#166534",
                  !hasDraftChanges || !onSaveRouting,
                )}
              >
                Save Routing
              </button>
              <button
                type="button"
                onClick={() => setDraftRouting(buildInitialDraft(asset))}
                style={buttonStyle("#991b1b")}
              >
                Reset Draft
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            style={buttonStyle(editMode ? "#1d4ed8" : "#132640")}
          >
            {editMode ? "Editing Routes" : "Edit Routing"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem(
                  "alistra-workspace-return-tab",
                  "build",
                );
              } catch {
                // ignore private browsing/localStorage errors
              }
              onClose?.();
            }}
            style={buttonStyle("#1e293b")}
          >
            Back
          </button>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "330px minmax(760px, 1fr) 380px",
          gap: isMobile ? 10 : 16,
          padding: isMobile ? 10 : 16,
          overflow: "auto",
          overflowX: "hidden",
        }}
      >
        {(!isMobile || mobilePanel === "summary") && <CapacityPanel>
          <h2 style={{ margin: 0, fontSize: 18 }}>DP Capacity</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}
          >
            <Metric label="Used Ports" value={capacity.used} colour="#38bdf8" />
            <Metric label="Free Ports" value={capacity.free} colour="#4ade80" />
            <Metric
              label="Total Capacity"
              value={capacity.capacity}
              colour="#c084fc"
            />
            <Metric
              label="Utilisation"
              value={`${capacity.percent}%`}
              colour={getStateColour(capacity.state)}
            />
          </div>

          <div
            style={{
              borderRadius: 999,
              overflow: "hidden",
              background: "#1e293b",
              height: 12,
            }}
          >
            <div
              style={{
                width: `${Math.min(capacity.percent, 100)}%`,
                background: getStateColour(capacity.state),
                height: "100%",
                transition: "width 180ms ease",
              }}
            />
          </div>

          <div
            style={{
              border: `1px solid ${getStateColour(capacity.state)}`,
              color: getStateColour(capacity.state),
              borderRadius: 12,
              padding: 12,
              fontWeight: 950,
            }}
          >
            {capacity.state === "OK"
              ? "Capacity OK"
              : capacity.state === "WARN"
                ? "Near capacity"
                : capacity.state === "FULL"
                  ? "Full"
                  : capacity.state === "OVER"
                    ? "Over capacity"
                    : "No capacity set"}
          </div>

          <div
            style={{
              height: 1,
              background: "rgba(148,163,184,0.16)",
              margin: "2px 0",
            }}
          />

          <FibreIntakePanel>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fibre Intake</h2>
          <div
            style={{
              background: "rgba(15,23,42,0.72)",
              border: "1px solid rgba(56,189,248,0.22)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={smallLabelStyle()}>Set through / MDU cable</div>
            <select
              value={throughCableSelectValue}
              disabled={!editMode}
              onChange={(event) => setManualThroughCableId(event.target.value)}
              style={{
                marginTop: 8,
                width: "100%",
                background: editMode ? "#020617" : "#334155",
                color: "#e5e7eb",
                border: "1px solid rgba(148,163,184,0.28)",
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
              }}
            >
              <option value="">No through cable selected</option>
              {selectableThroughCables.map((candidate) => {
                const value = text(
                  (candidate as any).id ||
                    (candidate as any).assetId ||
                    (candidate as any).name ||
                    (candidate as any).cableId,
                );
                const fibreCount = getFibreCountFromCable(candidate);
                return (
                  <option key={value} value={value}>
                    {cableName(candidate)}{fibreCount > 0 ? ` · ${fibreCount}F` : ""}
                  </option>
                );
              })}
            </select>
            <small style={{ display: "block", marginTop: 8, color: "#94a3b8" }}>
              Click Edit Routing, choose the correct 96F/144F cable, then Save Routing to persist it to the DP/MDU details.
            </small>
          </div>
          <Metric
            label="Incoming cable"
            value={text(
              (throughCable as any)?.name ||
                (throughCable as any)?.cableId ||
                throughCableId,
            )}
            colour="#38bdf8"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <Metric
              label="Incoming"
              value={incomingFibreCountLabel}
              colour="#38bdf8"
            />
            <Metric label="Used" value={consumedFibreCount} colour="#fbbf24" />
            <Metric
              label={
                hasJointMappedFibres
                  ? "Passthrough"
                  : draftRouting.hasDownstreamCable
                    ? "Passthrough"
                    : "Spare / EOL"
              }
              value={`${hasJointMappedFibres ? passthroughFibreCount : draftRouting.hasDownstreamCable ? passthroughFibreCount : spareEndOfLineFibreCount}F`}
              colour="#4ade80"
            />
            <Metric
              label={
                hasJointMappedFibres ? "Allocated Elsewhere" : "Network state"
              }
              value={
                hasJointMappedFibres
                  ? `${allocatedElsewhereFibreCount}F`
                  : incomingFibreCount > 0
                    ? incomingFibreCountLabel
                    : `${computedDpRoutingState?.usedFibres.length || 0}F`
              }
              colour="#a78bfa"
            />
          </div>

          {parentFibreMappings.length ? (
            <div
              style={{
                background: "rgba(56,189,248,0.10)",
                border: "1px solid rgba(56,189,248,0.28)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ ...smallLabelStyle(), color: "#7dd3fc" }}>
                Parent SB → This SB fibre mapping
              </div>
              <div style={{ marginTop: 8, color: "#e0f2fe", fontWeight: 900 }}>
                {branchParentName} → {currentSbName}: {parentFibreMappings.length} fibre{parentFibreMappings.length === 1 ? "" : "s"} needed
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {parentFibreMappings.map((row) => (
                  <div
                    key={`${row.parentFibre}-${row.localFibre}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      color: "#e0f2fe",
                      fontWeight: 900,
                    }}
                  >
                    <span>{row.parentAssetName || "Parent SB"} F{row.parentFibre}</span>
                    <span>→</span>
                    <span>{row.childAssetName || "This SB"} F{row.localFibre}</span>
                  </div>
                ))}
              </div>
              <small style={{ display: "block", marginTop: 8, color: "#94a3b8" }}>
                Shoot-off branch: this shows the parent SB fibres feeding this SB. Only the number of fibres needed by this SB is reserved on the parent run.
              </small>
            </div>
          ) : null}

          <div
            style={{
              background: "rgba(15,23,42,0.72)",
              border: "1px solid rgba(148,163,184,0.12)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={smallLabelStyle()}>Cable run mode</div>
            <button
              type="button"
              disabled={!editMode}
              onClick={() =>
                setDraftRouting((prev) => ({
                  ...prev,
                  hasDownstreamCable: !prev.hasDownstreamCable,
                }))
              }
              style={{
                ...buttonStyle(editMode ? "#132640" : "#334155", !editMode),
                marginTop: 8,
                width: "100%",
              }}
            >
              {hasJointMappedFibres
                ? "Joint mapping controls passthrough"
                : draftRouting.hasDownstreamCable
                  ? "Passthrough cable continues"
                  : "End of line / no downstream cable"}
            </button>
          </div>

          <div
            style={{
              background: "rgba(15,23,42,0.72)",
              border: "1px solid rgba(148,163,184,0.12)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={smallLabelStyle()}>All fibres on incoming cable</div>
            <div
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 6,
                maxHeight: 165,
                overflow: "auto",
                paddingRight: 4,
              }}
            >
              {allCableFibres.map((fibre) => {
                const colour = getFibreColour(fibre);
                const isSplitter = displaySplitterFibres.includes(fibre);
                const isDirect = displayDirectFibres.includes(fibre);
                const isSplice = displaySpliceFibres.includes(fibre);
                const isPassthrough = passthroughFibres.includes(fibre);
                const isAllocatedElsewhere =
                  jointAllocatedElsewhereFibres.includes(fibre);
                const active = selectedFibre === fibre;
                return (
                  <button
                    key={fibre}
                    type="button"
                    onClick={() => setSelectedFibre(active ? null : fibre)}
                    style={{
                      border: active
                        ? `2px solid ${colour.colour}`
                        : "1px solid rgba(148,163,184,0.18)",
                      background: isSplitter
                        ? "rgba(168,85,247,0.18)"
                        : isDirect
                          ? "rgba(56,189,248,0.18)"
                          : isSplice
                            ? "rgba(244,114,182,0.20)"
                            : isPassthrough
                            ? "rgba(34,197,94,0.12)"
                            : isAllocatedElsewhere
                              ? "rgba(251,146,60,0.14)"
                              : "rgba(2,6,23,0.72)",
                      color: "#e5e7eb",
                      borderRadius: 9,
                      padding: "7px 6px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: colour.colour,
                          display: "inline-block",
                        }}
                      />
                      <strong>{fibre}</strong>
                    </div>
                    <small
                      style={{
                        color: "#94a3b8",
                        fontSize: 10,
                        lineHeight: 1.1,
                      }}
                    >
                      {isSplitter
                        ? "Splitter"
                        : isDirect
                          ? "Direct"
                          : isSplice
                            ? "Splice"
                            : isPassthrough
                            ? "Pass"
                            : isAllocatedElsewhere
                              ? "Upstream"
                              : "Spare"}
                    </small>
                  </button>
                );
              })}
            </div>

            {editMode ? (
              <div
                style={{
                  marginTop: 10,
                  border: "1px solid rgba(56,189,248,0.18)",
                  background: "rgba(2,6,23,0.50)",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div style={smallLabelStyle()}>Bulk fibre route</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <input
                    type="number"
                    min={1}
                    max={incomingFibreCount}
                    placeholder="From fibre"
                    value={rangeStartFibre}
                    onChange={(event) => setRangeStartFibre(event.target.value)}
                    style={{
                      background: "#020617",
                      color: "#f8fafc",
                      border: "1px solid rgba(148,163,184,0.24)",
                      borderRadius: 8,
                      padding: "9px 10px",
                      minWidth: 0,
                    }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={incomingFibreCount}
                    placeholder="To fibre"
                    value={rangeEndFibre}
                    onChange={(event) => setRangeEndFibre(event.target.value)}
                    style={{
                      background: "#020617",
                      color: "#f8fafc",
                      border: "1px solid rgba(148,163,184,0.24)",
                      borderRadius: 8,
                      padding: "9px 10px",
                      minWidth: 0,
                    }}
                  />
                </div>
                <select
                  value={rangeRouteType}
                  onChange={(event) =>
                    setRangeRouteType(event.target.value as "splitter" | "direct" | "splice" | "passthrough" | "spare")
                  }
                  style={{
                    width: "100%",
                    marginTop: 8,
                    background: "#020617",
                    color: "#f8fafc",
                    border: "1px solid rgba(148,163,184,0.24)",
                    borderRadius: 8,
                    padding: "9px 10px",
                  }}
                >
                  <option value="passthrough">Passthrough</option>
                  <option value="splice">Splice</option>
                  <option value="splitter">Splitter</option>
                  <option value="direct">Direct</option>
                  <option value="spare">Spare / EOL</option>
                </select>
                <button
                  type="button"
                  onClick={setFibreRangeRoute}
                  style={{
                    ...buttonStyle(
                      rangeRouteType === "splice"
                        ? "#9d174d"
                        : rangeRouteType === "passthrough"
                          ? "#166534"
                          : rangeRouteType === "splitter"
                            ? "#581c87"
                            : rangeRouteType === "direct"
                              ? "#075985"
                              : "#334155",
                    ),
                    width: "100%",
                    marginTop: 8,
                  }}
                >
                  Apply range
                </button>
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>
                  Example: enter 1 to 12, choose Passthrough, then apply once.
                </div>
              </div>
            ) : null}

            {selectedFibre && editMode ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => setFibreRoute(selectedFibre, "splitter")}
                  style={buttonStyle("#581c87")}
                >
                  Splitter
                </button>
                <button
                  type="button"
                  onClick={() => setFibreRoute(selectedFibre, "direct")}
                  style={buttonStyle("#075985")}
                >
                  Direct
                </button>
                <button
                  type="button"
                  onClick={() => setFibreRoute(selectedFibre, "splice")}
                  style={buttonStyle("#9d174d")}
                >
                  Splice
                </button>
                <button
                  type="button"
                  onClick={() => setFibreRoute(selectedFibre, "passthrough")}
                  style={buttonStyle("#166534")}
                >
                  Passthrough
                </button>
                <button
                  type="button"
                  onClick={() => setFibreRoute(selectedFibre, "spare")}
                  style={buttonStyle("#334155")}
                >
                  Spare
                </button>
              </div>
            ) : null}
          </div>
          </FibreIntakePanel>
        </CapacityPanel>}

        {(!isMobile || mobilePanel === "fibres") && <RoutePanel>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div style={smallLabelStyle()}>
                Splitter / Fibre Route Operations
              </div>
              <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>
                {routeModeLabel}
              </h2>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              {portRoutes.length} capacity output port(s)
            </div>
          </div>

          <div
            style={{
              position: "relative",
              minHeight: 520,
              background: "rgba(2,6,23,0.34)",
              border: "1px solid rgba(148,163,184,0.10)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {activeFibreView === "splitter" ? (
              <FibreSpliceDiagram
                allCableFibres={allCableFibres}
                splitterInputFibres={displaySplitterFibresOnCable}
                directFibres={displayDirectFibresOnCable}
                spliceFibres={displaySpliceFibresOnCable}
                passthroughFibres={passthroughFibres}
                spareFibres={spareFibres}
                hasDownstreamCable={draftRouting.hasDownstreamCable}
                splitterRatio={splitterBlockLabel}
                routeModeLabel={routeModeLabel}
                isHybridMduFeed={isHybridMduFeed}
                portRoutes={portRoutes.slice(0, 8)}
                parentFibreMappings={parentFibreMappings}
                selectedFibre={selectedFibre}
                selectedPort={selectedPort}
                isCompact={isMobile}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                onSelectPort={(port) =>
                  setSelectedPort(selectedPort === port ? null : port)
                }
              />
            ) : activeFibreView === "used" ? (
              <FibreTraceGroupView
                title="Fibre spliced to splitter"
                subtitle={parentFibreMappings.length ? `${branchParentName} → ${currentSbName}: ${parentFibreMappings.length} fibre${parentFibreMappings.length === 1 ? "" : "s"} needed (${parentFibreMappings.map((row) => `F${row.parentFibre} → F${row.localFibre}`).join(", ")})` : `Used locally in ${getAssetTitle(asset)} from ${cableName(throughCable)}`}
                fibres={displaySplitterFibres}
                routeLabel="Local splitter input"
                routeDescription={parentFibreMappings.length ? "This local branch fibre is fed from the matching parent fibre on the upstream/main run." : "This fibre is consumed in this DP and feeds the local splitter."}
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No local splitter fibres found for this DP."
                accentColour="#c084fc"
              />
            ) : activeFibreView === "splice" ? (
              <FibreTraceGroupView
                title="Splice fibres"
                subtitle={`Spliced onward inside ${getAssetTitle(asset)}. These are not local splitter outputs.`}
                fibres={displaySpliceFibres}
                routeLabel="Spliced onward"
                routeDescription="This incoming fibre is joined in this SB to an outgoing branch fibre/cable from the FAS sheet."
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No splice fibres found for this SB."
                accentColour="#f472b6"
              />
            ) : activeFibreView === "passthrough" ? (
              <FibreTraceGroupView
                title="Passthrough fibres"
                subtitle={`Continuing downstream through ${getAssetTitle(asset)} from ${cableName(throughCable)}`}
                fibres={passthroughFibres}
                routeLabel="Passthrough downstream"
                routeDescription="This fibre passes through this DP according to the uploaded joint continuity."
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No passthrough fibres found for this DP."
                accentColour="#22c55e"
              />
            ) : activeFibreView === "allocated" ? (
              <FibreTraceGroupView
                title="Allocated upstream / elsewhere"
                subtitle={`Already consumed before or away from ${getAssetTitle(asset)} on ${cableName(throughCable)}`}
                fibres={jointAllocatedElsewhereFibres}
                routeLabel="Allocated upstream / elsewhere"
                routeDescription="This fibre is already allocated outside this DP according to the uploaded joint continuity."
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No upstream / elsewhere allocated fibres found for this DP."
                accentColour="#fb923c"
              />
            ) : (
              <FibreTraceGroupView
                title="Spare / EOL fibres"
                subtitle={`Available fibres on ${cableName(throughCable)}`}
                fibres={spareFibres}
                routeLabel="Spare / end of line"
                routeDescription="This fibre is currently spare or reaches end of line based on the current routing state."
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No spare / EOL fibres found for this DP."
                accentColour="#64748b"
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveFibreView("used")}
              style={legendButtonStyle("#c084fc", activeFibreView === "used")}
            >
              Fibre spliced to splitter ({displaySplitterFibres.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFibreView("splitter")}
              style={legendButtonStyle(
                "#38bdf8",
                activeFibreView === "splitter",
              )}
            >
              1:8 splitter view
            </button>
            <button
              type="button"
              onClick={() => setActiveFibreView("splice")}
              style={legendButtonStyle("#f472b6", activeFibreView === "splice")}
            >
              Splice fibres ({displaySpliceFibres.length})
            </button>
            <span style={{ ...legendPillStyle(), color: "#4ade80" }}>
              Splitter outputs
            </span>
            <button
              type="button"
              onClick={() => setActiveFibreView("passthrough")}
              style={legendButtonStyle(
                "#22c55e",
                activeFibreView === "passthrough",
              )}
            >
              Passthrough fibres ({passthroughFibres.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFibreView("allocated")}
              style={legendButtonStyle(
                "#fb923c",
                activeFibreView === "allocated",
              )}
            >
              Allocated upstream / elsewhere (
              {jointAllocatedElsewhereFibres.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFibreView("spare")}
              style={legendButtonStyle("#64748b", activeFibreView === "spare")}
            >
              Spare / EOL fibres ({spareFibres.length})
            </button>
            <span style={{ marginLeft: "auto" }}>
              {activeFibreView === "splitter"
                ? "Click fibres, splitter outputs, or ports to inspect"
                : "Click a fibre card to inspect it on the right"}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
              gap: 10,
              maxHeight: 225,
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {portRoutes.map((route) => {
              const active = selectedPort === route.port;
              const live = isLiveStatus(route.home?.status || "");
              return (
                <button
                  key={route.port}
                  type="button"
                  onClick={() => setSelectedPort(active ? null : route.port)}
                  style={{
                    background: active
                      ? "rgba(37,99,235,0.24)"
                      : route.home
                        ? "rgba(34,197,94,0.10)"
                        : "rgba(15,23,42,0.82)",
                    border: active
                      ? "2px solid #38bdf8"
                      : `1px solid ${route.home ? (live ? "rgba(34,197,94,0.48)" : "rgba(251,191,36,0.48)") : "rgba(148,163,184,0.14)"}`,
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 118,
                    maxWidth: "100%",
                    overflow: "hidden",
                    color: "#e5e7eb",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <strong style={{ color: route.fibreColour || "#93c5fd" }}>
                      Port {route.port}
                    </strong>
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          route.routeType === "direct"
                            ? "#38bdf8"
                            : route.routeType === "splitter"
                              ? "#4ade80"
                              : route.routeType === "splice"
                                ? "#f472b6"
                                : route.routeType === "passthrough"
                                ? "#22c55e"
                                : "#64748b",
                      }}
                    >
                      {route.routeType === "direct"
                        ? "Direct"
                        : route.routeType === "splitter"
                          ? "Splitter"
                          : route.routeType === "splice"
                            ? "Splice"
                            : route.routeType === "passthrough"
                            ? "Passthrough"
                            : "Spare"}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: route.fibreColour || "#94a3b8",
                      fontSize: 12,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {route.fibreLabel}
                  </div>
                  <div
                    style={{ marginTop: 10, color: "#cbd5e1", fontSize: 12 }}
                  >
                    Cable
                  </div>
                  <div
                    title={
                      route.cable
                        ? cableName(route.cable)
                        : "No cable connected"
                    }
                    style={{
                      color: "#f8fafc",
                      fontSize: 12,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      wordBreak: "break-word",
                    }}
                  >
                    {route.cable
                      ? cableName(route.cable)
                      : "No cable connected"}
                  </div>
                  <div
                    title={route.home?.name || "No home connected"}
                    style={{
                      marginTop: 7,
                      color: route.home ? "#f8fafc" : "#64748b",
                      fontSize: 12,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {route.home?.name || "No home connected"}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              background: "rgba(15,23,42,0.72)",
              border: "1px solid rgba(148,163,184,0.12)",
              borderRadius: 14,
              padding: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div style={smallLabelStyle()}>Incoming</div>
              <div style={{ fontSize: 26, fontWeight: 950 }}>
                {incomingFibreCount}F
              </div>
              <small style={{ color: "#38bdf8" }}>
                From {cableName(throughCable)}
              </small>
            </div>
            <div>
              <div style={smallLabelStyle()}>Used in this DP</div>
              <div style={{ fontSize: 26, fontWeight: 950, color: "#fbbf24" }}>
                {consumedFibreCount}F
              </div>
              <small style={{ color: "#cbd5e1" }}>
                {usedFibresDisplayText || "No fibres selected"}
              </small>
            </div>
            <div>
              <div style={smallLabelStyle()}>
                {hasJointMappedFibres
                  ? "Passthrough downstream"
                  : draftRouting.hasDownstreamCable
                    ? "Passthrough"
                    : "Spare at end of line"}
              </div>
              <div style={{ fontSize: 26, fontWeight: 950, color: "#4ade80" }}>
                {hasJointMappedFibres
                  ? passthroughFibreCount
                  : draftRouting.hasDownstreamCable
                    ? passthroughFibreCount
                    : spareEndOfLineFibreCount}
                F
              </div>
              <small style={{ color: "#cbd5e1" }}>
                {hasJointMappedFibres
                  ? `${allocatedElsewhereFibreCount}F allocated upstream / elsewhere`
                  : draftRouting.hasDownstreamCable
                    ? "Continuing to next asset"
                    : "Unused fibres stop at this DP"}
              </small>
            </div>
          </div>
        </RoutePanel>}

        {(!isMobile || mobilePanel === "homes") && <ConnectedHomesPanel>
          <div>
            <div style={smallLabelStyle()}>Served Homes</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>
              {connectedHomes.length} connected
            </h2>
          </div>

          {(selectedFibre || selectedRoute) && (
            <div
              style={{
                background: "rgba(37,99,235,0.14)",
                border: "1px solid rgba(59,130,246,0.34)",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <div style={{ ...smallLabelStyle(), color: "#93c5fd" }}>
                Selection
              </div>
              {selectedFibre ? (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ color: selectedFibreColour?.colour }}>
                    Fibre {selectedFibre} · {selectedFibreColour?.name}
                  </strong>
                  <div style={{ color: "#cbd5e1", marginTop: 4, fontSize: 12 }}>
                    {displayDirectFibres.includes(selectedFibre)
                      ? `${formatLocalFibreWithParent(selectedFibre, parentFibreMappings)} direct output fibre to Port ${displayDirectFibres.indexOf(selectedFibre) + 1}.`
                      : displaySpliceFibres.includes(selectedFibre)
                        ? `${selectedFibre} is spliced onward to an outgoing branch route in this SB.`
                      : displaySplitterFibres.includes(selectedFibre)
                        ? `${formatLocalFibreWithParent(selectedFibre, parentFibreMappings)} spliced into splitter input.`
                        : passthroughFibres.includes(selectedFibre)
                          ? "Passing through downstream according to uploaded joint mapping."
                          : jointAllocatedElsewhereFibres.includes(
                                selectedFibre,
                              )
                            ? "Allocated upstream / elsewhere according to uploaded joint mapping."
                            : "True spare fibre at end of line."}
                  </div>
                </div>
              ) : null}
              {selectedRoute ? (
                <div style={{ marginTop: selectedFibre ? 10 : 8 }}>
                  <strong>Port {selectedRoute.port}</strong>
                  <div style={{ color: "#cbd5e1", marginTop: 4, fontSize: 12 }}>
                    {selectedRoute.fibreLabel}
                  </div>
                  <div style={{ color: "#38bdf8", marginTop: 4, fontSize: 12 }}>
                    {selectedRoute.cable
                      ? cableName(selectedRoute.cable)
                      : "No output cable connected"}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gap: 8,
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {connectedHomes.length ? (
              connectedHomes.slice(0, 80).map((home, index) => {
                const route = portRoutes[index];
                const live = isLiveStatus(home.status);
                return (
                  <button
                    key={`${home.id}-${index}`}
                    type="button"
                    onClick={() => setSelectedPort(route?.port || index + 1)}
                    style={{
                      background:
                        selectedPort === (route?.port || index + 1)
                          ? "rgba(37,99,235,0.24)"
                          : "rgba(15,23,42,0.72)",
                      border:
                        selectedPort === (route?.port || index + 1)
                          ? "2px solid #38bdf8"
                          : "1px solid rgba(148,163,184,0.14)",
                      borderRadius: 12,
                      padding: 11,
                      color: "#e5e7eb",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <strong style={{ color: "#f8fafc", fontSize: 13 }}>
                        {home.name}
                      </strong>
                      <span style={{ color: "#93c5fd", fontSize: 12 }}>
                        Port {route?.port || home.port || index + 1}
                      </span>
                    </div>
                    <div
                      style={{
                        color: live ? "#4ade80" : "#fbbf24",
                        marginTop: 4,
                        fontSize: 12,
                      }}
                    >
                      {home.status || "Planned"}
                    </div>
                    <div
                      style={{
                        color: route?.fibreColour || "#64748b",
                        marginTop: 4,
                        fontSize: 12,
                      }}
                    >
                      {route?.fibreLabel || "No fibre mapped"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  color: "#94a3b8",
                  background: "rgba(15,23,42,0.72)",
                  border: "1px solid rgba(148,163,184,0.14)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                No connected homes detected yet. This editor will populate from
                home/drop relationships as the DP is connected.
              </div>
            )}
          </div>

          <div
            style={{
              background: "rgba(15,23,42,0.72)",
              border: "1px solid rgba(148,163,184,0.12)",
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div style={smallLabelStyle()}>Connected Drop / Output Cables</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {dropCables.length ? (
                dropCables.slice(0, 10).map((cable, index) => (
                  <button
                    key={cable.id || index}
                    type="button"
                    onClick={() => setSelectedPort(index + 1)}
                    style={{
                      background: "rgba(2,6,23,0.62)",
                      border: "1px solid rgba(148,163,184,0.14)",
                      color: "#e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{cableName(cable)}</strong>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      Port {index + 1} output cable
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>
                  No output/drop cables detected for this DP.
                </div>
              )}
            </div>
          </div>
        </ConnectedHomesPanel>}
      </main>

      {isMobile ? (
        <nav style={mobilePanelDockStyle}>
          <button type="button" onClick={() => setMobilePanel("summary")} style={mobileDockButtonStyle(mobilePanel === "summary")}>
            Summary
          </button>
          <button type="button" onClick={() => setMobilePanel("fibres")} style={mobileDockButtonStyle(mobilePanel === "fibres")}>
            Fibres
          </button>
          <button type="button" onClick={() => setMobilePanel("homes")} style={mobileDockButtonStyle(mobilePanel === "homes")}>
            Homes
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function legendPillStyle(): React.CSSProperties {
  return {
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 800,
  };
}

function legendButtonStyle(
  colour: string,
  active: boolean,
): React.CSSProperties {
  return {
    ...legendPillStyle(),
    color: colour,
    cursor: "pointer",
    background: active ? "rgba(37,99,235,0.22)" : "rgba(15,23,42,0.72)",
    border: active ? `2px solid ${colour}` : "1px solid rgba(148,163,184,0.14)",
    fontFamily: "inherit",
  };
}

function FibreTraceGroupView({
  title,
  subtitle,
  fibres,
  routeLabel,
  routeDescription,
  selectedFibre,
  onSelectFibre,
  emptyMessage,
  accentColour,
}: {
  title: string;
  subtitle: string;
  fibres: number[];
  routeLabel: string;
  routeDescription: string;
  selectedFibre: number | null;
  onSelectFibre: (fibre: number) => void;
  emptyMessage: string;
  accentColour: string;
}) {
  const sortedFibres = uniqueSorted(fibres);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ ...smallLabelStyle(), color: accentColour }}>
            Fibre trace detail
          </div>
          <h3
            style={{
              margin: "5px 0 0",
              fontSize: 25,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </h3>
          <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 13 }}>
            {subtitle}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={smallLabelStyle()}>Fibres</div>
          <div
            style={{
              color: accentColour,
              fontSize: 28,
              fontWeight: 950,
              lineHeight: 1,
            }}
          >
            {sortedFibres.length}F
          </div>
        </div>
      </div>

      {sortedFibres.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 10,
            overflow: "auto",
            paddingRight: 4,
          }}
        >
          {sortedFibres.map((fibre) => {
            const colour = getFibreColour(fibre);
            const active = selectedFibre === fibre;
            return (
              <button
                key={fibre}
                type="button"
                onClick={() => onSelectFibre(fibre)}
                style={{
                  background: active
                    ? "rgba(37,99,235,0.26)"
                    : "rgba(15,23,42,0.78)",
                  border: active
                    ? `2px solid ${colour.colour}`
                    : "1px solid rgba(148,163,184,0.16)",
                  borderRadius: 14,
                  padding: 13,
                  color: "#e5e7eb",
                  cursor: "pointer",
                  textAlign: "left",
                  minHeight: 118,
                  boxShadow: active ? `0 0 24px ${colour.colour}44` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 9 }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        display: "grid",
                        placeItems: "center",
                        background: colour.colour,
                        color: colour.textColour,
                        fontWeight: 950,
                      }}
                    >
                      {fibre}
                    </span>
                    <strong>Fibre {fibre}</strong>
                  </span>
                  <span
                    style={{
                      color: colour.colour,
                      fontSize: 12,
                      fontWeight: 850,
                    }}
                  >
                    {colour.name}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    color: accentColour,
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  {routeLabel}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    color: "#94a3b8",
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  {routeDescription}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            color: "#94a3b8",
            border: "1px dashed rgba(148,163,184,0.22)",
            borderRadius: 16,
          }}
        >
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

const mobilePanelDockStyle: React.CSSProperties = {
  position: "fixed",
  left: 10,
  right: 10,
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
  zIndex: 6600,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  padding: 8,
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.96)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
  backdropFilter: "blur(12px)",
};

function mobileDockButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 46,
    borderRadius: 14,
    border: active ? "1px solid rgba(147,197,253,0.78)" : "1px solid rgba(148,163,184,0.24)",
    background: active ? "#2563eb" : "rgba(30,41,59,0.92)",
    color: "#fff",
    fontWeight: 950,
    fontSize: 13,
  };
}

function FibreSpliceDiagram({
  allCableFibres,
  splitterInputFibres,
  directFibres,
  spliceFibres,
  passthroughFibres,
  spareFibres,
  hasDownstreamCable,
  splitterRatio,
  routeModeLabel,
  isHybridMduFeed = false,
  portRoutes,
  parentFibreMappings = [],
  selectedFibre,
  selectedPort,
  isCompact = false,
  onSelectFibre,
  onSelectPort,
}: {
  allCableFibres: number[];
  splitterInputFibres: number[];
  directFibres: number[];
  spliceFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  hasDownstreamCable: boolean;
  splitterRatio: string;
  routeModeLabel: string;
  isHybridMduFeed?: boolean;
  portRoutes: PortRoute[];
  parentFibreMappings?: ParentFibreMapping[];
  selectedFibre: number | null;
  selectedPort: number | null;
  isCompact?: boolean;
  onSelectFibre: (fibre: number) => void;
  onSelectPort: (port: number) => void;
}) {
  const directFeedFibres = uniqueSorted(directFibres);
  const splitterFibres = uniqueSorted(splitterInputFibres);
  const localConsumedFibres = uniqueSorted([...directFeedFibres, ...splitterFibres]);
  const spliceDisplayFibres = uniqueSorted(spliceFibres);
  const passDisplayFibres = uniqueSorted(passthroughFibres).slice(0, 8);
  const spareDisplayFibres = uniqueSorted(spareFibres).slice(0, 4);
  const totalFibreCount = allCableFibres.length;
  const colourKey = FIBRE_COLOURS.map((colour, index) => {
    const start = index + 1;
    return { ...colour, range: totalFibreCount > 12 ? `${start}, ${start + 12}...` : `${start}` };
  });


  const routeTargetText = (fibre: number, index: number) => {
    const mapping = parentFibreMappings.find((row) => row.parentFibre === fibre || row.localFibre === fibre);
    if (mapping) {
      const child = mapping.childAssetName || "downstream SB";
      return `F${mapping.parentFibre} → F${mapping.localFibre} → ${child}`;
    }
    return `Spliced onward route ${index + 1}`;
  };

  const chipStyle = (fibre: number, active: boolean): React.CSSProperties => {
    const colour = getFibreColour(fibre);
    return {
      minWidth: 40,
      height: 28,
      borderRadius: 8,
      background: colour.colour,
      color: colour.textColour,
      display: "inline-grid",
      placeItems: "center",
      fontWeight: 950,
      border: active ? "2px solid #f8fafc" : "1px solid rgba(255,255,255,0.22)",
      boxShadow: active ? `0 0 16px ${colour.colour}` : "0 8px 18px rgba(0,0,0,0.25)",
    };
  };

  const fibreRowStyle = (active: boolean): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "92px minmax(130px, 220px) 34px minmax(160px, 1fr)",
    alignItems: "center",
    gap: isCompact ? 7 : 10,
    border: active ? "1px solid rgba(56,189,248,0.8)" : "1px solid rgba(148,163,184,0.12)",
    background: active ? "rgba(14,165,233,0.13)" : "rgba(15,23,42,0.62)",
    borderRadius: 12,
    padding: "7px 10px",
    cursor: "pointer",
    minWidth: 0,
  });

  const lineStyle = (fibre: number, kind: "splice" | "splitter" | "passthrough" | "spare"): React.CSSProperties => {
    const colour = getFibreColour(fibre);
    return {
      height: kind === "spare" ? 0 : 3,
      borderTop: kind === "spare" ? `2px dashed ${colour.colour}` : undefined,
      background: kind === "spare" ? undefined : colour.colour,
      borderRadius: 999,
      boxShadow: kind === "splice"
        ? `0 0 8px ${colour.colour}`
        : kind === "splitter"
          ? "0 0 8px rgba(34,197,94,0.35)"
          : undefined,
      opacity: kind === "spare" ? 0.48 : 0.92,
    };
  };

  const sectionHeaderStyle = (colour: string): React.CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    color: colour,
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 8,
  });

  const routeCardStyle = (borderColour: string): React.CSSProperties => ({
    border: `1px solid ${borderColour}`,
    background: "rgba(2,6,23,0.52)",
    borderRadius: 14,
    padding: 12,
    minHeight: 0,
  });

  const summaryItems = [
    { label: "Direct feeds", value: directFeedFibres.length, colour: "#38bdf8" },
    { label: "Splitter feeds", value: splitterFibres.length, colour: "#22c55e" },
    { label: "Splice", value: spliceDisplayFibres.length, colour: "#fb923c" },
    { label: "Pass-through", value: passthroughFibres.length, colour: "#38bdf8" },
    { label: "Spare / EOL", value: spareFibres.length, colour: "#94a3b8" },
  ];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 520,
        padding: 14,
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isCompact
            ? "minmax(0, 1fr)"
            : "220px minmax(0, 1fr) 280px",
          gap: 14,
          minWidth: 0,
          minHeight: isCompact ? 0 : 490,
          alignItems: "start",
        }}
      >
        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={routeCardStyle("rgba(56,189,248,0.24)")}>
            <div style={smallLabelStyle()}>Incoming Cable</div>
            <div style={{ marginTop: 10, color: "#38bdf8", fontSize: 18, fontWeight: 950 }}>
              {totalFibreCount || 0}F
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
              {hasDownstreamCable ? "Cable continues downstream" : "End of cable route"}
            </div>
          </div>

          <div style={routeCardStyle("rgba(148,163,184,0.18)")}>
            <div style={smallLabelStyle()}>DP Summary</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {summaryItems.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: "1px solid rgba(148,163,184,0.10)",
                    paddingBottom: 6,
                    color: "#cbd5e1",
                    fontSize: 13,
                  }}
                >
                  <span>{item.label}</span>
                  <strong style={{ color: item.colour }}>{item.value}</strong>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", color: "#e5e7eb", fontSize: 13 }}>
                <span>Total Fibres</span>
                <strong>{totalFibreCount}</strong>
              </div>
            </div>
          </div>

          <div style={routeCardStyle("rgba(148,163,184,0.18)")}>
            <div style={smallLabelStyle()}>Fibre Colour Key</div>
            <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
              {colourKey.map((colour) => (
                <div
                  key={colour.name}
                  style={{ display: "grid", gridTemplateColumns: "42px 1fr auto", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1" }}
                >
                  <span style={{ height: 3, borderRadius: 999, background: colour.colour }} />
                  <span>{colour.name}</span>
                  <span style={{ color: "#94a3b8" }}>{colour.range}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main
          style={{
            ...routeCardStyle("rgba(59,130,246,0.22)"),
            padding: isCompact ? 10 : 14,
            minWidth: 0,
            overflowX: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ ...smallLabelStyle(), color: "#38bdf8" }}>Fibre Flow Diagram</div>
              <div style={{ marginTop: 4, color: "#e0f2fe", fontSize: 15, fontWeight: 950 }}>
                {routeModeLabel}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>
                Complete view of direct feeds, splitter feeds, splice and pass-through fibres. Fibre lines use the real 12-colour code.
              </div>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Click a fibre, splice route, or output port to inspect.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <section style={routeCardStyle("rgba(251,146,60,0.34)")}>
              <div style={sectionHeaderStyle("#fb923c")}>
                <span>Splice Routes</span>
                <span>{spliceDisplayFibres.length} fibre{spliceDisplayFibres.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {spliceDisplayFibres.length ? spliceDisplayFibres.map((fibre, index) => {
                  const colour = getFibreColour(fibre);
                  const active = selectedFibre === fibre;
                  return (
                    <button key={`splice-${fibre}`} type="button" onClick={() => onSelectFibre(fibre)} style={fibreRowStyle(active)}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={chipStyle(fibre, active)}>{fibre}</span>
                        <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{colour.name}</span>
                      </span>
                      <span style={lineStyle(fibre, "splice")} />
                      <span style={{ color: "#fb923c", fontWeight: 950, fontSize: 20 }}>⊗</span>
                      <span style={{ color: "#cbd5e1", fontSize: 13 }}>
                        {routeTargetText(fibre, index)}
                      </span>
                    </button>
                  );
                }) : (
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>No splice fibres recorded on this DP.</div>
                )}
              </div>
            </section>

            {directFeedFibres.length ? (
              <section style={routeCardStyle("rgba(56,189,248,0.30)")}>
                <div style={sectionHeaderStyle("#38bdf8")}>
                  <span>{isHybridMduFeed ? "Direct MDU Feeds" : "Direct Feeds"}</span>
                  <span>{directFeedFibres.length} fibre{directFeedFibres.length === 1 ? "" : "s"}</span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {directFeedFibres.map((fibre, index) => {
                    const colour = getFibreColour(fibre);
                    const active = selectedFibre === fibre;
                    return (
                      <button key={`direct-${fibre}`} type="button" onClick={() => onSelectFibre(fibre)} style={fibreRowStyle(active)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={chipStyle(fibre, active)}>{fibre}</span>
                          <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{colour.name}</span>
                        </span>
                        <span style={lineStyle(fibre, "passthrough")} />
                        <span style={{ color: "#38bdf8", fontWeight: 950, fontSize: 20 }}>→</span>
                        <span style={{ color: "#cbd5e1", fontSize: 13 }}>
                          Direct feed output {index + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section style={routeCardStyle("rgba(34,197,94,0.34)")}>
              <div style={sectionHeaderStyle("#22c55e")}>
                <span>{isHybridMduFeed ? "1:8 Splitter Feeds" : "Splitter Routes"}</span>
                <span>{splitterFibres.length} fibre{splitterFibres.length === 1 ? "" : "s"}</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isCompact
                    ? "minmax(0, 1fr)"
                    : "minmax(220px, 1fr) 120px minmax(190px, 1fr)",
                  gap: 12,
                  alignItems: "center",
                  minWidth: isCompact ? 0 : 560,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  {splitterFibres.length ? splitterFibres.map((fibre) => {
                    const colour = getFibreColour(fibre);
                    const active = selectedFibre === fibre;
                    return (
                      <button key={`splitter-input-${fibre}`} type="button" onClick={() => onSelectFibre(fibre)} style={{ ...fibreRowStyle(active), gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "92px 1fr" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={chipStyle(fibre, active)}>{fibre}</span>
                          <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{colour.name}</span>
                        </span>
                        <span style={{ ...lineStyle(fibre, "splitter"), position: "relative" }} />
                      </button>
                    );
                  }) : <div style={{ color: "#94a3b8", fontSize: 13 }}>No splitter fibres selected.</div>}
                </div>

                <button
                  type="button"
                  onClick={() => splitterFibres[0] && onSelectFibre(splitterFibres[0])}
                  style={{
                    border: "1px solid rgba(34,197,94,0.55)",
                    borderRadius: 16,
                    background: "rgba(2,6,23,0.72)",
                    color: "#22c55e",
                    minHeight: 96,
                    display: "grid",
                    placeItems: "center",
                    cursor: splitterFibres.length ? "pointer" : "default",
                    boxShadow: "0 0 22px rgba(34,197,94,0.12)",
                  }}
                >
                  <span style={{ textAlign: "center" }}>
                    <strong style={{ fontSize: 24 }}>{splitterRatio}</strong>
                    <small style={{ display: "block", marginTop: 4, color: "#86efac", fontWeight: 900 }}>
                      {isHybridMduFeed ? "SPLITTER FEED" : "SPLITTER"}
                    </small>
                  </span>
                </button>

                <div style={{ display: "grid", gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  {portRoutes.slice(0, Math.min(portRoutes.length, 16)).map((route) => {
                    const active = selectedPort === route.port;
                    return (
                      <button
                        key={`port-mini-${route.port}`}
                        type="button"
                        onClick={() => onSelectPort(route.port)}
                        style={{
                          border: active ? "2px solid #38bdf8" : "1px solid rgba(34,197,94,0.22)",
                          background: active ? "rgba(14,165,233,0.18)" : "rgba(15,23,42,0.72)",
                          borderRadius: 10,
                          padding: "8px 9px",
                          color: route.routeType === "spare" ? "#94a3b8" : "#22c55e",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 850,
                        }}
                      >
                        Port {route.port}
                        <span style={{ display: "block", marginTop: 2, color: "#94a3b8", fontWeight: 600 }}>
                          {route.routeType === "direct"
                            ? `Direct (${route.fibreLabel})`
                            : route.routeType === "spare"
                              ? "Not used"
                              : "Splitter output"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section style={routeCardStyle("rgba(56,189,248,0.30)")}>
              <div style={sectionHeaderStyle("#38bdf8")}>
                <span>Pass-through</span>
                <span>{passthroughFibres.length} fibre{passthroughFibres.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {passDisplayFibres.length ? passDisplayFibres.map((fibre) => {
                  const colour = getFibreColour(fibre);
                  const active = selectedFibre === fibre;
                  return (
                    <button key={`pass-${fibre}`} type="button" onClick={() => onSelectFibre(fibre)} style={{ ...fibreRowStyle(active), gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "92px minmax(200px, 1fr) 120px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={chipStyle(fibre, active)}>{fibre}</span>
                        <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{colour.name}</span>
                      </span>
                      <span style={lineStyle(fibre, "passthrough")} />
                      <span style={{ color: "#38bdf8", fontWeight: 900 }}>Continues →</span>
                    </button>
                  );
                }) : <div style={{ color: "#94a3b8", fontSize: 13 }}>No pass-through fibres currently recorded.</div>}
                {passthroughFibres.length > passDisplayFibres.length ? (
                  <div style={{ color: "#94a3b8", fontSize: 12, paddingLeft: 6 }}>
                    +{passthroughFibres.length - passDisplayFibres.length} more pass-through fibres hidden to keep the diagram readable.
                  </div>
                ) : null}
              </div>
            </section>

            {spareDisplayFibres.length ? (
              <section style={routeCardStyle("rgba(148,163,184,0.22)")}>
                <div style={sectionHeaderStyle("#94a3b8")}>
                  <span>Spare / EOL sample</span>
                  <span>{spareFibres.length} fibre{spareFibres.length === 1 ? "" : "s"}</span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {spareDisplayFibres.map((fibre) => {
                    const colour = getFibreColour(fibre);
                    const active = selectedFibre === fibre;
                    return (
                      <button key={`spare-${fibre}`} type="button" onClick={() => onSelectFibre(fibre)} style={{ ...fibreRowStyle(active), gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "92px minmax(200px, 1fr) 120px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={chipStyle(fibre, active)}>{fibre}</span>
                          <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{colour.name}</span>
                        </span>
                        <span style={lineStyle(fibre, "spare")} />
                        <span style={{ color: "#94a3b8", fontWeight: 900 }}>Spare</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </main>

        <aside
          style={{
            ...routeCardStyle("rgba(34,197,94,0.20)"),
            width: isCompact ? "100%" : 280,
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <div style={smallLabelStyle()}>Output Ports ({portRoutes.length})</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10, maxHeight: 440, overflow: "auto", paddingRight: 4 }}>
            {portRoutes.map((route) => {
              const active = selectedPort === route.port;
              return (
                <button
                  key={route.port}
                  type="button"
                  onClick={() => onSelectPort(route.port)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "78px 1fr",
                    alignItems: "center",
                    gap: 10,
                    background: active ? "rgba(37,99,235,0.28)" : "rgba(15,23,42,0.86)",
                    border: active ? "2px solid #38bdf8" : "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 10,
                    padding: "9px 9px",
                    color: "#f8fafc",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <strong style={{ color: route.routeType === "spare" ? "#94a3b8" : "#22c55e" }}>
                    Port {route.port}
                  </strong>
                  <span style={{ color: route.routeType === "spare" ? "#94a3b8" : "#4ade80", fontSize: 12 }}>
                    {route.routeType === "direct"
                      ? `Direct (${route.fibreLabel})`
                      : route.routeType === "splitter"
                        ? "Splitter output"
                        : "Not used"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
