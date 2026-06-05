import { useMemo } from "react";
import type { AppMode } from "../../../context/AppModeContext";

type RolePermissions = {
  build?: boolean;
  survey?: boolean;
  maintenance?: boolean;
};

export type RoleMobileMode = "survey" | "maintenance" | "build" | "none";

export function useRoleMobileMode(args: {
  isMobile: boolean;
  activeMode: AppMode;
  permissions: RolePermissions;
  isSuperUser?: boolean;
}): RoleMobileMode {
  const { isMobile, activeMode, permissions, isSuperUser } = args;

  return useMemo(() => {
    if (!isMobile) return "none";

    // Build/super users keep the normal desktop-style controls for now.
    // The full Project Workspace is still better on tablet/desktop.
    if (isSuperUser || permissions.build || activeMode === "build") return "build";

    if (permissions.maintenance || activeMode === "maintenance") return "maintenance";
    if (permissions.survey || activeMode === "survey") return "survey";

    return "none";
  }, [activeMode, isMobile, isSuperUser, permissions.build, permissions.maintenance, permissions.survey]);
}
