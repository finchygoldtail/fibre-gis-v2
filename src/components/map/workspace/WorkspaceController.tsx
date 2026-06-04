import React from "react";
import ProjectWorkspace from "../../Project/ProjectWorkspace";
import type { SavedMapAsset } from "../types";
import type { WorkspaceControllerState } from "./workspaceTypes";

type Props = {
  workspace: WorkspaceControllerState;
  allAssets: SavedMapAsset[];
  projectHomes: SavedMapAsset[];
  onOpenJoint?: (joint: SavedMapAsset) => void;
  onBackToMap?: () => void;
};

export default function WorkspaceController({
  workspace,
  allAssets,
  projectHomes,
  onOpenJoint,
  onBackToMap,
}: Props) {
  if (!workspace.isWorkspaceOpen || !workspace.canOpenWorkspace) return null;
  if (!workspace.activeProjectId) return null;

  return (
    <ProjectWorkspace
      activeProjectId={workspace.activeProjectId}
      allMapAssets={allAssets}
      visibleProjectAssets={workspace.visibleProjectAssets}
      projectHomes={projectHomes}
      onBackToMap={onBackToMap || workspace.closeWorkspace}
      onClose={onBackToMap || workspace.closeWorkspace}
      onOpenJoint={onOpenJoint}
    />
  );
}
