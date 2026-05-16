import React from "react";

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: any[];
  projectArea?: any;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
};

const panel: React.CSSProperties = { background: "#0f1b2d", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#e5e7eb" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(148,163,184,0.12)", color: "#cbd5e1" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const tile: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", background: "#111827", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };
const readinessBadge: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900, border: "1px solid rgba(96,165,250,0.35)", color: "#93c5fd", background: "rgba(37,99,235,0.12)" };

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={row}><span>{label}</span><strong style={{ color: "#f8fafc" }}>{value}</strong></div>;
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

export default function WorkspaceOverview({ projectName, status, stats, projectAssets, projectArea, onOpenPanel, onOpenTrace, onExport }: Props) {
  const readiness = stats?.operationalReadiness;
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  return <>
    <section style={panel}>
      <h3 style={title}>Project Summary</h3>
      <Row label="Area" value={projectName} />
      <Row label="Status" value={status || "Live"} />
      <Row label="Readiness" value={<span style={readinessBadge}>{readiness?.state || "Build"}</span>} />
      <Row label="Readiness Score" value={`${n(readiness?.score)}%`} />
      <Row label="Homes" value={`${n(stats?.homesConnected)} / ${n(stats?.homesPassed)}`} />
      <Row label="Route Length" value={`${n(stats?.routeLengthMeters)} m`} />
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={() => onOpenPanel?.("projectDetails", "assets")}>View Project Details</button>
    </section>
    <section style={panel}>
      <h3 style={title}>RFS Progress</h3>
      <div style={{ display: "grid", placeItems: "center", minHeight: 92 }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: Number(stats?.rfsPercent || 0) >= 80 ? "#4ade80" : "#fb7185" }}>{n(stats?.rfsPercent)}%</div>
        <div style={{ color: "#94a3b8" }}>Complete</div>
      </div>
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={() => onOpenPanel?.("rfsBreakdown", "build")}>View RFS Breakdown</button>
    </section>
    <section style={panel}>
      <h3 style={title}>Area Readiness</h3>
      <div style={{ display: "grid", placeItems: "center", minHeight: 92 }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: blockers.length ? "#fb7185" : "#4ade80" }}>{n(readiness?.score)}%</div>
        <div style={{ color: "#94a3b8" }}>{readiness?.state || "Build"}</div>
      </div>
      <Row label="Hard blockers" value={blockers.length ? blockers.length : "None"} />
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={() => onOpenPanel?.("rfsBreakdown", "build")}>View Readiness</button>
    </section>
    <section style={panel}>
      <h3 style={title}>Issue Summary</h3>
      <div style={grid}>
        <Tile label="Issues" value={n(stats?.issueCount)} />
        <Tile label="Unmatched Cables" value={n(stats?.unmatchedCableIds)} />
      </div>
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={() => onOpenPanel?.("issues", "qa")}>View All Issues</button>
    </section>
    <section style={panel}>
      <h3 style={title}>Topology Summary</h3>
      <Row label="Mapped Joints" value={n(stats?.mappedJoints ?? stats?.joints)} />
      <Row label="Fibre Rows" value={n(stats?.fibreTrayRows)} />
      <Row label="Route Links" value={n(stats?.topologyLinks)} />
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={() => onOpenPanel?.("topology", "topology")}>View Topology</button>
    </section>
    <section style={wide}>
      <h3 style={title}>Asset Overview</h3>
      <div style={grid}>
        <Tile label="Total Assets" value={n(projectAssets?.length)} />
        <Tile label="Joints" value={n(stats?.joints)} />
        <Tile label="DPs / CBTs / AFNs" value={n(stats?.dps)} />
        <Tile label="Cables" value={n(stats?.cables)} />
        <Tile label="Poles" value={n(stats?.poles)} />
        <Tile label="Chambers" value={n(stats?.chambers)} />
      </div>
    </section>
    <section style={wide}>
      <h3 style={title}>Quick Actions</h3>
      <div style={grid}>
        <button type="button" style={button} onClick={() => onOpenPanel?.("qa", "qa")}>Run QA Validation</button>
        <button type="button" style={button} onClick={() => { onOpenPanel?.("trace", "topology"); onOpenTrace?.(); }}>Trace Fibre Route</button>
        <button type="button" style={button} onClick={() => onOpenPanel?.("addAsset", "assets")}>Add New Asset</button>
        <button type="button" style={button} onClick={onExport}>Export Project Data</button>
        <button type="button" style={button} onClick={() => onOpenPanel?.("report", "reports")}>Generate Report</button>
      </div>
    </section>
  </>;
}
