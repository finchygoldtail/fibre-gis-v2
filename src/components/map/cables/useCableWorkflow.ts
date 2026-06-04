import type React from "react";
import type { LatLngLiteral } from "leaflet";
import { getNextAssetName } from "../../../utils/mapAssetNames";
import { snapPointToAssets } from "../utils/snapToAssets";
import type {
  AssetType,
  CableType,
  FibreCount,
  InstallMethod,
  SavedMapAsset,
} from "../types";

type MapMode = "pick" | "measure" | "draw-cable" | "draw-area" | "move-homes" | "survey-delete-homes";

type UseCableWorkflowArgs = {
  jointName: string;
  savedJoints: SavedMapAsset[];
  snapCandidateAssets: SavedMapAsset[];
  snapEnabled: boolean;
  setEditingAssetId: React.Dispatch<React.SetStateAction<string | null>>;
  setAssetType: React.Dispatch<React.SetStateAction<AssetType>>;
  setJointType: React.Dispatch<React.SetStateAction<string>>;
  setJointName: React.Dispatch<React.SetStateAction<string>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  setCablePiaNoiNumber: React.Dispatch<React.SetStateAction<string>>;
  setCableType: React.Dispatch<React.SetStateAction<CableType>>;
  setFibreCount: React.Dispatch<React.SetStateAction<FibreCount>>;
  setInstallMethod: React.Dispatch<React.SetStateAction<InstallMethod>>;
  setParentCableId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAllocatedInputFibres: React.Dispatch<React.SetStateAction<number[]>>;
  setPickedLocation: React.Dispatch<React.SetStateAction<LatLngLiteral | null>>;
  setDraftAreaPoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  setDraftCablePoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  setSelectedReferenceDuctId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedReferenceDuctName: React.Dispatch<React.SetStateAction<string>>;
  setMapMode: React.Dispatch<React.SetStateAction<MapMode>>;
  setShowCableModal: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useCableWorkflow({
  jointName,
  savedJoints,
  snapCandidateAssets,
  snapEnabled,
  setEditingAssetId,
  setAssetType,
  setJointType,
  setJointName,
  setNotes,
  setCablePiaNoiNumber,
  setCableType,
  setFibreCount,
  setInstallMethod,
  setParentCableId,
  setAllocatedInputFibres,
  setPickedLocation,
  setDraftAreaPoints,
  setDraftCablePoints,
  setSelectedReferenceDuctId,
  setSelectedReferenceDuctName,
  setMapMode,
  setShowCableModal,
  setIsPanelOpen,
}: UseCableWorkflowArgs) {
  const snapCablePoint = (point: LatLngLiteral): LatLngLiteral =>
    snapPointToAssets(
      point,
      snapCandidateAssets.filter((asset) => asset.assetType !== "area"),
      snapEnabled,
      8,
    );

  const openCableModalForNew = () => {
    setEditingAssetId(null);
    setAssetType("cable");
    setJointType("Cable");
    setJointName(getNextAssetName(savedJoints, "cable"));
    setNotes("");
    setCablePiaNoiNumber("");
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setPickedLocation(null);
    setDraftAreaPoints([]);
    setDraftCablePoints([]);
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setMapMode("pick");
    setShowCableModal(false);
    setIsPanelOpen(true);
  };

  const startCableDrawing = () => {
    if (!jointName.trim()) {
      alert("Enter a cable name.");
      return;
    }

    setAssetType("cable");
    setJointType("Cable");
    setMapMode("draw-cable");
    setShowCableModal(false);
  };

  const handleUndoCablePoint = () => {
    setDraftCablePoints((prev) => prev.slice(0, -1));
  };

  const handleClearCable = () => {
    setDraftCablePoints([]);
  };

  const handleMoveCablePoint = (index: number, point: LatLngLiteral) => {
    const snapped = snapCablePoint(point);

    setDraftCablePoints((prev) =>
      prev.map((existingPoint, existingIndex) =>
        existingIndex === index ? snapped : existingPoint,
      ),
    );
  };

  const handleDeleteCablePoint = (index: number) => {
    setDraftCablePoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInsertCablePoint = (index: number, point: LatLngLiteral) => {
    const snapped = snapCablePoint(point);

    setDraftCablePoints((prev) => [
      ...prev.slice(0, index + 1),
      snapped,
      ...prev.slice(index + 1),
    ]);
  };

  const handleCablePoint = (point: LatLngLiteral) => {
    setDraftCablePoints((prev) => [...prev, snapCablePoint(point)]);
  };

  return {
    openCableModalForNew,
    startCableDrawing,
    handleUndoCablePoint,
    handleClearCable,
    handleMoveCablePoint,
    handleDeleteCablePoint,
    handleInsertCablePoint,
    handleCablePoint,
  };
}
