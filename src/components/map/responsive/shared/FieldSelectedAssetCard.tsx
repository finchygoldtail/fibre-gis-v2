import React from "react";
import type { SavedMapAsset } from "../../types";

type Props = {
  variant: "mobile" | "tablet";
  role: "survey" | "maintenance";
  asset: SavedMapAsset;
  onOpenDetails: () => void;
  onClearSelection: () => void;
  onOpenMaintenance?: () => void;
};

function getAssetLabel(asset: SavedMapAsset): string {
  return (
    asset.name ||
    (asset as any).label ||
    (asset as any).jointName ||
    (asset as any).uprn ||
    "Selected asset"
  );
}

function getAssetTypeLabel(asset: SavedMapAsset): string {
  const raw = String(asset.assetType || asset.jointType || "asset")
    .replace(/-/g, " ")
    .trim();

  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Asset";
}

function getStatusLabel(asset: SavedMapAsset): string | null {
  const status =
    (asset as any).status ||
    (asset as any).buildStatus ||
    (asset as any).dpDetails?.buildStatus ||
    (asset as any).properties?.status ||
    (asset as any).properties?.buildStatus;

  const text = String(status || "").trim();
  return text || null;
}

export default function FieldSelectedAssetCard({
  variant,
  role,
  asset,
  onOpenDetails,
  onClearSelection,
  onOpenMaintenance,
}: Props) {
  const isMobile = variant === "mobile";
  const status = getStatusLabel(asset);

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 1320,
    left: isMobile ? 12 : "auto",
    right: 12,
    bottom: isMobile ? 92 : 92,
    width: isMobile ? "calc(100% - 24px)" : 360,
    maxWidth: "calc(100% - 24px)",
    borderRadius: 18,
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#e5e7eb",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.42)",
    padding: 12,
    backdropFilter: "blur(10px)",
  };

  const buttonStyle: React.CSSProperties = {
    border: "1px solid rgba(148, 163, 184, 0.3)",
    borderRadius: 999,
    background: "rgba(30, 41, 59, 0.9)",
    color: "#f8fafc",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 800,
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800 }}>
            Selected {role === "maintenance" ? "maintenance" : "survey"} asset
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 15,
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={getAssetLabel(asset)}
          >
            {getAssetLabel(asset)}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "#cbd5e1" }}>
            {getAssetTypeLabel(asset)}{status ? ` · ${status}` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onOpenDetails} style={buttonStyle}>
          Details
        </button>
        {role === "maintenance" && onOpenMaintenance ? (
          <button type="button" onClick={onOpenMaintenance} style={buttonStyle}>
            Maintenance
          </button>
        ) : null}
        <button type="button" onClick={onClearSelection} style={buttonStyle}>
          Clear
        </button>
      </div>
    </div>
  );
}
