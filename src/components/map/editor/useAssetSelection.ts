import { useCallback } from "react";
import type React from "react";
import type { LatLngLiteral } from "leaflet";
import {
  createAssetActivityLog,
  withAssetViewedMetadata,
} from "../../../services/assetActivityService";
import type {
  AssetType,
  CableType,
  DistributionPointDetails,
  FibreCount,
  InstallMethod,
  PoleDetails,
  SavedMapAsset,
} from "../types";
import type { ChamberDetails } from "../modals/ChamberDetailsModal";

type AreaLevel = "L0" | "L1" | "L2" | "L3";
type MapMode = "pick" | "measure" | "draw-cable" | "draw-area" | "move-homes" | "survey-delete-homes";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

function normaliseAreaLevel(value: unknown): AreaLevel {
  const level = String(value || "L0").toUpperCase();

  if (level === "L1" || level === "L2" || level === "L3") {
    return level;
  }

  return "L0";
}

function normaliseDpOperationalStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Planned";

  const lower = raw.toLowerCase();
  if (lower === "live") return "Live";
  if (lower === "bwip") return "BWIP";
  if (lower === "unserviceable") return "Unserviceable";
  if (lower === "live not ready for service" || lower === "lnrfs") {
    return "Live not ready for service";
  }
  if (lower === "planned") return "Planned";
  return raw;
}

function getDpOperationalStatus(asset: any, fallback: string = "Planned"): string {
  return normaliseDpOperationalStatus(
    asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      fallback,
  );
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
  setCableType: Setter<CableType>;
  setFibreCount: Setter<FibreCount>;
  setInstallMethod: Setter<InstallMethod>;
  setParentCableId: Setter<string | undefined>;
  setAllocatedInputFibres: Setter<number[]>;
  setPoleDetails: Setter<PoleDetails>;
  setDpDetails: Setter<DistributionPointDetails>;
  setChamberDetails: Setter<ChamberDetails>;
  setIsPanelOpen: Setter<boolean>;
  setPickedLocation: Setter<LatLngLiteral | null>;
  setDraftCablePoints: Setter<LatLngLiteral[]>;
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
  setCableType,
  setFibreCount,
  setInstallMethod,
  setParentCableId,
  setAllocatedInputFibres,
  setPoleDetails,
  setDpDetails,
  setChamberDetails,
  setIsPanelOpen,
  setPickedLocation,
  setDraftCablePoints,
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
      setCableType(viewedAsset.cableType || "Feeder Cable");
      setFibreCount(viewedAsset.fibreCount || "12F");
      setInstallMethod(viewedAsset.installMethod || "Underground");
      setParentCableId((viewedAsset as any).parentCableId);
      setAllocatedInputFibres(
        ((viewedAsset as any).allocatedInputFibres || []) as number[],
      );
      setPoleDetails(viewedAsset.poleDetails || {});
      setDpDetails({
        ...(viewedAsset.dpDetails ||
          (viewedAsset as any).properties?.dpDetails || {
            powerReadings: ["", "", "", ""],
            closureType: "CBT",
            connectionsToHomes: 8,
          }),
        buildStatus: getDpOperationalStatus(viewedAsset),
      } as DistributionPointDetails);
      setChamberDetails(viewedAsset.chamberDetails || {});

      // Any Edit Details action should bring the left details panel back into view.
      setIsPanelOpen(true);

      if (asset.geometry?.type === "Point") {
        const [lat, lng] = asset.geometry.coordinates;
        setPickedLocation({ lat, lng });
        setDraftCablePoints([]);
        setMapMode("pick");

        setShowPoleModal(false);
        setShowDpModal(false);
        setShowChamberModal(false);
        setShowCableModal(false);
      } else if (asset.geometry?.type === "Polygon") {
        setPickedLocation(null);
        setDraftCablePoints([]);
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
        setMapMode("pick");
        setShowCableModal(false);
      }
    },
    [
      activeProjectIdRef,
      setAllocatedInputFibres,
      setAreaLevel,
      setAssetType,
      setCablePiaNoiNumber,
      setCableType,
      setChamberDetails,
      setDpDetails,
      setDraftAreaPoints,
      setDraftCablePoints,
      setEditingAssetId,
      setFibreCount,
      setInstallMethod,
      setIsPanelOpen,
      setJointName,
      setJointType,
      setMapMode,
      setNotes,
      setParentCableId,
      setPickedLocation,
      setPoleDetails,
      setSavedJoints,
      setShowCableModal,
      setShowChamberModal,
      setShowDpModal,
      setShowPoleModal,
    ],
  );

  return { handleEditAsset };
}
