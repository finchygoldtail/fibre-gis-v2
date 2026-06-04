/**
 * Centralises the rule that prevents loading the entire UK / all project homes
 * on the global map.
 */
export function shouldLoadHomesForProject({
  activeProjectId,
  homesLayerVisible,
  isProjectWorkspaceOpen,
}: {
  activeProjectId: string | null | undefined;
  homesLayerVisible: boolean;
  isProjectWorkspaceOpen: boolean;
}) {
  return Boolean(activeProjectId) && (homesLayerVisible || isProjectWorkspaceOpen);
}
