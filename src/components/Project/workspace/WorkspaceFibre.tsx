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

const panel: React.CSSProperties = { background: "transparent", border: "1px solid #ddd8cf", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#1f2933" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #ddd8cf", color: "#64748b" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const tile: React.CSSProperties = { background: "#ffffff", border: "1px solid #ddd8cf", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid #ddd8cf", background: "#ffffff", color: "#1f2933", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={row}><span>{label}</span><strong style={{ color: "#1f2933" }}>{value}</strong></div>;
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

export default function WorkspaceFibre({ stats, onOpenFibreTopology }: Props) {
  return <>
    <section style={panel}><h3 style={title}>Fibre Summary</h3><Row label="Splice Points" value={n(stats?.splicePoints)} /><Row label="Fibre Tray Rows" value={n(stats?.fibreTrayRows)} /><Row label="Mapped Joints" value={n(stats?.mappedJoints ?? stats?.joints)} /></section>
    <section style={wide}><h3 style={title}>Fibre Tray Topology</h3><p style={{ color: "#64748b" }}>Open the existing Fibre Tray / Joint topology editor from here. The current tray logic remains untouched by this workspace module.</p><button type="button" style={button} onClick={onOpenFibreTopology}>Open Fibre Tray Topology</button></section>
  </>;
}


