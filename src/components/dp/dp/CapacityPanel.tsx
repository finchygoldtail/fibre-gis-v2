import React from "react";

type CapacityPanelProps = {
  children: React.ReactNode;
};

export default function CapacityPanel({ children }: CapacityPanelProps) {
  return (
    <section
      style={{
        background:
          "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96))",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
        display: "grid",
        gap: 14,
        alignContent: "start",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      {children}
    </section>
  );
}
