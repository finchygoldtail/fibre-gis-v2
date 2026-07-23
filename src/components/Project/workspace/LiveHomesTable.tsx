import React from "react";
import type { SavedMapAsset } from "../../map/types";
import type { LiveHomesDpRow } from "./LiveHomesControl";

type Props = {
  rows: LiveHomesDpRow[];
  selectedDpId?: string;
  onSelectDp?: (dpId: string) => void;
  onFocusDp?: (asset: SavedMapAsset) => void;
  onOpenDp?: (asset: SavedMapAsset) => void;
};

function pct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function statusStyle(status: string): React.CSSProperties {
  const normalised = status.toLowerCase();
  if (normalised === "live") return { ...pill, background: "rgba(34,197,94,0.16)", color: "#15803d", borderColor: "rgba(34,197,94,0.35)" };
  if (normalised.includes("bwip")) return { ...pill, background: "rgba(59,130,246,0.16)", color: "#2563eb", borderColor: "rgba(59,130,246,0.35)" };
  if (normalised.includes("unserviceable")) return { ...pill, background: "rgba(239,68,68,0.16)", color: "#dc2626", borderColor: "rgba(239,68,68,0.35)" };
  if (normalised.includes("ready")) return { ...pill, background: "rgba(245,158,11,0.16)", color: "#d97706", borderColor: "rgba(245,158,11,0.35)" };
  return pill;
}

function displayReference(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^distribution-point-\d+$/i.test(text)) return "";
  if (/^[a-f0-9-]{16,}$/i.test(text)) return "";
  return text;
}

export default function LiveHomesTable({ rows, selectedDpId, onSelectDp, onFocusDp, onOpenDp }: Props) {
  if (!rows.length) {
    return <div style={emptyState}>No DPs match the current live homes filters.</div>;
  }

  return (
    <div style={tableWrap}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>DP</th>
            <th style={th}>Closure</th>
            <th style={th}>Status</th>
            <th style={th}>Homes</th>
            <th style={th}>Live</th>
            <th style={th}>Not Live</th>
            <th style={th}>Drops</th>
            <th style={th}>Capacity</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = row.dp.id === selectedDpId;
            return (
              <tr key={row.dp.id} style={active ? activeTr : tr}>
                <td style={td}>
                  <button type="button" style={nameButton} onClick={() => onSelectDp?.(row.dp.id)}>
                    {row.name}
                  </button>
                  {displayReference(row.dp.id) ? <div style={subText}>{displayReference(row.dp.id)}</div> : null}
                </td>
                <td style={td}>{row.closureType}</td>
                <td style={td}><span style={statusStyle(row.status)}>{row.status}</span></td>
                <td style={tdStrong}>{row.homesServed}</td>
                <td style={tdStrong}>{row.liveHomes}</td>
                <td style={tdStrong}>{row.notLiveHomes}</td>
                <td style={tdStrong}>{row.dropCableCount}</td>
                <td style={td}>
                  <div style={{ fontWeight: 900 }}>{row.capacityUsed} / {row.capacity || "—"}</div>
                  <div style={barOuter}><div style={{ ...barInner, width: pct(row.capacityPercent) }} /></div>
                </td>
                <td style={td}>
                  <div style={actionGroup}>
                    <button type="button" style={actionButton} onClick={() => onFocusDp?.(row.dp)}>Focus</button>
                    <button type="button" style={actionButton} onClick={() => onOpenDp?.(row.dp)}>Open</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableWrap: React.CSSProperties = {
  overflow: "auto",
  maxHeight: 430,
  border: "1px solid #ddd8cf",
  borderRadius: 12,
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 920 };
const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "#ffffff",
  color: "#2563eb",
  textAlign: "left",
  padding: "10px 11px",
  fontSize: 11,
  letterSpacing: 0.35,
  textTransform: "uppercase",
  borderBottom: "1px solid #ddd8cf",
};
const tr: React.CSSProperties = { background: "#ffffff" };
const activeTr: React.CSSProperties = { background: "rgba(37,99,235,0.24)", boxShadow: "inset 3px 0 0 #60a5fa" };
const td: React.CSSProperties = { padding: "10px 11px", borderBottom: "1px solid #e2ded7", color: "#64748b", fontSize: 12, verticalAlign: "middle" };
const tdStrong: React.CSSProperties = { ...td, color: "#1f2933", fontWeight: 900 };
const nameButton: React.CSSProperties = { background: "transparent", border: "none", padding: 0, color: "#1f2933", fontWeight: 900, cursor: "pointer", textAlign: "left" };
const subText: React.CSSProperties = { marginTop: 3, color: "#64748b", fontSize: 10, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", border: "1px solid #d8d2c8", borderRadius: 999, padding: "4px 8px", color: "#1f2933", background: "#e2ded7", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" };
const barOuter: React.CSSProperties = { marginTop: 5, height: 6, background: "#e2ded7", borderRadius: 999, overflow: "hidden", border: "1px solid #ddd8cf" };
const barInner: React.CSSProperties = { height: "100%", background: "#22c55e", borderRadius: 999 };
const actionGroup: React.CSSProperties = { display: "flex", gap: 6 };
const actionButton: React.CSSProperties = { border: "1px solid #d8d2c8", background: "#ffffff", color: "#1f2933", borderRadius: 7, padding: "7px 8px", fontWeight: 850, cursor: "pointer", fontSize: 11 };
const emptyState: React.CSSProperties = { border: "1px solid #ddd8cf", background: "#ffffff", borderRadius: 12, padding: 16, color: "#64748b" };



