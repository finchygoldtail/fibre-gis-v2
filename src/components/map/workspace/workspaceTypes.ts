import type { SavedMapAsset } from "../types";

export type WorkspaceControllerState = {
  activeProjectId: string | null;
  isWorkspaceOpen: boolean;
  isWorkspaceLoading: boolean;
  visibleProjectAssets: SavedMapAsset[];
  canOpenWorkspace: boolean;
  openWorkspace: (projectId?: string | null) => void;
  closeWorkspace: () => void;
  selectProject: (projectId: string | null, options?: { openWorkspace?: boolean }) => void;
};
