import React from "react";
import AreaBulkStatusPanel from "./AreaBulkStatusPanel";
import LiveHomesControl from "./LiveHomesControl";
import DuplicateHomeResolutionPanel from "./DuplicateHomeResolutionPanel";
import AddressSheetImportPanel from "./AddressSheetImportPanel";
import type { SavedMapAsset } from "../../map/types";

type ManagerPoint = { lat: number; lng: number };

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: SavedMapAsset[];
  projectArea?: SavedMapAsset | null;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  managerAreaPoints?: ManagerPoint[];
  isManagerAreaDrawing?: boolean;
  onStartManagerAreaDrawing?: () => void;
  onStopManagerAreaDrawing?: () => void;
  onClearManagerAreaDrawing?: () => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
  onResolveDuplicateHomes?: (request: any) => void;
  onAutoSpreadStackedHomes?: () => void | Promise<void>;
  onApplyAddressSheetAssignments?: (request: any) => void | Promise<void>;
};

const panel: React.CSSProperties = { background: "#0f1b2d", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#e5e7eb" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(148,163,184,0.12)", color: "#cbd5e1" };
const tile: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", background: "#111827", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };
const readinessBox: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(96,165,250,0.28)", borderRadius: 10, padding: 12, color: "#cbd5e1" };
const readinessBadge: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900, border: "1px solid rgba(148,163,184,0.35)", color: "#93c5fd", background: "rgba(37,99,235,0.12)" };

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

export default function WorkspaceBuild({
  stats,
  status,
  projectAssets,
  projectArea,
  managerAreaPoints = [],
  isManagerAreaDrawing = false,
  areaDistributionPoints = [],
  onStartManagerAreaDrawing,
  onStopManagerAreaDrawing,
  onClearManagerAreaDrawing,
  onBulkUpdateDpStatus,
  onClearDpFibreAllocations,
  onSelectAsset,
  onOpenJointEditor,
  onBackToMap,
  onResolveDuplicateHomes,
  onAutoSpreadStackedHomes,
  onApplyAddressSheetAssignments,
}: Props) {
  const canonicalHomesPassed = Number(stats?.rolloutKpis?.homesPassed ?? stats?.homesPassed ?? 0);
  const canonicalHomesLive = Number(stats?.rolloutKpis?.homesLive ?? stats?.homesConnected ?? 0);
  const remaining = Math.max(0, canonicalHomesPassed - canonicalHomesLive);
  const readiness = stats?.operationalReadiness;
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const nextActions = Array.isArray(readiness?.nextActions) ? readiness.nextActions : [];

  return <>
    <section style={panel}>
      <h3 style={title}>Build Progress</h3>
      <Tile label="RFS" value={`${n(stats?.rfsPercent)}%`} />
      <Row label="Status" value={status || "Build"} />
      <Row label="Build completion" value={`${n(stats?.rolloutKpis?.buildCompletionPercent)}%`} />
    </section>

    <section style={panel}>
      <h3 style={title}>Area Readiness</h3>
      <div style={readinessBox}>
        <span style={readinessBadge}>{readiness?.state || "Build"}</span>
        <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: "#f8fafc" }}>
          {n(readiness?.score)}%
        </div>
        <div style={{ marginTop: 6 }}>{readiness?.summary || "Readiness will be calculated from DP status, QA and topology."}</div>
      </div>
      <Row label="Hard blockers" value={blockers.length ? blockers.length : "None"} />
      <Row label="QA high" value={n(readiness?.qaHigh)} />
      <Row label="Disconnected" value={n(readiness?.disconnectedAssets)} />
    </section>

    <section style={panel}>
      <h3 style={title}>Homes</h3>
      <Row label="Passed" value={n(canonicalHomesPassed)} />
      <Row label="Live / Connected" value={n(canonicalHomesLive)} />
      <Row label="Remaining" value={n(remaining)} />
    </section>




    <AddressSheetImportPanel
      projectAssets={projectAssets}
      onSelectAsset={onSelectAsset}
      onOpenAsset={(asset) => {
        onSelectAsset?.(asset);
        onOpenJointEditor?.(asset);
      }}
      onApplyAssignments={onApplyAddressSheetAssignments}
    />

    <DuplicateHomeResolutionPanel
      projectAssets={projectAssets}
      onSelectAsset={onSelectAsset}
      onOpenAsset={(asset) => {
        onSelectAsset?.(asset);
        onOpenJointEditor?.(asset);
      }}
      onResolveDuplicateHomes={onResolveDuplicateHomes}
    />

    <section style={wide}>
      <h3 style={title}>Stacked Home Tools</h3>
      <p style={{ color: "#cbd5e1", marginTop: 0 }}>
        Automatically spreads homes stacked within 1.75m. No homes are deleted,
        UPRNs are preserved and the current project homes are saved back to the area.
      </p>
      <button
        type="button"
        style={{
          ...button,
          background: "#065f46",
          borderColor: "rgba(52,211,153,0.35)",
        }}
        onClick={onAutoSpreadStackedHomes}
        disabled={!onAutoSpreadStackedHomes}
      >
        Auto Spread All Stacked Homes
      </button>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
        Keeps the first home in each stack in place and moves the others into a small
        2.5m circle so they can be selected and connected individually.
      </div>
    </section>

    <LiveHomesControl
      projectAssets={projectAssets}
      stats={stats}
      onSelectAsset={onSelectAsset}
      onOpenAsset={(asset) => {
        onSelectAsset?.(asset);
        onOpenJointEditor?.(asset);
      }}
    />

    <AreaBulkStatusPanel
      projectAssets={projectAssets}
      projectArea={projectArea}
      drawnAreaPoints={managerAreaPoints}
      isDrawingArea={isManagerAreaDrawing}
      onStartDrawingArea={onStartManagerAreaDrawing}
      onStopDrawingArea={onStopManagerAreaDrawing}
      onClearDrawingArea={onClearManagerAreaDrawing}
      onBulkUpdateDpStatus={onBulkUpdateDpStatus}
    />

    <section style={wide}>
      <h3 style={title}>DP Fibre Allocation Reset</h3>
      <p style={{ color: "#cbd5e1", marginTop: 0 }}>
        Clears only fibre allocation/routing state from every DP in this selected polygon.
        DP names, closure types, homes, notes, photos, statuses and selected through-cables are kept.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Tile label="Area DPs" value={n(areaDistributionPoints.length)} />
        <Tile label="Action" value="Clear fibres" />
      </div>
      <button
        type="button"
        style={{
          ...button,
          background: "#7f1d1d",
          borderColor: "rgba(248,113,113,0.42)",
        }}
        onClick={onClearDpFibreAllocations}
        disabled={!areaDistributionPoints.length || !onClearDpFibreAllocations}
      >
        Clear DP Fibre Allocations In Area
      </button>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
        Use this before Rebuild Chain when old manual fibre allocations need wiping clean across the fibrehood.
      </div>
    </section>

    <section style={wide}>
      <h3 style={title}>Build Actions</h3>
      <p style={{ color: "#cbd5e1" }}>
        Asset creation still lives on the main map so the existing right-click creation,
        snapping, cable drawing and save logic stays protected.
      </p>
      {blockers.length > 0 ? (
        <div style={readinessBox}>
          <strong style={{ color: "#fb7185" }}>Readiness blockers</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {blockers.map((blocker: string) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}
      <div style={readinessBox}>
        <strong style={{ color: "#93c5fd" }}>Next actions</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {nextActions.map((action: string) => <li key={action}>{action}</li>)}
        </ul>
      </div>
      <button type="button" style={button} onClick={onBackToMap}>Back To Map To Build</button>
    </section>
  </>;
}
