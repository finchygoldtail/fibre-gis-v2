import React from "react";

type Props = {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export default function MapSidebar({ open, onToggle, children }: Props) {
  return (
    <>
      <aside
        style={{
          width: open ? 360 : 0,
          flex: "0 0 auto",
          height: "100%",
          overflow: "hidden",
          transition: "width 180ms ease",
          borderRight: open ? "1px solid #374151" : "none",
          background: "#1f2937",
        }}
      >
        <div
          style={{
            width: 360,
            height: "100%",
            boxSizing: "border-box",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      </aside>

      <button
        type="button"
        onClick={onToggle}
        title={open ? "Hide left panel" : "Show left panel"}
        aria-label={open ? "Hide left panel" : "Show left panel"}
        style={{
          position: "absolute",
          left: open ? 348 : 10,
          top: 78,
          zIndex: 1300,
          width: 34,
          height: 42,
          borderRadius: "0 10px 10px 0",
          border: "1px solid #4b5563",
          borderLeft: open ? "none" : "1px solid #4b5563",
          background: "#2563eb",
          color: "white",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
          transition: "left 180ms ease",
        }}
      >
        {open ? "‹" : "☰"}
      </button>
    </>
  );
}
