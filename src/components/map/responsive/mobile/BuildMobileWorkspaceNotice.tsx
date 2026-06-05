import React from "react";

type Props = {
  projectName: string;
  onBackToMap: () => void;
};

export default function BuildMobileWorkspaceNotice({
  projectName,
  onBackToMap,
}: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#020617",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid #334155",
          borderRadius: 18,
          background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
          padding: 18,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontSize: 12, color: "#93c5fd", fontWeight: 900 }}>
          BUILD WORKSPACE
        </div>

        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>
          {projectName}
        </div>

        <p style={{ color: "#cbd5e1", lineHeight: 1.45, marginTop: 12 }}>
          The full Project Workspace is designed for tablet or desktop. On a
          phone, stay in the map view for quick asset checks, layers, GPS and
          field edits.
        </p>

        <button
          type="button"
          onClick={onBackToMap}
          style={{
            width: "100%",
            marginTop: 14,
            border: "none",
            borderRadius: 14,
            padding: "13px 14px",
            background: "#2563eb",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 15,
          }}
        >
          Back to mobile map
        </button>

        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12 }}>
          Tablet and desktop users still get the normal full workspace.
        </div>
      </div>
    </div>
  );
}
