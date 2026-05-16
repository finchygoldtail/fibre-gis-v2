// =====================================================
// FILE: TraceTopologyPanel.tsx
// PURPOSE: Operational topology trace panel for Project Workspace.
//          Pure UI over topologyTraceService.
// =====================================================

import React, { useMemo } from "react";
import type { SavedMapAsset } from "../map/types";
import type { AuditIssue } from "../../services/areaAudit";
import type { NetworkGraph } from "../../services/networkGraph";

import {
  buildTopologyTrace,
  type TopologyTraceStep,
} from "../../services/topologyTraceService";

type TraceTopologyPanelProps = {
  selectedAsset: SavedMapAsset | null;
  assets: SavedMapAsset[];
  networkGraph: NetworkGraph;
  auditIssues?: AuditIssue[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={metricCard}>
      <span style={metricLabel}>{label}</span>
      <strong style={metricValue}>{value}</strong>
    </div>
  );
}

function StepList({
  title,
  empty,
  rows,
  onSelectAsset,
}: {
  title: string;
  empty: string;
  rows: TopologyTraceStep[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
}) {
  return (
    <section style={sectionCard}>
      <h4 style={sectionTitle}>{title}</h4>
      {rows.length === 0 ? (
        <div style={emptyText}>{empty}</div>
      ) : (
        <div style={stepStack}>
          {rows.map((row) => (
            <button
              key={`${row.direction}-${row.id}`}
              type="button"
              style={stepButton}
              onClick={() => row.asset && onSelectAsset?.(row.asset as SavedMapAsset)}
            >
              <div style={stepTitleRow}>
                <strong>{row.title}</strong>
                {row.fibreText ? <span style={fibrePill}>{row.fibreText}</span> : null}
              </div>
              <span style={stepSubTitle}>{row.subtitle}</span>
              {row.warning ? <span style={warningText}>{row.warning}</span> : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function TraceTopologyPanel({
  selectedAsset,
  assets,
  networkGraph,
  auditIssues = [],
  onSelectAsset,
}: TraceTopologyPanelProps) {
  const trace = useMemo(
    () =>
      buildTopologyTrace({
        selectedAsset,
        assets,
        graph: networkGraph,
        auditIssues,
      }),
    [selectedAsset, assets, networkGraph, auditIssues],
  );

  if (!selectedAsset) {
    return (
      <div style={emptyPanel}>
        Select a cable, joint, DP, AFN or MDU on the workspace map to trace the
        operational topology.
      </div>
    );
  }

  return (
    <div style={panelWrap}>
      <div style={selectedCard}>
        <div style={kicker}>TRACE SELECTED</div>
        <h3 style={selectedTitle}>{trace.summary.selectedName}</h3>
        <div style={selectedType}>{trace.summary.selectedType}</div>
      </div>

      {trace.warnings.length ? (
        <div style={warningBox}>
          <strong>Trace warnings</strong>
          {trace.warnings.slice(0, 4).map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      <div style={metricGrid}>
        <Metric label="Upstream" value={trace.summary.upstreamCount} />
        <Metric label="Downstream" value={trace.summary.downstreamCount} />
        <Metric label="Branches" value={trace.summary.branchCableCount} />
        <Metric label="Homes" value={trace.summary.connectedHomeCount} />
        <Metric label="Reserved" value={`${trace.summary.reservedFibres}${trace.summary.capacity ? `/${trace.summary.capacity}` : ""}F`} />
        <Metric label="Utilisation" value={formatPercent(trace.summary.utilisationPercent)} />
        <Metric label="QA High" value={trace.summary.qaHigh} />
        <Metric label="QA Med/Low" value={`${trace.summary.qaMedium}/${trace.summary.qaLow}`} />
      </div>

      <StepList
        title="Upstream Chain"
        empty="No upstream links found. Check endpoint snapping or through-cable references."
        rows={trace.upstream}
        onSelectAsset={onSelectAsset}
      />

      <StepList
        title="Downstream Chain"
        empty="No downstream links found yet."
        rows={trace.downstream}
        onSelectAsset={onSelectAsset}
      />

      <StepList
        title="Branch Cables"
        empty="No branch cables detected from this asset."
        rows={trace.branches}
        onSelectAsset={onSelectAsset}
      />

      <StepList
        title="Fibre Reservations"
        empty="No fibre reservation metadata found yet. Apply/rebuild the fibre plan to populate this section."
        rows={trace.fibre}
        onSelectAsset={onSelectAsset}
      />

      <StepList
        title="Connected Homes / Drops"
        empty="No connected homes or drop cables detected in the current trace."
        rows={trace.homes}
        onSelectAsset={onSelectAsset}
      />

      <StepList
        title="QA Risks"
        empty="No QA risks tied to this trace."
        rows={trace.qa}
        onSelectAsset={onSelectAsset}
      />
    </div>
  );
}

const panelWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const selectedCard: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.35)",
  background: "linear-gradient(135deg, rgba(30,64,175,0.35), rgba(2,6,23,0.95))",
  borderRadius: 16,
  padding: 14,
};

const kicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.4,
};

const selectedTitle: React.CSSProperties = {
  margin: "6px 0 2px",
  color: "#f8fafc",
  fontSize: 18,
};

const selectedType: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
};

const warningBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  border: "1px solid rgba(251,113,133,0.35)",
  background: "rgba(127,29,29,0.28)",
  borderRadius: 14,
  padding: 12,
  color: "#fecdd3",
  fontSize: 12,
};

const metricGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const metricCard: React.CSSProperties = {
  minHeight: 58,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.82)",
  borderRadius: 14,
  padding: 10,
};

const metricLabel: React.CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 800,
  marginBottom: 5,
};

const metricValue: React.CSSProperties = {
  color: "#e5e7eb",
  fontSize: 16,
};

const sectionCard: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.55)",
  borderRadius: 16,
  padding: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 9px",
  color: "#e5e7eb",
  fontSize: 13,
  letterSpacing: 0.2,
};

const stepStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const stepButton: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid rgba(51,65,85,0.95)",
  background: "rgba(15,23,42,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#e5e7eb",
  cursor: "pointer",
};

const stepTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const stepSubTitle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#94a3b8",
  fontSize: 12,
};

const fibrePill: React.CSSProperties = {
  border: "1px solid rgba(34,197,94,0.35)",
  background: "rgba(22,101,52,0.25)",
  color: "#bbf7d0",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const warningText: React.CSSProperties = {
  display: "block",
  marginTop: 5,
  color: "#fecaca",
  fontSize: 12,
};

const emptyText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const emptyPanel: React.CSSProperties = {
  border: "1px dashed rgba(148,163,184,0.3)",
  background: "rgba(15,23,42,0.45)",
  borderRadius: 16,
  padding: 16,
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
};
