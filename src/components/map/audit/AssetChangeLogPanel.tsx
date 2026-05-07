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

  useEffect(() => {
    if (!visible || !asset?.id) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const rows = await loadAssetChangeLogs(asset.id);
        if (!cancelled) setLogs(rows);
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
            logs.map((log) => (
              <div key={log.id} style={logCardStyle}>
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
                {log.attachments?.length ? (
                  <div style={{ marginTop: 8 }}>
                    {log.attachments.map((attachment) => (
                      <div key={attachment.id} style={{ fontSize: 12 }}>
                        {attachment.dataUrl ? (
                          <a href={attachment.dataUrl} target="_blank" rel="noreferrer" style={linkStyle}>
                            {attachment.type}: {attachment.fileName}
                          </a>
                        ) : attachment.url ? (
                          <a href={attachment.url} target="_blank" rel="noreferrer" style={linkStyle}>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
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
