import React from "react";

type Props = {
  isOffline: boolean;
  lastCachedAt: string | null;
  cachedAssetCount: number;
  cachedHomeCount: number;
  pendingSaveCount?: number;
  pendingSaveUpdatedAt?: string | null;
  pendingSaveError?: string;
  onCacheNow: () => void;
  onClearCache: () => void;
  onRetryPendingSave?: () => void;
  onClearPendingSave?: () => void;
  isRetryingPendingSave?: boolean;
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
  pendingSaveCount = 0,
  pendingSaveUpdatedAt = null,
  pendingSaveError = "",
  onCacheNow,
  onClearCache,
  onRetryPendingSave,
  onClearPendingSave,
  isRetryingPendingSave = false,
}: Props) {
  const hasPendingSave = pendingSaveCount > 0;

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: 58,
        zIndex: 1250,
        background: hasPendingSave
          ? "#78350f"
          : isOffline
            ? "#7f1d1d"
            : "rgba(15,23,42,0.94)",
        color: "#f8fafc",
        border: `1px solid ${hasPendingSave ? "#fbbf24" : isOffline ? "#fecaca" : "#334155"}`,
        borderRadius: 14,
        padding: "10px 12px",
        boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>
            {hasPendingSave ? "Pending save stored" : isOffline ? "Offline field mode" : "Field cache ready"}
          </div>
          <div style={{ color: "#cbd5e1", marginTop: 2 }}>
            {hasPendingSave
              ? `${formatCachedAt(pendingSaveUpdatedAt)} - ${pendingSaveCount} assets waiting to retry`
              : `${formatCachedAt(lastCachedAt)} - ${cachedAssetCount} assets - ${cachedHomeCount} homes`}
          </div>
          {hasPendingSave && pendingSaveError ? (
            <div style={{ color: "#fde68a", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pendingSaveError}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {hasPendingSave ? (
            <>
              <button type="button" onClick={onRetryPendingSave} disabled={isRetryingPendingSave} style={buttonStyle}>
                {isRetryingPendingSave ? "Retrying" : "Retry Save"}
              </button>
              <button type="button" onClick={onClearPendingSave} style={buttonStyle}>
                Clear Pending
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCacheNow} style={buttonStyle}>Cache</button>
              {lastCachedAt ? (
                <button type="button" onClick={onClearCache} style={buttonStyle}>Clear</button>
              ) : null}
            </>
          )}
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
