import React from "react";
import type { PiaAcceptanceStats, PiaAcceptanceStatus } from "../../../services/piaIntelligence";

function formatNumber(value: number | undefined): string {
  return (value ?? 0).toLocaleString("en-GB");
}

function colourFor(status: PiaAcceptanceStatus | "pass" | "photo"): string {
  if (status === "photos_uploaded" || status === "photo") return "#38bdf8";
  if (status === "contractor_pass") return "#f97316";
  if (status === "please_review") return "#a855f7";
  if (status === "pia_pass" || status === "pass") return "#22c55e";
  if (status === "pia_fail") return "#ef4444";
  return "#94a3b8";
}

function KpiCard({ label, value, status, icon }: { label: string; value: React.ReactNode; status: PiaAcceptanceStatus | "pass" | "photo"; icon: string }) {
  const colour = colourFor(status);
  return (
    <div style={kpiCard}>
      <div style={{ ...kpiIcon, background: `${colour}22`, color: colour }}>{icon}</div>
      <div>
        <div style={smallLabel}>{label}</div>
        <div style={kpiValue}>{value}</div>
      </div>
    </div>
  );
}

export default function PiaKpiPanel({ stats }: { stats: PiaAcceptanceStats<any> }) {
  const required = Math.max(0, stats.requiredTotal ?? stats.total - (stats.notRequired || 0));
  const reviewed = Math.max(0, (stats.piaPass || 0) + (stats.piaFail || 0));
  const remaining = Math.max(0, required - reviewed);
  const progressPercent = required ? Math.round((reviewed / required) * 100) : 0;

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <div>
          <div style={kicker}>PIA Dashboard</div>
          <h2 style={title}>PIA Workspace Checks</h2>
        </div>
        <div style={pill}>{formatNumber(stats.awaitingPiaCheck)} awaiting check</div>
      </div>
      <p style={intro}>Review poles and chambers, check uploaded evidence, and update the PIA status.</p>
      <div style={progressHeader}>
        <strong>{formatNumber(reviewed)} / {formatNumber(required)} reviewed</strong>
        <span>{formatNumber(remaining)} remaining · {progressPercent}% complete</span>
      </div>
      <div style={progressTrack}>
        <div style={{ ...progressFill, width: `${progressPercent}%` }} />
      </div>
      <div style={grid}>
        <KpiCard icon="−" label="Not Required" value={formatNumber(stats.notRequired)} status="not_required" />
        <KpiCard icon="▣" label="Photos Uploaded" value={formatNumber(stats.photosUploaded)} status="photo" />
        <KpiCard icon="✓" label="Contractor Pass" value={formatNumber(stats.contractorPass)} status="contractor_pass" />
        <KpiCard icon="◷" label="Awaiting Check" value={formatNumber(stats.awaitingPiaCheck)} status="please_review" />
        <KpiCard icon="✓" label="PIA Pass" value={formatNumber(stats.piaPass)} status="pia_pass" />
        <KpiCard icon="×" label="PIA Fail" value={formatNumber(stats.piaFail)} status="pia_fail" />
        <KpiCard icon="◯" label="Pass Rate" value={`${formatNumber(stats.passPercent)}%`} status="pass" />
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.28)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
};
const panelHeader: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 };
const kicker: React.CSSProperties = { color: "#93c5fd", fontSize: 11, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "6px 0 0", fontSize: 18, color: "#f8fafc" };
const intro: React.CSSProperties = { margin: "14px 0 16px", color: "#94a3b8", fontSize: 13 };
const pill: React.CSSProperties = { border: "1px solid rgba(34,197,94,0.75)", color: "#4ade80", borderRadius: 999, padding: "7px 13px", fontWeight: 850, whiteSpace: "nowrap" };
const progressHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, color: "#cbd5e1", fontSize: 13, marginBottom: 8 };
const progressTrack: React.CSSProperties = { height: 9, borderRadius: 999, overflow: "hidden", background: "rgba(148,163,184,0.18)", marginBottom: 14 };
const progressFill: React.CSSProperties = { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #2563eb, #22c55e)", transition: "width 180ms ease" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const kpiCard: React.CSSProperties = { minHeight: 84, background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10, padding: 14, display: "flex", alignItems: "center", gap: 13 };
const kpiIcon: React.CSSProperties = { width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 950 };
const smallLabel: React.CSSProperties = { color: "#cbd5e1", fontSize: 12, fontWeight: 750 };
const kpiValue: React.CSSProperties = { color: "#f8fafc", fontSize: 28, fontWeight: 950, lineHeight: 1.05, marginTop: 2 };
