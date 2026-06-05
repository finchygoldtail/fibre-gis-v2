import React from "react";
import type { SavedMapAsset } from "../../types";

type FieldRole = "survey" | "maintenance";

type Props = {
  role: FieldRole;
  asset: SavedMapAsset;
  mapMode: string;
  selectedMoveHomeCount: number;
  selectedDeleteHomeCount: number;
  onOpenDetails: () => void;
  onOpenMaintenance: () => void;
  onClose: () => void;
};

function getAssetLabel(asset: SavedMapAsset): string {
  return String(
    asset.name ||
      (asset as any).label ||
      (asset as any).jointName ||
      (asset as any).id ||
      "Selected asset",
  );
}

function getAssetTypeLabel(asset: SavedMapAsset): string {
  const raw = String(asset.assetType || asset.jointType || "asset");
  return raw
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getAssetStatus(asset: SavedMapAsset): string {
  return String(
    (asset as any).status ||
      (asset as any).buildStatus ||
      (asset as any).dpDetails?.buildStatus ||
      (asset as any).properties?.status ||
      "No status",
  );
}

export default function AssetBottomSheet({
  role,
  asset,
  mapMode,
  selectedMoveHomeCount,
  selectedDeleteHomeCount,
  onOpenDetails,
  onOpenMaintenance,
  onClose,
}: Props) {
  const isSurvey = role === "survey";
  const modeText =
    mapMode === "move-homes"
      ? `${selectedMoveHomeCount} home${selectedMoveHomeCount === 1 ? "" : "s"} selected to move`
      : mapMode === "survey-delete-homes"
        ? `${selectedDeleteHomeCount} home${selectedDeleteHomeCount === 1 ? "" : "s"} selected to delete`
        : null;

  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 92,
        zIndex: 1450,
        borderRadius: 22,
        border: "1px solid rgba(148,163,184,0.35)",
        background: "rgba(15,23,42,0.96)",
        color: "white",
        boxShadow: "0 18px 42px rgba(0,0,0,0.45)",
        padding: 14,
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          width: 46,
          height: 5,
          borderRadius: 999,
          background: "rgba(148,163,184,0.55)",
          margin: "0 auto 12px",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: isSurvey ? "#93c5fd" : "#fca5a5", textTransform: "uppercase", letterSpacing: 0.8 }}>
            {isSurvey ? "Survey field asset" : "Maintenance field asset"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {getAssetLabel(asset)}
          </div>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
            {getAssetTypeLabel(asset)} · {getAssetStatus(asset)}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close selected asset panel"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(30,41,59,0.9)",
            color: "white",
            fontWeight: 900,
            flex: "0 0 auto",
          }}
        >
          ×
        </button>
      </div>

      {modeText && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(37,99,235,0.18)",
            border: "1px solid rgba(96,165,250,0.35)",
            fontSize: 12,
            color: "#dbeafe",
            fontWeight: 800,
          }}
        >
          {modeText}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onOpenDetails} style={primaryButton}>
          Open / Edit
        </button>
        <button type="button" onClick={onOpenMaintenance} style={secondaryButton}>
          {isSurvey ? "Asset History" : "Maintenance"}
        </button>
      </div>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 14,
  border: "none",
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  fontSize: 13,
};

const secondaryButton: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(30,41,59,0.92)",
  color: "white",
  fontWeight: 900,
  fontSize: 13,
};
