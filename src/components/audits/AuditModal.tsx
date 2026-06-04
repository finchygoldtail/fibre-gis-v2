import React from "react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function AuditModal({ title, open, onClose, children }: Props) {
  if (!open) return null;

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div style={modal}>
        <div style={header}>
          <h2 style={heading}>{title}</h2>

          <button type="button" onClick={onClose} style={closeButton} aria-label="Close audit">
            ✕
          </button>
        </div>

        <div style={body}>{children}</div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.75)",
  zIndex: 10000,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 20,
};

const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  maxHeight: "90vh",
  overflow: "hidden",
  background: "#111827",
  borderRadius: 12,
  border: "1px solid #374151",
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  display: "flex",
  flexDirection: "column",
};

const header: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #374151",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const heading: React.CSSProperties = {
  margin: 0,
  color: "#fff",
};

const closeButton: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.3)",
  background: "#0b1220",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 900,
};

const body: React.CSSProperties = {
  padding: 16,
  overflowY: "auto",
};
