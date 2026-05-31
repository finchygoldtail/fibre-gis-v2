// =====================================================
// FILE: DistributionPointEditor.tsx
// PURPOSE: Dedicated operational editor for DPs / CBTs / AFNs / MDUs.
//          This is NOT the FibreTrayEditor. FibreTrayEditor remains for
//          CMJ / LMJ / MMJ splice continuity only.
// PHASE 8B — DP Operational Fibre Routing.
// =====================================================

import React, { useEffect, useMemo, useState } from "react";
import type { DistributionPointDetails, SavedMapAsset } from "../map/types";
import { buildDpRoutingState, buildNetworkState } from "../../services/network";

type ConnectedHomeRow = {
  id: string;
  name: string;
  status: string;
  port?: number | string;
  dpId?: string;
};

type PortRoute = {
  port: number;
  routeType: "splitter" | "direct" | "passthrough" | "spare";
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
  passthroughFibres: number[];
  spareFibres: number[];
  hasDownstreamCable: boolean;
};

type FibreViewMode =
  | "splitter"
  | "used"
  | "passthrough"
  | "allocated"
  | "spare";

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

function getFibreColour(fibreNumber: number): FibreColour {
  const index = Math.max(0, (Number(fibreNumber) - 1) % FIBRE_COLOURS.length);
  return FIBRE_COLOURS[index];
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
  const haystack = [
    item?.fibreCount,
    item?.fiberCount,
    item?.coreCount,
    item?.size,
    item?.name,
    item?.cableId,
  ]
    .map(text)
    .join(" ");
  const match = haystack.match(/(288|144|96|48|36|24|12)\s*F?/i);
  return match ? Number(match[1]) : 144;
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

  allAssets
    .filter((candidate) => isHome(candidate))
    .forEach((home: any, index) => {
      const directDpKeys = [
        home.dpId,
        home.connectedDpId,
        home.connectedDP,
        home.parentDpId,
      ]
        .map((value) => text(value).toLowerCase())
        .filter(Boolean);

      const linkedDirectly = directDpKeys.some((key) => dpLookup.has(key));
      const homeIdentity = getHomeIdentityKey(home, `home-${index}`);
      const linkedByDrop = homeIdentity ? homeKeysFromDrops.has(homeIdentity) : false;

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
  // not separate home point assets. In that case, use the drops as a safe fallback
  // for served-home rows while still deduping by UPRN/home reference.
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
  const item = asset as any;
  const details = getDpDetails(asset);
  const closure = getClosureType(asset);
  const afnDetails = details.afnDetails || {};
  const mduDetails = details.mduDetails || {};

  const storedInputFibres = Array.isArray(afnDetails.inputFibres)
    ? afnDetails.inputFibres
    : Array.isArray(mduDetails.inputFibres)
      ? mduDetails.inputFibres
      : [];

  const inputCount = Math.max(
    splitterInputCount,
    storedInputFibres.map(Number).filter(Number.isFinite).length,
  );

  const outputsPerInput =
    Number.isFinite(splitterOutputsPerInput) && splitterOutputsPerInput > 0
      ? splitterOutputsPerInput
      : 8;

  const splitterCapacity = inputCount > 0 ? inputCount * outputsPerInput : 0;

  const explicitCapacity = Number(
    item?.capacity ||
      item?.dpCapacity ||
      item?.ports ||
      details.capacity ||
      details.portCapacity ||
      0,
  );

  const baseCapacity =
    Number.isFinite(explicitCapacity) && explicitCapacity > 0
      ? explicitCapacity
      : closure.includes("CBT")
        ? 12
        : closure.includes("AFN")
          ? 8
          : closure.includes("MDU")
            ? Math.max(Number(details.connectionsToHomes || 0), 1)
            : Number(details.connectionsToHomes || 0);

  const capacity = Math.max(
    baseCapacity,
    splitterCapacity,
    connectedHomeCount,
    closure.includes("AFN") && inputCount > 0 ? 8 : 0,
  );

  const used = Math.max(
    connectedHomeCount,
    Number(details.connectedHomes || item?.connectedHomes || 0),
  );
  const percent = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const free = Math.max(capacity - used, 0);
  const state =
    capacity <= 0
      ? "NO CAPACITY"
      : used > capacity
        ? "OVER"
        : used === capacity
          ? "FULL"
          : percent >= 80
            ? "WARN"
            : "OK";

  return { used, capacity, free, percent, state };
}

function getStateColour(state: string): string {
  if (state === "OVER") return "#c084fc";
  if (state === "FULL") return "#fb7185";
  if (state === "WARN") return "#fbbf24";
  if (state === "NO CAPACITY") return "#94a3b8";
  return "#4ade80";
}

function panelStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background:
      "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96))",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
    ...extra,
  };
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
}): PortRoute[] {
  const {
    splitterInputFibres,
    directFibres,
    splitterOutputsPerFibre,
    connectedHomes,
    dropCables,
  } = args;

  const directRoutes = directFibres.map((directFibre, index): PortRoute => {
    const directColour = getFibreColour(directFibre);
    return {
      port: index + 1,
      routeType: "direct",
      fibre: directFibre,
      fibreLabel: `Fibre ${directFibre} (${directColour.name})`,
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
            fibreLabel: `Splitter output from fibre ${splitterFibre} (${splitterColour.name})`,
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
  const [asset, setEditorAsset] = useState<SavedMapAsset | null>(incomingAsset);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [activeFibreView, setActiveFibreView] =
    useState<FibreViewMode>("splitter");
  const [editMode, setEditMode] = useState(false);
  const [draftRouting, setDraftRouting] = useState<DraftRouting>(() =>
    buildInitialDraft(incomingAsset),
  );

  useEffect(() => {
    setEditorAsset(incomingAsset);
  }, [incomingAsset?.id]);

  useEffect(() => {
    setDraftRouting(buildInitialDraft(asset));
    setSelectedFibre(null);
    setSelectedPort(null);
    setActiveFibreView("splitter");
    setEditMode(false);
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
  };

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
  const throughCableId =
    afnDetails.throughCableId ||
    mduDetails.throughCableId ||
    details.throughCableId ||
    "No through cable selected";
  const throughCable = allAssets.find(
    (candidate) =>
      candidate.id === throughCableId ||
      (candidate as any).assetId === throughCableId,
  );
  const incomingFibreCount = getFibreCountFromCable(throughCable);
  const allCableFibres = Array.from(
    { length: incomingFibreCount },
    (_, index) => index + 1,
  );

  const jointMatchedFibres = uniqueSorted([
    ...(((jointMatchedDpState as any)?.jointMatchedFibres || []) as number[]),
    ...(((jointMatchedDpState as any)?.jointMatch?.fibres || []) as number[]),
  ]);

  const hasJointMappedFibres = jointMatchedFibres.length > 0 && !editMode;
  const displaySplitterFibres = hasJointMappedFibres
    ? jointMatchedFibres
    : draftRouting.splitterFibres;
  const displayDirectFibres = hasJointMappedFibres
    ? []
    : draftRouting.directFibres;

  const inputFibres = uniqueSorted([
    ...displaySplitterFibres,
    ...displayDirectFibres,
  ]);

  const capacity = getCapacity(
    asset,
    connectedHomes.length,
    displaySplitterFibres.length + displayDirectFibres.length,
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
    ? networkJointPassthroughFibres.length
      ? networkJointPassthroughFibres
      : localMinFibre !== null
        ? allCableFibres.filter((fibre) => fibre < localMinFibre)
        : []
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
    ...draftRouting.passthroughFibres,
    ...draftRouting.spareFibres,
  ]);

  const autoUnclassifiedFibres = allCableFibres.filter(
    (fibre) => !explicitlyClassifiedFibres.includes(fibre),
  );

  const passthroughFibres = hasJointMappedFibres
    ? jointPassthroughFibres
    : draftRouting.hasDownstreamCable
      ? uniqueSorted([
          ...draftRouting.passthroughFibres,
          ...autoUnclassifiedFibres,
        ])
      : uniqueSorted(draftRouting.passthroughFibres);

  const spareFibres = hasJointMappedFibres
    ? jointTrueSpareFibres
    : draftRouting.hasDownstreamCable
      ? uniqueSorted(draftRouting.spareFibres)
      : uniqueSorted([...draftRouting.spareFibres, ...autoUnclassifiedFibres]);

  const consumedFibreCount =
    inputFibres.length ||
    Number(afnDetails.fibreCountUsed || mduDetails.totalReservedFibres || 0);
  const passthroughFibreCount = passthroughFibres.length;
  const spareEndOfLineFibreCount = spareFibres.length;
  const allocatedElsewhereFibreCount = jointAllocatedElsewhereFibres.length;
  const portRoutes = buildPortRoutes({
    splitterInputFibres: displaySplitterFibres,
    directFibres: displayDirectFibres,
    splitterOutputsPerFibre,
    connectedHomes,
    dropCables,
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
    initialDraft.passthroughFibres.join(",") !==
      draftRouting.passthroughFibres.join(",") ||
    initialDraft.spareFibres.join(",") !== draftRouting.spareFibres.join(",");

  const setFibreRoute = (
    fibre: number,
    route: "splitter" | "direct" | "passthrough" | "spare",
  ) => {
    setDraftRouting((prev) => {
      const withoutFibre = {
        ...prev,
        splitterFibres: prev.splitterFibres.filter((item) => item !== fibre),
        directFibres: prev.directFibres.filter((item) => item !== fibre),
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

  const saveRouting = () => {
    if (!onSaveRouting || !hasDraftChanges) return;

    const nextInputFibres = uniqueSorted([
      ...draftRouting.splitterFibres,
      ...draftRouting.directFibres,
    ]);

    const nextDetails: DistributionPointDetails = {
      ...(details as DistributionPointDetails),
      closureType: (details.closureType || closureType || "AFN") as any,
      connectionsToHomes: Number(
        details.connectionsToHomes || capacity.capacity || 0,
      ),
      powerReadings: Array.isArray(details.powerReadings)
        ? details.powerReadings
        : [],
      afnDetails: {
        enabled: true,
        throughCableId:
          throughCableId === "No through cable selected"
            ? undefined
            : throughCableId,
        splitterRatio: "1:8",
        splitterOutputs: splitterOutputsPerFibre,
        ...(afnDetails || {}),
        inputFibres: nextInputFibres,
        fibreCountUsed: nextInputFibres.length,
        directOutputFibres: draftRouting.directFibres,
        passthroughFibres: passthroughFibres,
        spareFibres: spareFibres,
        downstreamCableId: draftRouting.hasDownstreamCable
          ? afnDetails.downstreamCableId ||
            afnDetails.outCableId ||
            afnDetails.nextCableId ||
            "downstream-unassigned"
          : undefined,
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
      }}
    >
      <header
        style={{
          minHeight: 76,
          padding: "14px 20px",
          borderBottom: "1px solid rgba(148,163,184,0.16)",
          background: "rgba(15, 23, 42, 0.92)",
          display: "grid",
          gridTemplateColumns: "320px 1fr auto",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div>
          <div style={{ ...smallLabelStyle(), color: "#38bdf8" }}>
            DP Operations
          </div>
          <h1
            style={{
              margin: "5px 0 0",
              fontSize: 25,
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
            display: "flex",
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

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          gridTemplateColumns: "330px minmax(760px, 1fr) 380px",
          gap: 16,
          padding: 16,
          overflow: "auto",
        }}
      >
        <section
          style={panelStyle({
            display: "grid",
            gap: 14,
            alignContent: "start",
          })}
        >
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

          <h2 style={{ margin: 0, fontSize: 18 }}>Fibre Intake</h2>
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
              value={`${incomingFibreCount}F`}
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
              value={`${hasJointMappedFibres ? allocatedElsewhereFibreCount : computedDpRoutingState?.usedFibres.length || 0}F`}
              colour="#a78bfa"
            />
          </div>

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
        </section>

        <section
          style={panelStyle({
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            gap: 12,
          })}
        >
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
                {splitterRatio}
              </h2>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              {portRoutes.length} mapped output port(s)
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
                splitterInputFibres={displaySplitterFibres}
                directFibres={displayDirectFibres}
                passthroughFibres={passthroughFibres}
                spareFibres={spareFibres}
                hasDownstreamCable={draftRouting.hasDownstreamCable}
                splitterRatio={splitterRatio}
                portRoutes={portRoutes.slice(0, 8)}
                selectedFibre={selectedFibre}
                selectedPort={selectedPort}
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
                subtitle={`Used locally in ${getAssetTitle(asset)} from ${cableName(throughCable)}`}
                fibres={displaySplitterFibres}
                routeLabel="Local splitter input"
                routeDescription="This fibre is consumed in this DP and feeds the local splitter."
                selectedFibre={selectedFibre}
                onSelectFibre={(fibre) =>
                  setSelectedFibre(selectedFibre === fibre ? null : fibre)
                }
                emptyMessage="No local splitter fibres found for this DP."
                accentColour="#c084fc"
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
                              : route.routeType === "passthrough"
                                ? "#22c55e"
                                : "#64748b",
                      }}
                    >
                      {route.routeType === "direct"
                        ? "Direct"
                        : route.routeType === "splitter"
                          ? "Splitter"
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
                {inputFibres.join(", ") || "No fibres selected"}
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
        </section>

        <section
          style={panelStyle({
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            gap: 12,
          })}
        >
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
                      ? `Direct output fibre to Port ${displayDirectFibres.indexOf(selectedFibre) + 1}.`
                      : displaySplitterFibres.includes(selectedFibre)
                        ? "Spliced into splitter input."
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
        </section>
      </main>
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

function FibreSpliceDiagram({
  allCableFibres,
  splitterInputFibres,
  directFibres,
  passthroughFibres,
  spareFibres,
  hasDownstreamCable,
  splitterRatio,
  portRoutes,
  selectedFibre,
  selectedPort,
  onSelectFibre,
  onSelectPort,
}: {
  allCableFibres: number[];
  splitterInputFibres: number[];
  directFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  hasDownstreamCable: boolean;
  splitterRatio: string;
  portRoutes: PortRoute[];
  selectedFibre: number | null;
  selectedPort: number | null;
  onSelectFibre: (fibre: number) => void;
  onSelectPort: (port: number) => void;
}) {
  const displayedInputFibres = uniqueSorted([
    ...splitterInputFibres,
    ...directFibres,
  ]);
  const samplePassthroughFibres = passthroughFibres.slice(0, 5);
  const sampleSpareFibres = spareFibres.slice(0, 5);
  const inputY = (index: number) => 76 + index * 44;
  const spareY = (index: number) => 330 + index * 26;
  const portY = (index: number) => 58 + index * 52;
  const splitterY = 220;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 520,
      }}
    >
      <svg
        viewBox="0 0 1040 520"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <marker
            id="arrowGreenDp"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#22c55e" />
          </marker>
          <marker
            id="arrowBlueDp"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#38bdf8" />
          </marker>
          <marker
            id="arrowGreyDp"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
          </marker>
          <marker
            id="arrowVioletDp"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#a855f7" />
          </marker>
        </defs>

        {displayedInputFibres.map((fibre, index) => {
          const colour = getFibreColour(fibre);
          const y = inputY(index);
          const active = selectedFibre === fibre;
          const isSplitter = splitterInputFibres.includes(fibre);
          const targetY = isSplitter
            ? splitterY
            : portY(Math.max(0, directFibres.indexOf(fibre)));
          const path = isSplitter
            ? `M 190 ${y} C 330 ${y}, 360 ${splitterY}, 460 ${splitterY}`
            : `M 190 ${y} C 360 ${y}, 530 ${targetY}, 710 ${targetY}`;

          return (
            <path
              key={fibre}
              d={path}
              fill="none"
              stroke={colour.colour}
              strokeWidth={active ? 5 : 3}
              opacity={active || !selectedFibre ? 1 : 0.28}
              markerEnd={
                isSplitter ? "url(#arrowVioletDp)" : "url(#arrowBlueDp)"
              }
              style={{
                cursor: "pointer",
                filter: active
                  ? `drop-shadow(0 0 8px ${colour.colour})`
                  : undefined,
              }}
              onClick={() => onSelectFibre(fibre)}
            />
          );
        })}

        {samplePassthroughFibres.map((fibre, index) => {
          const colour = getFibreColour(fibre);
          const y = spareY(index);
          const active = selectedFibre === fibre;
          return (
            <path
              key={`pass-${fibre}`}
              d={`M 190 ${y} C 430 ${y - 10}, 620 ${y + 10}, 890 ${y}`}
              fill="none"
              stroke={colour.colour}
              strokeWidth={active ? 4 : 2}
              opacity={active ? 1 : 0.58}
              markerEnd="url(#arrowGreyDp)"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectFibre(fibre)}
            />
          );
        })}

        {sampleSpareFibres.map((fibre, index) => {
          const y = spareY(index);
          const active = selectedFibre === fibre;
          return (
            <path
              key={`spare-${fibre}`}
              d={`M 190 ${y} C 430 ${y - 10}, 620 ${y + 10}, 890 ${y}`}
              fill="none"
              stroke="#64748b"
              strokeWidth={active ? 4 : 2}
              opacity={active ? 1 : 0.34}
              strokeDasharray="8 8"
              markerEnd="url(#arrowGreyDp)"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectFibre(fibre)}
            />
          );
        })}

        {portRoutes.slice(0, 8).map((route, index) => {
          if (route.routeType !== "splitter") return null;
          const y = portY(index);
          return (
            <path
              key={`splitter-${route.port}`}
              d={`M 545 ${splitterY} C 600 ${splitterY}, 620 ${y}, 665 ${y}`}
              fill="none"
              stroke="#22c55e"
              strokeWidth={selectedPort === route.port ? 5 : 3}
              opacity={selectedPort && selectedPort !== route.port ? 0.28 : 1}
              markerEnd="url(#arrowGreenDp)"
              style={{
                cursor: "pointer",
                filter:
                  selectedPort === route.port
                    ? "drop-shadow(0 0 8px #22c55e)"
                    : undefined,
              }}
              onClick={() => onSelectPort(route.port)}
            />
          );
        })}
      </svg>

      <div style={{ position: "absolute", left: 18, top: 18, width: 190 }}>
        <div style={smallLabelStyle()}>
          Used Input Fibres ({displayedInputFibres.length})
        </div>
        <div
          style={{
            display: "grid",
            gap: 7,
            marginTop: 10,
            maxHeight: 270,
            overflow: "auto",
            paddingRight: 4,
          }}
        >
          {displayedInputFibres.length ? (
            displayedInputFibres.map((fibre) => {
              const colour = getFibreColour(fibre);
              const active = selectedFibre === fibre;
              return (
                <button
                  key={fibre}
                  type="button"
                  onClick={() => onSelectFibre(fibre)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: active
                      ? "rgba(37,99,235,0.28)"
                      : "rgba(15,23,42,0.86)",
                    border: active
                      ? `2px solid ${colour.colour}`
                      : "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    color: "#f8fafc",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      background: colour.colour,
                      color: colour.textColour,
                      width: 25,
                      height: 25,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 950,
                    }}
                  >
                    {fibre}
                  </span>
                  <span>
                    <strong>{colour.name}</strong>
                    <small style={{ display: "block", color: "#94a3b8" }}>
                      {directFibres.includes(fibre)
                        ? `direct to Port ${directFibres.indexOf(fibre) + 1}`
                        : "to splitter"}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <div style={{ color: "#94a3b8" }}>No fibres selected</div>
          )}
        </div>

        <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 12 }}>
          {samplePassthroughFibres.length
            ? `${samplePassthroughFibres.length} passthrough fibres shown from ${passthroughFibres.length}.`
            : null}
          {samplePassthroughFibres.length && sampleSpareFibres.length
            ? " "
            : null}
          {sampleSpareFibres.length
            ? `${sampleSpareFibres.length} spare fibres shown from ${spareFibres.length}.`
            : null}
          {!samplePassthroughFibres.length && !sampleSpareFibres.length
            ? "No passthrough/spare fibres on this cable."
            : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          splitterInputFibres[0] && onSelectFibre(splitterInputFibres[0])
        }
        style={{
          position: "absolute",
          left: "44%",
          top: splitterY,
          transform: "translate(-50%, -50%)",
          width: 100,
          height: 86,
          borderRadius: 16,
          background: "rgba(15,23,42,0.96)",
          border: "1px solid rgba(148,163,184,0.38)",
          color: "#f8fafc",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          boxShadow: "0 18px 34px rgba(0,0,0,0.34)",
        }}
      >
        <span style={{ textAlign: "center" }}>
          <strong style={{ fontSize: 20 }}>{splitterRatio}</strong>
          <small style={{ display: "block", color: "#93c5fd", marginTop: 3 }}>
            SPLITTER
          </small>
        </span>
      </button>

      <div style={{ position: "absolute", right: 20, top: 18, width: 292 }}>
        <div style={smallLabelStyle()}>Output Ports ({portRoutes.length})</div>
        <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
          {portRoutes.slice(0, 8).map((route) => {
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
                  background: active
                    ? "rgba(37,99,235,0.28)"
                    : "rgba(15,23,42,0.86)",
                  border: active
                    ? "2px solid #38bdf8"
                    : "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 10,
                  padding: "9px 9px",
                  color: "#f8fafc",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <strong style={{ color: route.fibreColour || "#93c5fd" }}>
                  Port {route.port}
                </strong>
                <span
                  style={{
                    color: route.routeType === "spare" ? "#94a3b8" : "#4ade80",
                    fontSize: 12,
                  }}
                >
                  {route.routeType === "direct"
                    ? `Active (${route.fibreLabel})`
                    : route.routeType === "splitter"
                      ? "Splitter output"
                      : "Available"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
