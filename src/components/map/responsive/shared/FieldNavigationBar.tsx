import React from "react";

type FieldNavigationBarProps = {
  variant: "mobile" | "tablet";
  hasSelectedAsset: boolean;
  onGpsLocate: () => void;
  onZoomToSelected: () => void;
  onOpenLayers: () => void;
};

const buttonBase: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.94)",
  color: "#f8fafc",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 8px 22px rgba(15,23,42,0.28)",
  backdropFilter: "blur(10px)",
};

export default function FieldNavigationBar({
  variant,
  hasSelectedAsset,
  onGpsLocate,
  onZoomToSelected,
  onOpenLayers,
}: FieldNavigationBarProps) {
  const isMobile = variant === "mobile";

  return (
    <div
      style={{
        position: "absolute",
        top: isMobile ? 70 : 74,
        right: isMobile ? 10 : 18,
        zIndex: 1250,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 8,
        alignItems: "flex-end",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={onGpsLocate}
        style={{
          ...buttonBase,
          minWidth: isMobile ? 48 : 88,
          minHeight: isMobile ? 48 : 42,
          padding: isMobile ? "0 10px" : "0 14px",
          borderRadius: 999,
        }}
        title="Zoom to my GPS location"
      >
        GPS
      </button>

      <button
        type="button"
        onClick={onOpenLayers}
        style={{
          ...buttonBase,
          minWidth: isMobile ? 48 : 92,
          minHeight: isMobile ? 48 : 42,
          padding: isMobile ? "0 10px" : "0 14px",
          borderRadius: 999,
        }}
        title="Open map layers"
      >
        Layers
      </button>

      {hasSelectedAsset ? (
        <button
          type="button"
          onClick={onZoomToSelected}
          style={{
            ...buttonBase,
            minWidth: isMobile ? 48 : 118,
            minHeight: isMobile ? 48 : 42,
            padding: isMobile ? "0 10px" : "0 14px",
            borderRadius: 999,
          }}
          title="Zoom to selected asset"
        >
          {isMobile ? "Asset" : "Zoom asset"}
        </button>
      ) : null}
    </div>
  );
}
