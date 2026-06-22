import type { Dispatch, SetStateAction } from "react";
import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../types";

type UseAreaDrawingToolsArgs = {
  draftAreaPoints: LatLngLiteral[];
  setDraftAreaPoints: Dispatch<SetStateAction<LatLngLiteral[]>>;
  jointName: string;
  savedJoints: SavedMapAsset[];
  notes: string;
  areaLevel: string;
  saveMapAssetToState: (
    asset: SavedMapAsset,
    options?: { isNew?: boolean },
  ) => SavedMapAsset;
  writeAssetAuditLog: (args: {
    asset: SavedMapAsset;
    action: "created" | "updated" | "deleted" | "moved" | string;
    reason: string;
    before?: SavedMapAsset | null;
    after?: SavedMapAsset | null;
    comment?: string;
  }) => void;
  getChangeReasonForCurrentMode: (
    action: "created" | "updated" | "deleted" | "moved" | string,
    assetName?: string,
  ) => string | null;
  resetEditor: () => void;
};

export function useAreaDrawingTools({
  draftAreaPoints,
  setDraftAreaPoints,
  jointName,
  savedJoints,
  notes,
  areaLevel,
  saveMapAssetToState,
  writeAssetAuditLog,
  getChangeReasonForCurrentMode,
  resetEditor,
}: UseAreaDrawingToolsArgs) {
  const handleFinishArea = () => {
    if (draftAreaPoints.length < 3) {
      alert("Add at least three polygon points.");
      return;
    }

    const areaName =
      jointName.trim() ||
      `Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`;

    const reason = getChangeReasonForCurrentMode("created", areaName);
    if (!reason) return;

    const areaRecord: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: areaName,
      assetType: "area",
      jointType: "Polygon Area",
      notes: notes.trim(),
      areaLevel: areaLevel as any,
      mappingRows: [],
      geometry: {
        type: "Polygon",
        coordinates: [draftAreaPoints.map((point) => [point.lat, point.lng])],
      },
    } as SavedMapAsset;

    const savedAreaRecord = saveMapAssetToState(areaRecord, { isNew: true });
    writeAssetAuditLog({
      asset: savedAreaRecord,
      action: "created",
      reason,
      after: savedAreaRecord,
    });
    resetEditor();
  };

  const handleUndoAreaPoint = () => {
    setDraftAreaPoints((prev) => prev.slice(0, -1));
  };

  const handleClearArea = () => {
    setDraftAreaPoints([]);
  };

  const handleMoveAreaPoint = (index: number, point: LatLngLiteral) => {
    setDraftAreaPoints((prev) =>
      prev.map((existingPoint, existingIndex) =>
        existingIndex === index ? point : existingPoint,
      ),
    );
  };

  return {
    handleFinishArea,
    handleUndoAreaPoint,
    handleClearArea,
    handleMoveAreaPoint,
  };
}
