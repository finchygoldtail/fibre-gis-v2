import type { Dispatch, SetStateAction } from "react";
import type { LatLngLiteral } from "leaflet";
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
import type { AssetChangeAction } from "../audit/types";
import { withAssetEditedMetadata } from "../../../services/assetActivityService";
import { saveProjectHomes } from "../projects/projectHomesStorage";
import { markAssetForLiveSync } from "../persistence/useAssetPersistence";
import {
  isDropCable,
  sanitiseCableRouteCoordinates,
} from "../utils/mapAssetGeometry";
import { recordLocalEngineeringChange } from "../../../core/engineering";


export function normaliseDpOperationalStatus(value: unknown): string {
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

export function getDpOperationalStatus(
  asset: any,
  fallback: string = "Planned",
): string {
  return normaliseDpOperationalStatus(
    asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      fallback,
  );
}

export function syncDpOperationalStatusOnAsset<T extends Record<string, any>>(
  asset: T,
  statusValue?: unknown,
): T {
  const nextStatus = normaliseDpOperationalStatus(
    statusValue ||
      asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      "Planned",
  );

  const nextDpDetails = {
    ...(asset?.dpDetails || asset?.properties?.dpDetails || {}),
    buildStatus: nextStatus,
  };

  return {
    ...(asset as any),
    status: nextStatus,
    buildStatus: nextStatus,
    dpDetails: nextDpDetails,
    properties: {
      ...((asset as any).properties || {}),
      status: nextStatus,
      buildStatus: nextStatus,
      dpDetails: {
        ...(((asset as any).properties || {}).dpDetails || {}),
        ...nextDpDetails,
        buildStatus: nextStatus,
      },
    },
  } as T;
}

type SaveDetailOverrides = {
  poleDetails?: PoleDetails;
  dpDetails?: DistributionPointDetails;
  chamberDetails?: ChamberDetails;
};

type UseAssetSaveHandlersArgs = {
  activeProjectId: string | null;
  activeProjectAreaName: string | null | undefined;
  allocatedInputFibres: number[];
  areaLevel: string;
  assetType: AssetType;
  cablePiaNoiNumber: string;
  cableType: CableType;
  chamberDetails: ChamberDetails;
  currentMappingRows: any[][];
  draftAreaPoints: LatLngLiteral[];
  draftCablePoints: LatLngLiteral[];
  editingAssetId: string | null;
  fibreCount: FibreCount;
  getChangeReasonForCurrentMode: (
    action: AssetChangeAction,
    assetName?: string,
  ) => string | null;
  installMethod: InstallMethod;
  jointName: string;
  jointType: string;
  notes: string;
  parentCableId: string;
  pickedLocation: LatLngLiteral | null;
  poleDetails: PoleDetails;
  dpDetails: DistributionPointDetails;
  projectHomes: SavedMapAsset[];
  resetEditor: () => void;
  saveMapAssetToState: (
    asset: SavedMapAsset,
    options?: { isNew?: boolean },
  ) => SavedMapAsset;
  savedJoints: SavedMapAsset[];
  setProjectHomes: Dispatch<SetStateAction<SavedMapAsset[]>>;
  setSavedJoints: Dispatch<SetStateAction<SavedMapAsset[]>>;
  stampHomesForActiveArea: (homes: SavedMapAsset[]) => SavedMapAsset[];
  writeAssetAuditLog: (args: {
    asset: SavedMapAsset;
    action: AssetChangeAction;
    reason: string;
    comment?: string;
    before?: SavedMapAsset | null;
    after?: SavedMapAsset | null;
  }) => void;
};

function getHomeConnectionKey(asset: any): string {
  return String(
    asset?.id ??
      asset?.assetId ??
      asset?.homeId ??
      asset?.uprn ??
      asset?.UPRN ??
      asset?.properties?.UPRN ??
      asset?.properties?.uprn ??
      "",
  ).trim();
}

function getDropHomeKeys(drop: any): string[] {
  const rawHomeId = String(
    drop?.homeId ??
      drop?.toAssetId ??
      drop?.connectedHomeId ??
      drop?.uprn ??
      drop?.UPRN ??
      "",
  ).trim();

  if (!rawHomeId) return [];

  return rawHomeId.startsWith("uprn-")
    ? [rawHomeId, rawHomeId.replace(/^uprn-/, "")]
    : [rawHomeId, `uprn-${rawHomeId}`];
}

function getEngineeringAreaId(
  activeProjectId: string | null,
  activeProjectAreaName: string | null | undefined,
): string {
  return String(activeProjectId || activeProjectAreaName || "global-map").trim() || "global-map";
}

function getEngineeringSnapshot(asset?: SavedMapAsset | null): any | null {
  if (!asset) return null;

  const anyAsset = asset as any;
  return {
    ...anyAsset,
    id: String(anyAsset.id ?? ""),
    type: anyAsset.assetType || anyAsset.jointType || anyAsset.type,
    name: anyAsset.name || anyAsset.label || anyAsset.properties?.name,
    status: anyAsset.status || anyAsset.buildStatus || anyAsset.properties?.status,
    notes: anyAsset.notes || anyAsset.properties?.notes,
    geometry: anyAsset.geometry,
    coordinates: anyAsset.geometry?.coordinates,
    fibreAllocation: anyAsset.allocatedInputFibres || anyAsset.fibreAllocation || anyAsset.properties?.fibreAllocation,
    fibres: anyAsset.fibres || anyAsset.fibreCount || anyAsset.properties?.fibres,
    photos: anyAsset.photos || anyAsset.photoUrls || anyAsset.properties?.photos,
    commercial: anyAsset.commercial || anyAsset.properties?.commercial,
  };
}

function recordEngineeringChangeSafely(args: {
  before?: SavedMapAsset | null;
  after?: SavedMapAsset | null;
  activeProjectId: string | null;
  activeProjectAreaName: string | null | undefined;
  reason?: string;
  source: string;
}): void {
  try {
    recordLocalEngineeringChange({
      before: getEngineeringSnapshot(args.before),
      after: getEngineeringSnapshot(args.after),
      areaId: getEngineeringAreaId(args.activeProjectId, args.activeProjectAreaName),
      areaName: args.activeProjectAreaName || undefined,
      createdBy: "Current User",
      source: args.source,
      reason: args.reason,
    });
  } catch (error) {
    console.warn("Engineering Core analysis failed; map save continued.", error);
  }
}

export function useAssetSaveHandlers({
  activeProjectId,
  activeProjectAreaName,
  allocatedInputFibres,
  areaLevel,
  assetType,
  cablePiaNoiNumber,
  cableType,
  chamberDetails,
  currentMappingRows,
  draftAreaPoints,
  draftCablePoints,
  editingAssetId,
  fibreCount,
  getChangeReasonForCurrentMode,
  installMethod,
  jointName,
  jointType,
  notes,
  parentCableId,
  pickedLocation,
  poleDetails,
  dpDetails,
  projectHomes,
  resetEditor,
  saveMapAssetToState,
  savedJoints,
  setProjectHomes,
  setSavedJoints,
  stampHomesForActiveArea,
  writeAssetAuditLog,
}: UseAssetSaveHandlersArgs) {
  const handleSaveEdits = async (detailOverrides?: SaveDetailOverrides) => {
    if (!editingAssetId) return;

    const beforeAsset = (savedJoints ?? []).find(
      (asset) => asset.id === editingAssetId,
    );
    const reason = getChangeReasonForCurrentMode(
      "updated",
      beforeAsset?.name || jointName,
    );
    if (!reason) return;

    let savedAfterAsset: SavedMapAsset | null = null;
    const editedCableCoordinates =
      assetType === "cable" && draftCablePoints.length >= 2
        ? sanitiseCableRouteCoordinates(draftCablePoints)
        : null;

    const nextPoleDetails = detailOverrides?.poleDetails ?? poleDetails;
    const nextDpDetails = detailOverrides?.dpDetails ?? dpDetails;
    const nextChamberDetails =
      detailOverrides?.chamberDetails ?? chamberDetails;

    setSavedJoints((prev) =>
      prev.map((asset) => {
        if (asset.id !== editingAssetId) return asset;

        if (assetType === "area") {
          if (draftAreaPoints.length < 3) return asset;

          savedAfterAsset = withAssetEditedMetadata(
            markAssetForLiveSync({
              ...asset,
              name: jointName.trim() || asset.name,
              jointType: "Polygon Area",
              notes: notes.trim(),
              assetType: "area",
              areaLevel,
              geometry: {
                type: "Polygon",
                coordinates: [draftAreaPoints.map((p) => [p.lat, p.lng])],
              },
            }),
            "updated",
            reason,
          );
          return savedAfterAsset;
        }

        if (asset.geometry?.type === "Point") {
          if (!pickedLocation) return asset;

          savedAfterAsset = withAssetEditedMetadata(
            markAssetForLiveSync({
              ...asset,
              name: jointName.trim() || asset.name,
              jointType:
                assetType === "street-cab"
                  ? "Street Cab"
                  : assetType === "pole"
                    ? "Pole"
                    : assetType === "distribution-point"
                      ? "Distribution Point"
                      : assetType === "chamber"
                        ? "Chamber"
                        : assetType === "home"
                          ? "Home"
                          : jointType,
              notes: notes.trim(),
              assetType,
              ...(assetType === "distribution-point"
                ? {
                    status: getDpOperationalStatus({
                      ...(asset as any),
                      dpDetails: nextDpDetails,
                    }),
                    buildStatus: getDpOperationalStatus({
                      ...(asset as any),
                      dpDetails: nextDpDetails,
                    }),
                    properties: {
                      ...((asset as any).properties || {}),
                      status: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                      buildStatus: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                      dpDetails: {
                        ...(((asset as any).properties || {}).dpDetails || {}),
                        ...nextDpDetails,
                        buildStatus: getDpOperationalStatus({
                          ...(asset as any),
                          dpDetails: nextDpDetails,
                        }),
                      },
                    },
                  }
                : {}),
              poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
              dpDetails:
                assetType === "distribution-point"
                  ? ({
                      ...nextDpDetails,
                      buildStatus: getDpOperationalStatus({
                        ...(asset as any),
                        dpDetails: nextDpDetails,
                      }),
                    } as DistributionPointDetails)
                  : undefined,
              chamberDetails:
                assetType === "chamber" ? nextChamberDetails : undefined,
              geometry: {
                type: "Point",
                coordinates: [pickedLocation.lat, pickedLocation.lng],
              },
            }),
            "updated",
            reason,
          );
          return savedAfterAsset;
        }

        savedAfterAsset = withAssetEditedMetadata(
          markAssetForLiveSync({
            ...asset,
            name: jointName.trim() || asset.name,
            jointType: "Cable",
            notes: notes.trim(),
            piaNoiNumber: cablePiaNoiNumber.trim(),
            assetType: "cable",
            cableType,
            fibreCount,
            installMethod,
            parentCableId,
            allocatedInputFibres,
            routeMode: (asset as any).routeMode,
            geometry: {
              type: "LineString",
              coordinates: editedCableCoordinates?.length
                ? editedCableCoordinates
                : sanitiseCableRouteCoordinates(
                    (asset.geometry?.type === "LineString"
                      ? asset.geometry.coordinates
                      : []) as [number, number][],
                  ),
            },
          }),
          "updated",
          reason,
        );
        return savedAfterAsset;
      }),
    );

    if (savedAfterAsset) {
      writeAssetAuditLog({
        asset: savedAfterAsset,
        action: "updated",
        reason,
        before: beforeAsset,
        after: savedAfterAsset,
      });

      recordEngineeringChangeSafely({
        before: beforeAsset,
        after: savedAfterAsset,
        activeProjectId,
        activeProjectAreaName,
        reason,
        source: "asset-edit-save",
      });
    }

    resetEditor();
  };

  const handleSaveJoint = (detailOverrides?: SaveDetailOverrides) => {
    if (!pickedLocation) {
      alert("Click a location on the map first.");
      return;
    }

    if (!jointName.trim()) {
      if (assetType === "street-cab") {
        alert("Enter a street cab name.");
      } else if (assetType === "pole") {
        alert("Enter a pole name.");
      } else if (assetType === "distribution-point") {
        alert("Enter a distribution point name.");
      } else if (assetType === "chamber") {
        alert("Enter a chamber name.");
      } else if (assetType === "home") {
        alert("Enter a home name.");
      } else {
        alert("Enter a joint name.");
      }
      return;
    }

    if (assetType === "cable") {
      alert("Use Add Cable and Start Drawing for cables.");
      return;
    }

    if (assetType === "area") {
      alert("Use Draw Area, then Finish Area for polygons.");
      return;
    }

    const nextPoleDetails = detailOverrides?.poleDetails ?? poleDetails;
    const nextDpDetails = detailOverrides?.dpDetails ?? dpDetails;
    const nextChamberDetails =
      detailOverrides?.chamberDetails ?? chamberDetails;

    const reason = getChangeReasonForCurrentMode("created", jointName.trim());
    if (!reason) return;

    const record: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: jointName.trim(),
      assetType,
      jointType:
        assetType === "street-cab"
          ? "Street Cab"
          : assetType === "pole"
            ? "Pole"
            : assetType === "distribution-point"
              ? "Distribution Point"
              : assetType === "chamber"
                ? "Chamber"
                : assetType === "home"
                  ? "Home"
                  : jointType,
      notes: notes.trim(),
      mappingRows: assetType === "ag-joint" ? currentMappingRows : [],
      mappingRowsCount:
        assetType === "ag-joint" ? currentMappingRows.length : undefined,
      ...(assetType === "ag-joint" && currentMappingRows.length > 0
        ? {
            mappingRowsRef: false,
            mappingRowsSummary: { rowCount: currentMappingRows.length },
          }
        : {}),
      ...(assetType === "distribution-point"
        ? {
            status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            properties: {
              status: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
              dpDetails: {
                ...nextDpDetails,
                buildStatus: getDpOperationalStatus({
                  dpDetails: nextDpDetails,
                }),
              },
            },
          }
        : {}),
      poleDetails: assetType === "pole" ? nextPoleDetails : undefined,
      dpDetails:
        assetType === "distribution-point"
          ? ({
              ...nextDpDetails,
              buildStatus: getDpOperationalStatus({ dpDetails: nextDpDetails }),
            } as DistributionPointDetails)
          : undefined,
      chamberDetails: assetType === "chamber" ? nextChamberDetails : undefined,
      geometry: {
        type: "Point",
        coordinates: [pickedLocation.lat, pickedLocation.lng],
      },
    };

    const savedRecord = saveMapAssetToState(record, { isNew: true });
    writeAssetAuditLog({
      asset: savedRecord,
      action: "created",
      reason,
      after: savedRecord,
    });
    recordEngineeringChangeSafely({
      before: null,
      after: savedRecord,
      activeProjectId,
      activeProjectAreaName,
      reason,
      source: "asset-create-save",
    });
    resetEditor();
  };

  const handleDeleteAsset = async (id: string) => {
    const deletedId = String(id);
    const deletedAsset = (savedJoints ?? []).find(
      (asset) => asset.id === deletedId,
    );
    const reason = getChangeReasonForCurrentMode(
      "deleted",
      deletedAsset?.name || deletedId,
    );
    if (!reason) return;

    const homeKeysToUnstamp = new Set<string>();

    savedJoints.forEach((asset: any) => {
      if (!isDropCable(asset)) return;

      const dropDpId = String(asset?.dpId ?? asset?.fromAssetId ?? "").trim();
      const dropHomeId = String(asset?.homeId ?? asset?.toAssetId ?? "").trim();

      if (
        dropDpId === deletedId ||
        dropHomeId === deletedId ||
        asset?.id === deletedId
      ) {
        getDropHomeKeys(asset).forEach((key) => homeKeysToUnstamp.add(key));
      }
    });

    setSavedJoints((prev) => {
      const filteredAssets = prev.filter((asset: any) => {
        if (asset?.id === deletedId) return false;

        if (isDropCable(asset)) {
          const dropDpId = String(
            asset?.dpId ?? asset?.fromAssetId ?? "",
          ).trim();
          const dropHomeId = String(
            asset?.homeId ?? asset?.toAssetId ?? "",
          ).trim();

          return dropDpId !== deletedId && dropHomeId !== deletedId;
        }

        return true;
      });

      return filteredAssets.map((asset: any) => {
        const connectedDpId = String(
          asset?.connectedDpId ?? asset?.properties?.connectedDpId ?? "",
        ).trim();
        const homeKey = getHomeConnectionKey(asset);

        if (
          connectedDpId !== deletedId &&
          (!homeKey || !homeKeysToUnstamp.has(homeKey))
        ) {
          return asset;
        }

        return markAssetForLiveSync(
          {
            ...asset,
            connection: "unconnected",
            connectedDpId: null,
            connectionMode: null,
            properties: {
              ...((asset as any).properties || {}),
              connection: "unconnected",
              connectedDpId: null,
              connectionMode: null,
            },
          },
          true,
        );
      });
    });

    if (deletedAsset) {
      writeAssetAuditLog({
        asset: deletedAsset,
        action: "deleted",
        reason,
        before: deletedAsset,
      });

      recordEngineeringChangeSafely({
        before: deletedAsset,
        after: null,
        activeProjectId,
        activeProjectAreaName,
        reason,
        source: "asset-delete-save",
      });
    }

    if (activeProjectId && homeKeysToUnstamp.size > 0) {
      const updatedProjectHomes = projectHomes.map((home: any) => {
        const connectedDpId = String(
          home?.connectedDpId ?? home?.properties?.connectedDpId ?? "",
        ).trim();
        const homeKey = getHomeConnectionKey(home);

        if (
          connectedDpId !== deletedId &&
          (!homeKey || !homeKeysToUnstamp.has(homeKey))
        ) {
          return home;
        }

        return markAssetForLiveSync(
          {
            ...home,
            connection: "unconnected",
            connectedDpId: null,
            connectionMode: null,
            properties: {
              ...((home as any).properties || {}),
              connection: "unconnected",
              connectedDpId: null,
              connectionMode: null,
            },
          },
          true,
        );
      });

      setProjectHomes(updatedProjectHomes);
      await saveProjectHomes(
        activeProjectId,
        stampHomesForActiveArea(updatedProjectHomes),
        activeProjectAreaName,
      );
    }

    if (editingAssetId === id) {
      resetEditor();
    }
  };

  return {
    handleSaveEdits,
    handleSaveJoint,
    handleDeleteAsset,
  };
}
