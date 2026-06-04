import React, { useEffect } from "react";

export type MapWorkspaceGuardProps = {
  canOpenWorkspace: boolean;
  isProjectWorkspaceOpen: boolean;
  closeWorkspace: () => void;
  children: React.ReactNode;
};

/**
 * Hard UI guard for ProjectWorkspace rendering.
 * This protects against project switching or stale state accidentally opening workspace
 * for Survey or Maintenance users.
 */
export default function MapWorkspaceGuard({
  canOpenWorkspace,
  isProjectWorkspaceOpen,
  closeWorkspace,
  children,
}: MapWorkspaceGuardProps) {
  useEffect(() => {
    if (isProjectWorkspaceOpen && !canOpenWorkspace) {
      closeWorkspace();
    }
  }, [canOpenWorkspace, closeWorkspace, isProjectWorkspaceOpen]);

  if (!isProjectWorkspaceOpen || !canOpenWorkspace) return null;

  return <>{children}</>;
}
