import type React from "react";
import { useState } from "react";
import type { JobPackDraft } from "../../services/jobpacks";
import { exportJobPackDraftPdf, exportJobPackZip, exportQgisJobPackBundle } from "../../services/jobpacks";

type JobPackExportPanelProps = {
  draft: JobPackDraft;
  onArchive: () => void;
};

export function JobPackExportPanel({ draft, onArchive }: JobPackExportPanelProps) {
  const [exporting, setExporting] = useState<"pdf" | "zip" | "qgis" | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const runExport = async (type: "pdf" | "zip" | "qgis") => {
    setExporting(type);
    setMessage(null);
    try {
      if (type === "pdf") {
        await exportJobPackDraftPdf(draft);
        setMessage({ type: "ok", text: "PDF export started." });
      } else if (type === "qgis") {
        const filename = await exportQgisJobPackBundle(draft);
        setMessage({ type: "ok", text: `QGIS bundle export started: ${filename}` });
      } else {
        await exportJobPackZip(draft);
        setMessage({ type: "ok", text: "Job pack upload bundle export started." });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage({ type: "error", text: `Export failed: ${text}` });
      console.error("Job pack export failed", error);
    } finally {
      setExporting(null);
    }
  };

  return (
    <section style={panel}>
      <div style={title}>Export / Issue</div>
      <div style={actions}>
        <button type="button" style={primary} onClick={() => runExport("pdf")} disabled={Boolean(exporting)}>
          {exporting === "pdf" ? "Building PDF..." : "Export PDF"}
        </button>
        <button type="button" style={secondary} onClick={() => runExport("zip")} disabled={Boolean(exporting)}>
          {exporting === "zip" ? "Preparing upload..." : "Job Pack Upload"}
        </button>
        <button type="button" style={secondary} onClick={() => runExport("qgis")} disabled={Boolean(exporting)}>
          {exporting === "qgis" ? "Building QGIS..." : "Export QGIS"}
        </button>
        <button type="button" style={secondary} onClick={onArchive} disabled={Boolean(exporting)}>
          Save Archive
        </button>
      </div>
      {message ? (
        <div style={message.type === "error" ? errorMessage : okMessage}>
          {message.text}
        </div>
      ) : null}
    </section>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(56, 189, 248, 0.22)",
  borderRadius: 8,
  padding: 14,
  background: "rgba(8, 47, 73, 0.24)",
};

const title: React.CSSProperties = { fontSize: 15, fontWeight: 900, marginBottom: 12, color: "#f8fafc" };
const actions: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const primary: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 14px", background: "linear-gradient(135deg, #0ea5e9, #2563eb)", color: "white", fontWeight: 900, cursor: "pointer" };
const secondary: React.CSSProperties = { border: "1px solid rgba(56,189,248,.45)", borderRadius: 8, padding: "10px 14px", background: "rgba(14,165,233,.12)", color: "#bae6fd", fontWeight: 900, cursor: "pointer" };
const okMessage: React.CSSProperties = { marginTop: 10, color: "#bbf7d0", fontSize: 12, fontWeight: 800 };
const errorMessage: React.CSSProperties = { marginTop: 10, color: "#fecaca", fontSize: 12, fontWeight: 800 };
