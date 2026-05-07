import React, { useState } from "react";

type Props = {
  visible: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (reason: string, comment: string) => void;
};

export default function ChangeReasonModal({
  visible,
  title = "Reason for change required",
  description = "Add why this change was made so the network history is accountable.",
  confirmLabel = "Save Change",
  onCancel,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  if (!visible) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ color: "#cbd5e1", marginTop: 8 }}>{description}</p>

        <label style={labelStyle}>Reason *</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Example: moved due to damaged fibre / customers down"
          style={inputStyle}
          autoFocus
        />

        <label style={labelStyle}>Engineer notes</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add extra details, fault reference, OTDR summary, or site notes."
          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button style={secondaryButton} onClick={onCancel}>Cancel</button>
          <button
            style={primaryButton}
            onClick={() => {
              if (!reason.trim()) {
                alert("A reason is required before saving this change.");
                return;
              }
              onSubmit(reason, comment);
              setReason("");
              setComment("");
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99999,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
  width: 520,
  maxWidth: "calc(100vw - 32px)",
  background: "#111827",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 18,
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  marginBottom: 6,
  color: "#9ca3af",
  fontWeight: 700,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#020617",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "10px 12px",
};

const primaryButton: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  background: "#374151",
  color: "white",
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
};
