import React, { createContext, useContext, useMemo, useState } from "react";

export type AppMode = "survey" | "build" | "maintenance";

type AppModeContextValue = {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;
  requiresAuditReason: boolean;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [activeMode, setActiveMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem("fibre-gis-app-mode");
    if (saved === "survey" || saved === "build" || saved === "maintenance") {
      return saved;
    }
    return "survey";
  });

  const updateMode = (mode: AppMode) => {
    setActiveMode(mode);
    localStorage.setItem("fibre-gis-app-mode", mode);
  };

  const value = useMemo(
    () => ({
      activeMode,
      setActiveMode: updateMode,
      requiresAuditReason: activeMode === "maintenance",
    }),
    [activeMode]
  );

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used inside AppModeProvider");
  }
  return ctx;
}