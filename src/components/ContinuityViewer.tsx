import React, { useMemo, useState } from "react";
import type { FibreCell } from "../logic/jointConfig";

type Props = {
  model: FibreCell[];
  selectedFibre: number | null;
  extraRows?: ContinuityRow[];
};

type ContinuityRow = {
  fibre: number;
  label: string;
  tray: number;
  pos: number;
};

function formatFibreLabel(row: ContinuityRow) {
  return `F${row.fibre}`;
}

export const ContinuityViewer: React.FC<Props> = ({
  model,
  selectedFibre,
  extraRows = [],
}) => {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const labelledModelRows = model
      .filter((f) => f.label.trim())
      .sort((a, b) => a.globalNo - b.globalNo)
      .map((f) => ({
        fibre: f.globalNo,
        label: f.label.trim(),
        tray: f.tray + 1,
        pos: f.pos + 1,
      }));

    const byFibre = new Map<number, ContinuityRow>();
    [...labelledModelRows, ...extraRows].forEach((row) => {
      if (!Number.isFinite(row.fibre) || !row.label.trim()) return;
      byFibre.set(row.fibre, row);
    });

    return Array.from(byFibre.values()).sort((a, b) => a.fibre - b.fibre);
  }, [model, extraRows]);

  const filteredRows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) => {
      return (
        String(r.fibre).includes(term) ||
        r.label.toLowerCase().includes(term) ||
        String(r.tray).includes(term) ||
        String(r.pos).includes(term)
      );
    });
  }, [rows, filter]);

  const selectedRow = useMemo(() => {
    if (selectedFibre == null) return null;
    return rows.find((r) => r.fibre === selectedFibre) ?? null;
  }, [rows, selectedFibre]);

  const highlightedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return new Set<number>();

    const matches = new Set<number>();
    filteredRows.forEach((r) => {
      if (
        String(r.fibre).toLowerCase().includes(term) ||
        r.label.toLowerCase().includes(term)
      ) {
        matches.add(r.fibre);
      }
    });
    return matches;
  }, [filteredRows, search]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
        color: "#f8fafc",
      }}
    >
      <div style={viewerHeader}>
        <div style={kicker}>CONTINUITY INSPECTOR</div>
        <h3 style={title}>Continuity Viewer</h3>
      </div>

      <div style={filterPanel}>
        <div>
          <label style={label}>Filter</label>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by fibre, tray, pos, label..."
            style={inputStyle}
          />
        </div>

        <div>
          <label style={label}>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Highlight matching rows..."
            style={inputStyle}
          />
        </div>
      </div>

      {selectedRow ? (
        <div
          style={{
            background: "#0f1b2d",
            color: "white",
            padding: 12,
            borderRadius: 8,
            border: "1px solid rgba(96, 165, 250, 0.28)",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>Selected Fibre:</strong> {formatFibreLabel(selectedRow)}
          {"\n"}
          <strong>Tray:</strong> {selectedRow.tray}
          {"\n"}
          <strong>Position:</strong> {selectedRow.pos}
          {"\n\n"}
          {selectedRow.label}
        </div>
      ) : (
        <div
          style={{
            background: "rgba(30, 64, 175, 0.22)",
            color: "#d1d5db",
            padding: 12,
            borderRadius: 8,
            border: "1px solid rgba(96, 165, 250, 0.22)",
          }}
        >
          Select a fibre to view its continuity chain.
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid rgba(148, 163, 184, 0.16)",
          borderRadius: 10,
          padding: 8,
          background: "#07111f",
        }}
      >
        {filteredRows.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>No labelled fibres to display.</div>
        ) : (
          filteredRows.map((r) => {
            const isSelected = selectedFibre === r.fibre;
            const isHighlighted = highlightedRows.has(r.fibre);
            const fibreLabel = formatFibreLabel(r);

            return (
              <div
                key={r.fibre}
                style={{
                  padding: "10px 11px",
                  marginBottom: 8,
                  borderRadius: 8,
                  background: isSelected
                    ? "#1e40af"
                    : isHighlighted
                    ? "#374151"
                    : "#0f1b2d",
                  color: "white",
                  border: isSelected ? "1px solid #60a5fa" : "1px solid rgba(148, 163, 184, 0.16)",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {fibreLabel} - Tray {r.tray}, Pos {r.pos}
                </div>
                <div style={{ marginTop: 4, color: "#d1d5db" }}>{r.label}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const viewerHeader: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  background: "#0f1b2d",
  padding: 12,
};

const kicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 20,
  fontWeight: 950,
};

const filterPanel: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "#e5e7eb",
  fontSize: 12,
  fontWeight: 850,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "#020617",
  color: "#f8fafc",
  boxSizing: "border-box",
  outline: "none",
};
