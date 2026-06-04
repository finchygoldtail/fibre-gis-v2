export type MapInteractionPermissionInput = {
  canManageNetworkDesign: boolean;
  canUseSurveyTools: boolean;
  isMaintenanceUser?: boolean;
};

export function useMapInteractionPermissions({
  canManageNetworkDesign,
  canUseSurveyTools,
  isMaintenanceUser,
}: MapInteractionPermissionInput) {
  return {
    canDrawCable: canManageNetworkDesign,
    canDrawArea: canManageNetworkDesign,
    canMeasure: true,
    canMoveHomes: canUseSurveyTools && !isMaintenanceUser,
    canDeleteHomes: canUseSurveyTools && !isMaintenanceUser,
    canEditAssets: canUseSurveyTools && !isMaintenanceUser,
  };
}
