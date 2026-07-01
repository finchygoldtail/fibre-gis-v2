import React, { useMemo } from "react";

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "nan") return "";
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function parseFibre(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const direct = Number(cleanCell(value));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = cleanCell(value).match(/\b(?:FIBRE|FIBER|F)\s*0*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

type MeetMeSpliceRow = {
  id: string;
  tray: number;
  inputCable: string;
  inputFibre: number | null;
  outputCable: string;
  outputFibre: number | null;
  status: string;
  notes: string;
};

type Props = {
  mappingRows: any[][];
  searchMatches: Set<number>;
  selectedFibre: number | null;
  onSelectFibre: (fibre: number | null) => void;
};

function buildSpliceRows(mappingRows: any[][]): MeetMeSpliceRow[] {
  if (!Array.isArray(mappingRows)) return [];

  return mappingRows
    .map((row, index) => {
      const tray = parseFibre(row?.[1]) || Math.floor(index / 12) + 1;
      const inputCable = cleanCell(row?.[5]) || "EBCL";
      const inputFibre = parseFibre(row?.[6]);
      const outputCable = cleanCell(row?.[7]) || "Feeder";
      const outputFibre = parseFibre(row?.[8]) ?? inputFibre;
      const status = cleanCell(row?.[9]);
      const notes = cleanCell(row?.[10]);

      return {
        id: `meet-me-splice-${index}`,
        tray,
        inputCable,
        inputFibre,
        outputCable,
        outputFibre,
        status,
        notes,
      };
    })
    .filter((row) => row.inputFibre !== null || row.outputFibre !== null || row.inputCable || row.outputCable);
}

function short(value: string, fallback: string) {
  return value.length > 24 ? `${value.slice(0, 21)}…` : value || fallback;
}

export default function MeetMeTrayView({
  mappingRows,
  searchMatches,
  selectedFibre,
  onSelectFibre,
}: Props) {
  const rows = useMemo(() => buildSpliceRows(mappingRows), [mappingRows]);
  const grouped = useMemo(() => {
    const byTray = new Map<number, MeetMeSpliceRow[]>();
    rows.forEach((row) => {
      const list = byTray.get(row.tray) || [];
      list.push(row);
      byTray.set(row.tray, list);
    });
    return Array.from(byTray.entries()).sort((a, b) => a[0] - b[0]);
  }, [rows]);

  if (!rows.length) {
    return (
      <div style={emptyState}>
        <strong>Meet Me Chamber splice view</strong>
        <div style={{ marginTop: 8 }}>
          Upload a meet-me splice sheet to show EBCL fibre-to-feeder fibre
          through splices. This view is separate from the LMJ splitter graphic.
        </div>
      </div>
    );
  }

  return (
    <div style={wrapper}>
      <div style={headerCard}>
        <div style={{ fontWeight: 900, color: "#e5e7eb" }}>Meet Me Chamber Splice View</div>
        <div style={{ color: "#93c5fd", fontSize: 12 }}>
          Fibre-to-fibre only. No splitter logic used here.
        </div>
      </div>

      {grouped.map(([tray, trayRows]) => (
        <div key={tray} style={trayCard}>
          <div style={trayTitle}>Splice Tray {tray}</div>
          <div style={gridHeader}>
            <span>EBCL / Input</span>
            <span style={{ textAlign: "center" }}>Through splice</span>
            <span style={{ textAlign: "right" }}>Feeder / Output</span>
          </div>

          {trayRows.map((row) => {
            const fibreNo = row.inputFibre ?? row.outputFibre;
            const selected = fibreNo !== null && selectedFibre === fibreNo;
            const matched = fibreNo !== null && searchMatches.has(fibreNo);

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelectFibre(fibreNo)}
                style={{
                  ...spliceRow,
                  borderColor: selected ? "#60a5fa" : matched ? "#facc15" : "#334155",
                  background: selected ? "#172554" : matched ? "#422006" : "#0f172a",
                }}
              >
                <span style={sideText}>
                  <strong>{short(row.inputCable, "EBCL")}</strong>
                  <small>F{row.inputFibre ?? "?"}</small>
                </span>

                <span style={spliceLine}>
                  <span style={dot} />
                  <span style={line} />
                  <span style={arrow}>→</span>
                  <span style={line} />
                  <span style={dot} />
                </span>

                <span style={{ ...sideText, textAlign: "right" }}>
                  <strong>{short(row.outputCable, "Feeder")}</strong>
                  <small>F{row.outputFibre ?? "?"}</small>
                </span>

                {(row.status || row.notes) && (
                  <span style={noteText}>{[row.status, row.notes].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const wrapper: React.CSSProperties = {
  display: "grid",
  gap: 12,
  minWidth: 720,
};

const headerCard: React.CSSProperties = {
  border: "1px solid #1d4ed8",
  background: "#0b1220",
  borderRadius: 10,
  padding: 12,
};

const trayCard: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#111827",
  borderRadius: 12,
  padding: 10,
};

const trayTitle: React.CSSProperties = {
  color: "#e5e7eb",
  fontWeight: 900,
  marginBottom: 8,
};

const gridHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 150px 1fr",
  color: "#94a3b8",
  fontSize: 11,
  marginBottom: 6,
};

const spliceRow: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "1fr 150px 1fr",
  gap: 10,
  alignItems: "center",
  border: "1px solid #334155",
  borderRadius: 9,
  padding: "7px 9px",
  marginBottom: 5,
  color: "#e5e7eb",
  cursor: "pointer",
};

const sideText: React.CSSProperties = {
  display: "grid",
  gap: 1,
  fontSize: 12,
};

const spliceLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  color: "#60a5fa",
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#60a5fa",
};

const line: React.CSSProperties = {
  height: 2,
  flex: 1,
  background: "#60a5fa",
  minWidth: 28,
};

const arrow: React.CSSProperties = {
  color: "#bfdbfe",
  fontWeight: 900,
};

const noteText: React.CSSProperties = {
  gridColumn: "1 / 4",
  color: "#94a3b8",
  fontSize: 11,
  textAlign: "left",
};

const emptyState: React.CSSProperties = {
  border: "1px dashed #475569",
  borderRadius: 12,
  padding: 18,
  color: "#cbd5e1",
  background: "#0f172a",
  lineHeight: 1.5,
};
