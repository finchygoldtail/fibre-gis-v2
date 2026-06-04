import { useCallback, useEffect } from "react";

/**
 * Hard safety guard for Project Workspace.
 *
 * This stops workspace opening from hidden routes, project switching, stale state,
 * or old button handlers. It is deliberately small so it can be reused anywhere
 * the project workspace gets opened.
 */
export function useProjectWorkspaceGuard({
  canOpenProjectWorkspace,
  hasActiveProjectArea,
  setIsProjectWorkspaceOpen,
  setIsProjectWorkspaceLoading,
}: {
  canOpenProjectWorkspace: boolean;
  hasActiveProjectArea: boolean;
  setIsProjectWorkspaceOpen: (value: boolean) => void;
  setIsProjectWorkspaceLoading?: (value: boolean) => void;
}) {
  const closeWorkspace = useCallback(() => {
    setIsProjectWorkspaceOpen(false);
    setIsProjectWorkspaceLoading?.(false);
  }, [setIsProjectWorkspaceOpen, setIsProjectWorkspaceLoading]);

  const openWorkspaceIfAllowed = useCallback(() => {
    if (!canOpenProjectWorkspace || !hasActiveProjectArea) {
      closeWorkspace();
      return false;
    }

    setIsProjectWorkspaceOpen(true);
    return true;
  }, [canOpenProjectWorkspace, hasActiveProjectArea, closeWorkspace, setIsProjectWorkspaceOpen]);

  useEffect(() => {
    if (!canOpenProjectWorkspace) {
      closeWorkspace();
    }
  }, [canOpenProjectWorkspace, closeWorkspace]);

  return {
    closeWorkspace,
    openWorkspaceIfAllowed,
    canRenderProjectWorkspace: canOpenProjectWorkspace && hasActiveProjectArea,
  };
}
