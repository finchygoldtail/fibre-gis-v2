import React, { useEffect, useMemo, useState } from "react";
import { loadAllAuditLogs, loadAssetAuditLogs, type AuditLog } from "../../services/auditService";

type Props = {
  asset?: any | null;
  onBack: () => void;
};

export default function ChangesDashboard({ asset, onBack }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"asset" | "all">(asset?.id ? "asset" : "all");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const rows = mode === "asset" && asset?.id
          ? await loadAssetAuditLogs(asset.id, 200)
          : await loadAllAuditLogs(300);
        if (!cancelled) setLogs(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [asset?.id, mode]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return logs;
    return logs.filter((log) =>
      [
        log.assetName,
        log.assetId,
        log.assetType,
        log.action,
        log.reason,
        log.comment,
        log.changedByEmail,
        log.changedByName,
        log.context,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [logs, search]);

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Changes / Maintenance History</h1>
          <div style={{ color: "#9ca3af", marginTop: 4 }}>
            {mode === "asset" && asset
              ? `${asset.name || "Unnamed asset"} · ${asset.assetType || asset.jointType || "asset"}`
              : "All viewed and changed asset events"}
          </div>
        </div>
        <button style={buttonStyle} onClick={onBack}>Back</button>
      </div>

      <div style={toolbarStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by asset, reason, user, action..."
          style={inputStyle}
        />
        <select value={mode} onChange={(e) => setMode(e.target.value as "asset" | "all")} style={selectStyle}>
          <option value="asset" disabled={!asset?.id}>This asset</option>
          <option value="all">All changes</option>
        </select>
      </div>

      <div style={summaryStyle}>
        <strong>{filtered.length}</strong> record{filtered.length === 1 ? "" : "s"}
        {asset?.id && mode === "asset" ? ` for ${asset.name || asset.id}` : ""}
      </div>

      {loading ? (
        <div style={emptyStyle}>Loading changes...</div>
      ) : filtered.length === 0 ? (
        <div style={emptyStyle}>No change history found yet.</div>
      ) : (
        <div style={timelineStyle}>
          {filtered.map((log) => (
            <div key={log.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, textTransform: "capitalize" }}>
                    {log.action.replaceAll("-", " ")}
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}>
                    {log.assetName || log.assetId} · {log.assetType || "asset"}
                  </div>
                </div>
                <div style={{ color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>
                  {formatDate(log.changedAt)}
                </div>
              </div>

              {log.reason ? <div style={{ marginTop: 10 }}>{log.reason}</div> : null}
              {log.comment ? <div style={{ marginTop: 6, color: "#cbd5e1" }}>{log.comment}</div> : null}

              <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
                By {log.changedByName || log.changedByEmail || "unknown"}
                {log.context ? ` · ${log.context}` : ""}
              </div>

              {renderMoveDetails(log)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderMoveDetails(log: AuditLog) {
  const moves = (log.after as any)?.moves;
  if (!Array.isArray(moves) || !moves.length) return null;

  return (
    <div style={moveBoxStyle}>
      <strong>Fibre moves</strong>
      {moves.map((move: any, index: number) => (
        <div key={`${move.fromFibre}-${move.toFibre}-${index}`} style={{ marginTop: 4 }}>
          Tray {move.tray}: fibre {move.fromFibre} → {move.toFibre}
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "white",
  padding: 24,
  boxSizing: "border-box",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  marginBottom: 18,
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#020617",
  color: "white",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "10px 12px",
};

const selectStyle: React.CSSProperties = {
  background: "#020617",
  color: "white",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "10px 12px",
};

const buttonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
};

const summaryStyle: React.CSSProperties = {
  color: "#cbd5e1",
  marginBottom: 12,
};

const timelineStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 14,
};

const emptyStyle: React.CSSProperties = {
  color: "#9ca3af",
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 18,
};

const moveBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#020617",
  color: "#cbd5e1",
  fontSize: 13,
};
