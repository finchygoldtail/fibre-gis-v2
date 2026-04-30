import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";

type Props = {
  projectAreas: SavedMapAsset[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onClearProject: () => void;
};

export default function ProjectAreaSelector({
  projectAreas,
  activeProjectId,
  onSelectProject,
  onClearProject,
}: Props) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);

  const activeProject = projectAreas.find((p) => p.id === activeProjectId);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return projectAreas.slice(0, 8);

    return projectAreas
      .filter((project) =>
        String(project.name || "").toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [projectAreas, search]);

  const showResults = focused || search.length > 0;

  return (
    <div style={{ position: "relative", minWidth: 260, flex: 1 }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={activeProject ? activeProject.name : "Find project area..."}
        style={{
          width: "100%",
          padding: "0.65rem 2.2rem 0.65rem 0.75rem",
          borderRadius: 8,
          border: focused ? "1px solid #2563eb" : "1px solid #374151",
          background: "#111827",
          color: "white",
          outline: "none",
          boxSizing: "border-box",
          fontSize: "0.95rem",
        }}
      />

      {activeProjectId && (
        <button
          onClick={() => {
            onClearProject();
            setSearch("");
          }}
          title="Clear project"
          style={{
            position: "absolute",
            right: 8,
            top: 7,
            background: "transparent",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          ×
        </button>
      )}

      {showResults && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: 44,
            left: 0,
            right: 0,
            zIndex: 3000,
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}
        >
          <button
            onClick={() => {
              onClearProject();
              setSearch("");
              setFocused(false);
            }}
            style={rowButton}
          >
            Show All
          </button>

          {filteredProjects.length === 0 ? (
            <div style={{ padding: 8, color: "#9ca3af" }}>
              No project found
            </div>
          ) : (
            filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  onSelectProject(project.id);
                  setSearch("");
                  setFocused(false);
                }}
                style={{
                  ...rowButton,
                  background:
                    project.id === activeProjectId ? "#1f2937" : "transparent",
                }}
              >
                {project.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const rowButton: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.5rem",
  background: "transparent",
  color: "white",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 6,
};