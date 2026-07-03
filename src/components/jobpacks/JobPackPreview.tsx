import type React from "react";
import type { JobPackDraft } from "../../services/jobpacks";

type JobPackPreviewProps = {
  draft: JobPackDraft;
};

export function JobPackPreview({ draft }: JobPackPreviewProps) {
  return (
    <section style={panel}>
      <div style={head}>
        <div>
          <div style={eyebrow}>Alistra GIS Draft</div>
          <h3 style={title}>{draft.packNumber}</h3>
        </div>
        <span style={badge}>{draft.status.replace(/_/g, " ")}</span>
      </div>
      <div style={grid}>
        <Metric label="Assets" value={draft.summary.totalAssets} />
        <Metric label="Routes" value={draft.summary.routes} />
        <Metric label="DPs" value={draft.summary.distributionPoints} />
        <Metric label="Homes" value={draft.summary.homes} />
        <Metric label="Risks" value={draft.summary.risks} />
        <Metric label="Blockers" value={draft.summary.blockers} />
      </div>
      {draft.overviewMapImageDataUrl ? (
        <img src={draft.overviewMapImageDataUrl} alt="Captured live map overview" style={capturedMap} />
      ) : (
        <div style={captureRequired}>
          Live map capture required. Use the Route Pages capture controls before exporting the contractor pack.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 8,
  padding: 14,
  background: "rgba(15, 23, 42, 0.86)",
};

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const eyebrow: React.CSSProperties = { color: "#38bdf8", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const title: React.CSSProperties = { margin: "4px 0 12px", color: "#f8fafc", fontSize: 18 };
const badge: React.CSSProperties = { borderRadius: 999, padding: "5px 9px", background: "rgba(14,165,233,.18)", color: "#bae6fd", fontWeight: 900, fontSize: 12 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 };
const metric: React.CSSProperties = { border: "1px solid rgba(148,163,184,.14)", borderRadius: 8, padding: 10, background: "rgba(2,6,23,.55)", display: "grid", gap: 4 };
const capturedMap: React.CSSProperties = { width: "100%", borderRadius: 8, border: "1px solid rgba(34,197,94,.28)" };
const captureRequired: React.CSSProperties = { border: "1px dashed rgba(250,204,21,.35)", borderRadius: 8, padding: 18, color: "#fef3c7", background: "rgba(113,63,18,.16)" };
