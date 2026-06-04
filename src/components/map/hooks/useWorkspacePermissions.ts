import { useMemo } from "react";
import { useUserRole } from "../../../context/UserRoleContext";

/**
 * Central role gate for the main map.
 *
 * Keep this as the single place that decides who can open project workspace,
 * delete OR/PIA overlays, use survey tools, and edit map assets.
 */
export function useWorkspacePermissions() {
  const { permissions, isSuperUser } = useUserRole();

  return useMemo(() => {
    const canManageNetworkDesign = isSuperUser || permissions.build;
    const canUseSurveyTools = canManageNetworkDesign || permissions.survey;
    const canUseAssetEditor = canManageNetworkDesign || permissions.survey;
    const canUseHomeReassignment = canManageNetworkDesign || permissions.survey;
    const canDeleteHomes = canManageNetworkDesign || permissions.survey;
    const canOpenProjectWorkspace = canManageNetworkDesign;
    const canDeleteOpenreachOverlay = canManageNetworkDesign;
    const canImportExportMap = canManageNetworkDesign;
    const canUseMaintenance = permissions.maintenance;

    return {
      permissions,
      isSuperUser,
      canManageNetworkDesign,
      canUseSurveyTools,
      canUseAssetEditor,
      canUseHomeReassignment,
      canDeleteHomes,
      canOpenProjectWorkspace,
      canDeleteOpenreachOverlay,
      canImportExportMap,
      canUseMaintenance,
    };
  }, [permissions, isSuperUser]);
}
