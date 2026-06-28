import { mobileButtonBase, responsiveSafeArea, responsiveZ } from "./responsive/responsiveUiTokens";
import React from "react";
import { useDeviceLayout } from "./responsive/useDeviceLayout";

type Props = {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export default function MapSidebar({ open, onToggle, children }: Props) {
  const { isMobile, isTabletPortrait } = useDeviceLayout();
  const useSlideOver = isMobile || isTabletPortrait;

  if (useSlideOver) {
    return (
      <>
        {open ? <div onClick={onToggle} style={mobileBackdropStyle} /> : null}

        <aside
          style={{
            ...mobileSidebarStyle,
            transform: open ? "translateX(0)" : "translateX(-105%)",
          }}
          aria-hidden={!open}
        >
          <div style={mobileHeaderStyle}>
            <div>
              <strong>Assets</strong>
              <span>Map tools and asset controls</span>
            </div>
            <button type="button" onClick={onToggle} style={mobileCloseButtonStyle}>
              ×
            </button>
          </div>

          <div style={mobileBodyStyle}>{children}</div>
        </aside>

        {!open ? (
          <button
            type="button"
            onClick={onToggle}
            title="Open assets"
            aria-label="Open assets"
            style={mobileFloatingButtonStyle}
          >
            ☰
          </button>
        ) : null}
      </>
    );
  }

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

const mobileBackdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: responsiveZ.mobileOverlay,
  background: "rgba(2,6,23,0.48)",
  backdropFilter: "blur(2px)",
};

const mobileSidebarStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  bottom: 0,
  zIndex: 1600,
  width: "min(88vw, 390px)",
  background: "#1f2937",
  borderRight: "1px solid rgba(148,163,184,0.35)",
  boxShadow: "18px 0 46px rgba(0,0,0,0.45)",
  transition: "transform 220ms ease",
  display: "flex",
  flexDirection: "column",
};

const mobileHeaderStyle: React.CSSProperties = {
  minHeight: 58,
  padding: "12px 14px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  color: "#f8fafc",
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

const mobileCloseButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.72)",
  color: "white",
  fontSize: 24,
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: `calc(12px + ${responsiveSafeArea.top}) 12px 12px`,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

const mobileFloatingButtonStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 18,
  zIndex: 1350,
  width: 48,
  height: 48,
  borderRadius: 16,
  border: "1px solid rgba(148,163,184,0.4)",
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  fontSize: 20,
  boxShadow: "0 14px 32px rgba(15,23,42,0.34)",
  cursor: "pointer",
};
