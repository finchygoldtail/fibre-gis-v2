import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "../../map/types";
import {
  addressSheetReportToCsv,
  buildAddressSheetMatchReport,
  parseAddressSheetFile,
  type AddressSheetMatchReport,
  type AddressSheetMatchedRow,
} from "./addressSheetParser";

export type AddressSheetAssignmentRequest = {
  rows: AddressSheetMatchedRow[];
  overwriteExistingDrops: boolean;
  note: string;
};

type Props = {
  projectAssets: SavedMapAsset[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset?: (asset: SavedMapAsset) => void;
  onApplyAssignments?: (request: AddressSheetAssignmentRequest) => void | Promise<void>;
};

const panel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
  minHeight: 190,
  gridColumn: "span 2",
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const button: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "9px 11px",
  fontWeight: 800,
  cursor: "pointer",
};

const tile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#93a4bd",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  fontSize: 12,
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  color: "#dbeafe",
  borderBottom: "1px solid rgba(148,163,184,0.1)",
  fontSize: 12,
  verticalAlign: "top",
};

function n(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-GB") : "0";
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function assetLabel(asset?: SavedMapAsset): string {
  if (!asset) return "—";
  const item = asset as any;
  return String(item.name || item.jointName || item.label || item.assetId || item.id || "Asset");
}

function downloadCsv(report: AddressSheetMatchReport) {
  const csv = addressSheetReportToCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "address-sheet-map-match-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AddressSheetImportPanel({ projectAssets, onSelectAsset, onOpenAsset, onApplyAssignments }: Props) {
  const [report, setReport] = useState<AddressSheetMatchReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);

  const splitterSummary = useMemo(() => {
    if (!report) return [];
    const grouped = new Map<string, { rows: number; matchedHomes: number; matchedPoleChambers: number }>();

    report.rows.forEach((row) => {
      const key = row.splitterBox || "No splitter";
      const current = grouped.get(key) || { rows: 0, matchedHomes: 0, matchedPoleChambers: 0 };
      current.rows += 1;
      if (row.homeAsset) current.matchedHomes += 1;
      if (row.poleChamberAsset) current.matchedPoleChambers += 1;
      grouped.set(key, current);
    });

    return Array.from(grouped.entries())
      .map(([splitterBox, values]) => ({ splitterBox, ...values }))
      .sort((a, b) => a.splitterBox.localeCompare(b.splitterBox));
  }, [report]);


  const handleApplyAssignments = async () => {
    if (!report || applying) return;

    const assignableRows = report.rows.filter((row) => row.homeAsset && row.splitterBox);
    if (!assignableRows.length) {
      alert("No matched homes with splitter boxes were found in the address sheet.");
      return;
    }

    const unmatchedHomes = report.rows.filter((row) => !row.homeAsset).length;
    if (unmatchedHomes > 0) {
      const proceed = window.confirm(
        `${unmatchedHomes} address sheet row${unmatchedHomes === 1 ? "" : "s"} did not match a map home. Apply the matched rows only?`,
      );
      if (!proceed) return;
    }

    const overwriteExistingDrops = window.confirm(
      "Replace existing home drop cables for these matched homes with drops from the assigned splitter boxes?\n\nChoose OK for the clean test path. Choose Cancel to only stamp SB/home metadata.",
    );

    const note = window.prompt(
      "Audit note for SB/Home/drop assignment:",
      "Assign homes to splitter boxes from address sheet",
    );

    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      alert("An audit note is required before applying address sheet assignments.");
      return;
    }

    setApplying(true);
    try {
      await onApplyAssignments?.({
        rows: assignableRows,
        overwriteExistingDrops,
        note: trimmed,
      });
    } catch (err) {
      console.error("Address sheet assignment failed", err);
      alert(err instanceof Error ? err.message : "Address sheet assignment failed.");
    } finally {
      setApplying(false);
    }
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const rows = await parseAddressSheetFile(file);
      setReport(buildAddressSheetMatchReport(rows, projectAssets));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Address sheet import failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={panel}>
      <h3 style={title}>Address Sheet → SB / Home Matcher</h3>
      <p style={{ color: "#cbd5e1", marginTop: 0 }}>
        Upload the address sheet to match UPRNs to map homes and group them by splitter box.
        Pole/chamber references are ignored for this workflow; SBs can be created at the centre of their matched homes and drops generated from SB to home.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => handleFile(event.target.files?.[0])}
          style={{ color: "#dbeafe" }}
        />
        {report ? (
          <button type="button" style={button} onClick={() => downloadCsv(report)}>
            Export Match Report
          </button>
        ) : null}
        {report ? (
          <button type="button" style={button} onClick={() => setShowRows((value) => !value)}>
            {showRows ? "Hide Row Matches" : "Show Row Matches"}
          </button>
        ) : null}
        {report && onApplyAssignments ? (
          <button
            type="button"
            style={{
              ...button,
              background: report.stats.unmatchedHomes === 0 ? "#14532d" : "#78350f",
              borderColor: report.stats.unmatchedHomes === 0 ? "rgba(74,222,128,0.42)" : "rgba(251,191,36,0.42)",
            }}
            onClick={handleApplyAssignments}
            disabled={applying}
          >
            {applying ? "Applying..." : "Assign SB / Home / Drops"}
          </button>
        ) : null}
      </div>

      {loading ? <div style={{ color: "#93c5fd" }}>Reading address sheet…</div> : null}
      {error ? <div style={{ color: "#fecaca", marginBottom: 10 }}>{error}</div> : null}

      {report ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
            <Metric label="Rows" value={n(report.stats.rows)} />
            <Metric label="Unique UPRNs" value={n(report.stats.uniqueUprns)} />
            <Metric label="Homes matched" value={`${n(report.stats.matchedHomes)} / ${n(report.stats.rows)} (${pct(report.stats.matchedHomes, report.stats.rows)})`} />
            <Metric label="UPRN matches" value={n(report.stats.matchedHomesByUprn)} />
            <Metric label="Address fallback" value={n(report.stats.matchedHomesByAddress)} />
            <Metric label="Unmatched homes" value={n(report.stats.unmatchedHomes)} danger={report.stats.unmatchedHomes > 0} />
            <Metric label="Splitter boxes" value={n(report.stats.splitterBoxes)} />
            <Metric label="Pole/chamber refs" value={n(report.stats.poleChambers)} />
            <Metric label="Pole/chamber matched" value={`${n(report.stats.matchedPoleChambers)} / ${n(report.stats.rows)}`} />
          </div>

          <div style={{ overflowX: "auto", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Splitter Box</th>
                  <th style={th}>Rows</th>
                  <th style={th}>Homes Matched</th>
                  <th style={th}>Pole/Chamber Matched</th>
                </tr>
              </thead>
              <tbody>
                {splitterSummary.map((row) => (
                  <tr key={row.splitterBox}>
                    <td style={td}>{row.splitterBox}</td>
                    <td style={td}>{n(row.rows)}</td>
                    <td style={td}>{n(row.matchedHomes)} / {n(row.rows)}</td>
                    <td style={td}>{n(row.matchedPoleChambers)} / {n(row.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showRows ? (
            <div style={{ overflowX: "auto", maxHeight: 420, border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Row</th>
                    <th style={th}>UPRN / Address</th>
                    <th style={th}>SB</th>
                    <th style={th}>Pole/Chamber</th>
                    <th style={th}>Map Home</th>
                    <th style={th}>Map Pole/Chamber</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 250).map((row) => (
                    <tr key={`${row.rowNumber}-${row.uprn}-${row.address}`}>
                      <td style={td}>{row.rowNumber}</td>
                      <td style={td}>
                        <div>{row.uprn || "No UPRN"}</div>
                        <div style={{ color: "#94a3b8" }}>{row.address}</div>
                      </td>
                      <td style={td}>{row.splitterBox}</td>
                      <td style={td}>{row.poleChamber}</td>
                      <td style={td}>
                        {row.homeAsset ? (
                          <button type="button" style={button} onClick={() => { onSelectAsset?.(row.homeAsset!); onOpenAsset?.(row.homeAsset!); }}>
                            {row.homeMatchType}: {assetLabel(row.homeAsset)}
                          </button>
                        ) : (
                          <span style={{ color: "#fb7185" }}>No match</span>
                        )}
                      </td>
                      <td style={td}>
                        {row.poleChamberAsset ? (
                          <button type="button" style={button} onClick={() => { onSelectAsset?.(row.poleChamberAsset!); onOpenAsset?.(row.poleChamberAsset!); }}>
                            {assetLabel(row.poleChamberAsset)}
                          </button>
                        ) : (
                          <span style={{ color: "#fbbf24" }}>No map ref</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.rows.length > 250 ? (
                <div style={{ padding: 10, color: "#94a3b8" }}>Showing first 250 rows. Export the CSV for the full report.</div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div style={tile}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: danger ? "#fb7185" : "#f8fafc" }}>{value}</div>
    </div>
  );
}
