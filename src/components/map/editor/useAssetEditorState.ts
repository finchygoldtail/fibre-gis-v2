import { useState } from "react";
import type {
  CableType,
  DistributionPointDetails,
  FibreCount,
  HomeServiceStatus,
  InstallMethod,
  PoleDetails,
} from "../types";
import type { ChamberDetails } from "../modals/ChamberDetailsModal";
import { DEFAULT_DISTRIBUTION_CLOSURE_TYPE } from "../../../services/assetNameValidation";

export type AreaLevel = "L0" | "L1" | "L2" | "L3";

/**
 * Keeps the main map component from owning every asset editor form field.
 * This is intentionally a straight extraction only: no behaviour changes.
 */
export function useAssetEditorState(
  currentJointName: string,
  currentJointType: string,
) {
  const [jointName, setJointName] = useState(currentJointName || "");
  const [jointType, setJointType] = useState(
    currentJointType || "CMJ (12 trays)",
  );
  const [notes, setNotes] = useState("");
  const [cablePiaNoiNumber, setCablePiaNoiNumber] = useState("");
  const [areaLevel, setAreaLevel] = useState<AreaLevel>("L0");

  const [cableType, setCableType] = useState<CableType>("Feeder Cable");
  const [fibreCount, setFibreCount] = useState<FibreCount>("12F");
  const [installMethod, setInstallMethod] =
    useState<InstallMethod>("Underground");
  const [parentCableId, setParentCableId] = useState<string | undefined>(
    undefined,
  );
  const [allocatedInputFibres, setAllocatedInputFibres] = useState<number[]>(
    [],
  );

  const [poleDetails, setPoleDetails] = useState<PoleDetails>({});
  const [dpDetails, setDpDetails] = useState<DistributionPointDetails>({
    powerReadings: ["", "", "", ""],
    closureType: DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
    connectionsToHomes: 8,
    afnDetails: undefined,
  });
  const [chamberDetails, setChamberDetails] = useState<ChamberDetails>({});
  const [homeServiceStatus, setHomeServiceStatus] =
    useState<HomeServiceStatus>("serviceable");
  const [homeBlockedReason, setHomeBlockedReason] = useState("");
  const [homeServiceNote, setHomeServiceNote] = useState("");
  const [homeRecommendedDpId, setHomeRecommendedDpId] = useState("");

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  return {
    jointName,
    setJointName,
    jointType,
    setJointType,
    notes,
    setNotes,
    cablePiaNoiNumber,
    setCablePiaNoiNumber,
    areaLevel,
    setAreaLevel,
    cableType,
    setCableType,
    fibreCount,
    setFibreCount,
    installMethod,
    setInstallMethod,
    parentCableId,
    setParentCableId,
    allocatedInputFibres,
    setAllocatedInputFibres,
    poleDetails,
    setPoleDetails,
    dpDetails,
    setDpDetails,
    chamberDetails,
    setChamberDetails,
    homeServiceStatus,
    setHomeServiceStatus,
    homeBlockedReason,
    setHomeBlockedReason,
    homeServiceNote,
    setHomeServiceNote,
    homeRecommendedDpId,
    setHomeRecommendedDpId,
    editingAssetId,
    setEditingAssetId,
    editingAreaId,
    setEditingAreaId,
  };
}
