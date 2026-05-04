// =====================================================
// FILE: AreaAssetInspector.tsx
// PURPOSE: Area scan panel, issue summary, asset search, and CSV export.
// =====================================================

import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "./types";

type Props = {
  assets: SavedMapAsset[];
  areaAsset?: SavedMapAsset | null;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onZoomAsset?: (asset: SavedMapAsset) => void;
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
        typeof point[1] === "number"
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
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI || Number.EPSILON) + latI;

    if (intersects) inside = !inside;
  }

  return inside;
}

function orientation(a: LatLngTuple, b: LatLngTuple, c: LatLngTuple): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
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

function segmentsIntersect(p1: LatLngTuple, q1: LatLngTuple, p2: LatLngTuple, q2: LatLngTuple): boolean {
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

function lineIntersectsPolygon(points: LatLngTuple[], polygon: LatLngTuple[]): boolean {
  if (points.some((point) => pointInPolygon(point, polygon))) return true;

  for (let i = 0; i < points.length - 1; i++) {
    const lineStart = points[i];
    const lineEnd = points[i + 1];

    for (let j = 0; j < polygon.length; j++) {
      const polyStart = polygon[j];
      const polyEnd = polygon[(j + 1) % polygon.length];

      if (segmentsIntersect(lineStart, lineEnd, polyStart, polyEnd)) return true;
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
    return ((asset.geometry.coordinates?.[0] || []) as LatLngTuple[]);
  }

  return [];
}

function getAssetStatus(asset: SavedMapAsset): string {
  const raw =
    (asset as any).status ||
    (asset as any).liveStatus ||
    (asset as any).buildStatus ||
    (asset as any).state ||
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
  if (Array.isArray(fibreMappings)) {
    return String(fibreMappings.length);
  }

  const trayMappings = (asset as any).trayMappings;
  if (Array.isArray(trayMappings)) {
    return String(trayMappings.length);
  }

  const mappings = (asset as any).mappings;
  if (Array.isArray(mappings)) {
    return String(mappings.length);
  }

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

function escapeCsv(value: string): string {
  const clean = value.replace(/\r?\n/g, " ");
  if (clean.includes(",") || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

function downloadCsv(rows: InspectorRow[], areaName: string) {
  const headers = [
    "Asset ID",
    "Name",
    "Type",
    "Status",
    "PIA NOI Number",
    "Cable Type",
    "Fibre Count",
    "Used Fibres",
    "Install Method",
    "Notes",
    "Latitude",
    "Longitude",
    "Start Latitude",
    "Start Longitude",
    "End Latitude",
    "End Longitude",
    "Route Points",
  ];

  const body = rows.map((row) =>
    [
      row.id,
      row.name,
      row.type,
      row.status,
      row.piaNoiNumber,
      row.cableType,
      row.fibreCount,
      row.usedFibres,
      row.installMethod,
      row.notes,
      row.latitude,
      row.longitude,
      row.startLatitude,
      row.startLongitude,
      row.endLatitude,
      row.endLongitude,
      row.routePoints,
    ]
      .map(escapeCsv)
      .join(",")
  );

  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (areaName || "area-assets").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

  link.href = url;
  link.download = `${safeName || "area-assets"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AreaAssetInspector({
  assets,
  areaAsset,
  onSelectAsset,
  onZoomAsset,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const polygon = useMemo(() => getAreaPolygon(areaAsset), [areaAsset]);

  const rows = useMemo(() => {
    if (polygon.length < 3) return [];

    return (assets || [])
      .filter((asset) => asset.id !== areaAsset?.id)
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
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
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
    rows.forEach((row) => counts.set(row.type, (counts.get(row.type) || 0) + 1));
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const missingPiaCount = rows.filter((row) => row.type === "cable" && !row.piaNoiNumber).length;

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={title}>Area Asset Inspector</div>
          <div style={hint}>
            {areaAsset
              ? `Scanning: ${areaAsset.name || areaAsset.id}`
              : "Select a project area to scan assets inside it."}
          </div>
        </div>

        <button
          type="button"
          style={button}
          disabled={filteredRows.length === 0}
          onClick={() => downloadCsv(filteredRows, areaAsset?.name || "area-assets")}
        >
          Download CSV
        </button>
      </div>

      <div style={summaryGrid}>
        <div style={summaryBox}>
          <div style={summaryNumber}>{rows.length}</div>
          <div style={summaryLabel}>Assets</div>
        </div>
        <div style={summaryBox}>
          <div style={summaryNumber}>{typeCounts.length}</div>
          <div style={summaryLabel}>Types</div>
        </div>
        <div style={summaryBox}>
          <div style={summaryNumber}>{missingPiaCount}</div>
          <div style={summaryLabel}>Cables missing PIA</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, PIA NOI, status..."
          style={input}
        />

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={select}>
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
            {areaAsset ? "No matching assets found inside this area." : "No area selected."}
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
                {row.fibreCount ? <span>Fibre Count: {row.fibreCount}</span> : null}
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
  fontWeight: 700,
  fontSize: "0.95rem",
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
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
};

const summaryBox: React.CSSProperties = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 8,
};

const summaryNumber: React.CSSProperties = {
  color: "#93c5fd",
  fontWeight: 800,
  fontSize: "1rem",
};

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
