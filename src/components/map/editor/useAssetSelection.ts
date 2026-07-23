import { useCallback } from "react";
import type React from "react";
import type { LatLngLiteral } from "leaflet";
import {
  createAssetActivityLog,
  withAssetViewedMetadata,
} from "../../../services/assetActivityService";
import type {
  AssetType,
  AreaWorkType,
  CableType,
  DistributionPointDetails,
  DuctUse,
  FibreCount,
  HomeServiceStatus,
  InstallMethod,
  PoleDetails,
  SavedMapAsset,
  PermitDetails,
} from "../types";
import type { ChamberDetails } from "../modals/ChamberDetailsModal";
import { getDpOperationalStatus } from "./assetEditCoordinator";
import { DEFAULT_DISTRIBUTION_CLOSURE_TYPE } from "../../../services/assetNameValidation";

type AreaLevel = "L0" | "L1" | "L2" | "L3";
type MapMode =
  | "pick"
  | "measure"
  | "draw-cable"
  | "draw-area"
  | "drive-to-location"
  | "move-homes"
  | "survey-delete-homes";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

function normaliseAreaLevel(value: unknown): AreaLevel {
  const level = String(value || "L0").toUpperCase();

  if (level === "L1" || level === "L2" || level === "L3") {
    return level;
  }

  return "L0";
}

function normaliseAreaWorkType(value: unknown): AreaWorkType {
  const clean = String(value || "").trim().toLowerCase();
  return clean === "data-centre" || clean === "data center" || clean === "backhaul"
    ? "data-centre"
    : "pia";
}

type UseAssetSelectionArgs = {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  setSavedJoints: Setter<SavedMapAsset[]>;
  setEditingAssetId: Setter<string | null>;
  setAssetType: Setter<AssetType>;
  setJointName: Setter<string>;
  setJointType: Setter<string>;
  setNotes: Setter<string>;
  setCablePiaNoiNumber: Setter<string>;
  setAreaLevel: Setter<AreaLevel>;
  setAreaWorkType: Setter<AreaWorkType>;
  setPermitDetails: Setter<PermitDetails>;
  setCableType: Setter<CableType>;
  setFibreCount: Setter<FibreCount>;
  setInstallMethod: Setter<InstallMethod>;
  setDuctCount: Setter<number>;
  setDuctDiameterMm: Setter<number>;
  setDuctUse: Setter<DuctUse>;
  setParentCableId: Setter<string | undefined>;
  setAllocatedInputFibres: Setter<number[]>;
  setPoleDetails: Setter<PoleDetails>;
  setDpDetails: Setter<DistributionPointDetails>;
  setChamberDetails: Setter<ChamberDetails>;
  setHomeServiceStatus: Setter<HomeServiceStatus>;
  setHomeBlockedReason: Setter<string>;
  setHomeServiceNote: Setter<string>;
  setHomeRecommendedDpId: Setter<string>;
  setIsPanelOpen: Setter<boolean>;
  setPickedLocation: Setter<LatLngLiteral | null>;
  setDraftCablePoints: Setter<LatLngLiteral[]>;
  setDraftCableSegmentMethods: Setter<any[]>;
  setDraftAreaPoints: Setter<LatLngLiteral[]>;
  setMapMode: Setter<MapMode>;
  setShowPoleModal: Setter<boolean>;
  setShowDpModal: Setter<boolean>;
  setShowChamberModal: Setter<boolean>;
  setShowCableModal: Setter<boolean>;
};

export function useAssetSelection({
  activeProjectIdRef,
  setSavedJoints,
  setEditingAssetId,
  setAssetType,
  setJointName,
  setJointType,
  setNotes,
  setCablePiaNoiNumber,
  setAreaLevel,
  setAreaWorkType,
  setPermitDetails,
  setCableType,
  setFibreCount,
  setInstallMethod,
  setDuctCount,
  setDuctDiameterMm,
  setDuctUse,
  setParentCableId,
  setAllocatedInputFibres,
  setPoleDetails,
  setDpDetails,
  setChamberDetails,
  setHomeServiceStatus,
  setHomeBlockedReason,
  setHomeServiceNote,
  setHomeRecommendedDpId,
  setIsPanelOpen,
  setPickedLocation,
  setDraftCablePoints,
  setDraftCableSegmentMethods,
  setDraftAreaPoints,
  setMapMode,
  setShowPoleModal,
  setShowDpModal,
  setShowChamberModal,
  setShowCableModal,
}: UseAssetSelectionArgs) {
  const handleEditAsset = useCallback(
    (asset: SavedMapAsset) => {
      const viewedAsset = withAssetViewedMetadata(asset, "map-edit-panel");

      setSavedJoints((prev) =>
        (prev ?? []).map((item) =>
          item.id === viewedAsset.id ? viewedAsset : item,
        ),
      );

      void createAssetActivityLog({
        projectId: activeProjectIdRef.current,
        asset: viewedAsset,
        action: "viewed",
        reason: "Asset opened",
        context: "map-edit-panel",
      });

      setEditingAssetId(viewedAsset.id);
      setAssetType(viewedAsset.assetType || "ag-joint");
      setJointName(viewedAsset.name || "");
      setJointType(viewedAsset.jointType || "");
      setNotes(viewedAsset.notes || "");
      setCablePiaNoiNumber((viewedAsset as any).piaNoiNumber || "");
      setAreaLevel(normaliseAreaLevel((viewedAsset as any).areaLevel));
      setAreaWorkType(
        normaliseAreaWorkType(
          (viewedAsset as any).areaWorkType ||
            (viewedAsset as any).properties?.areaWorkType,
        ),
      );
      setPermitDetails({
        status: "draft",
        source: "street-manager",
        ...((viewedAsset as any).permitDetails ||
          (viewedAsset as any).properties?.permitDetails ||
          {}),
      });
      setCableType(viewedAsset.cableType || "Feeder Cable");
      setFibreCount(viewedAsset.fibreCount || "12F");
      setInstallMethod(viewedAsset.installMethod || "Underground");
      setDuctCount(Number((viewedAsset as any).ductCount || 4));
      setDuctDiameterMm(Number((viewedAsset as any).ductDiameterMm || 96));
      setDuctUse(((viewedAsset as any).ductUse || "Main route") as DuctUse);
      setParentCableId((viewedAsset as any).parentCableId);
      setAllocatedInputFibres(
        ((viewedAsset as any).allocatedInputFibres || []) as number[],
      );
      setPoleDetails(viewedAsset.poleDetails || {});
      setDpDetails({
        ...(viewedAsset.dpDetails ||
          (viewedAsset as any).properties?.dpDetails || {
            powerReadings: ["", "", "", ""],
            closureType: DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
            connectionsToHomes: 8,
          }),
        buildStatus: getDpOperationalStatus(viewedAsset),
      } as DistributionPointDetails);
      setChamberDetails(viewedAsset.chamberDetails || {});
      setHomeServiceStatus(viewedAsset.serviceStatus || "serviceable");
      setHomeBlockedReason(String((viewedAsset as any).blockedReason || ""));
      setHomeServiceNote(String((viewedAsset as any).serviceNote || ""));
      setHomeRecommendedDpId(String((viewedAsset as any).recommendedDpId || ""));

      // Any Edit Details action should bring the left details panel back into view.
      setIsPanelOpen(true);

      if (asset.geometry?.type === "Point") {
        const [lat, lng] = asset.geometry.coordinates;
        setPickedLocation({ lat, lng });
        setDraftCablePoints([]);
        setDraftCableSegmentMethods([]);
        setMapMode("pick");

        setShowPoleModal(false);
        setShowDpModal(false);
        setShowChamberModal(false);
        setShowCableModal(false);
      } else if (asset.geometry?.type === "Polygon") {
        setPickedLocation(null);
        setDraftCablePoints([]);
        setDraftCableSegmentMethods([]);
        setDraftAreaPoints(
          (asset.geometry.coordinates[0] || []).map(([lat, lng]) => ({
            lat,
            lng,
          })),
        );
        setMapMode("draw-area");
        setShowCableModal(false);
      } else if (asset.geometry?.type === "LineString") {
        setPickedLocation(null);
        setDraftAreaPoints([]);

        // Edit details should only open the side-panel fields.
        // Route handles are controlled by CableLinesLayer's "Edit route" button.
        // Keeping this empty prevents every stored route vertex rendering as a marker.
        setDraftCablePoints([]);
        setDraftCableSegmentMethods([]);
        setMapMode("pick");
        setShowCableModal(false);
      }
    },
    [
      activeProjectIdRef,
      setAllocatedInputFibres,
      setAreaLevel,
      setAreaWorkType,
      setPermitDetails,
      setAssetType,
      setCablePiaNoiNumber,
      setCableType,
      setChamberDetails,
      setDpDetails,
      setDraftAreaPoints,
      setDraftCablePoints,
      setDraftCableSegmentMethods,
      setEditingAssetId,
      setFibreCount,
      setInstallMethod,
      setDuctCount,
      setDuctDiameterMm,
      setDuctUse,
      setIsPanelOpen,
      setJointName,
      setJointType,
      setMapMode,
      setNotes,
      setParentCableId,
      setPickedLocation,
      setPoleDetails,
      setHomeBlockedReason,
      setHomeRecommendedDpId,
      setHomeServiceNote,
      setHomeServiceStatus,
      setSavedJoints,
      setShowCableModal,
      setShowChamberModal,
      setShowDpModal,
      setShowPoleModal,
    ],
  );

  return { handleEditAsset };
}
