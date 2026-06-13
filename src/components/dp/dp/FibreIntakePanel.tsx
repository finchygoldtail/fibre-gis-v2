import React from "react";

type FibreIntakePanelProps = {
  children: React.ReactNode;
};

export default function FibreIntakePanel({ children }: FibreIntakePanelProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        alignContent: "start",
      }}
    >
      {children}
    </div>
  );
}
