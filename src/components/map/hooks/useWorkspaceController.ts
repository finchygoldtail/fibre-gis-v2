import { useCallback, useMemo, useRef, useState } from "react";
import type { SavedMapAsset } from "../types";
import { filterAssetsForProjectArea } from "../projects/projectAssetFilter";
import type { WorkspaceControllerState } from "../workspace/workspaceTypes";

type UseWorkspaceControllerArgs = {
  savedJoints: SavedMapAsset[];
  projectHomes: SavedMapAsset[];
  canManageNetworkDesign: boolean;
  initialProjectId?: string | null;
};

export function useWorkspaceController({
  savedJoints,
  projectHomes,
  canManageNetworkDesign,
  initialProjectId = null,
}: UseWorkspaceControllerArgs): WorkspaceControllerState {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const activeProjectIdRef = useRef<string | null>(initialProjectId);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);

  const selectProject = useCallback(
    (projectId: string | null, options?: { openWorkspace?: boolean }) => {
      setActiveProjectId(projectId);
      activeProjectIdRef.current = projectId;

      const shouldOpen = Boolean(options?.openWorkspace);

      if (shouldOpen && canManageNetworkDesign) {
        setIsWorkspaceOpen(true);
      } else {
        setIsWorkspaceOpen(false);
      }
    },
    [canManageNetworkDesign],
  );

  const openWorkspace = useCallback(
    (projectId?: string | null) => {
      if (!canManageNetworkDesign) {
        setIsWorkspaceOpen(false);
        return;
      }

      if (typeof projectId !== "undefined") {
        setActiveProjectId(projectId);
        activeProjectIdRef.current = projectId;
      }

      setIsWorkspaceLoading(true);
      window.setTimeout(() => {
        setIsWorkspaceOpen(true);
        setIsWorkspaceLoading(false);
      }, 0);
    },
    [canManageNetworkDesign],
  );

  const closeWorkspace = useCallback(() => {
    setIsWorkspaceOpen(false);
    setIsWorkspaceLoading(false);
  }, []);

  const visibleProjectAssets = useMemo(() => {
    if (!activeProjectId) return [];

    return filterAssetsForProjectArea(savedJoints, activeProjectId);
  }, [savedJoints, activeProjectId]);

  const mergedVisibleProjectAssets = useMemo(() => {
    if (!activeProjectId) return visibleProjectAssets;

    const homesForProject = projectHomes.filter((home: any) => {
      const projectId = String(
        home.projectId || home.activeProjectId || home.properties?.projectId || "",
      );
      return !projectId || projectId === activeProjectId;
    });

    return [...visibleProjectAssets, ...homesForProject];
  }, [activeProjectId, projectHomes, visibleProjectAssets]);

  return {
    activeProjectId,
    isWorkspaceOpen: isWorkspaceOpen && canManageNetworkDesign,
    isWorkspaceLoading,
    visibleProjectAssets: mergedVisibleProjectAssets,
    canOpenWorkspace: canManageNetworkDesign,
    openWorkspace,
    closeWorkspace,
    selectProject,
  };
}
