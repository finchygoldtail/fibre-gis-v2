import React, { useEffect, useMemo, useState } from "react";
import { loadAssetAuditLogs, type AuditLog } from "../../services/auditService";

type Props = {
  assetId?: string | null;
  refreshKey?: number;
  maxResults?: number;
};

function text(value: unknown, fallback = "—"): string {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function readAuditPayload(log: AuditLog): Record<string, any> {
  const after = log.after as any;
  if (!after || typeof after !== "object") return {};
  return after;
}

function formatDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function resultStyle(result: string): React.CSSProperties {
  const value = result.toLowerCase();
  if (value.includes("fail")) {
    return {
      ...pill,
      color: "#fecaca",
      borderColor: "rgba(248,113,113,0.45)",
      background: "rgba(127,29,29,0.28)",
    };
  }
  if (value.includes("advisory")) {
    return {
      ...pill,
      color: "#fed7aa",
      borderColor: "rgba(251,191,36,0.45)",
      background: "rgba(120,53,15,0.28)",
    };
  }
  return {
    ...pill,
    color: "#bbf7d0",
    borderColor: "rgba(74,222,128,0.45)",
    background: "rgba(20,83,45,0.28)",
  };
}

function isAuditFormLog(log: AuditLog): boolean {
  const payload = readAuditPayload(log);
  return Boolean(payload.auditType || payload.auditTitle || payload.answers || log.context?.includes("audit"));
}

function AuditHistoryRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const payload = readAuditPayload(log);
  const title = text(payload.auditTitle || log.reason, "Audit");
  const result = text(payload.result, "Logged");
  const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  const answerRows = Object.entries(answers);
  const attachments = log.attachments || [];
  const signature = text(payload.signature, "");

  return (
    <div style={historyRow}>
      <button type="button" style={rowButton} onClick={() => setOpen((current) => !current)}>
        <div>
          <div style={historyTitle}>{title}</div>
          <div style={historyMeta}>{formatDate(log.changedAt)} · {text(log.changedByEmail, "unknown")}</div>
        </div>
        <span style={resultStyle(result)}>{result}</span>
      </button>

      {open ? (
        <div style={detailsBox}>
          {log.comment ? <div style={commentBox}>{log.comment}</div> : null}

          {answerRows.length ? (
            <div style={answerGrid}>
              {answerRows.map(([key, value]) => (
                <div key={key} style={answerRow}>
                  <span style={answerKey}>{key.replace(/([A-Z])/g, " $1")}</span>
                  <strong style={answerValue}>{text(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>No question answers stored on this log.</div>
          )}

          {attachments.length ? (
            <div style={photoGrid}>
              {attachments.slice(0, 6).map((attachment) => {
                const src = attachment.url || attachment.dataUrl || "";
                return src ? (
                  <a key={attachment.id || attachment.fileName} href={src} target="_blank" rel="noreferrer" style={photoLink}>
                    <img src={src} alt={attachment.fileName || "Audit evidence"} style={photoThumb} />
                    {attachment.questionLabel ? (
                      <span style={photoQuestion}>For: {attachment.questionLabel}</span>
                    ) : null}
                    <span>{attachment.fileName || "Photo"}</span>
                  </a>
                ) : (
                  <div key={attachment.id || attachment.fileName} style={photoPlaceholder}>📷 {attachment.fileName || "Photo"}</div>
                );
              })}
            </div>
          ) : null}

          {signature.startsWith("data:image") ? (
            <div style={signatureWrap}>
              <div style={signatureLabel}>Signature</div>
              <img src={signature} alt="Audit signature" style={signatureImage} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AuditHistoryPanel({ assetId, refreshKey = 0, maxResults = 25 }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assetId) {
        setLogs([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const loaded = await loadAssetAuditLogs(assetId, maxResults);
        if (!cancelled) setLogs(loaded.filter(isAuditFormLog));
      } catch (err) {
        console.error("Failed to load audit history", err);
        if (!cancelled) setError("Could not load audit history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [assetId, refreshKey, maxResults]);

  const latest = useMemo(() => logs.slice(0, 5), [logs]);

  return (
    <section style={sectionWrap}>
      <div style={sectionHeader}>
        <h4 style={sectionTitle}>Audit History</h4>
        <span style={countPill}>{logs.length}</span>
      </div>

      {loading ? <div style={emptyText}>Loading audit history…</div> : null}
      {error ? <div style={errorText}>{error}</div> : null}

      {!loading && !error && !latest.length ? (
        <div style={emptyText}>No saved audit forms for this asset yet.</div>
      ) : null}

      <div style={historyList}>
        {latest.map((log) => (
          <AuditHistoryRow key={log.id} log={log} />
        ))}
      </div>

      {logs.length > latest.length ? (
        <div style={emptyText}>Showing latest {latest.length} of {logs.length} audit logs.</div>
      ) : null}
    </section>
  );
}

const sectionWrap: React.CSSProperties = {
  margin: "12px 16px",
  padding: 12,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.72)",
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const countPill: React.CSSProperties = {
  border: "1px solid rgba(147,197,253,0.35)",
  color: "#bfdbfe",
  background: "rgba(30,64,175,0.22)",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const historyList: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const historyRow: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  overflow: "hidden",
  background: "rgba(17,24,39,0.82)",
};

const rowButton: React.CSSProperties = {
  width: "100%",
  border: 0,
  background: "transparent",
  color: "#e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
};

const historyTitle: React.CSSProperties = {
  color: "#f8fafc",
  fontWeight: 900,
  fontSize: 13,
};

const historyMeta: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  marginTop: 3,
};

const pill: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const detailsBox: React.CSSProperties = {
  borderTop: "1px solid rgba(148,163,184,0.12)",
  padding: 12,
  display: "grid",
  gap: 10,
};

const commentBox: React.CSSProperties = {
  color: "#cbd5e1",
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  lineHeight: 1.45,
};

const answerGrid: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const answerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
  color: "#cbd5e1",
  fontSize: 12,
  paddingBottom: 6,
  borderBottom: "1px solid rgba(148,163,184,0.08)",
};

const answerKey: React.CSSProperties = {
  textTransform: "capitalize",
  color: "#94a3b8",
};

const answerValue: React.CSSProperties = {
  color: "#f8fafc",
};

const photoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 8,
};

const photoLink: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#bfdbfe",
  fontSize: 11,
  textDecoration: "none",
};

const photoQuestion: React.CSSProperties = {
  color: "#fed7aa",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1.25,
};

const photoThumb: React.CSSProperties = {
  width: "100%",
  height: 76,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "#020617",
};

const photoPlaceholder: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  padding: 8,
};

const signatureWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const signatureLabel: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 900,
};

const signatureImage: React.CSSProperties = {
  width: "100%",
  maxHeight: 130,
  objectFit: "contain",
  background: "#fff",
  borderRadius: 8,
};

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
};

const errorText: React.CSSProperties = {
  color: "#fecaca",
  fontSize: 12,
  lineHeight: 1.4,
};
