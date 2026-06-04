import { useCallback, useEffect, useRef } from "react";
import { saveMapView } from "../mapViewMemory";

export type ProjectWorkspaceAccess = {
  canOpenProjectWorkspace: boolean;
  onBlockedWorkspaceOpen?: () => void;
};

export function useProjectSelectionGuard({
  activeProjectId,
  setActiveProjectId,
  setIsProjectWorkspaceOpen,
  canOpenProjectWorkspace,
  onBlockedWorkspaceOpen,
}: {
  activeProjectId: string | null;
  setActiveProjectId: (projectId: string | null) => void;
  setIsProjectWorkspaceOpen: (open: boolean) => void;
  canOpenProjectWorkspace: boolean;
  onBlockedWorkspaceOpen?: () => void;
}) {
  const activeProjectIdRef = useRef<string | null>(activeProjectId);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const selectProject = useCallback(
    (projectId: string | null, options?: { openWorkspace?: boolean }) => {
      setActiveProjectId(projectId);

      try {
        saveMapView({ activeProjectId: projectId });
      } catch (err) {
        console.warn("Failed to persist active project selection", err);
      }

      if (options?.openWorkspace) {
        if (canOpenProjectWorkspace) {
          setIsProjectWorkspaceOpen(true);
        } else {
          setIsProjectWorkspaceOpen(false);
          onBlockedWorkspaceOpen?.();
        }
      }
    },
    [canOpenProjectWorkspace, onBlockedWorkspaceOpen, setActiveProjectId, setIsProjectWorkspaceOpen],
  );

  const openWorkspace = useCallback(() => {
    if (!canOpenProjectWorkspace) {
      setIsProjectWorkspaceOpen(false);
      onBlockedWorkspaceOpen?.();
      return false;
    }

    setIsProjectWorkspaceOpen(true);
    return true;
  }, [canOpenProjectWorkspace, onBlockedWorkspaceOpen, setIsProjectWorkspaceOpen]);

  const closeWorkspace = useCallback(() => {
    setIsProjectWorkspaceOpen(false);
  }, [setIsProjectWorkspaceOpen]);

  useEffect(() => {
    if (!canOpenProjectWorkspace) {
      setIsProjectWorkspaceOpen(false);
    }
  }, [canOpenProjectWorkspace, setIsProjectWorkspaceOpen]);

  return {
    activeProjectIdRef,
    selectProject,
    openWorkspace,
    closeWorkspace,
  };
}
