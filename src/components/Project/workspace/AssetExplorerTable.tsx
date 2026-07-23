import React from "react";
import type { SavedMapAsset } from "../../map/types";

export type AssetExplorerRow = {
  asset: SavedMapAsset;
  id: string;
  name: string;
  type: string;
  status: string;
  closureType: string;
  capacity: number;
  used: number;
  free: number;
  risk: "OK" | "WARN" | "FULL" | "OVER" | "UNKNOWN";
  fibreSummary: string;
  location: string;
};

type Props = {
  rows: AssetExplorerRow[];
  selectedAssetId?: string | null;
  selectedBulkCableIds?: string[];
  onToggleBulkCable?: (assetId: string) => void;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset?: (asset: SavedMapAsset) => void;
  onTraceAsset?: (asset: SavedMapAsset) => void;
};

const wrap: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #ddd8cf",
  borderRadius: 12,
  overflow: "hidden",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  color: "#64748b",
  fontSize: 12,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#ffffff",
  color: "#64748b",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #ddd8cf",
};

const td: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid #e2ded7",
  verticalAlign: "top",
};

const nameButton: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#bfdbfe",
  fontWeight: 900,
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
};

const actionButton: React.CSSProperties = {
  border: "1px solid #d8d2c8",
  background: "#ffffff",
  color: "#1f2933",
  borderRadius: 7,
  padding: "6px 8px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
};

function riskStyle(risk: AssetExplorerRow["risk"]): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 900,
    border: "1px solid #d8d2c8",
    color: "#64748b",
    background: "#e2ded7",
  };

  if (risk === "OK") return { ...base, color: "#15803d", background: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.34)" };
  if (risk === "WARN") return { ...base, color: "#d97706", background: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.34)" };
  if (risk === "FULL") return { ...base, color: "#fdba74", background: "rgba(249,115,22,0.14)", borderColor: "rgba(249,115,22,0.34)" };
  if (risk === "OVER") return { ...base, color: "#dc2626", background: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.34)" };
  return base;
}

function capacityText(row: AssetExplorerRow): string {
  if (!row.capacity) return "—";
  return `${row.used}/${row.capacity} (${row.free} free)`;
}

function displayReference(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^distribution-point-\d+$/i.test(text)) return "";
  if (/^[a-f0-9-]{16,}$/i.test(text)) return "";
  return text;
}

function isCableRow(row: AssetExplorerRow): boolean {
  const item = row.asset as any;
  const raw = String(item.assetType || item.type || item.cableType || row.type || "").toLowerCase();
  return row.asset.geometry?.type === "LineString" || raw.includes("cable");
}

function readPiaNoi(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(
    item.piaNoiNumber ||
      item.piaNOI ||
      item.piaNoi ||
      item.noiNumber ||
      item.properties?.piaNoiNumber ||
      item.properties?.piaNOI ||
      item.properties?.piaNoi ||
      item.properties?.noiNumber ||
      ""
  ).trim();
}

export default function AssetExplorerTable({
  rows,
  selectedAssetId,
  selectedBulkCableIds = [],
  onToggleBulkCable,
  onSelectAsset,
  onOpenAsset,
  onTraceAsset,
}: Props) {
  const selectedBulkSet = new Set(selectedBulkCableIds);
  if (!rows.length) {
    return (
      <div style={{ ...wrap, padding: 16, color: "#64748b" }}>
        No assets match the current filters.
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ maxHeight: 540, overflow: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              {onToggleBulkCable ? <th style={{ ...th, width: 42 }}>Bulk</th> : null}
              <th style={th}>Asset</th>
              <th style={th}>Type</th>
              <th style={th}>Status</th>
              <th style={th}>Capacity</th>
              <th style={th}>Fibre</th>
              <th style={th}>PIA NOI</th>
              <th style={th}>Location</th>
              <th style={th}>Risk</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const active = row.id === selectedAssetId;
              const cable = isCableRow(row);
              const bulkSelected = selectedBulkSet.has(row.id);
              return (
                <tr key={row.id} style={active ? { background: "rgba(37,99,235,0.18)" } : undefined}>
                  {onToggleBulkCable ? (
                    <td style={td}>
                      {cable ? (
                        <input
                          type="checkbox"
                          checked={bulkSelected}
                          onChange={() => onToggleBulkCable(row.id)}
                          aria-label={`Select ${row.name} for bulk PIA NOI`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td style={td}>
                    <button type="button" style={nameButton} onClick={() => onSelectAsset?.(row.asset)}>{row.name}</button>
                    {displayReference(row.id) ? <div style={{ color: "#64748b", marginTop: 3 }}>{displayReference(row.id)}</div> : null}
                  </td>
                  <td style={td}>{row.type}{row.closureType ? <div style={{ color: "#64748b" }}>{row.closureType}</div> : null}</td>
                  <td style={td}>{row.status || "Unknown"}</td>
                  <td style={td}>{capacityText(row)}</td>
                  <td style={td}>{row.fibreSummary || "—"}</td>
                  <td style={td}>{readPiaNoi(row.asset) || "—"}</td>
                  <td style={td}>{row.location || "—"}</td>
                  <td style={td}><span style={riskStyle(row.risk)}>{row.risk}</span></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" style={actionButton} onClick={() => onSelectAsset?.(row.asset)}>Select</button>
                      <button type="button" style={actionButton} onClick={() => onOpenAsset?.(row.asset)}>Open</button>
                      <button type="button" style={actionButton} onClick={() => onTraceAsset?.(row.asset)}>Trace</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


