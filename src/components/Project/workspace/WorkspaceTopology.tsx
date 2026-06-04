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

export default function WorkspaceTopology({ stats, networkGraph, disconnectedAssets = [], onOpenFibreTopology, onOpenTrace, onOpenPanel }: Props) {
  const graphNodes = networkGraph?.nodes?.size ?? networkGraph?.nodes?.length ?? 0;
  const graphLinks = networkGraph?.edges?.size ?? networkGraph?.edges?.length ?? 0;

  return <>
    <section style={panel}>
      <h3 style={title}>Topology Health</h3>
      <Row label="Graph Nodes" value={n(graphNodes)} />
      <Row label="Graph Links" value={n(graphLinks)} />
      <Row label="Disconnected Assets" value={n(disconnectedAssets.length)} />
    </section>

    <section style={panel}>
      <h3 style={title}>Fibre Topology</h3>
      <Row label="Mapped Joints" value={n(stats?.mappedJoints ?? stats?.joints)} />
      <Row label="Fibre Tray Rows" value={n(stats?.fibreTrayRows)} />
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={onOpenFibreTopology}>
        Open Fibre Tray Topology
      </button>
    </section>

    <section style={wide}>
      <h3 style={title}>Trace Workflow</h3>
      <div style={grid}>
        <Tile label="1. Select" value="Asset" />
        <Tile label="2. Inspect" value="Links" />
        <Tile label="3. Trace" value="Path" />
        <Tile label="4. Resolve" value="Issue" />
      </div>
      <p style={{ color: "#cbd5e1", marginTop: 12 }}>
        Select a cable, joint, DP, pole, chamber or street cabinet on the map, then open Trace to inspect upstream and downstream relationships.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={button} onClick={onOpenTrace}>Open Trace Tool</button>
        <button type="button" style={button} onClick={() => onOpenPanel?.("disconnected", "topology")}>Review Disconnected Assets</button>
      </div>
    </section>
  </>;
}
