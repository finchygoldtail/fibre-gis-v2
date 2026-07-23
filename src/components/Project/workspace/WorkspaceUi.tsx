import React from "react";

import type { SavedMapAsset } from "../../map/types";

export function StatCard({
  label,
  value,
  tone = "default",
  onClick,
  title,
  active = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  const toneColour =
    tone === "good"
      ? "#4ade80"
      : tone === "warn"
        ? "#fbbf24"
        : tone === "bad"
          ? "#fb7185"
          : "#1f2933";
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      style={{
        ...metricCard,
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        border: active ? "1px solid #60a5fa" : (metricCard as any).border,
        boxShadow: active
          ? "0 0 0 1px #2563eb inset"
          : (metricCard as any).boxShadow,
      }}
      onClick={onClick}
      title={title}
      disabled={!clickable}
    >
      <div style={metricLabel}>{label}</div>
      <div style={{ ...metricValue, color: toneColour }}>{value}</div>
    </button>
  );
}

export function AssetDrilldownButton({
  asset,
  title,
  assetType,
  subtitle,
  detail,
  onClick,
}: {
  asset: SavedMapAsset;
  title: string;
  assetType: string;
  subtitle?: React.ReactNode;
  detail?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      style={{
        ...operationListItem,
        textAlign: "left",
        cursor: "pointer",
      }}
      onClick={onClick}
    >
      <strong>{title || asset.name || asset.id}</strong>
      <span>{subtitle || assetType}</span>
      {detail ? <small>{detail}</small> : null}
      <small style={{ color: "#2563eb" }}>
        Click to select and highlight on map
      </small>
    </button>
  );
}

export function SideGroup({
  title,
  items,
}: {
  title: string;
  items: [string, () => void][];
}) {
  return (
    <div style={sideGroup}>
      <div style={sideGroupTitle}>{title}</div>
      {items.map(([label, onClick]) => (
        <button key={label} type="button" style={railButton} onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div style={infoRow}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <strong style={{ color: highlight ? "#4ade80" : "#1f2933" }}>
        {value}
      </strong>
    </div>
  );
}

export function IssueCard({
  label,
  value,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      style={{
        ...issueCard,
        background: tone,
        border: active
          ? "2px solid #2563eb"
          : "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        textAlign: "left",
        color: "#fff",
      }}
      onClick={onClick}
    >
      <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      <small style={{ opacity: 0.75 }}>Open assets</small>
    </button>
  );
}

const metricCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: "10px 12px",
  minWidth: 115,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const metricLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const metricValue: React.CSSProperties = {
  marginTop: 3,
  color: "#1f2933",
  fontSize: 18,
  fontWeight: 950,
};

const operationListItem: React.CSSProperties = {
  display: "grid",
  gap: 4,
  background: "#ffffff",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 12,
  color: "#1f2933",
};

const sideGroup: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const sideGroupTitle: React.CSSProperties = {
  color: "#60a5fa",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const railButton: React.CSSProperties = {
  border: "1px solid #ddd8cf",
  background: "#ffffff",
  color: "#64748b",
  borderRadius: 10,
  padding: "9px 10px",
  textAlign: "left",
  cursor: "pointer",
};

const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  background: "#ffffff",
  borderRadius: 10,
  border: "1px solid #ddd8cf",
};

const issueCard: React.CSSProperties = {
  borderRadius: 12,
  padding: 12,
  minHeight: 96,
};


