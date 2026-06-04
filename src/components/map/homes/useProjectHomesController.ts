import { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";
import { loadProjectHomes } from "../projects/projectHomesStorage";

type UseProjectHomesControllerArgs = {
  activeProjectId: string | null;
  visibleHomesLayer: boolean;
  isProjectWorkspaceOpen: boolean;
  normalizeHomeAsset: (asset: SavedMapAsset) => SavedMapAsset;
};

type UseProjectHomesControllerResult = {
  projectHomes: SavedMapAsset[];
  setProjectHomes: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  normalizedProjectHomes: SavedMapAsset[];
  isLoadingProjectHomes: boolean;
  loadedHomesProjectId: string | null;
};

export function useProjectHomesController({
  activeProjectId,
  visibleHomesLayer,
  isProjectWorkspaceOpen,
  normalizeHomeAsset,
}: UseProjectHomesControllerArgs): UseProjectHomesControllerResult {
  const [isLoadingProjectHomes, setIsLoadingProjectHomes] = useState(false);
  const [projectHomes, setProjectHomes] = useState<SavedMapAsset[]>([]);
  const [loadedHomesProjectId, setLoadedHomesProjectId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchProjectHomes = async () => {
      // PERFORMANCE GUARD:
      // Never auto-load project homes on the global map.
      // Global map must stay a lightweight network overview; homes are loaded
      // only inside the selected Project Workspace or by an explicit import/load action.
      const shouldLoadHomesForSelectedProject =
        Boolean(activeProjectId) && (visibleHomesLayer || isProjectWorkspaceOpen);

      if (!shouldLoadHomesForSelectedProject) {
        setProjectHomes([]);
        setLoadedHomesProjectId(null);
        return;
      }

      if (loadedHomesProjectId === activeProjectId) return;

      setIsLoadingProjectHomes(true);
      try {
        const homes = await loadProjectHomes(activeProjectId);
        if (!cancelled) {
          setProjectHomes(homes);
          setLoadedHomesProjectId(activeProjectId);
        }
      } catch (err) {
        console.error("Failed to load saved project homes", err);
      } finally {
        if (!cancelled) setIsLoadingProjectHomes(false);
      }
    };

    void fetchProjectHomes();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, isProjectWorkspaceOpen, visibleHomesLayer, loadedHomesProjectId]);

  const normalizedProjectHomes = useMemo(
    () => (projectHomes ?? []).map((home) => normalizeHomeAsset(home)),
    [projectHomes, normalizeHomeAsset],
  );

  return {
    projectHomes,
    setProjectHomes,
    normalizedProjectHomes,
    isLoadingProjectHomes,
    loadedHomesProjectId,
  };
}
