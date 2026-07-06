import React, { useMemo } from "react";
import type { FibreCell } from "../logic/jointConfig";
import { getColourForFibre } from "../logic/fibreColours";

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
  model: FibreCell[];
  mappingRows: any[][];
  searchMatches: Set<number>;
  moveMode?: boolean;
  moveSrc?: FibreCell | null;
  selectedFibre: number | null;
  onSelectFibre: (fibre: number | null) => void;
  onFibreClick?: (cell: FibreCell, target?: { side: "input" | "output"; tray: number; localFibre: number; fibreNo?: number }) => void;
};

function buildSpliceRows(mappingRows: any[][]): MeetMeSpliceRow[] {
  if (!Array.isArray(mappingRows)) return [];

  return mappingRows
    .flatMap((row, index) =>
      readMeetMeRows(row, index).map((fields, spliceIndex) => ({
        id: `meet-me-splice-${index}-${spliceIndex}`,
        tray: fields.tray,
        inputCable: fields.inputCable,
        inputFibre: fields.inputFibre,
        outputCable: fields.outputCable,
        outputFibre: fields.outputFibre,
        status: fields.status,
        notes: fields.notes,
      })),
    )
    .filter((row) => row.inputFibre !== null || row.outputFibre !== null || row.inputCable || row.outputCable);
}

export default function MeetMeTrayView({
  model,
  mappingRows,
  searchMatches,
  moveMode = false,
  moveSrc = null,
  selectedFibre,
  onSelectFibre,
  onFibreClick,
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
  const modelByTray = useMemo(() => {
    const byTray = new Map<number, FibreCell[]>();
    model.forEach((cell) => {
      const tray = cell.tray + 1;
      const list = byTray.get(tray) || [];
      list.push(cell);
      byTray.set(tray, list);
    });
    byTray.forEach((list) =>
      list.sort((a, b) => a.pos - b.pos || a.globalNo - b.globalNo),
    );
    return byTray;
  }, [model]);
  const modelByGlobalNo = useMemo(() => {
    const byGlobalNo = new Map<number, FibreCell>();
    model.forEach((cell) => byGlobalNo.set(cell.globalNo, cell));
    return byGlobalNo;
  }, [model]);

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
          {(() => {
            const visualRows = buildVisualSpliceRows(tray, trayRows);
            const inputCableLabel = shortCableLabel(trayRows[0]?.inputCable, "EBCL");
            const primaryOutputCable = cleanCell(trayRows[0]?.outputCable) || "Feeder";
            const outputCableLabel = shortCableLabel(trayRows[0]?.outputCable, "Feeder");
            return (
              <>
          <div style={spliceMatrix}>
            <div style={rowLabel}>{inputCableLabel} / Input</div>
            <div style={fibreButtonGrid}>
              {Array.from({ length: 12 }, (_, index) =>
                renderFibreButton({
                  tray,
                  localFibre: index + 1,
                  fibreNo: getTrayGlobalFibre(tray, index + 1),
                  modelByTray,
                  modelByGlobalNo,
                  searchMatches,
                  selectedFibre,
                  moveMode,
                  moveSrc,
                  onSelectFibre,
                  onFibreClick,
                  side: "input",
                }),
              )}
            </div>

            <svg viewBox="0 0 1200 86" preserveAspectRatio="none" style={spliceSvg}>
              {visualRows.map((row) => {
                  const visualLocal = getVisualLocalFibre(row);
                  const x1 = getColumnX(visualLocal);
                  const x2 = getColumnX(visualLocal);
                  const selected =
                    selectedFibre === row.inputFibre || selectedFibre === row.outputFibre;
                  const cableMismatch = isDifferentCable(row.outputCable, primaryOutputCable);
                  const matched =
                    (row.inputFibre !== null && searchMatches.has(row.inputFibre)) ||
                    (row.outputFibre !== null && searchMatches.has(row.outputFibre));
                  return (
                    <g key={`${row.id}-line`}>
                      <path
                        d={`M ${x1} 4 C ${x1} 34, ${x2} 52, ${x2} 82`}
                        fill="none"
                        stroke={
                          getTrayNumber(row.outputFibre) !== tray
                            ? "#fb923c"
                            : cableMismatch
                              ? "#a78bfa"
                              : selected
                              ? "#60a5fa"
                              : matched
                                ? "#facc15"
                                : "#38bdf8"
                        }
                        strokeWidth={getTrayNumber(row.outputFibre) !== tray || cableMismatch || selected || matched ? 5 : 3}
                        opacity={selected || matched ? 0.95 : 0.72}
                      />
                      <circle cx={x1} cy={4} r={5} fill="#0ea5e9" />
                      <circle cx={x2} cy={82} r={5} fill="#0ea5e9" />
                    </g>
                  );
                })}
            </svg>

            <div style={rowLabel}>{outputCableLabel} / Output</div>
            <div style={fibreButtonGrid}>
              {Array.from({ length: 12 }, (_, index) => {
                const localFibre = index + 1;
                const mappedRow = trayRows.find(
                  (row) => getVisualLocalFibre(row) === localFibre,
                );
                return renderFibreButton({
                  tray,
                  localFibre,
                  fibreNo: mappedRow?.outputFibre ?? getTrayGlobalFibre(tray, localFibre),
                  modelByTray,
                  modelByGlobalNo,
                  searchMatches,
                  selectedFibre,
                  cableLabel:
                    mappedRow && isDifferentCable(mappedRow.outputCable, primaryOutputCable)
                      ? shortCableLabel(mappedRow.outputCable, "Feeder")
                      : undefined,
                  moveMode,
                  moveSrc,
                  onSelectFibre,
                  onFibreClick,
                  side: "output",
                });
              })}
            </div>
          </div>
              </>
            );
          })()}

          {(() => {
            const primaryOutputCable = cleanCell(trayRows[0]?.outputCable) || "Feeder";
            const exceptionRows = trayRows.filter(
              (row) => row.inputFibre !== row.outputFibre || isDifferentCable(row.outputCable, primaryOutputCable),
            );

            return exceptionRows.length > 0 && (
            <>
              <div style={gridHeader}>
                <span>EBCL</span>
                <span style={{ textAlign: "center" }}>Splice</span>
                <span style={{ textAlign: "right" }}>Feeder</span>
              </div>

              {exceptionRows.map((row) => {
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
                      <small>{shortCableLabel(row.inputCable, "EBCL")}</small>
                      <strong>{formatAbsoluteFibre(row.inputFibre)}</strong>
                    </span>

                    <span style={spliceLine}>
                      <span style={dot} />
                      <span style={line} />
                      <span style={arrow}>-&gt;</span>
                      <span style={line} />
                      <span style={dot} />
                    </span>

                    <span style={{ ...sideText, textAlign: "right" }}>
                      <small>{shortCableLabel(row.outputCable, "Feeder")}</small>
                      <strong>{formatAbsoluteFibre(row.outputFibre)}</strong>
                    </span>
                  </button>
                );
              })}
            </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function renderFibreButton({
  tray,
  localFibre,
  fibreNo,
  modelByTray,
  modelByGlobalNo,
  searchMatches,
  selectedFibre,
  cableLabel,
  moveMode,
  moveSrc,
  onSelectFibre,
  onFibreClick,
  side,
}: {
  tray: number;
  localFibre: number;
  fibreNo: number;
  modelByTray: Map<number, FibreCell[]>;
  modelByGlobalNo: Map<number, FibreCell>;
  searchMatches: Set<number>;
  selectedFibre: number | null;
  cableLabel?: string;
  moveMode: boolean;
  moveSrc: FibreCell | null;
  onSelectFibre: (fibre: number | null) => void;
  onFibreClick?: (cell: FibreCell, target?: { side: "input" | "output"; tray: number; localFibre: number; fibreNo?: number }) => void;
  side: "input" | "output";
}) {
  const cell =
    modelByGlobalNo.get(fibreNo) ||
    modelByTray.get(tray)?.find((item) => item.pos === localFibre - 1);
  const colour = getColourForFibre(localFibre - 1);
  const selected = selectedFibre === fibreNo;
  const matched = searchMatches.has(fibreNo);
  const isMoveSource = moveMode && moveSrc?.globalNo === fibreNo;

  return (
    <button
      key={`${tray}-${localFibre}-${fibreNo}`}
      type="button"
      onClick={() => {
        if (cell && onFibreClick) {
          onFibreClick(cell, { side, tray, localFibre, fibreNo });
          return;
        }
        onSelectFibre(fibreNo);
      }}
      style={{
        ...fibreButton,
        background: colour,
        color: getTextColour(colour),
        borderColor: isMoveSource
          ? "#ffffff"
          : selected
            ? "#60a5fa"
            : matched
              ? "#facc15"
              : "#334155",
        boxShadow: isMoveSource
          ? "0 0 0 3px rgba(249, 115, 22, 0.45)"
          : selected || matched
            ? "0 0 0 3px rgba(96, 165, 250, 0.22)"
            : "none",
      }}
      title={`${cableLabel ? `${cableLabel} ` : ""}Tray ${tray} ${side === "output" ? "Output" : "Input"} F${fibreNo}`}
    >
      {cableLabel ? (
        <span style={buttonStack}>
          <span style={buttonCableLabel}>{cableLabel}</span>
          <span>F{fibreNo}</span>
        </span>
      ) : (
        `F${fibreNo}`
      )}
    </button>
  );
}

function buildVisualSpliceRows(tray: number, rows: MeetMeSpliceRow[]): MeetMeSpliceRow[] {
  const byInputLocal = new Map<number, MeetMeSpliceRow>();
  rows.forEach((row) => {
    const inputLocal = getVisualLocalFibre(row);
    if (!byInputLocal.has(inputLocal)) byInputLocal.set(inputLocal, row);
  });

  return Array.from({ length: 12 }, (_, index) => {
    const localFibre = index + 1;
    const mapped = byInputLocal.get(localFibre);
    if (mapped) return mapped;

    const globalFibre = getTrayGlobalFibre(tray, localFibre);
    return {
      id: `visual-splice-${tray}-${localFibre}`,
      tray,
      inputCable: "EBCL",
      inputFibre: globalFibre,
      outputCable: "Feeder",
      outputFibre: globalFibre,
      status: "Visual path",
      notes: "",
    };
  });
}

function getVisualLocalFibre(row: MeetMeSpliceRow) {
  return getLocalFibre(row.inputFibre ?? row.outputFibre);
}

function getTrayGlobalFibre(tray: number, localFibre: number) {
  return (tray - 1) * 12 + localFibre;
}

function getTrayNumber(fibre: number | null) {
  if (!fibre || !Number.isFinite(fibre)) return 1;
  return Math.floor((fibre - 1) / 12) + 1;
}

function getLocalFibre(fibre: number | null) {
  if (!fibre || !Number.isFinite(fibre)) return 1;
  return ((fibre - 1) % 12) + 1;
}

function formatLocalFibre(fibre: number | null) {
  return fibre ? `F${getLocalFibre(fibre)}` : "F?";
}

function formatAbsoluteFibre(fibre: number | null) {
  return fibre ? `F${fibre}` : "F?";
}

function shortCableLabel(value: string | undefined, fallback: string) {
  const text = cleanCell(value) || fallback;
  return text.length > 28 ? `${text.slice(0, 25)}...` : text;
}

function isDifferentCable(value: string | undefined, baseline: string | undefined) {
  return normalizeCable(value) !== normalizeCable(baseline);
}

function normalizeCable(value: string | undefined) {
  return cleanCell(value).toLowerCase();
}

function readMeetMeRow(row: any[], rowIndex: number) {
  return readMeetMeRows(row, rowIndex)[0];
}

function readMeetMeRows(row: any[], rowIndex: number) {
  const tray = parseFibre(row?.[1]) || Math.floor(rowIndex / 12) + 1;
  const inputLocalFibres = parseMeetMeFibreRange(row?.[3]);
  const outputLocalFibres = parseMeetMeFibreRange(row?.[5]);
  const fallbackLocalFibres = inputLocalFibres.length ? inputLocalFibres : outputLocalFibres;
  const maxLength = Math.max(inputLocalFibres.length, outputLocalFibres.length, fallbackLocalFibres.length, 1);

  return Array.from({ length: maxLength }, (_, index) => {
    const inputLocalFibre = inputLocalFibres[index] ?? fallbackLocalFibres[index] ?? null;
    const outputLocalFibre = outputLocalFibres[index] ?? inputLocalFibre;

    return {
    tray,
    position: inputLocalFibre ?? outputLocalFibre ?? 1,
    inputCable: cleanCell(row?.[2]) || "EBCL",
    inputFibre: inputLocalFibre,
    outputCable: cleanCell(row?.[4]) || "Feeder",
    outputFibre: outputLocalFibre,
    status: cleanCell(row?.[6]),
    notes: cleanCell(row?.[7]),
    };
  });
}

function parseMeetMeFibreRange(value: unknown): number[] {
  const text = cleanCell(value);
  if (!text) return [];

  const range = text.match(/F?\s*(\d{1,4})\s*-\s*F?\s*(\d{1,4})/i);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  const single = parseFibre(value);
  return single === null ? [] : [single];
}

function getColumnX(localFibre: number) {
  return ((localFibre - 0.5) / 12) * 1200;
}

function getTextColour(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#000000" : "#ffffff";
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

const spliceMatrix: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 10,
};

const rowLabel: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 850,
};

const fibreButtonGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(34px, 1fr))",
  gap: 7,
  marginBottom: 10,
  background: "#0b1220",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: 8,
};

const spliceSvg: React.CSSProperties = {
  width: "100%",
  height: 86,
  display: "block",
  background: "rgba(2, 6, 23, 0.55)",
  border: "1px solid rgba(148, 163, 184, 0.12)",
  borderRadius: 10,
};

const fibreButton: React.CSSProperties = {
  height: 34,
  minWidth: 34,
  border: "2px solid #334155",
  borderRadius: 8,
  fontWeight: 950,
  fontSize: 12,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  lineHeight: 1,
  overflow: "hidden",
};

const buttonStack: React.CSSProperties = {
  display: "grid",
  gap: 1,
  justifyItems: "center",
  maxWidth: "100%",
};

const buttonCableLabel: React.CSSProperties = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 9,
  fontWeight: 900,
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

const emptyState: React.CSSProperties = {
  border: "1px dashed #475569",
  borderRadius: 12,
  padding: 18,
  color: "#cbd5e1",
  background: "#0f172a",
  lineHeight: 1.5,
};
