import React from "react";
import type { PiaAcceptanceStats } from "../../../services/piaIntelligence";

function formatNumber(value: number | undefined): string {
  return (value ?? 0).toLocaleString("en-GB");
}

function AlertMini({ value, label, colour }: { value: number; label: string; colour: string }) {
  return (
    <div style={alertMini}>
      <strong style={{ color: colour }}>{formatNumber(value)}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function PiaAlertsPanel({ stats }: { stats: PiaAcceptanceStats<any> }) {
  return (
    <div style={panel}>
      <div style={header}>PIA Alerts</div>
      <div style={alertGrid}>
        <AlertMini value={stats.awaitingPiaCheck} label="Awaiting review" colour="#a855f7" />
        <AlertMini value={stats.piaFail} label="PIA Fail" colour="#ef4444" />
        <AlertMini value={stats.photosUploaded} label="New uploads" colour="#38bdf8" />
        <AlertMini value={stats.contractorPass} label="Contractor pass" colour="#f97316" />
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.22)",
  borderRadius: 14,
  padding: 16,
};
const header: React.CSSProperties = { color: "#dbeafe", fontSize: 14, fontWeight: 850, marginBottom: 14 };
const alertGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const alertMini: React.CSSProperties = { display: "grid", gap: 4, color: "#cbd5e1", fontSize: 12 };
