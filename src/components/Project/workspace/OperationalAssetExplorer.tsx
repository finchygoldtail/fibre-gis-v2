import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "../../map/types";
import AssetExplorerFilters, {
  DEFAULT_ASSET_EXPLORER_FILTERS,
  type AssetExplorerFiltersState,
} from "./AssetExplorerFilters";
import AssetExplorerTable, { type AssetExplorerRow } from "./AssetExplorerTable";
import {
  getDpCapacitySummary,
  getDpConnectedHomeCount,
} from "../../../services/dpIntelligence";

type Props = {
  projectAssets: SavedMapAsset[];
  selectedAssetId?: string | null;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset?: (asset: SavedMapAsset) => void;
  onTraceAsset?: (asset: SavedMapAsset) => void;
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function norm(value: unknown): string {
  return text(value).toLowerCase();
}


const CORE_CABLE_FIBRE_COUNTS = new Set([12, 24, 36, 48, 96, 144, 288]);

function parseCableFibreCount(asset: SavedMapAsset): number | null {
  const item = asset as any;
  const candidates = [
    item.fibreCount,
    item.fiberCount,
    item.coreCount,
    item.size,
    item.cableSize,
    item.cableFibreCount,
    item.properties?.fibreCount,
    item.properties?.fiberCount,
    item.properties?.coreCount,
    item.properties?.size,
    assetName(asset),
    item.cableId,
    item.cableName,
    item.label,
  ];

  for (const candidate of candidates) {
    const raw = text(candidate);
    if (!raw) continue;
    const match = raw.match(/\b(12|24|36|48|96|144|288)\s*(?:f|fibre|fiber|core|cores|ulw|fulw)?\b/i);
    if (match) return Number(match[1]);
  }

  return null;
}

function isCoreNetworkCable(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const raw = [
    item.assetType,
    item.type,
    item.cableType,
    item.routeType,
    item.name,
    item.label,
    item.cableId,
    item.cableName,
  ].map(norm).join(" ");

  const isLineOrCable = asset.geometry?.type === "LineString" || raw.includes("cable") || raw.includes("ulw") || raw.includes("fulw") || raw.includes("feeder") || raw.includes("link");
  if (!isLineOrCable) return false;

  const looksLikeServiceDrop =
    raw.includes("uprn") ||
    raw.includes("drop") ||
    raw.includes("service drop") ||
    raw.includes("drop cable") ||
    raw.includes("home drop") ||
    raw.includes("premise drop");

  const fibreCount = parseCableFibreCount(asset);
  if (looksLikeServiceDrop && (!fibreCount || fibreCount <= 1)) return false;
  if (!fibreCount) return false;
  return CORE_CABLE_FIBRE_COUNTS.has(fibreCount);
}

function assetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return text(item.name || item.jointName || item.label || item.cableId || item.assetId || item.id || "Unnamed asset");
}

function assetType(asset: SavedMapAsset): string {
  const item = asset as any;

  const raw = norm(
    item.assetType ||
    item.type ||
    item.jointType ||
    item.cableType ||
    "other"
  );

  // CABLES FIRST — only core network cables belong in this explorer.
  // UPRN/service drops stay out of the core engineering list.
  if (isCoreNetworkCable(asset)) {
    return "cable";
  }

  if (
    raw.includes("distribution") ||
    raw.includes("dp") ||
    raw.includes("cbt") ||
    raw.includes("afn") ||
    raw.includes("mdu") ||
    raw.includes("sb")
  ) {
    return "distribution-point";
  }

  if (
    raw.includes("joint") ||
    raw.includes("cmj") ||
    raw.includes("midj") ||
    raw.includes("lmj") ||
    raw.includes("mmj") ||
    raw.includes("ag")
  ) {
    return "ag-joint";
  }

  if (raw.includes("street-cab")) {
    return "street-cab";
  }

  if (raw.includes("pole")) return "pole";
  if (raw.includes("chamber")) return "chamber";
  if (raw.includes("home")) return "home";

  if (
    raw.includes("area") ||
    raw.includes("polygon") ||
    asset.geometry?.type === "Polygon"
  ) {
    return "area";
  }

  return "other";
}

export function isOperationalAssetRegisterAsset(asset: SavedMapAsset): boolean {
  const type = assetType(asset);
  return type !== "home";
}

function prettyType(type: string): string {
  if (type === "distribution-point") return "DP / SB";
  if (type === "ag-joint") return "Joint";
  if (type === "street-cab") return "Street cab";
  return type.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function closureType(asset: SavedMapAsset): string {
  const item = asset as any;
  const raw = text(item.dpDetails?.closureType || item.dpDetails?.networkArchitecture || item.closureType || item.dpType || item.distributionPointType || item.jointType).toUpperCase();
  if (raw.includes("MDU_SPLITTER")) return "MDU_SPLITTER";
  if (raw.includes("MDU")) return "MDU";
  if (raw.includes("AFN")) return "AFN";
  if (raw.includes("CBT")) return "CBT";
  return "";
}

function status(asset: SavedMapAsset): string {
  const item = asset as any;
  return text(item.status || item.buildStatus || item.serviceStatus || item.dpDetails?.buildStatus || item.properties?.status || "Unknown");
}

function numberList(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function getFibreSummary(asset: SavedMapAsset): string {
  const item = asset as any;
  const details = item.dpDetails || item.properties?.dpDetails || {};
  const fibres = numberList([
    details.afnDetails?.inputFibres,
    details.afnDetails?.splitterFibres,
    details.mduDetails?.inputFibres,
    details.autoFibrePlan?.inputFibres,
    item.inputFibres,
    item.splitterFibres,
  ]);

  if (fibres.length) return `F${fibres.join(", F")}`;

  const cableCount = text(item.fibreCount || item.fiberCount || item.coreCount || item.size);
  if (cableCount) return cableCount;

  const mappedRows = Array.isArray(item.mappingRows) ? item.mappingRows.length : Number(item.mappingRowsCount || 0);
  if (mappedRows) return `${mappedRows} mapped rows`;

  return "";
}

function getLocation(asset: SavedMapAsset): string {
  const item = asset as any;
  if (typeof item.lat === "number" && typeof item.lng === "number") return `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`;
  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates as any[];
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) return `${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}`;
  }
  return "";
}

function toRow(asset: SavedMapAsset, allAssets: SavedMapAsset[]): AssetExplorerRow {
  const type = assetType(asset);
  const capacitySummary =
    type === "distribution-point"
      ? getDpCapacitySummary(asset, allAssets, {
          connectedHomeCount: getDpConnectedHomeCount(asset, allAssets),
        })
      : null;
  const used = capacitySummary?.used || 0;
  const capacity = capacitySummary?.capacity || 0;
  const risk =
    capacitySummary?.state === "NO CAPACITY"
      ? "UNKNOWN"
      : capacitySummary?.state || "UNKNOWN";

  return {
    asset,
    id: text(asset.id || (asset as any).assetId || assetName(asset)),
    name: assetName(asset),
    type: prettyType(type),
    status: status(asset),
    closureType: closureType(asset),
    capacity,
    used,
    free: Math.max(0, capacity - used),
    risk,
    fibreSummary: getFibreSummary(asset),
    location: getLocation(asset),
  };
}

function matchesSearch(row: AssetExplorerRow, search: string): boolean {
  const q = norm(search);
  if (!q) return true;
  const item = row.asset as any;
  const haystack = [
    row.id,
    row.name,
    row.type,
    row.status,
    row.closureType,
    row.fibreSummary,
    item.cableId,
    item.jointName,
    item.label,
    item.assetId,
    item.notes,
  ]
    .map(norm)
    .join(" ");

  return haystack.includes(q);
}

function matchesFilters(row: AssetExplorerRow, filters: AssetExplorerFiltersState): boolean {
  if (!matchesSearch(row, filters.search)) return false;

  if (filters.type !== "all") {
    const type = assetType(row.asset);
    if (filters.type === "other") {
      if (type !== "other") return false;
    } else if (type !== filters.type) {
      return false;
    }
  }

  if (filters.status !== "all") {
    const rowStatus = row.status || "Unknown";
    if (filters.status === "Unknown") {
      if (rowStatus !== "Unknown") return false;
    } else if (rowStatus !== filters.status) {
      return false;
    }
  }

  if (filters.showRiskOnly && !(row.risk === "WARN" || row.risk === "FULL" || row.risk === "OVER")) return false;

  return true;
}

function sortRows(rows: AssetExplorerRow[], sort: AssetExplorerFiltersState["sort"]): AssetExplorerRow[] {
  const next = [...rows];
  const riskRank: Record<string, number> = { OVER: 0, FULL: 1, WARN: 2, UNKNOWN: 3, OK: 4 };

  next.sort((a, b) => {
    if (sort === "type") return `${a.type} ${a.name}`.localeCompare(`${b.type} ${b.name}`, undefined, { numeric: true });
    if (sort === "status") return `${a.status} ${a.name}`.localeCompare(`${b.status} ${b.name}`, undefined, { numeric: true });
    if (sort === "capacity") return b.used / Math.max(1, b.capacity) - a.used / Math.max(1, a.capacity);
    if (sort === "risk") return (riskRank[a.risk] ?? 99) - (riskRank[b.risk] ?? 99) || a.name.localeCompare(b.name, undefined, { numeric: true });
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return next;
}

export default function OperationalAssetExplorer({
  projectAssets,
  selectedAssetId,
  onSelectAsset,
  onOpenAsset,
  onTraceAsset,
  onBulkUpdateCablePiaNoi,
}: Props) {
  const [filters, setFilters] = useState<AssetExplorerFiltersState>(DEFAULT_ASSET_EXPLORER_FILTERS);
  const [selectedBulkCableIds, setSelectedBulkCableIds] = useState<string[]>([]);

  const explorerAssets = useMemo(() => {
    return (projectAssets || []).filter((asset) => {
      if (!isOperationalAssetRegisterAsset(asset)) return false;

      const item = asset as any;
      const raw = [item.assetType, item.type, item.cableType, item.name, item.label, item.cableId, item.cableName].map(norm).join(" ");
      const isLineOrCable = asset.geometry?.type === "LineString" || raw.includes("cable") || raw.includes("ulw") || raw.includes("fulw") || raw.includes("feeder") || raw.includes("link");
      return !isLineOrCable || isCoreNetworkCable(asset);
    });
  }, [projectAssets]);

  const allRows = useMemo(() => explorerAssets.map((asset) => toRow(asset, projectAssets || [])), [explorerAssets, projectAssets]);
  const filteredRows = useMemo(() => sortRows(allRows.filter((row) => matchesFilters(row, filters)), filters.sort), [allRows, filters]);

  const riskCount = allRows.filter((row) => row.risk === "WARN" || row.risk === "FULL" || row.risk === "OVER").length;
  const dpCount = allRows.filter((row) => assetType(row.asset) === "distribution-point").length;
  const jointCount = allRows.filter((row) => assetType(row.asset) === "ag-joint").length;
  const cableCount = allRows.filter((row) => assetType(row.asset) === "cable").length;

  const filteredCableRows = filteredRows.filter((row) => assetType(row.asset) === "cable");
  const selectedCableCount = selectedBulkCableIds.length;

  const toggleBulkCable = (assetId: string) => {
    setSelectedBulkCableIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId],
    );
  };

  const selectFilteredCables = () => {
    setSelectedBulkCableIds(filteredCableRows.map((row) => row.id));
  };

  const clearBulkCableSelection = () => setSelectedBulkCableIds([]);

  const applyBulkPiaNoi = async () => {
    if (!selectedBulkCableIds.length) {
      alert("Select one or more cables first.");
      return;
    }

    const piaNoiNumber = window.prompt(
      `PIA NOI number to apply to ${selectedBulkCableIds.length} selected cable${selectedBulkCableIds.length === 1 ? "" : "s"}:`,
      "",
    );
    if (piaNoiNumber === null) return;

    const trimmedPiaNoi = piaNoiNumber.trim();
    if (!trimmedPiaNoi) {
      alert("Enter a PIA NOI number before applying.");
      return;
    }

    const note = window.prompt(
      "Audit note for bulk PIA NOI update:",
      `Bulk apply PIA NOI ${trimmedPiaNoi}`,
    );
    if (note === null) return;

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      alert("An audit note is required before applying a bulk PIA NOI update.");
      return;
    }

    await onBulkUpdateCablePiaNoi({
      assetIds: selectedBulkCableIds,
      piaNoiNumber: trimmedPiaNoi,
      note: trimmedNote,
    });
  };

  return (
    <section style={{ gridColumn: "span 2", display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {[
          ["Assets", allRows.length],
          ["DPs / SBs", dpCount],
          ["Joints", jointCount],
          ["Cables", cableCount],
          ["Risk", riskCount],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ background: "transparent", border: "1px solid #ddd8cf", borderRadius: 10, padding: 12 }}>
            <div style={{ color: "#64748b", fontSize: 12 }}>{label}</div>
            <div style={{ color: "#1f2933", fontSize: 24, fontWeight: 900, marginTop: 5 }}>{Number(value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <AssetExplorerFilters value={filters} onChange={setFilters} totalCount={allRows.length} filteredCount={filteredRows.length} />

      <div style={{ background: "transparent", border: "1px solid #d8d2c8", borderRadius: 12, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#1f2933", fontWeight: 900 }}>Bulk PIA NOI</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            Select cable rows below, then apply one PIA NOI number to all selected cables.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 12 }}>{selectedCableCount} selected</span>
          <button type="button" style={{ border: "1px solid #d8d2c8", background: "#ffffff", color: "#1f2933", borderRadius: 8, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }} onClick={selectFilteredCables}>
            Select Filtered Cables ({filteredCableRows.length})
          </button>
          <button type="button" style={{ border: "1px solid #d8d2c8", background: "#ffffff", color: "#1f2933", borderRadius: 8, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }} onClick={clearBulkCableSelection}>
            Clear
          </button>
          <button
            type="button"
            style={{
              border: "1px solid rgba(34,197,94,0.45)",
              background: "#15803d",
              color: "#dcfce7",
              borderRadius: 8,
              padding: "8px 10px",
              fontWeight: 900,
              cursor: onBulkUpdateCablePiaNoi ? "pointer" : "not-allowed",
              opacity: onBulkUpdateCablePiaNoi ? 1 : 0.55,
            }}
            onClick={applyBulkPiaNoi}
            disabled={!onBulkUpdateCablePiaNoi}
          >
            Apply PIA NOI
          </button>
        </div>
      </div>

      <AssetExplorerTable
        rows={filteredRows}
        selectedAssetId={selectedAssetId}
        selectedBulkCableIds={selectedBulkCableIds}
        onToggleBulkCable={toggleBulkCable}
        onSelectAsset={onSelectAsset}
        onOpenAsset={onOpenAsset || onSelectAsset}
        onTraceAsset={onTraceAsset || onSelectAsset}
      />
    </section>
  );
}


