import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  isDarkMode: boolean;
};

const THEME_STORAGE_KEY = "alistra-gis-theme-mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      setThemeMode: setThemeModeState,
      toggleThemeMode: () =>
        setThemeModeState((current) => (current === "dark" ? "light" : "dark")),
      isDarkMode: themeMode === "dark",
    }),
    [themeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used inside ThemeProvider");
  }
  return context;
}
