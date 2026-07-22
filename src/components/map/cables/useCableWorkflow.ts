import type React from "react";
import type { LatLngLiteral } from "leaflet";
import { getNextAssetName } from "../../../utils/mapAssetNames";
import { snapPointToAssets } from "../utils/snapToAssets";
import type {
  AssetType,
  CableType,
  CableSegmentInstallMethod,
  DuctUse,
  FibreCount,
  InstallMethod,
  SavedMapAsset,
} from "../types";

type MapMode =
  | "pick"
  | "measure"
  | "draw-cable"
  | "draw-area"
  | "drive-to-location"
  | "move-homes"
  | "survey-delete-homes";

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
  setDuctCount: React.Dispatch<React.SetStateAction<number>>;
  setDuctDiameterMm: React.Dispatch<React.SetStateAction<number>>;
  setDuctUse: React.Dispatch<React.SetStateAction<DuctUse>>;
  setParentCableId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAllocatedInputFibres: React.Dispatch<React.SetStateAction<number[]>>;
  setPickedLocation: React.Dispatch<React.SetStateAction<LatLngLiteral | null>>;
  setDraftAreaPoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  setDraftCablePoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  setDraftCableSegmentMethods: React.Dispatch<
    React.SetStateAction<CableSegmentInstallMethod[]>
  >;
  setSelectedReferenceDuctId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedReferenceDuctName: React.Dispatch<React.SetStateAction<string>>;
  setMapMode: React.Dispatch<React.SetStateAction<MapMode>>;
  setShowCableModal: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentInstallMethod: InstallMethod;
};

function normaliseSegmentInstallMethod(
  value: InstallMethod | string | null | undefined,
): CableSegmentInstallMethod {
  const text = String(value || "").trim().toLowerCase();
  return text === "oh" || text.includes("overhead") ? "OH" : "Underground";
}

function getDuctCount(asset: SavedMapAsset): number {
  return Math.max(1, Math.round(Number((asset as any).ductCount || 1)));
}

function getNextDuctStartNumber(savedAssets: SavedMapAsset[]): number {
  return (
    savedAssets
      .filter((asset) => asset.assetType === "duct")
      .reduce((total, asset) => total + getDuctCount(asset), 0) + 1
  );
}

function formatDuctBundleName(startNumber: number, count: number): string {
  const safeCount = Math.max(1, Math.round(Number(count) || 1));
  return safeCount === 1
    ? `Duct ${startNumber}`
    : `Duct ${startNumber}-${startNumber + safeCount - 1}`;
}

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
  setDuctCount,
  setDuctDiameterMm,
  setDuctUse,
  setParentCableId,
  setAllocatedInputFibres,
  setPickedLocation,
  setDraftAreaPoints,
  setDraftCablePoints,
  setDraftCableSegmentMethods,
  setSelectedReferenceDuctId,
  setSelectedReferenceDuctName,
  setMapMode,
  setShowCableModal,
  setIsPanelOpen,
  currentInstallMethod,
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
    setDuctCount(4);
    setDuctDiameterMm(96);
    setDuctUse("Main route");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setPickedLocation(null);
    setDraftAreaPoints([]);
    setDraftCablePoints([]);
    setDraftCableSegmentMethods([]);
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setMapMode("pick");
    setShowCableModal(false);
    setIsPanelOpen(true);
  };

  const openDuctModalForNew = () => {
    const ductStartNumber = getNextDuctStartNumber(savedJoints);
    setEditingAssetId(null);
    setAssetType("duct");
    setJointType("Duct");
    setJointName(formatDuctBundleName(ductStartNumber, 4));
    setNotes("");
    setCablePiaNoiNumber("");
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setDuctCount(4);
    setDuctDiameterMm(96);
    setDuctUse("Main route");
    setParentCableId(undefined);
    setAllocatedInputFibres([]);
    setPickedLocation(null);
    setDraftAreaPoints([]);
    setDraftCablePoints([]);
    setDraftCableSegmentMethods([]);
    setSelectedReferenceDuctId(null);
    setSelectedReferenceDuctName("");
    setMapMode("draw-cable");
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
    setDraftCablePoints((prev) => {
      if (prev.length > 1) {
        setDraftCableSegmentMethods((methods) => methods.slice(0, -1));
      }
      return prev.slice(0, -1);
    });
  };

  const handleClearCable = () => {
    setDraftCablePoints([]);
    setDraftCableSegmentMethods([]);
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
    setDraftCablePoints((prev) => {
      if (prev.length > 1) {
        const methodIndex = index >= prev.length - 1 ? index - 1 : index;
        setDraftCableSegmentMethods((methods) =>
          methods.filter((_, i) => i !== Math.max(0, methodIndex)),
        );
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleInsertCablePoint = (index: number, point: LatLngLiteral) => {
    const snapped = snapCablePoint(point);

    setDraftCableSegmentMethods((methods) => {
      const inherited =
        methods[index] || normaliseSegmentInstallMethod(currentInstallMethod);
      return [
        ...methods.slice(0, index + 1),
        inherited,
        ...methods.slice(index + 1),
      ];
    });

    setDraftCablePoints((prev) => [
      ...prev.slice(0, index + 1),
      snapped,
      ...prev.slice(index + 1),
    ]);
  };

  const handleCablePoint = (point: LatLngLiteral) => {
    setDraftCablePoints((prev) => {
      if (prev.length > 0) {
        setDraftCableSegmentMethods((methods) => [
          ...methods,
          normaliseSegmentInstallMethod(currentInstallMethod),
        ]);
      }
      return [...prev, snapCablePoint(point)];
    });
  };

  return {
    openCableModalForNew,
    openDuctModalForNew,
    startCableDrawing,
    handleUndoCablePoint,
    handleClearCable,
    handleMoveCablePoint,
    handleDeleteCablePoint,
    handleInsertCablePoint,
    handleCablePoint,
  };
}
