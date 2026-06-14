import React from "react";
import AreaBulkStatusPanel from "./AreaBulkStatusPanel";
import LiveHomesControl from "./LiveHomesControl";
import DuplicateHomeResolutionPanel from "./DuplicateHomeResolutionPanel";
import AddressSheetImportPanel from "./AddressSheetImportPanel";
import FasSbRouteImportPanel from "./FasSbRouteImportPanel";
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
  areaDistributionPoints?: SavedMapAsset[];
  onStartManagerAreaDrawing?: () => void;
  onStopManagerAreaDrawing?: () => void;
  onClearManagerAreaDrawing?: () => void;
  onClearDpFibreAllocations?: () => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
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
  onApplySbRouteAssignments?: (request: any) => void | Promise<void>;
};

const panel: React.CSSProperties = { background: "#0f1b2d", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#e5e7eb" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(148,163,184,0.12)", color: "#cbd5e1" };
const tile: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", background: "#111827", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };
const readinessBox: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(96,165,250,0.28)", borderRadius: 10, padding: 12, color: "#cbd5e1" };
const readinessBadge: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900, border: "1px solid rgba(148,163,184,0.35)", color: "#93c5fd", background: "rgba(37,99,235,0.12)" };

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#020617",
  color: "#f8fafc",
  borderRadius: 9,
  padding: "10px 11px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
};

const cablePreviewBox: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
  maxHeight: 220,
  overflow: "auto",
};

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

type BuildToolKey =
  | "fas"
  | "address"
  | "homes"
  | "dps"
  | "pia"
  | "reset"
  | "actions";

const toolGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

function ToolButton({
  label,
  description,
  active,
  tone = "default",
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  tone?: "default" | "warn" | "danger" | "good";
  onClick: () => void;
}) {
  const activeBorder =
    tone === "danger"
      ? "rgba(248,113,113,0.7)"
      : tone === "warn"
        ? "rgba(251,191,36,0.7)"
        : tone === "good"
          ? "rgba(52,211,153,0.7)"
          : "rgba(96,165,250,0.75)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...tile,
        textAlign: "left",
        cursor: "pointer",
        minHeight: 86,
        border: active
          ? `1px solid ${activeBorder}`
          : "1px solid rgba(148,163,184,0.16)",
        background: active ? "#102548" : "#0b1424",
        boxShadow: active ? "0 0 0 1px rgba(96,165,250,0.16) inset" : "none",
      }}
    >
      <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: 15 }}>
        {label}
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 7, lineHeight: 1.35 }}>
        {description}
      </div>
    </button>
  );
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
  onBulkUpdateCablePiaNoi,
  onClearDpFibreAllocations,
  onSelectAsset,
  onOpenJointEditor,
  onBackToMap,
  onResolveDuplicateHomes,
  onAutoSpreadStackedHomes,
  onApplyAddressSheetAssignments,
  onApplySbRouteAssignments,
}: Props) {
  const [activeTool, setActiveTool] = React.useState<BuildToolKey | null>(null);
  const [piaNoiNumber, setPiaNoiNumber] = React.useState("");
  const [piaCableFilter, setPiaCableFilter] = React.useState("");
  const [piaAuditNote, setPiaAuditNote] = React.useState("Bulk apply PIA NOI to project design cables");
  const canonicalHomesPassed = Number(stats?.rolloutKpis?.homesPassed ?? stats?.homesPassed ?? 0);
  const canonicalHomesLive = Number(stats?.rolloutKpis?.homesLive ?? stats?.homesConnected ?? 0);
  const remaining = Math.max(0, canonicalHomesPassed - canonicalHomesLive);
  const readiness = stats?.operationalReadiness;
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const nextActions = Array.isArray(readiness?.nextActions) ? readiness.nextActions : [];

  const designCables = React.useMemo(
    () =>
      (projectAssets || []).filter((asset: any) => {
        const raw = String(asset?.assetType || asset?.type || asset?.cableType || asset?.name || "").toLowerCase();
        const isCable = asset?.geometry?.type === "LineString" || raw.includes("cable") || raw.includes("ulw") || raw.includes("fulw") || raw.includes("feeder") || raw.includes("link");
        const isDrop = String(asset?.cableType || asset?.name || asset?.generatedBy || "").toLowerCase().includes("drop") || asset?.isDropCable === true || asset?.isHomeDrop === true || asset?.generatedDrop === true || asset?.autoGeneratedDrop === true;
        return isCable && !isDrop;
      }),
    [projectAssets],
  );

  const filteredPiaCables = React.useMemo(() => {
    const filter = piaCableFilter.trim().toLowerCase();
    if (!filter) return designCables;

    return designCables.filter((asset: any) => {
      const haystack = [
        asset.name,
        asset.cableId,
        asset.cableName,
        asset.label,
        asset.id,
        asset.piaNoiNumber,
        asset.properties?.piaNoiNumber,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(filter);
    });
  }, [designCables, piaCableFilter]);

  const applyBuildBulkPiaNoi = async () => {
    if (!onBulkUpdateCablePiaNoi) {
      alert("Bulk PIA NOI update is not wired into this workspace yet.");
      return;
    }

    if (!designCables.length) {
      alert("No design cables found in this project.");
      return;
    }

    if (!filteredPiaCables.length) {
      alert("No cables match the current filter.");
      return;
    }

    const trimmedPiaNoi = piaNoiNumber.trim();
    if (!trimmedPiaNoi) {
      alert("Enter a PIA NOI number before applying.");
      return;
    }

    const trimmedNote = piaAuditNote.trim();
    if (!trimmedNote) {
      alert("An audit note is required before applying a bulk PIA NOI update.");
      return;
    }

    const confirmed = window.confirm(
      `Apply PIA NOI ${trimmedPiaNoi} to ${filteredPiaCables.length} cable${filteredPiaCables.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    await onBulkUpdateCablePiaNoi({
      assetIds: filteredPiaCables.map((asset) => asset.id),
      piaNoiNumber: trimmedPiaNoi,
      note: trimmedNote,
    });
  };

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

    <section style={wide}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3 style={title}>Build Operations</h3>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: 13 }}>
            Pick one build tool below. Only the selected tool opens, so this tab stays short and easy to use.
          </p>
        </div>
        {activeTool ? (
          <button type="button" style={button} onClick={() => setActiveTool(null)}>
            Close Tool
          </button>
        ) : null}
      </div>

      <div style={toolGrid}>
        <ToolButton
          label="FAS Route Import"
          description="Import SB → SB fibre routes from the FAS."
          active={activeTool === "fas"}
          onClick={() => setActiveTool((value) => value === "fas" ? null : "fas")}
        />
        <ToolButton
          label="Address Sheet Matcher"
          description="Match UPRNs to map homes and group by SB."
          active={activeTool === "address"}
          onClick={() => setActiveTool((value) => value === "address" ? null : "address")}
        />
        <ToolButton
          label="Home Tools"
          description="Duplicates, stacked homes and home clean-up."
          active={activeTool === "homes"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "homes" ? null : "homes")}
        />
        <ToolButton
          label="DP Operations"
          description="Live homes, capacity and bulk DP status."
          active={activeTool === "dps"}
          onClick={() => setActiveTool((value) => value === "dps" ? null : "dps")}
        />
        <ToolButton
          label="Bulk PIA NOI"
          description="Apply one PIA NOI number to project design cables."
          active={activeTool === "pia"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "pia" ? null : "pia")}
        />
        <ToolButton
          label="Fibre Reset"
          description="Clear DP fibre allocations in this area."
          active={activeTool === "reset"}
          tone="danger"
          onClick={() => setActiveTool((value) => value === "reset" ? null : "reset")}
        />
        <ToolButton
          label="Build Actions"
          description="Blockers, next actions and back to map."
          active={activeTool === "actions"}
          tone="warn"
          onClick={() => setActiveTool((value) => value === "actions" ? null : "actions")}
        />
      </div>
    </section>

    {activeTool === "fas" ? (
      <FasSbRouteImportPanel
        projectAssets={projectAssets}
        onApplySbRouteAssignments={onApplySbRouteAssignments}
      />
    ) : null}

    {activeTool === "address" ? (
      <AddressSheetImportPanel
        projectAssets={projectAssets}
        onSelectAsset={onSelectAsset}
        onOpenAsset={(asset) => {
          onSelectAsset?.(asset);
          onOpenJointEditor?.(asset);
        }}
        onApplyAssignments={onApplyAddressSheetAssignments}
      />
    ) : null}

    {activeTool === "homes" ? (
      <>
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
      </>
    ) : null}

    {activeTool === "dps" ? (
      <>
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
      </>
    ) : null}

    {activeTool === "pia" ? (
      <section style={wide}>
        <h3 style={title}>Bulk Cable PIA NOI</h3>
        <p style={{ color: "#cbd5e1", marginTop: 0 }}>
          Apply the same PIA NOI number to multiple project design cables. Drop cables are ignored.
          Use the filter to target a cable group such as 96FULW, 48FULW, FULW01 or AG1.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Design cables" value={n(designCables.length)} />
          <Tile label="Matched cables" value={n(filteredPiaCables.length)} />
          <Tile label="Action" value="PIA NOI" />
        </div>

        <div style={formGrid}>
          <label style={labelStyle}>
            PIA NOI Number
            <input
              value={piaNoiNumber}
              onChange={(event) => setPiaNoiNumber(event.target.value)}
              placeholder="Example: NOI-123456"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Optional Cable Filter
            <input
              value={piaCableFilter}
              onChange={(event) => setPiaCableFilter(event.target.value)}
              placeholder="Example: 96FULW, 48FULW, FULW01 or AG1"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Audit Note
            <input
              value={piaAuditNote}
              onChange={(event) => setPiaAuditNote(event.target.value)}
              placeholder="Reason for this bulk update"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={cablePreviewBox}>
          <div style={{ color: "#e5e7eb", fontWeight: 900, marginBottom: 8 }}>
            Preview Matched Cables
          </div>
          {filteredPiaCables.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {filteredPiaCables.slice(0, 40).map((asset: any) => (
                <div
                  key={asset.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    borderBottom: "1px solid rgba(148,163,184,0.10)",
                    paddingBottom: 6,
                    color: "#cbd5e1",
                    fontSize: 12,
                  }}
                >
                  <span>{asset.name || asset.cableId || asset.label || asset.id}</span>
                  <span style={{ color: "#94a3b8" }}>
                    Current: {asset.piaNoiNumber || asset.properties?.piaNoiNumber || "None"}
                  </span>
                </div>
              ))}
              {filteredPiaCables.length > 40 ? (
                <div style={{ color: "#94a3b8", fontSize: 12 }}>
                  Showing first 40 of {n(filteredPiaCables.length)} matched cables.
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: "#fb7185", fontSize: 12 }}>
              No cables match the current filter.
            </div>
          )}
        </div>

        <button
          type="button"
          style={{
            ...button,
            background: "#14532d",
            borderColor: "rgba(74,222,128,0.42)",
            marginTop: 12,
          }}
          onClick={applyBuildBulkPiaNoi}
          disabled={!filteredPiaCables.length || !onBulkUpdateCablePiaNoi || !piaNoiNumber.trim() || !piaAuditNote.trim()}
        >
          Apply PIA NOI To {n(filteredPiaCables.length)} Cable{filteredPiaCables.length === 1 ? "" : "s"}
        </button>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
          This updates piaNoiNumber on the cable and inside properties.piaNoiNumber so older panels can read it.
        </div>
      </section>
    ) : null}

    {activeTool === "reset" ? (
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
    ) : null}

    {activeTool === "actions" ? (
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
    ) : null}
  </>;
}
