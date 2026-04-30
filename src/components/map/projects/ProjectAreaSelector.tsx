import React, { useState } from "react";
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
  const [open, setOpen] = useState(false);

  const activeProject = projectAreas.find((p) => p.id === activeProjectId);

  return (
    <div
      style={{
        position: "absolute",
        top: 70,
        left: 16,
        zIndex: 1200,
        background: "#111827",
        color: "white",
        borderRadius: 8,
        padding: 10,
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        minWidth: 220,
      }}
    >
      <button onClick={() => setOpen((v) => !v)}>
        {activeProject ? activeProject.name : "Projects"}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <button onClick={onClearProject}>Show All</button>

          {projectAreas.map((project) => (
            <button
              key={project.id}
              onClick={() => {
                onSelectProject(project.id);
                setOpen(false);
              }}
              style={{ display: "block", marginTop: 6 }}
            >
              {project.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}