import React from "react";
import type { PerfMarkResult } from "../utils/performanceMarks";

type Props = {
  visible: boolean;
  items: PerfMarkResult[];
  onClose: () => void;
  onClear: () => void;
};

export default function PerformanceDebugPanel({ visible, items, onClose, onClear }: Props) {
  if (!visible) return null;

  return (
    <aside style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Performance</h3>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>Recent local timings</div>
        </div>
        <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
      </div>

      <button type="button" onClick={onClear} style={{ ...buttonStyle, width: "100%" }}>
        Clear timings
      </button>

      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {items.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No timings captured yet.</div>
        ) : (
          items.map((item, index) => (
            <div key={`${item.label}-${item.startedAt}-${index}`} style={rowStyle}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </span>
              <strong>{item.durationMs}ms</strong>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 14,
  top: 82,
  zIndex: 5000,
  width: 320,
  maxWidth: "calc(100vw - 28px)",
  maxHeight: "calc(100vh - 110px)",
  overflowY: "auto",
  background: "#111827",
  color: "white",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 12,
  boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #4b5563",
  background: "#374151",
  color: "white",
  borderRadius: 9,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid #334155",
  borderRadius: 10,
  background: "#0f172a",
  fontSize: 12,
};
