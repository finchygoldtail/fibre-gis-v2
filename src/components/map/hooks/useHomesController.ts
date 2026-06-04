import { useEffect, useState } from "react";
import type { SavedMapAsset } from "../types";
import { loadProjectHomes, saveProjectHomes } from "../projects/projectHomesStorage";

type UseHomesControllerArgs = {
  activeProjectId: string | null;
  visibleHomesLayer: boolean;
  isProjectWorkspaceOpen: boolean;
};

export function useHomesController({
  activeProjectId,
  visibleHomesLayer,
  isProjectWorkspaceOpen,
}: UseHomesControllerArgs) {
  const [projectHomes, setProjectHomes] = useState<SavedMapAsset[]>([]);
  const [loadedHomesProjectId, setLoadedHomesProjectId] = useState<string | null>(null);
  const [isLoadingProjectHomes, setIsLoadingProjectHomes] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const shouldLoadHomesForSelectedProject =
      Boolean(activeProjectId) && (visibleHomesLayer || isProjectWorkspaceOpen);

    if (!shouldLoadHomesForSelectedProject) {
      setProjectHomes([]);
      setLoadedHomesProjectId(null);
      return;
    }

    if (!activeProjectId || loadedHomesProjectId === activeProjectId) return;

    setIsLoadingProjectHomes(true);

    loadProjectHomes(activeProjectId)
      .then((homes) => {
        if (!cancelled) {
          setProjectHomes(homes as SavedMapAsset[]);
          setLoadedHomesProjectId(activeProjectId);
        }
      })
      .catch((err) => {
        console.error("Failed to load saved project homes", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjectHomes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, visibleHomesLayer, isProjectWorkspaceOpen, loadedHomesProjectId]);

  const persistProjectHomes = async (projectId: string, homes: SavedMapAsset[]) => {
    setProjectHomes(homes);
    setLoadedHomesProjectId(projectId);
    await saveProjectHomes(projectId, homes as any[]);
  };

  return {
    projectHomes,
    setProjectHomes,
    loadedHomesProjectId,
    setLoadedHomesProjectId,
    isLoadingProjectHomes,
    persistProjectHomes,
  };
}
