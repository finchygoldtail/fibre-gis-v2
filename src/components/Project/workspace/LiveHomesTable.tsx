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
  if (normalised === "live") return { ...pill, background: "rgba(34,197,94,0.16)", color: "#86efac", borderColor: "rgba(34,197,94,0.35)" };
  if (normalised.includes("bwip")) return { ...pill, background: "rgba(59,130,246,0.16)", color: "#93c5fd", borderColor: "rgba(59,130,246,0.35)" };
  if (normalised.includes("unserviceable")) return { ...pill, background: "rgba(239,68,68,0.16)", color: "#fecaca", borderColor: "rgba(239,68,68,0.35)" };
  if (normalised.includes("ready")) return { ...pill, background: "rgba(245,158,11,0.16)", color: "#fcd34d", borderColor: "rgba(245,158,11,0.35)" };
  return pill;
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
                  <div style={subText}>{row.dp.id}</div>
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
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 920 };
const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "#081225",
  color: "#93c5fd",
  textAlign: "left",
  padding: "10px 11px",
  fontSize: 11,
  letterSpacing: 0.35,
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(148,163,184,0.18)",
};
const tr: React.CSSProperties = { background: "rgba(15,23,42,0.58)" };
const activeTr: React.CSSProperties = { background: "rgba(37,99,235,0.24)", boxShadow: "inset 3px 0 0 #60a5fa" };
const td: React.CSSProperties = { padding: "10px 11px", borderBottom: "1px solid rgba(148,163,184,0.10)", color: "#cbd5e1", fontSize: 12, verticalAlign: "middle" };
const tdStrong: React.CSSProperties = { ...td, color: "#f8fafc", fontWeight: 900 };
const nameButton: React.CSSProperties = { background: "transparent", border: "none", padding: 0, color: "#f8fafc", fontWeight: 900, cursor: "pointer", textAlign: "left" };
const subText: React.CSSProperties = { marginTop: 3, color: "#64748b", fontSize: 10, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 999, padding: "4px 8px", color: "#e5e7eb", background: "rgba(148,163,184,0.10)", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" };
const barOuter: React.CSSProperties = { marginTop: 5, height: 6, background: "rgba(15,23,42,0.95)", borderRadius: 999, overflow: "hidden", border: "1px solid rgba(148,163,184,0.16)" };
const barInner: React.CSSProperties = { height: "100%", background: "#22c55e", borderRadius: 999 };
const actionGroup: React.CSSProperties = { display: "flex", gap: 6 };
const actionButton: React.CSSProperties = { border: "1px solid rgba(96,165,250,0.26)", background: "#10203a", color: "#e5e7eb", borderRadius: 7, padding: "7px 8px", fontWeight: 850, cursor: "pointer", fontSize: 11 };
const emptyState: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.58)", borderRadius: 12, padding: 16, color: "#cbd5e1" };
