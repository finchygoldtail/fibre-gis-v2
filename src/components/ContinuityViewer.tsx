import React, { useMemo, useState } from "react";
import type { FibreCell } from "../logic/jointConfig";

type Props = {
  model: FibreCell[];
  selectedFibre: number | null;
};

export const ContinuityViewer: React.FC<Props> = ({
  model,
  selectedFibre,
}) => {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    return model
      .filter((f) => f.label.trim())
      .sort((a, b) => a.globalNo - b.globalNo)
      .map((f) => ({
        fibre: f.globalNo,
        label: f.label.trim(),
        tray: f.tray + 1,
        pos: f.pos + 1,
      }));
  }, [model]);

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
        gap: "0.75rem",
        height: "100%",
      }}
    >
      <h3 style={{ margin: 0 }}>Continuity Viewer</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4 }}>Filter</label>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by fibre, tray, pos, label..."
            style={{ width: "100%", padding: "0.4rem" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4 }}>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Highlight matching rows..."
            style={{ width: "100%", padding: "0.4rem" }}
          />
        </div>
      </div>

      {selectedRow ? (
        <div
          style={{
            background: "#1f2937",
            color: "white",
            padding: "0.75rem",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>Selected Fibre:</strong> {selectedRow.fibre}
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
            background: "#1f2937",
            color: "#d1d5db",
            padding: "0.75rem",
            borderRadius: 6,
          }}
        >
          Select a fibre to view its continuity chain.
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #444",
          borderRadius: 6,
          padding: "0.5rem",
          background: "#111827",
        }}
      >
        {filteredRows.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>No labelled fibres to display.</div>
        ) : (
          filteredRows.map((r) => {
            const isSelected = selectedFibre === r.fibre;
            const isHighlighted = highlightedRows.has(r.fibre);

            return (
              <div
                key={r.fibre}
                style={{
                  padding: "0.65rem",
                  marginBottom: "0.5rem",
                  borderRadius: 6,
                  background: isSelected
                    ? "#1d4ed8"
                    : isHighlighted
                    ? "#374151"
                    : "#1f2937",
                  color: "white",
                  border: "1px solid #374151",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  Fibre {r.fibre} — Tray {r.tray}, Pos {r.pos}
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