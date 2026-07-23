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

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

function getAssetName(asset: any): string {
  return String(asset?.name || asset?.jointName || asset?.label || asset?.cableId || asset?.id || "Asset");
}

function getStatus(asset: any): string {
  return String(asset?.status || asset?.buildStatus || asset?.dpDetails?.buildStatus || asset?.serviceStatus || "");
}

function buildActivityRows(projectAssets: any[], auditIssues: any[]) {
  const statusRows = (projectAssets || [])
    .filter((asset) => getStatus(asset))
    .slice(0, 8)
    .map((asset) => ({
      title: getAssetName(asset),
      detail: `Status: ${getStatus(asset)}`,
      tone: "Asset",
    }));

  const issueRows = (auditIssues || []).slice(0, 8).map((issue) => ({
    title: String(issue.assetName || issue.assetId || issue.title || "QA issue"),
    detail: String(issue.message || issue.description || issue.category || "Review required"),
    tone: String(issue.severity || "QA").toUpperCase(),
  }));

  return [...issueRows, ...statusRows].slice(0, 12);
}

export default function WorkspaceMaintenance({ auditIssues = [], stats, projectAssets = [], onOpenQA, onOpenPanel }: Props) {
  const rows = buildActivityRows(projectAssets, auditIssues);

  return <>
    <section style={panel}>
      <h3 style={title}>Maintenance Queue</h3>
      <div style={grid}>
        <Tile label="Open Issues" value={n(auditIssues.length ?? stats?.issueCount)} />
        <Tile label="High Priority" value={n(auditIssues.filter((issue: any) => issue?.severity === "high").length)} />
      </div>
      <button type="button" style={{ ...button, marginTop: 12, width: "100%" }} onClick={onOpenQA}>
        Open QA Review
      </button>
    </section>

    <section style={wide}>
      <h3 style={title}>Workspace Activity Feed</h3>
      <p style={{ color: "#64748b", fontSize: 12, marginTop: -4 }}>
        Read-only operational feed. Audited activity logging can be enabled from the maintenance workflow.
      </p>

      {rows.length ? rows.map((item, index) => (
        <div key={`${item.title}-${index}`} style={row}>
          <span>
            <strong style={{ color: "#1f2933" }}>{item.title}</strong>
            <br />
            <small style={{ color: "#64748b" }}>{item.detail}</small>
          </span>
          <strong>{item.tone}</strong>
        </div>
      )) : (
        <div style={{ color: "#64748b", background: "#ffffff", border: "1px solid #ddd8cf", borderRadius: 10, padding: 12 }}>
          No maintenance activity to show yet.
        </div>
      )}

      <button type="button" style={{ ...button, marginTop: 12 }} onClick={() => onOpenPanel?.("qa", "maintenance")}>
        Open Maintenance Drawer
      </button>
    </section>
  </>;
}


