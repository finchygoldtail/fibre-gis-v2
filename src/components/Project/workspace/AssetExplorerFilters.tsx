import React from "react";

export type AssetExplorerTypeFilter =
  | "all"
  | "distribution-point"
  | "ag-joint"
  | "cable"
  | "pole"
  | "chamber"
  | "street-cab"
  | "home"
  | "area"
  | "other";

export type AssetExplorerStatusFilter =
  | "all"
  | "Live"
  | "BWIP"
  | "Unserviceable"
  | "Live not ready for service"
  | "Planned"
  | "Unknown";

export type AssetExplorerSortKey = "name" | "type" | "status" | "capacity" | "risk";

export type AssetExplorerFiltersState = {
  search: string;
  type: AssetExplorerTypeFilter;
  status: AssetExplorerStatusFilter;
  sort: AssetExplorerSortKey;
  showRiskOnly: boolean;
};

type Props = {
  value: AssetExplorerFiltersState;
  onChange: (next: AssetExplorerFiltersState) => void;
  totalCount: number;
  filteredCount: number;
};

const shell: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 12,
  padding: 14,
  display: "grid",
  gap: 12,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.5fr) repeat(3, minmax(130px, 0.7fr)) auto",
  gap: 10,
  alignItems: "end",
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#020617",
  color: "#f8fafc",
  borderRadius: 9,
  padding: "9px 10px",
  outline: "none",
};

const toggle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#111827",
  color: "#e5e7eb",
  borderRadius: 9,
  padding: "9px 11px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const toggleActive: React.CSSProperties = {
  ...toggle,
  background: "#7f1d1d",
  borderColor: "rgba(248,113,113,0.45)",
  color: "#fecaca",
};

const meta: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  color: "#94a3b8",
  fontSize: 12,
};

export const DEFAULT_ASSET_EXPLORER_FILTERS: AssetExplorerFiltersState = {
  search: "",
  type: "all",
  status: "all",
  sort: "name",
  showRiskOnly: false,
};

export default function AssetExplorerFilters({ value, onChange, totalCount, filteredCount }: Props) {
  const update = <K extends keyof AssetExplorerFiltersState>(key: K, nextValue: AssetExplorerFiltersState[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div style={shell}>
      <div style={meta}>
        <strong style={{ color: "#e5e7eb" }}>Operational Asset Explorer</strong>
        <span>{filteredCount.toLocaleString()} of {totalCount.toLocaleString()} assets</span>
      </div>

      <div style={row}>
        <label style={label}>
          Search asset, DP, SB, pole, chamber, cable
          <input
            value={value.search}
            onChange={(event) => update("search", event.target.value)}
            placeholder="Search assets..."
            style={input}
          />
        </label>

        <label style={label}>
          Type
          <select value={value.type} onChange={(event) => update("type", event.target.value as AssetExplorerTypeFilter)} style={input}>
            <option value="all">All</option>
            <option value="distribution-point">DP / SB / CBT / AFN</option>
            <option value="ag-joint">Joints</option>
            <option value="cable">Cables</option>
            <option value="pole">Poles</option>
            <option value="chamber">Chambers</option>
            <option value="street-cab">Street cabs</option>
            <option value="home">Homes</option>
            <option value="area">Areas</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label style={label}>
          Status
          <select value={value.status} onChange={(event) => update("status", event.target.value as AssetExplorerStatusFilter)} style={input}>
            <option value="all">All</option>
            <option value="Live">Live</option>
            <option value="BWIP">BWIP</option>
            <option value="Unserviceable">Unserviceable</option>
            <option value="Live not ready for service">Live not ready</option>
            <option value="Planned">Planned</option>
            <option value="Unknown">Unknown</option>
          </select>
        </label>

        <label style={label}>
          Sort
          <select value={value.sort} onChange={(event) => update("sort", event.target.value as AssetExplorerSortKey)} style={input}>
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="status">Status</option>
            <option value="capacity">Capacity used</option>
            <option value="risk">Risk first</option>
          </select>
        </label>

        <button
          type="button"
          style={value.showRiskOnly ? toggleActive : toggle}
          onClick={() => update("showRiskOnly", !value.showRiskOnly)}
        >
          Risk only
        </button>
      </div>
    </div>
  );
}
