import React from "react";

type Props = {
  isOffline: boolean;
  lastCachedAt: string | null;
  cachedAssetCount: number;
  cachedHomeCount: number;
  onCacheNow: () => void;
  onClearCache: () => void;
};

function formatCachedAt(value: string | null) {
  if (!value) return "Not cached yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Cached";
  return `Cached ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function OfflineFieldModeBanner({
  isOffline,
  lastCachedAt,
  cachedAssetCount,
  cachedHomeCount,
  onCacheNow,
  onClearCache,
}: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: 58,
        zIndex: 1250,
        background: isOffline ? "#7f1d1d" : "rgba(15,23,42,0.94)",
        color: "#f8fafc",
        border: `1px solid ${isOffline ? "#fecaca" : "#334155"}`,
        borderRadius: 14,
        padding: "10px 12px",
        boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{isOffline ? "Offline field mode" : "Field cache ready"}</div>
          <div style={{ color: "#cbd5e1", marginTop: 2 }}>
            {formatCachedAt(lastCachedAt)} • {cachedAssetCount} assets • {cachedHomeCount} homes
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onCacheNow} style={buttonStyle}>Cache</button>
          {lastCachedAt ? (
            <button type="button" onClick={onClearCache} style={buttonStyle}>Clear</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid #64748b",
  background: "#0f172a",
  color: "#f8fafc",
  borderRadius: 999,
  padding: "7px 10px",
  fontWeight: 800,
  fontSize: 12,
};
