import React, { useMemo, useState } from "react";
import type { FibreCell } from "../logic/jointConfig";

interface Props {
  model: FibreCell[];
  selectedFibre: number | null;
}

type ParsedLabel = {
  inputFibre: string;
  splitter: string;
  splitterId: string;
  splitterOut: string;
  outputFibre: string;
  ag: string;
  agFibre: string;
  group: string;
};

function getSplitterNumber(globalNo: number): number {
  return Math.ceil(globalNo / 4);
}

function getTrayNumber(globalNo: number): number {
  return Math.ceil(globalNo / 8);
}

function getSplitterGroup(splitterNo: number): number[] {
  const start = (splitterNo - 1) * 4 + 1;
  return [start, start + 1, start + 2, start + 3];
}

function parseLmjLabel(label: string): ParsedLabel {
  const out: ParsedLabel = {
    inputFibre: "",
    splitter: "",
    splitterId: "",
    splitterOut: "",
    outputFibre: "",
    ag: "",
    agFibre: "",
    group: "",
  };

  label.split("|").forEach((part) => {
    const [key, value] = part.split("=");
    if (!key || !value) return;

    switch (key) {
      case "INPUT":
        out.inputFibre = value;
        break;
      case "SPLITTER":
        out.splitter = value;
        break;
      case "SPLITTER_ID":
        out.splitterId = value;
        break;
      case "SPLITTER_OUT":
        out.splitterOut = value;
        break;
      case "OUTPUT_FIBRE":
        out.outputFibre = value;
        break;
      case "AG":
        out.ag = value;
        break;
      case "AG_FIBRE":
        out.agFibre = value;
        break;
      case "GROUP":
        out.group = value;
        break;
    }
  });

  return out;
}

export const LMJContinuityViewer: React.FC<Props> = ({
  model,
  selectedFibre,
}) => {
  const [filterText, setFilterText] = useState("");
  const [searchText, setSearchText] = useState("");

  const labelledCells = useMemo(
    () => model.filter((f) => f.label.trim()),
    [model]
  );

  const selectedCell = useMemo(() => {
    if (selectedFibre === null) return null;
    return model.find((f) => f.globalNo === selectedFibre) || null;
  }, [model, selectedFibre]);

  const parsedSelected = useMemo(() => {
    if (!selectedCell?.label) return null;
    return parseLmjLabel(selectedCell.label);
  }, [selectedCell]);

  const selectedSplitter = selectedCell
    ? getSplitterNumber(selectedCell.globalNo)
    : null;

  const selectedGroup = selectedSplitter
    ? getSplitterGroup(selectedSplitter)
    : [];

  const filteredCells = useMemo(() => {
    const filter = filterText.trim().toLowerCase();
    if (!filter) return labelledCells;

    return labelledCells.filter((f) => {
      const splitter = getSplitterNumber(f.globalNo);
      const tray = getTrayNumber(f.globalNo);

      return (
        String(f.globalNo).includes(filter) ||
        String(tray).includes(filter) ||
        String(splitter).includes(filter) ||
        f.label.toLowerCase().includes(filter)
      );
    });
  }, [labelledCells, filterText]);

  const highlightedFibres = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return new Set<number>();

    const set = new Set<number>();
    model.forEach((f) => {
      const splitter = getSplitterNumber(f.globalNo);
      const tray = getTrayNumber(f.globalNo);

      if (
        String(f.globalNo).includes(term) ||
        String(splitter).includes(term) ||
        String(tray).includes(term) ||
        f.label.toLowerCase().includes(term)
      ) {
        set.add(f.globalNo);
      }
    });
    return set;
  }, [model, searchText]);

  const relatedCells = useMemo(() => {
    if (!selectedGroup.length) return [];
    return selectedGroup
      .map((fibreNo) => model.find((f) => f.globalNo === fibreNo))
      .filter(Boolean) as FibreCell[];
  }, [model, selectedGroup]);

  return (
    <div
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        color: "white",
      }}
    >
      <h2 style={{ margin: 0 }}>LMJ Continuity Viewer</h2>

      <div>
        <label style={{ display: "block", marginBottom: 6 }}>Filter</label>
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by fibre, tray, splitter, AG..."
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ display: "block", marginBottom: 6 }}>Search</label>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Highlight matching LMJ rows..."
          style={inputStyle}
        />
      </div>

      <div
        style={{
          background: "#172554",
          borderRadius: 10,
          padding: "1rem",
          minHeight: 180,
        }}
      >
        {selectedCell && parsedSelected ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              Selected Fibre: {selectedCell.globalNo}
            </div>

            <div style={{ marginBottom: 6 }}>Tray: {getTrayNumber(selectedCell.globalNo)}</div>
            <div style={{ marginBottom: 6 }}>Splitter: {parsedSelected.splitter}</div>
            <div style={{ marginBottom: 6 }}>Input Fibre: {parsedSelected.inputFibre}</div>
            <div style={{ marginBottom: 6 }}>
              Splitter ID: {parsedSelected.splitterId || `Splitter ${parsedSelected.splitter}`}
            </div>
            <div style={{ marginBottom: 6 }}>Splitter Output: {parsedSelected.splitterOut}</div>
            <div style={{ marginBottom: 6 }}>Output Fibre: {parsedSelected.outputFibre}</div>
            <div style={{ marginBottom: 6 }}>AG: {parsedSelected.ag}</div>
            <div style={{ marginBottom: 6 }}>AG Fibre: {parsedSelected.agFibre}</div>
            <div>Splitter Group: {parsedSelected.group}</div>
          </>
        ) : (
          <div>Select an LMJ fibre to view its continuity chain.</div>
        )}
      </div>

      <div
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 10,
          padding: "0.75rem",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          Related fibres in selected splitter
        </div>

        {relatedCells.length === 0 ? (
          <div style={{ color: "#cbd5e1" }}>No splitter group selected.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {relatedCells.map((cell) => {
              const parsed = parseLmjLabel(cell.label || "");
              const isSelected = cell.globalNo === selectedFibre;

              return (
                <div
                  key={cell.globalNo}
                  style={{
                    padding: "0.7rem",
                    borderRadius: 8,
                    background: isSelected ? "#1d4ed8" : "#1e293b",
                    border: "1px solid #334155",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Fibre {cell.globalNo}</div>
                  <div style={{ marginTop: 6, color: "#e5e7eb" }}>
                    {parsed.ag || "—"} — {parsed.agFibre || "—"}
                  </div>
                  <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: "0.9rem" }}>
                    {parsed.outputFibre
                      ? `${parsed.inputFibre} → Splitter ${parsed.splitter} → ${parsed.outputFibre}`
                      : "No path"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid #374151",
          borderRadius: 10,
          maxHeight: 420,
          overflowY: "auto",
          padding: "0.5rem",
          background: "#0f172a",
        }}
      >
        {filteredCells.length === 0 ? (
          <div style={{ padding: "1rem", color: "#cbd5e1" }}>
            No labelled LMJ fibres to display.
          </div>
        ) : (
          filteredCells.map((f) => {
            const isHighlighted = highlightedFibres.has(f.globalNo);
            const isSelected = selectedFibre === f.globalNo;
            const parsed = parseLmjLabel(f.label);
            const splitter = getSplitterNumber(f.globalNo);
            const tray = getTrayNumber(f.globalNo);

            return (
              <div
                key={f.globalNo}
                style={{
                  padding: "0.75rem",
                  borderRadius: 8,
                  marginBottom: 8,
                  background: isSelected
                    ? "#1d4ed8"
                    : isHighlighted
                    ? "#334155"
                    : "#172554",
                  border: "1px solid #334155",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  Fibre {f.globalNo} — Tray {tray} — Splitter {splitter}
                </div>
                <div style={{ marginTop: 8, color: "#e5e7eb" }}>
                  {parsed.inputFibre} → Splitter {parsed.splitter} → {parsed.outputFibre}
                </div>
                <div style={{ marginTop: 4, color: "#cbd5e1" }}>
                  {parsed.ag} — {parsed.agFibre}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#1f2937",
  color: "white",
  boxSizing: "border-box",
};