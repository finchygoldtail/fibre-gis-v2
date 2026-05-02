import type { ExchangeAsset } from "../storage/exchangeStorage";

type Props = {
  exchange: ExchangeAsset;
  onClose: () => void;
};

export function ExchangeSidePanel({ exchange, onClose }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 360,
        height: "100%",
        zIndex: 3000,
        background: "#111827",
        color: "white",
        padding: 16,
        boxSizing: "border-box",
        borderLeft: "1px solid #374151",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.35)",
        overflowY: "auto",
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "#374151",
          color: "white",
          border: "1px solid #4b5563",
          borderRadius: 6,
          padding: "8px 10px",
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        Close
      </button>

      <h2 style={{ marginTop: 0 }}>⭐ {exchange.name}</h2>

      <div style={{ color: "#9ca3af", marginBottom: 16 }}>
        Exchange ID: {exchange.id}
      </div>

      {exchange.code && (
        <div style={{ marginBottom: 12 }}>
          <strong>Code:</strong> {exchange.code}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3>OLT / PON</h3>
        <p style={{ color: "#9ca3af" }}>
          No OLTs or PON ports added yet.
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Connected Feeder Cables</h3>
        <p style={{ color: "#9ca3af" }}>
          No feeder cables linked yet.
        </p>
      </div>
    </div>
  );
}