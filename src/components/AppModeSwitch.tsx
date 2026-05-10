import React from "react";
import type { AppMode } from "../context/AppModeContext";
import { useAppMode } from "../context/AppModeContext";
import { useUserRole } from "../context/UserRoleContext";

const modes: { key: AppMode; label: string }[] = [
  { key: "survey", label: "Survey" },
  { key: "build", label: "Build" },
  { key: "maintenance", label: "Maintenance" },
];

export default function AppModeSwitch() {
  const { activeMode, setActiveMode } = useAppMode();
  const { permissions } = useUserRole();

  const visibleModes = modes.filter((mode) => permissions[mode.key]);

  React.useEffect(() => {
    if (!permissions[activeMode]) {
      const fallback = visibleModes[0]?.key ?? "survey";
      setActiveMode(fallback);
    }
  }, [activeMode, permissions, setActiveMode, visibleModes]);

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 999,
        padding: 4,
        boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
      }}
    >
      {visibleModes.map((mode) => {
        const active = activeMode === mode.key;

        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => setActiveMode(mode.key)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 800,
              background: active ? "#2563eb" : "transparent",
              color: active ? "white" : "#d1d5db",
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
