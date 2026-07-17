import { useCallback } from "react";
import type { DistributionPointDetails } from "../types";
import { DEFAULT_DISTRIBUTION_CLOSURE_TYPE } from "../../../services/assetNameValidation";

type Setter<T = any> = (value: T) => void;

type UseEditorResetArgs = {
  setEditingAssetId: Setter<string | null>;
  setEditingAreaId: Setter<string | null>;
  setPickedLocation: Setter<any>;
  setNotes: Setter<string>;
  setCablePiaNoiNumber: Setter<string>;
  setAreaLevel: Setter<any>;
  setMapMode: Setter<any>;
  setSelectedReferenceDuctId: Setter<string | null>;
  setSelectedReferenceDuctName: Setter<string>;
  setDraftCablePoints: Setter<any[]>;
  setDraftCableSegmentMethods: Setter<any[]>;
  setDraftAreaPoints: Setter<any[]>;
  setCableType: Setter<any>;
  setFibreCount: Setter<any>;
  setInstallMethod: Setter<any>;
  setParentCableId: Setter<any>;
  setAllocatedInputFibres: Setter<number[]>;
  setPoleDetails: Setter<any>;
  setDpDetails: Setter<DistributionPointDetails>;
  setChamberDetails: Setter<any>;
  setShowCableModal: Setter<boolean>;
  setShowPoleModal: Setter<boolean>;
  setShowDpModal: Setter<boolean>;
  setShowChamberModal: Setter<boolean>;
  setOpenDistributionPointAsset: Setter<any>;
};

export function useEditorReset(args: UseEditorResetArgs) {
  const resetEditor = useCallback(() => {
    args.setEditingAssetId(null);
    args.setEditingAreaId(null);
    args.setPickedLocation(null);
    args.setNotes("");
    args.setCablePiaNoiNumber("");
    args.setAreaLevel("L0");
    args.setMapMode("pick");
    args.setSelectedReferenceDuctId(null);
    args.setSelectedReferenceDuctName("");
    args.setDraftCablePoints([]);
    args.setDraftCableSegmentMethods([]);
    args.setDraftAreaPoints([]);
    args.setCableType("Feeder Cable");
    args.setFibreCount("12F");
    args.setInstallMethod("Underground");
    args.setParentCableId(undefined);
    args.setAllocatedInputFibres([]);
    args.setPoleDetails({});
    args.setDpDetails({
      powerReadings: ["", "", "", ""],
      closureType: DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
      connectionsToHomes: 8,
      buildStatus: "Planned",
    } as DistributionPointDetails);
    args.setChamberDetails({});
    args.setShowCableModal(false);
    args.setShowPoleModal(false);
    args.setShowDpModal(false);
    args.setShowChamberModal(false);
    args.setOpenDistributionPointAsset(null);
  }, [args]);

  return { resetEditor };
}
