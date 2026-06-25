import React from "react";
import type { SavedMapAsset } from "../types";
import type { PiaAcceptanceStatus } from "../../../services/piaIntelligence";
import {
  getPiaAcceptanceContractor,
  getPiaAcceptanceDetails,
  getPiaAcceptancePhotoCount,
  getPiaAcceptanceStatus,
  getPiaAcceptanceStatusLabel,
} from "../../../services/piaIntelligence";

function getAssetTitle(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(item.name || item.jointName || item.label || item.assetId || item.id || "Unnamed asset");
}

function getAssetType(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(item.assetType || item.type || item.jointType || "Asset");
}

function statusColour(status: PiaAcceptanceStatus): string {
  if (status === "photos_uploaded") return "#38bdf8";
  if (status === "contractor_pass") return "#f97316";
  if (status === "please_review") return "#a855f7";
  if (status === "pia_pass") return "#22c55e";
  if (status === "pia_fail") return "#ef4444";
  return "#94a3b8";
}

export default function PiaAssetTable({
  assets,
  selectedAsset,
  searchTerm,
  statusFilter,
  contractorFilter,
  contractorOptions,
  onSearchTermChange,
  onStatusFilterChange,
  onContractorFilterChange,
  onSelectAsset,
  onExport,
}: {
  assets: SavedMapAsset[];
  selectedAsset: SavedMapAsset | null;
  searchTerm: string;
  statusFilter: PiaAcceptanceStatus | "all";
  contractorFilter: string;
  contractorOptions: string[];
  onSearchTermChange: (value: string) => void;
  onStatusFilterChange: (value: PiaAcceptanceStatus | "all") => void;
  onContractorFilterChange: (value: string) => void;
  onSelectAsset: (asset: SavedMapAsset) => void;
  onExport?: () => void;
}) {
  return (
    <section style={card}>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>PIA Assets ({assets.length})</h2>
          <p style={sectionSub}>Search, filter, select, review.</p>
        </div>
        {onExport ? <button type="button" onClick={onExport} style={button}>⇩ Export</button> : null}
      </div>
      <div style={filters}>
        <input value={searchTerm} onChange={(event) => onSearchTermChange(event.target.value)} placeholder="Search assets..." style={input} />
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as any)} style={input}>
          <option value="all">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="photos_uploaded">Photos Uploaded</option>
          <option value="contractor_pass">Contractor Pass</option>
          <option value="please_review">Please Review</option>
          <option value="pia_pass">PIA Pass</option>
          <option value="pia_fail">PIA Fail</option>
        </select>
        <select value={contractorFilter} onChange={(event) => onContractorFilterChange(event.target.value)} style={input}>
          <option value="all">All Contractors</option>
          {contractorOptions.map((contractor) => <option key={contractor} value={contractor}>{contractor}</option>)}
        </select>
      </div>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Asset</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Contractor</th>
              <th style={thStyle}>PIA Status</th>
              <th style={thStyle}>Reviewer</th>
              <th style={thStyle}>Review Date</th>
              <th style={thStyle}>Photos</th>
              <th style={thStyle}>View</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const status = getPiaAcceptanceStatus(asset as any);
              const details = getPiaAcceptanceDetails(asset as any);
              const selected = selectedAsset?.id === asset.id;
              return (
                <tr key={asset.id} onClick={() => onSelectAsset(asset)} style={trStyle(selected)}>
                  <td style={tdStyle}><strong>{getAssetTitle(asset)}</strong></td>
                  <td style={tdStyle}>{getAssetType(asset)}</td>
                  <td style={tdStyle}>{getPiaAcceptanceContractor(asset as any) === "Unassigned" ? "—" : getPiaAcceptanceContractor(asset as any)}</td>
                  <td style={tdStyle}><span style={{ ...statusPill, borderColor: statusColour(status), color: statusColour(status) }}>{getPiaAcceptanceStatusLabel(status)}</span></td>
                  <td style={tdStyle}>{details.piaReviewer || details.reviewer || "—"}</td>
                  <td style={tdStyle}>{details.piaReviewDate || details.reviewDate || "—"}</td>
                  <td style={tdStyle}>{getPiaAcceptancePhotoCount(asset as any)}</td>
                  <td style={tdStyle}><button type="button" onClick={(event) => { event.stopPropagation(); onSelectAsset(asset); }} style={viewButton}>⊙</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 14,
  padding: 16,
  minHeight: 0,
  height: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};
const sectionHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 };
const sectionTitle: React.CSSProperties = { margin: 0, color: "#dbeafe", fontSize: 16 };
const sectionSub: React.CSSProperties = { margin: "6px 0 0", color: "#94a3b8", fontSize: 12 };
const button: React.CSSProperties = { background: "#0f2b52", color: "#e5e7eb", border: "1px solid rgba(96,165,250,0.36)", borderRadius: 10, padding: "10px 14px", fontWeight: 850, cursor: "pointer" };
const filters: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "1fr 160px 180px",
  gap: 10,
  marginBottom: 12,
};
const input: React.CSSProperties = { width: "100%", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 9, color: "#f8fafc", padding: "10px 12px", outline: "none" };
const tableWrap: React.CSSProperties = {
  overflow: "auto",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 10,
  flex: 1,
  minHeight: 260,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "11px 12px", color: "#cbd5e1", fontSize: 11, fontWeight: 900, borderBottom: "1px solid rgba(148,163,184,0.12)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "13px 12px", borderBottom: "1px solid rgba(148,163,184,0.10)", whiteSpace: "nowrap", color: "#e5e7eb" };
const trStyle = (selected: boolean): React.CSSProperties => ({ cursor: "pointer", background: selected ? "rgba(37,99,235,0.35)" : "transparent" });
const statusPill: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 850 };
const viewButton: React.CSSProperties = { background: "#12356b", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.38)", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };
