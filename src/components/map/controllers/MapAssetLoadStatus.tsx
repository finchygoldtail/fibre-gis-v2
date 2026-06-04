import React from "react";

type Props = {
  isLoading?: boolean;
  isSaving?: boolean;
  source?: string;
};

export default function MapAssetLoadStatus({ isLoading, isSaving, source }: Props) {
  if (!isLoading && !isSaving && !source) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 54,
        zIndex: 1200,
        background: "rgba(15,23,42,0.88)",
        color: "white",
        border: "1px solid #334155",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 11,
        fontWeight: 800,
        pointerEvents: "none",
      }}
    >
      {isLoading ? "Loading map assets..." : isSaving ? "Saving map assets..." : `Assets: ${source}`}
    </div>
  );
}
