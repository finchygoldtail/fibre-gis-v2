import React from "react";
import { isOperationalAssetRegisterAsset } from "./OperationalAssetExplorer";

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: any[];
  projectArea?: any;
  isBackhaulWorkspace?: boolean;
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

const shell: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "minmax(360px, 1.1fr) minmax(360px, 0.9fr)",
  gap: 12,
  alignItems: "stretch",
};

const panel: React.CSSProperties = {
  background: "linear-gradient(180deg, #0f1b2d 0%, #0b1626 100%)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 12,
  padding: 16,
  minHeight: 0,
};

const wide: React.CSSProperties = { ...panel, gridColumn: "1 / -1" };

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 950,
  color: "#f8fafc",
};

const kicker: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  padding: "9px 0",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  color: "#cbd5e1",
};

const tileGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const tile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
  minHeight: 78,
};

const button: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 850,
  cursor: "pointer",
};

const primaryButton: React.CSSProperties = {
  ...button,
  background: "#1d4ed8",
  borderColor: "rgba(147, 197, 253, 0.45)",
};

const readinessBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid rgba(96,165,250,0.35)",
  color: "#93c5fd",
  background: "rgba(37,99,235,0.12)",
};

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function pct(value: any): string {
  return `${n(value)}%`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={row}>
      <span>{label}</span>
      <strong style={{ color: "#f8fafc", textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const colour =
    tone === "good"
      ? "#4ade80"
      : tone === "warn"
        ? "#fbbf24"
        : tone === "bad"
          ? "#fb7185"
          : "#f8fafc";

  return (
    <div style={tile}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 25, fontWeight: 950, color: colour }}>
        {value}
      </div>
    </div>
  );
}

export default function WorkspaceOverview({
  projectName,
  status,
  stats,
  projectAssets,
  isBackhaulWorkspace = false,
  onOpenPanel,
  onOpenTrace,
}: Props) {
  const operationalAssets = (projectAssets || []).filter(
    isOperationalAssetRegisterAsset,
  );
  const readiness = stats?.operationalReadiness;
  const rollout = stats?.rolloutKpis || {};
  const production = stats?.production || {};
  const closeout = stats?.closeout || {};
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const phaseLabel = stats?.deliveryPhaseLabel || status || "Build Phase";
  const phaseReason = String(stats?.deliveryPhaseOverrideReason || "").trim();
  const issueCount = Number(stats?.issueCount ?? rollout.qaIssues ?? 0);

  return (
    <div style={shell}>
      <section style={wide}>
        <div style={kicker}>Area Overview</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ ...title, fontSize: 20 }}>{projectName}</h3>
            <div style={{ color: "#9ca3af", marginTop: 5, fontSize: 13 }}>
              {stats?.deliveryPhaseDescription || "Operational project workspace"}
            </div>
          </div>
          <span style={readinessBadge}>{phaseLabel}</span>
        </div>

        <div style={tileGrid}>
          {isBackhaulWorkspace ? (
            <>
              <Tile
                label="Build"
                value={pct(rollout.buildCompletionPercent)}
                tone={Number(rollout.buildCompletionPercent || 0) >= 95 ? "good" : "warn"}
              />
              <Tile label="QA Issues" value={n(issueCount)} tone={issueCount ? "bad" : "good"} />
              <Tile label="Duct Metres" value={n(Math.round(production.ductMeters || 0))} />
              <Tile label="Cable Metres" value={n(Math.round(production.cableMeters || 0))} />
              <Tile label="Closeout Ready" value={`${n(closeout.closeoutReady)} / ${n(closeout.assetCount)}`} tone={Number(closeout.assetCount || 0) === Number(closeout.closeoutReady || 0) ? "good" : "warn"} />
              <Tile label="Blocked Assets" value={n(production.blockedAssets || closeout.blockers)} tone={Number(production.blockedAssets || closeout.blockers || 0) ? "bad" : "good"} />
            </>
          ) : (
            <>
              <Tile label="RFS" value={pct(rollout.rfsPercent ?? stats?.rfsPercent)} tone="good" />
              <Tile
                label="Build"
                value={pct(rollout.buildCompletionPercent)}
                tone={Number(rollout.buildCompletionPercent || 0) >= 95 ? "good" : "warn"}
              />
              <Tile
                label="Readiness"
                value={pct(readiness?.score)}
                tone={blockers.length ? "bad" : "good"}
              />
              <Tile label="Homes Live" value={`${n(rollout.homesLive ?? stats?.homesConnected)} / ${n(rollout.homesPassed ?? stats?.homesPassed)}`} tone="good" />
              <Tile label="DPs Live" value={`${n(rollout.dpLive)} / ${n(rollout.dpTotal ?? stats?.dps)}`} tone="good" />
              <Tile label="QA Issues" value={n(issueCount)} tone={issueCount ? "bad" : "good"} />
              <Tile label="Duct Metres" value={n(Math.round(production.ductMeters || 0))} />
              <Tile label="Cable Metres" value={n(Math.round(production.cableMeters || 0))} />
              <Tile label="Closeout Ready" value={`${n(closeout.closeoutReady)} / ${n(closeout.assetCount)}`} tone={Number(closeout.assetCount || 0) === Number(closeout.closeoutReady || 0) ? "good" : "warn"} />
              <Tile label="Blocked Assets" value={n(production.blockedAssets || closeout.blockers)} tone={Number(production.blockedAssets || closeout.blockers || 0) ? "bad" : "good"} />
            </>
          )}
        </div>
      </section>

      <section style={panel}>
        <div style={kicker}>Project Snapshot</div>
        <h3 style={title}>Scope</h3>
        <div style={{ marginTop: 10 }}>
          <Row label="Status" value={status || phaseLabel} />
          {!isBackhaulWorkspace ? (
            <>
              <Row label="Readiness" value={readiness?.state || "Build"} />
              <Row label="Homes" value={`${n(stats?.homesConnected)} / ${n(stats?.homesPassed)}`} />
            </>
          ) : null}
          <Row label="Route Length" value={`${n(stats?.routeLengthMeters)} m`} />
          <Row label="Sub-duct Metres" value={`${n(Math.round(production.subDuctMeters || 0))} m`} />
          <Row label="Missing Photos" value={n(closeout.missingPhotos)} />
          <Row label="Missing GPS" value={n(closeout.missingGps)} />
          <Row label="Hard Blockers" value={blockers.length || "None"} />
        </div>
        {phaseReason && (
          <div
            style={{
              marginTop: 12,
              color: "#cbd5e1",
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
            }}
          >
            Override note: {phaseReason}
          </div>
        )}
      </section>

      <section style={panel}>
        <div style={kicker}>Network</div>
        <h3 style={title}>Asset Totals</h3>
        <div style={{ ...tileGrid, marginTop: 10 }}>
          <Tile label="Total" value={n(operationalAssets.length)} />
          {!isBackhaulWorkspace ? <Tile label="DPs" value={n(stats?.dps)} /> : null}
          <Tile label="Cables" value={n(stats?.cables)} />
          <Tile label="Joints" value={n(stats?.joints)} />
          <Tile label="Poles" value={n(stats?.poles)} />
          <Tile label="Chambers" value={n(stats?.chambers)} />
        </div>
      </section>

      <section style={wide}>
        <div style={kicker}>Operations</div>
        <h3 style={title}>Common Actions</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginTop: 12,
          }}
        >
          <button type="button" style={primaryButton} onClick={() => onOpenPanel?.("handover", "overview")}>
            Delivery Phase
          </button>
          {!isBackhaulWorkspace ? (
            <button type="button" style={button} onClick={() => onOpenPanel?.("dpStatus", "overview")}>
              DP Status
            </button>
          ) : null}
          <button type="button" style={button} onClick={() => onOpenPanel?.("issues", "qa")}>
            QA Navigator
          </button>
          <button type="button" style={button} onClick={() => onOpenPanel?.("none", "reports")}>
            Templates
          </button>
        </div>
      </section>
    </div>
  );
}
