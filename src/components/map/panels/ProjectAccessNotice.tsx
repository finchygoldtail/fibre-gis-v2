import React from "react";

export default function ProjectAccessNotice({
  visible,
  message = "Your role can view the map, but cannot open the project workspace.",
  onClose,
}: {
  visible: boolean;
  message?: string;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 82,
        zIndex: 2500,
        maxWidth: 360,
        background: "#111827",
        border: "1px solid #f59e0b",
        color: "#fde68a",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>{message}</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid #92400e",
            background: "#78350f",
            color: "#fff7ed",
            borderRadius: 8,
            padding: "2px 7px",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
