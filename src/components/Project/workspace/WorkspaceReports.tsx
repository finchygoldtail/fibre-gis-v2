import React from "react";
import { downloadAddressSheetTemplate } from "./addressSheetParser";
import {
  downloadAgJointTemplate,
  downloadMeetMeJointTemplate,
  downloadMidjJointTemplate,
} from "../../../logic/exportAgExcel";
import { downloadLmjJointTemplate } from "../../../logic/exportLmjExcel";
import { downloadStreetCabTemplate } from "../../../logic/exportStreetCabExcel";
import { downloadExchangeTemplate } from "../../../logic/exportExchangeExcel";
import type { SavedMapAsset } from "../../map/types";
import {
  buildWorkspaceOperationsSummary,
  getAssetDisplayName,
  getDailyProgressHistory,
  downloadCloseoutCsv,
  downloadProductionCsv,
} from "./workspaceOperations";

type Props = {
  projectName?: string;
  projectAssets?: SavedMapAsset[];
  stats?: any;
  isBackhaulWorkspace?: boolean;
  onSelectAsset?: (asset: SavedMapAsset) => void;
};

const panel: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const button: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.28)",
  background: "#10203a",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "12px 14px",
  fontWeight: 850,
  cursor: "pointer",
  textAlign: "left",
};

const tileGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const tile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

const listPanel: React.CSSProperties = {
  ...panel,
  display: "grid",
  gap: 10,
};

const tableWrap: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  maxHeight: 360,
  overflow: "auto",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px minmax(150px, 1.4fr) 90px 110px 110px minmax(160px, 1fr) 88px",
  gap: 10,
  alignItems: "center",
  padding: "9px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  color: "#cbd5e1",
  fontSize: 12,
};

const permitRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(150px, 1.3fr) 130px 120px 120px minmax(150px, 1fr) 88px",
  gap: 10,
  alignItems: "center",
  padding: "9px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  color: "#cbd5e1",
  fontSize: 12,
};

const smallButton: React.CSSProperties = {
  ...button,
  padding: "6px 9px",
  fontSize: 12,
  textAlign: "center",
};

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString("en-GB") : "0";
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={tile}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 950, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function getPermitDetails(asset: SavedMapAsset) {
  const item = asset as any;
  return {
    status: "draft",
    source: "street-manager",
    ...((item.permitDetails || item.properties?.permitDetails || {}) as any),
  };
}

function daysUntil(endDate?: string): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function getPermitState(asset: SavedMapAsset) {
  const permit = getPermitDetails(asset);
  const status = String(permit.status || "").toLowerCase();
  const daysLeft = daysUntil(permit.endDate);

  if (status === "closed") return { label: "Closed", colour: "#94a3b8", daysLeft };
  if (daysLeft !== null && daysLeft < 0) return { label: "Expired", colour: "#f87171", daysLeft };
  if (daysLeft === 0) return { label: "Expires today", colour: "#ef4444", daysLeft };
  if (daysLeft !== null && daysLeft <= 2) return { label: "Closing soon", colour: "#fb923c", daysLeft };
  if (daysLeft !== null && daysLeft <= 5) return { label: `${daysLeft} days left`, colour: "#facc15", daysLeft };
  return { label: daysLeft === null ? "No end date" : "Active", colour: "#2dd4bf", daysLeft };
}

function getEntryMeters(entry: any): string {
  if (entry.team === "splicing") return `${Number(entry.spliceCount || 0).toLocaleString("en-GB")} splices`;
  if (typeof entry.startMeter === "number" && typeof entry.endMeter === "number") {
    return `${Math.min(entry.startMeter, entry.endMeter).toFixed(0)}m to ${Math.max(entry.startMeter, entry.endMeter).toFixed(0)}m`;
  }
  return `${Number(entry.meters || 0).toLocaleString("en-GB")}m`;
}

export default function WorkspaceReports({
  projectName = "workspace",
  projectAssets = [],
  stats,
  isBackhaulWorkspace = false,
  onSelectAsset,
}: Props) {
  const summary = React.useMemo(
    () => ({
      production: stats?.production,
      closeout: stats?.closeout,
      ...buildWorkspaceOperationsSummary(projectAssets || []),
    }),
    [projectAssets, stats],
  );

  const production = summary.production || {};
  const closeout = summary.closeout || {};
  const productionEntries = React.useMemo(
    () =>
      (projectAssets || [])
        .flatMap((asset) =>
          getDailyProgressHistory(asset).map((entry) => ({
            asset,
            entry,
          })),
        )
        .sort((a, b) => String(b.entry.date || "").localeCompare(String(a.entry.date || "")))
        .slice(0, 250),
    [projectAssets],
  );
  const permitZones = React.useMemo(
    () =>
      (projectAssets || [])
        .filter((asset: any) => asset.assetType === "permit-zone")
        .map((asset) => ({ asset, permit: getPermitDetails(asset), state: getPermitState(asset) }))
        .sort((a, b) => {
          const aDays = a.state.daysLeft ?? 99999;
          const bDays = b.state.daysLeft ?? 99999;
          return aDays - bDays;
        }),
    [projectAssets],
  );

  return (
    <>
      <section style={listPanel}>
        <h3 style={title}>Production history</h3>
        <div style={tileGrid}>
          <Tile label="Progress records" value={n(productionEntries.length)} />
          <Tile label="Civils metres" value={n(Math.round(production.ductMeters || 0))} />
          <Tile label="Cable metres" value={n(Math.round(production.cableMeters || 0))} />
          <Tile label="Blocked assets" value={n(production.blockedAssets || closeout.blockers)} />
        </div>
        <div style={tableWrap}>
          <div style={{ ...rowStyle, color: "#93c5fd", fontWeight: 900, position: "sticky", top: 0, background: "#0b1424", zIndex: 1 }}>
            <span>Date</span>
            <span>Asset</span>
            <span>Team</span>
            <span>Output</span>
            <span>Gang</span>
            <span>Notes / issues</span>
            <span>Map</span>
          </div>
          {productionEntries.length ? (
            productionEntries.map(({ asset, entry }: any, index) => (
              <div key={`${asset.id}-${entry.id || index}`} style={rowStyle}>
                <span>{entry.date || "No date"}</span>
                <span style={{ color: "#f8fafc", fontWeight: 800 }}>{getAssetDisplayName(asset)}</span>
                <span>{String(entry.team || "").toUpperCase()}</span>
                <span>{getEntryMeters(entry)}</span>
                <span>{entry.crewName || "-"}</span>
                <span>{entry.issueNote || entry.progressNote || entry.note || "-"}</span>
                <button type="button" style={smallButton} onClick={() => onSelectAsset?.(asset)} disabled={!onSelectAsset}>
                  View
                </button>
              </div>
            ))
          ) : (
            <div style={{ padding: 12, color: "#94a3b8", fontSize: 13 }}>
              No daily production has been logged for this workspace yet.
            </div>
          )}
        </div>
      </section>

      <section style={listPanel}>
        <h3 style={title}>Permit dashboard</h3>
        <div style={tileGrid}>
          <Tile label="Permit zones" value={n(permitZones.length)} />
          <Tile label="Closing soon" value={n(permitZones.filter((item) => item.state.label === "Closing soon").length)} />
          <Tile label="Expires today" value={n(permitZones.filter((item) => item.state.label === "Expires today").length)} />
          <Tile label="Expired" value={n(permitZones.filter((item) => item.state.label === "Expired").length)} />
        </div>
        <div style={tableWrap}>
          <div style={{ ...permitRowStyle, color: "#93c5fd", fontWeight: 900, position: "sticky", top: 0, background: "#0b1424", zIndex: 1 }}>
            <span>Zone</span>
            <span>Permit</span>
            <span>Start</span>
            <span>End</span>
            <span>Status</span>
            <span>Map</span>
          </div>
          {permitZones.length ? (
            permitZones.map(({ asset, permit, state }) => (
              <div key={asset.id} style={permitRowStyle}>
                <span style={{ color: "#f8fafc", fontWeight: 850 }}>{getAssetDisplayName(asset)}</span>
                <span>{permit.permitNumber || "Not loaded"}</span>
                <span>{permit.startDate || "-"}</span>
                <span>{permit.endDate || "-"}</span>
                <span style={{ color: state.colour, fontWeight: 900 }}>{state.label}</span>
                <button type="button" style={smallButton} onClick={() => onSelectAsset?.(asset)} disabled={!onSelectAsset}>
                  View
                </button>
              </div>
            ))
          ) : (
            <div style={{ padding: 12, color: "#94a3b8", fontSize: 13 }}>
              No permit zones have been created in this workspace yet.
            </div>
          )}
        </div>
      </section>

      <section style={panel}>
        <h3 style={title}>Delivery exports</h3>
        <div style={tileGrid}>
          <Tile label="Duct metres" value={n(Math.round(production.ductMeters || 0))} />
          <Tile label="Cable metres" value={n(Math.round(production.cableMeters || 0))} />
          <Tile label="Sub-duct metres" value={n(Math.round(production.subDuctMeters || 0))} />
          <Tile label="Closeout ready" value={`${n(closeout.closeoutReady)} / ${n(closeout.assetCount)}`} />
          <Tile label="Missing photos" value={n(closeout.missingPhotos)} />
          <Tile label="Blocked assets" value={n(production.blockedAssets || closeout.blockers)} />
        </div>
        <div style={grid}>
          <button type="button" style={button} onClick={() => downloadProductionCsv(projectName, projectAssets)}>
            Export Production CSV
          </button>
          <button type="button" style={button} onClick={() => downloadCloseoutCsv(projectName, projectAssets)}>
            Export Closeout CSV
          </button>
        </div>
      </section>

      <section style={panel}>
        <h3 style={title}>Templates</h3>
        <div style={grid}>
          {!isBackhaulWorkspace ? (
            <button type="button" style={button} onClick={() => void downloadAddressSheetTemplate()}>
              Address Sheet Template
            </button>
          ) : null}
          <button type="button" style={button} onClick={downloadAgJointTemplate}>
            AG Joint Template
          </button>
          <button type="button" style={button} onClick={downloadLmjJointTemplate}>
            LMJ Joint Template
          </button>
          {!isBackhaulWorkspace ? (
            <button type="button" style={button} onClick={downloadMidjJointTemplate}>
              MidJ Joint Template
            </button>
          ) : null}
          <button type="button" style={button} onClick={downloadMeetMeJointTemplate}>
            Meet Me Chamber Template
          </button>
          {!isBackhaulWorkspace ? (
            <>
              <button type="button" style={button} onClick={downloadStreetCabTemplate}>
                Street Cab Template
              </button>
              <button type="button" style={button} onClick={downloadExchangeTemplate}>
                Exchange Template
              </button>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
