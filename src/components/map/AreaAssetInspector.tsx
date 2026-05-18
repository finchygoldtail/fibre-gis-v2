// =====================================================
// FILE: AreaAssetInspector.tsx
// PURPOSE: Network Operations dashboard for selected area,
//          QA summary, topology health, asset search, and CSV export.
// =====================================================

import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "./types";
import { auditAreaAssets, type AuditIssue, type AuditSeverity } from "../../services/areaAudit";
import { exportToCSV } from "../../services/csvExport";

type Props = {
  assets: SavedMapAsset[];
  areaAsset?: SavedMapAsset | null;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onZoomAsset?: (asset: SavedMapAsset) => void;
  networkStats?: {
    nodes: number;
    edges: number;
    disconnected: number;
  };
};

type LatLngTuple = [number, number];

type InspectorRow = {
  asset: SavedMapAsset;
  id: string;
  name: string;
  type: string;
  status: string;
  piaNoiNumber: string;
  cableType: string;
  fibreCount: string;
  usedFibres: string;
  installMethod: string;
  notes: string;
  latitude: string;
  longitude: string;
  startLatitude: string;
  startLongitude: string;
  endLatitude: string;
  endLongitude: string;
  routePoints: string;
};

function getAreaPolygon(areaAsset?: SavedMapAsset | null): LatLngTuple[] {
  if (!areaAsset || areaAsset.geometry?.type !== "Polygon") return [];

  const ring = areaAsset.geometry.coordinates?.[0] || [];

  return ring
    .map((point: unknown) => point as LatLngTuple)
    .filter(
      (point) =>
        Array.isArray(point) &&
        typeof point[0] === "number" &&
        typeof point[1] === "number",
    );
}

function pointInPolygon(point: LatLngTuple, polygon: LatLngTuple[]): boolean {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersects =
      lngI > lng !== lngJ > lng &&
      lat <
        ((latJ - latI) * (lng - lngI)) /
          (lngJ - lngI || Number.EPSILON) +
          latI;

    if (intersects) inside = !inside;
  }

  return inside;
}

function orientation(a: LatLngTuple, b: LatLngTuple, c: LatLngTuple): number {
  const value =
    (b[1] - a[1]) * (c[0] - b[0]) -
    (b[0] - a[0]) * (c[1] - b[1]);

  if (Math.abs(value) < 1e-12) return 0;

  return value > 0 ? 1 : 2;
}

function onSegment(a: LatLngTuple, b: LatLngTuple, c: LatLngTuple): boolean {
  return (
    b[0] <= Math.max(a[0], c[0]) &&
    b[0] >= Math.min(a[0], c[0]) &&
    b[1] <= Math.max(a[1], c[1]) &&
    b[1] >= Math.min(a[1], c[1])
  );
}

function segmentsIntersect(
  p1: LatLngTuple,
  q1: LatLngTuple,
  p2: LatLngTuple,
  q2: LatLngTuple,
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

function lineIntersectsPolygon(
  points: LatLngTuple[],
  polygon: LatLngTuple[],
): boolean {
  if (points.some((point) => pointInPolygon(point, polygon))) return true;

  for (let i = 0; i < points.length - 1; i++) {
    const lineStart = points[i];
    const lineEnd = points[i + 1];

    for (let j = 0; j < polygon.length; j++) {
      const polyStart = polygon[j];
      const polyEnd = polygon[(j + 1) % polygon.length];

      if (segmentsIntersect(lineStart, lineEnd, polyStart, polyEnd)) {
        return true;
      }
    }
  }

  return false;
}

function getAssetCoordinates(asset: SavedMapAsset): LatLngTuple[] {
  if (!asset.geometry) return [];

  if (asset.geometry.type === "Point") {
    return [asset.geometry.coordinates as LatLngTuple];
  }

  if (asset.geometry.type === "LineString") {
    return (asset.geometry.coordinates || []) as LatLngTuple[];
  }

  if (asset.geometry.type === "Polygon") {
    return (asset.geometry.coordinates?.[0] || []) as LatLngTuple[];
  }

  return [];
}

function getAssetStatus(asset: SavedMapAsset): string {
  const raw =
    (asset as any).status ||
    (asset as any).liveStatus ||
    (asset as any).buildStatus ||
    (asset as any).state ||
    (asset as any).dpDetails?.buildStatus ||
    (asset as any).properties?.status ||
    (asset as any).properties?.buildStatus ||
    (asset as any).properties?.connection ||
    "Unknown";

  return String(raw);
}

function getAssetTypeLabel(asset: SavedMapAsset): string {
  return String(asset.assetType || asset.jointType || "asset");
}

function getAssetFibreCount(asset: SavedMapAsset): string {
  if (asset.assetType === "cable") {
    return String((asset as any).fibreCount || "");
  }

  const jointType = String((asset as any).jointType || "");
  const trayMatch = jointType.match(/(\d+)\s*trays?/i);

  if (trayMatch) {
    const trays = Number(trayMatch[1]);
    return `${trays * 12}F`;
  }

  return String((asset as any).fibreCount || "");
}

function getAssetUsedFibres(asset: SavedMapAsset): string {
  const directUsedFibres = (asset as any).usedFibres;

  if (
    directUsedFibres !== undefined &&
    directUsedFibres !== null &&
    String(directUsedFibres).trim() !== ""
  ) {
    return String(directUsedFibres);
  }

  if (asset.assetType === "cable") {
    const allocatedInputFibres = (asset as any).allocatedInputFibres;

    if (Array.isArray(allocatedInputFibres)) {
      return String(allocatedInputFibres.length);
    }
  }

  const fibreMappings = (asset as any).fibreMappings;
  if (Array.isArray(fibreMappings)) return String(fibreMappings.length);

  const trayMappings = (asset as any).trayMappings;
  if (Array.isArray(trayMappings)) return String(trayMappings.length);

  const mappings = (asset as any).mappings;
  if (Array.isArray(mappings)) return String(mappings.length);

  return "";
}

function makeRow(asset: SavedMapAsset): InspectorRow {
  const points = getAssetCoordinates(asset);
  const first = points[0];
  const last = points[points.length - 1];
  const point = asset.geometry?.type === "Point" ? first : undefined;

  return {
    asset,
    id: asset.id || "",
    name: asset.name || "",
    type: getAssetTypeLabel(asset),
    status: getAssetStatus(asset),
    piaNoiNumber: String((asset as any).piaNoiNumber || ""),
    cableType: String((asset as any).cableType || ""),
    fibreCount: getAssetFibreCount(asset),
    usedFibres: getAssetUsedFibres(asset),
    installMethod: String((asset as any).installMethod || ""),
    notes: String((asset as any).notes || ""),
    latitude: point ? String(point[0]) : "",
    longitude: point ? String(point[1]) : "",
    startLatitude: first ? String(first[0]) : "",
    startLongitude: first ? String(first[1]) : "",
    endLatitude: last ? String(last[0]) : "",
    endLongitude: last ? String(last[1]) : "",
    routePoints: String(points.length || ""),
  };
}

function normalise(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isHomeAsset(row: InspectorRow): boolean {
  const type = normalise(row.type);
  return type === "home" || type.includes("home") || type.includes("premise");
}

function isConnectedStatus(status: string): boolean {
  const value = normalise(status);
  return (
    value.includes("connected") ||
    value.includes("live") ||
    value.includes("rfs") ||
    value.includes("ready for service")
  );
}

function isBuildCompleteStatus(status: string): boolean {
  const value = normalise(status);
  return (
    value.includes("build complete") ||
    value.includes("built") ||
    value.includes("complete") ||
    value.includes("rfs") ||
    value.includes("live")
  );
}

function parseFibreCount(value: string): number {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function distanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const radius = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeLengthMeters(asset: SavedMapAsset): number {
  const points = getAssetCoordinates(asset);
  if (points.length < 2) return 0;

  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + distanceMeters(points[index - 1], point);
  }, 0);
}

function formatDistance(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}


function getAssetKey(asset: any): string {
  return String(
    asset?.id ??
      asset?.assetId ??
      asset?.homeId ??
      asset?.uprn ??
      asset?.UPRN ??
      asset?.properties?.UPRN ??
      asset?.properties?.uprn ??
      "",
  ).trim();
}

function isDropCable(asset: any): boolean {
  const cableType = normalise(asset?.cableType);
  return asset?.assetType === "cable" && cableType.includes("drop");
}

function getConnectedHomeIdsFromDrops(assets: SavedMapAsset[]): Set<string> {
  const connected = new Set<string>();

  assets.filter(isDropCable).forEach((drop: any) => {
    const homeId = String(
      drop?.homeId ??
        drop?.toAssetId ??
        drop?.connectedHomeId ??
        drop?.uprn ??
        drop?.UPRN ??
        "",
    ).trim();

    if (!homeId) return;

    connected.add(homeId);
    if (!homeId.startsWith("uprn-")) connected.add(`uprn-${homeId}`);
  });

  return connected;
}

function isHomeConnected(asset: SavedMapAsset, connectedHomeIds: Set<string>): boolean {
  const directConnection =
    Boolean((asset as any).connectedDpId) ||
    Boolean((asset as any).properties?.connectedDpId) ||
    normalise((asset as any).connection) === "connected" ||
    normalise((asset as any).properties?.connection) === "connected";

  if (directConnection) return true;

  const key = getAssetKey(asset);
  if (key && connectedHomeIds.has(key)) return true;

  const uprn = String(
    (asset as any).uprn ??
      (asset as any).UPRN ??
      (asset as any).properties?.uprn ??
      (asset as any).properties?.UPRN ??
      "",
  ).trim();

  return Boolean(uprn && (connectedHomeIds.has(uprn) || connectedHomeIds.has(`uprn-${uprn}`)));
}

function getCableCapacity(row: InspectorRow): number {
  return parseFibreCount(row.fibreCount);
}

function getCableUsedFibres(row: InspectorRow): number {
  return parseFibreCount(row.usedFibres);
}

function isCableOverCapacity(row: InspectorRow): boolean {
  const capacity = getCableCapacity(row);
  const used = getCableUsedFibres(row);
  return capacity > 0 && used > capacity;
}

function hasConnectionReference(asset: SavedMapAsset): boolean {
  const data = asset as any;
  return Boolean(
    data.fromAssetId ||
      data.toAssetId ||
      data.parentCableId ||
      data.connectedDpId ||
      data.properties?.connectedDpId ||
      data.dpId ||
      data.homeId ||
      data.connectedHomeId,
  );
}

const severityRank: Record<AuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function compareAuditIssues(a: AuditIssue, b: AuditIssue): number {
  const severityDiff = severityRank[a.severity] - severityRank[b.severity];
  if (severityDiff !== 0) return severityDiff;

  const categoryDiff = a.category.localeCompare(b.category);
  if (categoryDiff !== 0) return categoryDiff;

  return a.issue.localeCompare(b.issue);
}


function isReferenceInfrastructureAsset(asset: any): boolean {
  const haystack = [
    asset?.source,
    asset?.assetType,
    asset?.jointType,
    asset?.cableType,
    asset?.name,
    asset?.piaRef,
    asset?.piaKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    asset?.readOnly === true ||
    asset?.isReferenceAsset === true ||
    haystack.includes("openreach") ||
    haystack.includes("pia") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:") ||
    haystack.includes("osp:") ||
    haystack.includes("missing pole")
  );
}

function getSeverityColours(severity: AuditSeverity) {
  if (severity === "high") {
    return {
      bg: "rgba(127, 29, 29, 0.34)",
      border: "#991b1b",
      text: "#fecaca",
      strong: "#fca5a5",
    };
  }

  if (severity === "medium") {
    return {
      bg: "rgba(120, 53, 15, 0.34)",
      border: "#92400e",
      text: "#fed7aa",
      strong: "#fdba74",
    };
  }

  return {
    bg: "rgba(30, 64, 175, 0.28)",
    border: "#1d4ed8",
    text: "#bfdbfe",
    strong: "#93c5fd",
  };
}

export default function AreaAssetInspector({
  assets,
  areaAsset,
  onSelectAsset,
  onZoomAsset,
  networkStats,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const polygon = useMemo(() => getAreaPolygon(areaAsset), [areaAsset]);

  const rows = useMemo(() => {
    if (polygon.length < 3) return [];

    return (assets || [])
      .filter((asset) => asset.id !== areaAsset?.id)
      .filter((asset) => !isReferenceInfrastructureAsset(asset))
      .filter((asset) => asset.assetType !== "area")
      .filter((asset) => {
        const coords = getAssetCoordinates(asset);
        if (coords.length === 0) return false;

        if (asset.geometry?.type === "LineString") {
          return lineIntersectsPolygon(coords, polygon);
        }

        return coords.some((point) => pointInPolygon(point, polygon));
      })
      .map(makeRow)
      .sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
      );
  }, [assets, areaAsset?.id, polygon]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesType = typeFilter === "all" || row.type === typeFilter;

      const matchesQuery =
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query) ||
        row.piaNoiNumber.toLowerCase().includes(query) ||
        row.status.toLowerCase().includes(query) ||
        row.notes.toLowerCase().includes(query);

      return matchesType && matchesQuery;
    });
  }, [rows, search, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    rows.forEach((row) => {
      counts.set(row.type, (counts.get(row.type) || 0) + 1);
    });

    return Array.from(counts.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [rows]);

  const operationsMetrics = useMemo(() => {
    const rowAssets = rows.map((row) => row.asset);
    const connectedHomeIds = getConnectedHomeIdsFromDrops(rowAssets);

    const homes = rows.filter(isHomeAsset);
    const connectedHomes = homes.filter(
      (row) => isConnectedStatus(row.status) || isHomeConnected(row.asset, connectedHomeIds),
    );

    const buildComplete = rows.filter((row) => isBuildCompleteStatus(row.status));
    const cables = rows.filter((row) => row.type === "cable");
    const joints = rows.filter((row) => row.type.includes("joint"));
    const dps = rows.filter((row) => row.type.includes("distribution"));
    const dropCables = cables.filter((row) => isDropCable(row.asset));
    const overCapacityCables = cables.filter(isCableOverCapacity);

    const orphanedAssets = rows.filter((row) => {
      if (row.type === "home" || row.type === "area") return false;
      if (row.type === "cable") return !hasConnectionReference(row.asset);
      return !hasConnectionReference(row.asset) && row.type !== "pole" && row.type !== "chamber";
    });

    const routeLength = cables.reduce(
      (total, row) => total + routeLengthMeters(row.asset),
      0,
    );

    const totalFibre = cables.reduce(
      (total, row) => total + getCableCapacity(row),
      0,
    );
    const usedFibre = cables.reduce(
      (total, row) => total + getCableUsedFibres(row),
      0,
    );

    return {
      homesPassed: homes.length,
      homesConnected: connectedHomes.length,
      buildComplete: buildComplete.length,
      buildPercent: rows.length ? (buildComplete.length / rows.length) * 100 : 0,
      rfsPercent: homes.length ? (connectedHomes.length / homes.length) * 100 : 0,
      cables: cables.length,
      joints: joints.length,
      dps: dps.length,
      dropCables: dropCables.length,
      overCapacityCables: overCapacityCables.length,
      orphanedAssets: orphanedAssets.length,
      routeLength,
      totalFibre,
      usedFibre,
      fibreUtilisation: totalFibre ? (usedFibre / totalFibre) * 100 : 0,
    };
  }, [rows]);

  const missingPiaCount = rows.filter(
    (row) => row.type === "cable" && !row.piaNoiNumber,
  ).length;

  const auditIssues = useMemo<AuditIssue[]>(() => {
    return auditAreaAssets(rows.map((row) => row.asset));
  }, [rows]);

  const sortedAuditIssues = useMemo(() => {
    return [...auditIssues].sort(compareAuditIssues);
  }, [auditIssues]);

  const severityCounts = useMemo(() => {
    return sortedAuditIssues.reduce(
      (counts, item) => {
        counts[item.severity] += 1;
        return counts;
      },
      { high: 0, medium: 0, low: 0 } as Record<AuditSeverity, number>,
    );
  }, [sortedAuditIssues]);

  const auditIssueCounts = useMemo(() => {
    const counts = new Map<string, { count: number; severity: AuditSeverity; category: string }>();

    sortedAuditIssues.forEach((item) => {
      const current = counts.get(item.issue);

      if (current) {
        current.count += 1;
      } else {
        counts.set(item.issue, {
          count: 1,
          severity: item.severity,
          category: item.category,
        });
      }
    });

    return Array.from(counts.entries()).sort((a, b) => {
      const severityDiff = severityRank[a[1].severity] - severityRank[b[1].severity];
      if (severityDiff !== 0) return severityDiff;
      return b[1].count - a[1].count || a[0].localeCompare(b[0]);
    });
  }, [sortedAuditIssues]);

  const networkHealthStatus =
    auditIssues.length > 0 || missingPiaCount > 0 || (networkStats?.disconnected || 0) > 0
      ? "Attention Required"
      : "Healthy";

  const handleDownloadCSV = () => {
    const csvRows = [
      {
        section: "summary",
        assetId: areaAsset?.id || "",
        assetName: areaAsset?.name || "",
        metric: "homesPassed",
        value: operationsMetrics.homesPassed,
        assetType: "area",
        issue: "",
      },
      {
        section: "summary",
        assetId: areaAsset?.id || "",
        assetName: areaAsset?.name || "",
        metric: "homesConnected",
        value: operationsMetrics.homesConnected,
        assetType: "area",
        issue: "",
      },
      {
        section: "summary",
        assetId: areaAsset?.id || "",
        assetName: areaAsset?.name || "",
        metric: "buildPercent",
        value: formatPercent(operationsMetrics.buildPercent),
        assetType: "area",
        issue: "",
      },
      {
        section: "summary",
        assetId: areaAsset?.id || "",
        assetName: areaAsset?.name || "",
        metric: "overCapacityCables",
        value: operationsMetrics.overCapacityCables,
        assetType: "area",
        issue: "",
      },
      {
        section: "summary",
        assetId: areaAsset?.id || "",
        assetName: areaAsset?.name || "",
        metric: "orphanedAssets",
        value: operationsMetrics.orphanedAssets,
        assetType: "area",
        issue: "",
      },
      ...sortedAuditIssues.map((issue) => ({
        section: "audit",
        assetId: issue.assetId,
        assetName: issue.assetName || "",
        metric: "issue",
        value: "",
        assetType: issue.assetType,
        severity: issue.severity,
        category: issue.category,
        issue: issue.issue,
      })),
    ];

    exportToCSV(csvRows, "network-operations-area-audit.csv");
  };

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={title}>Network Operations</div>
          <div style={hint}>
            {areaAsset
              ? `Operational scan: ${areaAsset.name || areaAsset.id}`
              : "Select a project area to scan build, QA, and network health."}
          </div>
        </div>

        <button
          type="button"
          style={button}
          disabled={!areaAsset}
          onClick={handleDownloadCSV}
        >
          Export CSV
        </button>
      </div>

      <div style={statusBanner(networkHealthStatus)}>
        <div>
          <div style={statusTitle}>{networkHealthStatus}</div>
          <div style={hint}>
            {areaAsset
              ? "Area-level build, QA, and topology indicators."
              : "Pick an area polygon to activate the dashboard."}
          </div>
        </div>
        <div style={statusPill}>{auditIssues.length} issues</div>
      </div>

      <div style={sectionTitle}>Area Overview</div>
      <div style={kpiGrid}>
        <KpiCard label="Homes Passed" value={operationsMetrics.homesPassed} />
        <KpiCard label="Homes Connected" value={operationsMetrics.homesConnected} />
        <KpiCard label="RFS" value={formatPercent(operationsMetrics.rfsPercent)} tone="green" />
        <KpiCard label="Build" value={formatPercent(operationsMetrics.buildPercent)} tone="blue" />
      </div>

      <div style={sectionTitle}>Network Capacity</div>
      <div style={summaryGrid}>
        <KpiCard label="Assets" value={rows.length} small />
        <KpiCard label="Cables" value={operationsMetrics.cables} small />
        <KpiCard label="Joints" value={operationsMetrics.joints} small />
        <KpiCard label="DPs" value={operationsMetrics.dps} small />
        <KpiCard label="Drop Cables" value={operationsMetrics.dropCables} small />
        <KpiCard label="Route Length" value={formatDistance(operationsMetrics.routeLength)} small />
        <KpiCard label="Fibre Usage" value={formatPercent(operationsMetrics.fibreUtilisation)} small />
      </div>

      <div style={sectionTitle}>QA Status</div>
      <div style={severityGrid}>
        <SeverityCard label="High" value={severityCounts.high} severity="high" />
        <SeverityCard label="Medium" value={severityCounts.medium} severity="medium" />
        <SeverityCard label="Low" value={severityCounts.low} severity="low" />
      </div>

      <div style={qaGrid}>
        <HealthCard label="Audit Issues" value={auditIssues.length} danger={auditIssues.length > 0} />
        <HealthCard label="Missing PIA" value={missingPiaCount} danger={missingPiaCount > 0} />
        <HealthCard
          label="Disconnected"
          value={networkStats?.disconnected ?? 0}
          danger={(networkStats?.disconnected ?? 0) > 0}
        />
        <HealthCard
          label="Over Capacity"
          value={operationsMetrics.overCapacityCables}
          danger={operationsMetrics.overCapacityCables > 0}
        />
        <HealthCard
          label="Orphaned"
          value={operationsMetrics.orphanedAssets}
          danger={operationsMetrics.orphanedAssets > 0}
        />
      </div>

      {networkStats && (
        <div style={qaDebugBox}>
          <div style={qaDebugTitle}>Topology Debug</div>
          <div style={qaDebugGrid}>
            <div>
              <div style={qaDebugNumber}>{networkStats.nodes}</div>
              <div style={summaryLabel}>Nodes</div>
            </div>
            <div>
              <div style={qaDebugNumber}>{networkStats.edges}</div>
              <div style={summaryLabel}>Edges</div>
            </div>
            <div>
              <div style={qaDebugNumber}>{networkStats.disconnected}</div>
              <div style={summaryLabel}>Disconnected</div>
            </div>
          </div>
        </div>
      )}

      <div style={auditBox}>
        <div style={auditHeaderRow}>
          <div>
            <div style={qaDebugTitle}>Operational Issues</div>
            <div style={hint}>Checks assets currently inside the selected area.</div>
          </div>
          <div style={auditTotal(auditIssues.length)}>{auditIssues.length}</div>
        </div>

        {auditIssues.length === 0 ? (
          <div style={auditEmpty}>No operational issues found in this area.</div>
        ) : (
          <>
            <div style={auditIssueChips}>
              {auditIssueCounts.map(([issue, data]) => (
                <span key={issue} style={auditChip(data.severity)}>
                  {data.severity.toUpperCase()} · {issue}: {data.count}
                </span>
              ))}
            </div>

            <div style={auditList}>
              {sortedAuditIssues.slice(0, 14).map((item, index) => (
                <div
                  key={`${item.assetId}-${item.issue}-${index}`}
                  style={auditRow(item.severity)}
                >
                  <div style={auditRowTop}>
                    <span style={warningText}>{item.issue}</span>
                    <span style={severityPill(item.severity)}>{item.severity.toUpperCase()}</span>
                  </div>

                  <span style={auditRowMeta}>
                    {item.category} · {item.assetType} · {item.assetName || item.assetId}
                  </span>
                </div>
              ))}

              {sortedAuditIssues.length > 14 ? (
                <div style={auditMore}>+{sortedAuditIssues.length - 14} more issues</div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div style={sectionTitle}>Asset Search</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, PIA NOI, status..."
          style={input}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={select}
        >
          <option value="all">All types</option>
          {typeCounts.map(([type, count]) => (
            <option key={type} value={type}>
              {type} ({count})
            </option>
          ))}
        </select>
      </div>

      <div style={tableWrap}>
        {filteredRows.length === 0 ? (
          <div style={emptyState}>
            {areaAsset
              ? "No matching assets found inside this area."
              : "No area selected."}
          </div>
        ) : (
          filteredRows.map((row) => (
            <button
              key={row.id}
              type="button"
              style={rowButton}
              onClick={() => {
                onZoomAsset?.(row.asset);
                onSelectAsset?.(row.asset);
              }}
              title="Click to zoom/select this asset"
            >
              <div style={rowTop}>
                <span style={rowName}>{row.name || row.id}</span>
                <span style={badge}>{row.type}</span>
              </div>

              <div style={rowMeta}>
                <span>Status: {row.status}</span>
                {row.fibreCount ? <span>Fibre: {row.fibreCount}</span> : null}
                {row.usedFibres ? <span>Used: {row.usedFibres}</span> : null}
                {row.piaNoiNumber ? <span>PIA: {row.piaNoiNumber}</span> : null}
                {row.type === "cable" && !row.piaNoiNumber ? (
                  <span style={warningText}>Missing PIA NOI</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "green" | "blue";
  small?: boolean;
}) {
  return (
    <div style={small ? summaryBox : kpiBox}>
      <div style={kpiNumber(tone, small)}>{value}</div>
      <div style={summaryLabel}>{label}</div>
    </div>
  );
}

function SeverityCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: number;
  severity: AuditSeverity;
}) {
  const colours = getSeverityColours(severity);

  return (
    <div style={severityBox(severity)}>
      <div style={{ ...severityNumber, color: colours.strong }}>{value}</div>
      <div style={summaryLabel}>{label}</div>
    </div>
  );
}

function HealthCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger: boolean;
}) {
  return (
    <div style={healthBox(danger)}>
      <div style={healthNumber(danger)}>{value}</div>
      <div style={summaryLabel}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #374151",
  background: "#111827",
  borderRadius: 10,
  padding: 12,
  marginTop: 12,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const title: React.CSSProperties = {
  color: "white",
  fontWeight: 900,
  fontSize: "1rem",
};

const hint: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.78rem",
  marginTop: 3,
  lineHeight: 1.35,
};

const button: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.45rem 0.65rem",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const statusBanner = (status: string): React.CSSProperties => ({
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: status === "Healthy" ? "rgba(22, 101, 52, 0.18)" : "rgba(146, 64, 14, 0.18)",
  border: status === "Healthy" ? "1px solid #166534" : "1px solid #92400e",
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
});

const statusTitle: React.CSSProperties = {
  color: "#f8fafc",
  fontWeight: 900,
};

const statusPill: React.CSSProperties = {
  borderRadius: 999,
  background: "#020617",
  color: "#e5e7eb",
  border: "1px solid #334155",
  padding: "3px 8px",
  fontSize: "0.72rem",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 12,
  color: "#93c5fd",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const severityGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const qaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const kpiBox: React.CSSProperties = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: 10,
};

const summaryBox: React.CSSProperties = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 8,
};

const kpiNumber = (
  tone: "default" | "green" | "blue",
  small: boolean,
): React.CSSProperties => ({
  color: tone === "green" ? "#86efac" : tone === "blue" ? "#93c5fd" : "#f8fafc",
  fontWeight: 900,
  fontSize: small ? "0.95rem" : "1.25rem",
});

const severityBox = (severity: AuditSeverity): React.CSSProperties => {
  const colours = getSeverityColours(severity);

  return {
    background: colours.bg,
    border: `1px solid ${colours.border}`,
    borderRadius: 8,
    padding: 8,
  };
};

const severityNumber: React.CSSProperties = {
  fontWeight: 900,
  fontSize: "1.05rem",
};

const healthBox = (danger: boolean): React.CSSProperties => ({
  background: danger ? "rgba(127, 29, 29, 0.28)" : "rgba(22, 101, 52, 0.16)",
  border: danger ? "1px solid #7f1d1d" : "1px solid #166534",
  borderRadius: 8,
  padding: 8,
});

const healthNumber = (danger: boolean): React.CSSProperties => ({
  color: danger ? "#fecaca" : "#86efac",
  fontWeight: 900,
  fontSize: "1rem",
});

const summaryLabel: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: "0.72rem",
  marginTop: 2,
};

const input: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "0.55rem",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#020617",
  color: "white",
};

const select: React.CSSProperties = {
  width: 125,
  padding: "0.55rem",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#020617",
  color: "white",
};

const tableWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 10,
  maxHeight: 260,
  overflowY: "auto",
};

const emptyState: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.85rem",
  padding: "0.75rem",
  border: "1px dashed #374151",
  borderRadius: 8,
};

const rowButton: React.CSSProperties = {
  textAlign: "left",
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 9,
  color: "white",
  cursor: "pointer",
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const rowName: React.CSSProperties = {
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const badge: React.CSSProperties = {
  color: "#bfdbfe",
  background: "#1e3a8a",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: "0.7rem",
  whiteSpace: "nowrap",
};

const rowMeta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: "#cbd5e1",
  fontSize: "0.75rem",
  marginTop: 5,
};

const warningText: React.CSSProperties = {
  color: "#fbbf24",
  fontWeight: 700,
};

const qaDebugBox: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#020617",
  border: "1px solid #334155",
};

const qaDebugTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#93c5fd",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const qaDebugGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const qaDebugNumber: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#f8fafc",
};

const auditBox: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#0f172a",
  border: "1px solid #334155",
};

const auditHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const auditTotal = (count: number): React.CSSProperties => ({
  minWidth: 34,
  textAlign: "center",
  borderRadius: 8,
  padding: "4px 8px",
  background: count > 0 ? "#7f1d1d" : "#166534",
  color: count > 0 ? "#fecaca" : "#bbf7d0",
  fontWeight: 900,
});

const auditEmpty: React.CSSProperties = {
  marginTop: 8,
  color: "#86efac",
  fontSize: "0.8rem",
};

const auditIssueChips: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 8,
};

const auditChip = (severity: AuditSeverity): React.CSSProperties => {
  const colours = getSeverityColours(severity);

  return {
    borderRadius: 999,
    background: colours.bg,
    border: `1px solid ${colours.border}`,
    color: colours.text,
    padding: "3px 7px",
    fontSize: "0.72rem",
    fontWeight: 800,
  };
};

const auditList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 8,
  maxHeight: 180,
  overflowY: "auto",
};

const auditRow = (severity: AuditSeverity): React.CSSProperties => {
  const colours = getSeverityColours(severity);

  return {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderRadius: 8,
    background: "#111827",
    border: `1px solid ${colours.border}`,
    padding: 8,
  };
};

const auditRowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
};

const severityPill = (severity: AuditSeverity): React.CSSProperties => {
  const colours = getSeverityColours(severity);

  return {
    borderRadius: 999,
    background: colours.bg,
    border: `1px solid ${colours.border}`,
    color: colours.text,
    padding: "2px 6px",
    fontSize: "0.65rem",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
};

const auditRowMeta: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: "0.72rem",
  wordBreak: "break-word",
};

const auditMore: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: "0.78rem",
  fontWeight: 800,
};
