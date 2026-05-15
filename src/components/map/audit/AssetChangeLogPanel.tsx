import React, { useEffect, useState } from "react";
import type { SavedMapAsset } from "../types";
import {
  createAssetChangeLog,
  loadAssetChangeLogs,
} from "./assetChangeLogStorage";
import type {
  AssetChangeAction,
  AssetChangeAttachment,
  AssetChangeAttachmentType,
  AssetChangeLog,
} from "./types";

type Props = {
  visible: boolean;
  asset: SavedMapAsset | null;
  projectId?: string | null;
  onClose: () => void;
};

const actionOptions: AssetChangeAction[] = [
  "commented",
  "repaired",
  "tested",
  "moved",
  "updated",
  "photo-added",
  "otdr-added",
];

const attachmentTypeOptions: AssetChangeAttachmentType[] = [
  "photo",
  "damage-photo",
  "otdr",
  "document",
];

export default function AssetChangeLogPanel({
  visible,
  asset,
  projectId,
  onClose,
}: Props) {
  const [logs, setLogs] = useState<AssetChangeLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [action, setAction] = useState<AssetChangeAction>("commented");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentType, setAttachmentType] = useState<AssetChangeAttachmentType>("photo");
  const [attachments, setAttachments] = useState<AssetChangeAttachment[]>([]);
  const [selectedLog, setSelectedLog] = useState<AssetChangeLog | null>(null);

  useEffect(() => {
    if (!visible || !asset?.id) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const rows = await loadAssetChangeLogs(asset.id);
        if (!cancelled) {
          setLogs(rows);
      setSelectedLog(rows[0] ?? null);
          setSelectedLog((current) => {
            if (!current) return null;
            return rows.find((row) => row.id === current.id) ?? null;
          });
        }
      } catch (err) {
        console.error("Failed to load maintenance history", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [visible, asset?.id]);

  if (!visible || !asset) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const nextAttachments: AssetChangeAttachment[] = [];

    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file);
      nextAttachments.push({
        id: crypto.randomUUID(),
        type: attachmentType,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      });
    }

    setAttachments((prev) => [...prev, ...nextAttachments]);
  };

  const handleSave = async () => {
    if (!reason.trim()) {
      alert("Add a reason so the change is accountable.");
      return;
    }

    setIsSaving(true);
    try {
      await createAssetChangeLog({
        projectId,
        asset,
        action,
        reason,
        comment,
        attachments,
        after: asset,
      });

      setReason("");
      setComment("");
      setAttachments([]);
      const rows = await loadAssetChangeLogs(asset.id);
      setLogs(rows);
      setSelectedLog(rows[0] ?? null);
    } catch (err) {
      console.error("Failed to save maintenance history", err);
      alert("Could not save the maintenance log.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontWeight: 800 }}>Maintenance / Audit History</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {asset.name || "Unnamed asset"} · {asset.assetType || asset.jointType || "asset"}
            </div>
          </div>
          <button onClick={onClose} style={secondaryButton}>Close</button>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Action</div>
          <select value={action} onChange={(e) => setAction(e.target.value as AssetChangeAction)} style={inputStyle}>
            {actionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <div style={labelStyle}>Reason *</div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Example: cable moved due to roadworks"
            style={inputStyle}
          />

          <div style={labelStyle}>Comment / Engineer Notes</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add maintenance notes, fault details, OTDR result summary, or damage description."
            style={{ ...inputStyle, height: 90 }}
          />

          <div style={labelStyle}>Evidence Type</div>
          <select value={attachmentType} onChange={(e) => setAttachmentType(e.target.value as AssetChangeAttachmentType)} style={inputStyle}>
            {attachmentTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <div style={labelStyle}>Attach photos / OTDR / documents</div>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.sor,.txt,.csv,.xlsx,.xls,.json"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />

          {attachments.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#d1d5db" }}>
              {attachments.map((file) => (
                <div key={file.id}>• {file.type}: {file.fileName}</div>
              ))}
            </div>
          )}

          <button onClick={handleSave} disabled={isSaving} style={{ ...primaryButton, marginTop: 12 }}>
            {isSaving ? "Saving..." : "Save Log Entry"}
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>History</div>
          {isLoading ? (
            <div style={{ color: "#9ca3af" }}>Loading history...</div>
          ) : logs.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>No maintenance history yet.</div>
          ) : (
            logs.map((log) => {
              const isSelected = selectedLog?.id === log.id;

              return (
                <div
                  key={log.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedLog((current) => (current?.id === log.id ? null : log))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedLog((current) => (current?.id === log.id ? null : log));
                    }
                  }}
                  title="Click to view exactly what changed"
                  style={{
                    ...logCardStyle,
                    cursor: "pointer",
                    borderColor: isSelected ? "#60a5fa" : "#374151",
                    boxShadow: isSelected ? "0 0 0 1px rgba(96,165,250,0.45)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{log.action}</strong>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>
                      {formatDate(log.changedAt)}
                    </span>
                  </div>
                  <div style={{ color: "#d1d5db", marginTop: 4 }}>{log.reason}</div>
                  {log.comment ? <div style={{ color: "#9ca3af", marginTop: 4 }}>{log.comment}</div> : null}
                  <div style={{ color: "#6b7280", marginTop: 6, fontSize: 12 }}>
                    By {log.changedByName || log.changedByEmail || "unknown"}
                  </div>
                  <div style={{ color: "#93c5fd", marginTop: 8, fontSize: 12, fontWeight: 700 }}>
                    {isSelected ? "Hide change details" : "View change details"}
                  </div>
                  {isSelected ? <LogChangeDetails log={log} /> : null}
                  {log.attachments?.length ? (
                    <div style={{ marginTop: 8 }}>
                      {log.attachments.map((attachment) => (
                        <div key={attachment.id} style={{ fontSize: 12 }}>
                          {attachment.dataUrl ? (
                            <a href={attachment.dataUrl} target="_blank" rel="noreferrer" style={linkStyle} onClick={(event) => event.stopPropagation()}>
                              {attachment.type}: {attachment.fileName}
                            </a>
                          ) : attachment.url ? (
                            <a href={attachment.url} target="_blank" rel="noreferrer" style={linkStyle} onClick={(event) => event.stopPropagation()}>
                              {attachment.type}: {attachment.fileName}
                            </a>
                          ) : (
                            <span>{attachment.type}: {attachment.fileName}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function LogChangeDetails({ log }: { log: AssetChangeLog }) {
  const fibreMoves = extractFibreMoves(log);
  const before = flattenSnapshot(log.before);
  const after = flattenSnapshot(log.after);

  const ignoredKeys = new Set([
    "asset.lastViewedAt",
    "asset.lastEditedAt",
    "asset.metadata.lastViewedAt",
    "asset.metadata.lastEditedAt",
    "asset.syncRevision",
    "asset.updatedAt",
    "moves",
  ]);

  const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !ignoredKeys.has(key))
    .filter((key) => before[key] !== after[key])
    .sort();

  return (
    <div style={detailsBoxStyle} onClick={(event) => event.stopPropagation()}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Changed details</div>

      {fibreMoves.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: 6 }}>Fibre move details</div>
          {fibreMoves.map((move, index) => (
            <div key={move.id || `${move.fromFibre}-${move.toFibre}-${index}`} style={fibreMoveBoxStyle}>
              <div style={{ fontWeight: 800 }}>
                Fibre {move.fromFibre} swapped with fibre {move.toFibre}
              </div>
              <div style={changeValueStyle}>
                <span style={{ color: "#fca5a5", fontWeight: 800 }}>Before:</span>{" "}
                fibre {move.fromFibre} = {formatFibreLabel(move.fromLabelBefore)}, fibre {move.toFibre} = {formatFibreLabel(move.toLabelBefore)}
              </div>
              <div style={changeValueStyle}>
                <span style={{ color: "#86efac", fontWeight: 800 }}>After:</span>{" "}
                fibre {move.fromFibre} = {formatFibreLabel(move.toLabelBefore)}, fibre {move.toFibre} = {formatFibreLabel(move.fromLabelBefore)}
              </div>
              {move.jointName ? (
                <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>Joint: {move.jointName}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {changedKeys.length === 0 ? (
        fibreMoves.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 12 }}>
            No field-level before/after data was saved for this entry. The saved audit note is shown above.
          </div>
        ) : null
      ) : (
        <>
          {fibreMoves.length > 0 ? (
            <div style={{ color: "#93c5fd", fontWeight: 800, margin: "10px 0 4px" }}>Other changed fields</div>
          ) : null}
          {changedKeys.slice(0, 40).map((key) => (
            <div key={key} style={changeRowStyle}>
              <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: 4 }}>{key}</div>
              <div style={changeValueStyle}>
                <span style={{ color: "#fca5a5", fontWeight: 800 }}>Before:</span> {before[key] || "empty"}
              </div>
              <div style={changeValueStyle}>
                <span style={{ color: "#86efac", fontWeight: 800 }}>After:</span> {after[key] || "empty"}
              </div>
            </div>
          ))}
        </>
      )}

      {changedKeys.length > 40 ? (
        <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 8 }}>
          Showing first 40 changed fields.
        </div>
      ) : null}
    </div>
  );
}

type FibreMoveLogRow = {
  id?: string;
  jointName?: string;
  fromFibre?: number | string;
  toFibre?: number | string;
  fromLabelBefore?: string;
  toLabelBefore?: string;
};

function extractFibreMoves(log: AssetChangeLog): FibreMoveLogRow[] {
  const beforeMoves = (log.before as any)?.moves;
  const afterMoves = (log.after as any)?.moves;
  const moves = Array.isArray(afterMoves) ? afterMoves : Array.isArray(beforeMoves) ? beforeMoves : [];

  return moves.filter((move) => move && (move.fromFibre !== undefined || move.toFibre !== undefined));
}

function formatFibreLabel(value: unknown) {
  const label = String(value ?? "").trim();
  return label || "empty";
}

function flattenSnapshot(value: unknown, prefix = "", output: Record<string, string> = {}) {
  if (value === null || value === undefined) return output;

  if (Array.isArray(value)) {
    output[prefix || "value"] = `[${value.length} items]`;
    return output;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      flattenSnapshot(nestedValue, nextKey, output);
    });
    return output;
  }

  output[prefix || "value"] = String(value);
  return output;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(value?: string) {
  if (!value) return "unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 8000,
  background: "rgba(15, 23, 42, 0.45)",
  pointerEvents: "auto",
  overflow: "hidden",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: 420,
  maxWidth: "100vw",
  height: "100dvh",
  maxHeight: "100dvh",
  overflowY: "scroll",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  background: "#111827",
  color: "#f9fafb",
  padding: 16,
  paddingBottom: 96,
  boxSizing: "border-box",
  borderLeft: "1px solid #374151",
  boxShadow: "-12px 0 30px rgba(0,0,0,0.35)",
};

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
  paddingBottom: 10,
  background: "#111827",
};

const cardStyle: React.CSSProperties = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: 12,
};

const logCardStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 10,
};

const detailsBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#020617",
};

const fibreMoveBoxStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #1d4ed8",
  background: "rgba(30, 64, 175, 0.18)",
  marginBottom: 8,
};

const changeRowStyle: React.CSSProperties = {
  padding: "8px 0",
  borderTop: "1px solid #1f2937",
};

const changeValueStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const labelStyle: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 4,
  fontSize: 12,
  color: "#cbd5e1",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#020617",
  color: "#f9fafb",
  padding: "8px 10px",
};

const primaryButton: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  background: "#374151",
};

const linkStyle: React.CSSProperties = {
  color: "#93c5fd",
  textDecoration: "underline",
};
