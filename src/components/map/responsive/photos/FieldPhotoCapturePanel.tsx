import React, { useRef, useState } from "react";

type Props = {
  isOpen: boolean;
  assetName?: string | null;
  onClose: () => void;
  onFilesSelected?: (files: File[]) => void;
};

export default function FieldPhotoCapturePanel({
  isOpen,
  assetName,
  onClose,
  onFilesSelected,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 96,
        zIndex: 1450,
        background: "rgba(15,23,42,0.98)",
        color: "#f8fafc",
        border: "1px solid #334155",
        borderRadius: 18,
        padding: 14,
        boxShadow: "0 20px 40px rgba(0,0,0,0.38)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>Field photos</div>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
            {assetName ? `Attach photos for ${assetName}` : "Select an asset first for best photo records."}
          </div>
        </div>
        <button type="button" onClick={onClose} style={closeButtonStyle}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <button type="button" style={primaryButtonStyle} onClick={() => inputRef.current?.click()}>
          Open camera
        </button>
        <button type="button" style={secondaryButtonStyle} onClick={() => inputRef.current?.click()}>
          Upload photos
        </button>
      </div>

      {selectedCount > 0 ? (
        <div style={{ fontSize: 12, color: "#bbf7d0", marginTop: 10, fontWeight: 700 }}>
          {selectedCount} photo{selectedCount === 1 ? "" : "s"} selected ready for the asset photo uploader.
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          setSelectedCount(files.length);
          onFilesSelected?.(files);
        }}
      />
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #60a5fa",
  background: "#2563eb",
  color: "white",
  borderRadius: 14,
  padding: "12px 10px",
  fontWeight: 900,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #475569",
  background: "#1e293b",
  color: "white",
  borderRadius: 14,
  padding: "12px 10px",
  fontWeight: 900,
};

const closeButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "1px solid #475569",
  background: "#020617",
  color: "#f8fafc",
  fontSize: 20,
  fontWeight: 900,
};
