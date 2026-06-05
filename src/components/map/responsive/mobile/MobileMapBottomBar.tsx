import React from "react";

type Props = {
  children: React.ReactNode;
};

export default function MobileMapBottomBar({ children }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        zIndex: 2400,
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        justifyContent: "center",
        padding: 8,
        borderRadius: 18,
        background: "rgba(15, 23, 42, 0.94)",
        border: "1px solid rgba(148, 163, 184, 0.35)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </div>
  );
}

export const mobileBarButton: React.CSSProperties = {
  flex: 1,
  minHeight: 46,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 14,
  background: "#1d4ed8",
  color: "white",
  fontWeight: 900,
  fontSize: 12,
  lineHeight: 1.1,
  padding: "8px 10px",
  cursor: "pointer",
};

export const mobileBarButtonSecondary: React.CSSProperties = {
  ...mobileBarButton,
  background: "#334155",
};

export const mobileBarButtonDanger: React.CSSProperties = {
  ...mobileBarButton,
  background: "#991b1b",
  border: "1px solid rgba(248, 113, 113, 0.7)",
};
