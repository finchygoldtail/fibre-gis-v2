import { useMemo } from "react";
import type { SavedMapAsset } from "../types";
import { filterAssetsForProjectArea } from "../projects/projectAssetFilter";
import { isOpenreachReferenceAsset } from "../../../services/orAssetStorage";

type ConnectedHomeForSelectedDp = {
  port: number;
  homeId: string;
  homeName: string;
  status: string;
};

type UseCableAllocationOptionsArgs = {
  allMapAssets: SavedMapAsset[];
  activeProjectArea: SavedMapAsset | null;
  editingAssetId: string | null;
};

function isDropCable(asset: SavedMapAsset): boolean {
  return (
    asset.assetType === "cable" &&
    String((asset as any).cableType || "")
      .trim()
      .toLowerCase() === "drop"
  );
}

export function useCableAllocationOptions({
  allMapAssets,
  activeProjectArea,
  editingAssetId,
}: UseCableAllocationOptionsArgs) {
  const availableParentCablesForBranchAllocation = useMemo(
    () =>
      filterAssetsForProjectArea(allMapAssets, activeProjectArea)
        .filter((asset) => {
          const item = asset as any;
          const assetType = String(item.assetType || "").toLowerCase();
          const cableType = String(item.cableType || "").toLowerCase();
          const installMethod = String(item.installMethod || "").toLowerCase();
          const name = String(
            item.name || item.cableId || item.id || "",
          ).toLowerCase();
          const source = String(item.source || "").toLowerCase();
          const jointType = String(item.jointType || "").toLowerCase();
          const piaKind = String(item.piaKind || "").toLowerCase();
          const routeType = String(item.routeType || "").toLowerCase();
          const notes = String(item.notes || "").toLowerCase();
          const importedName = String(
            item.importedProperties?.Name ||
              item.importedProperties?.name ||
              item.importedProperties?.Description ||
              item.importedProperties?.description ||
              "",
          ).toLowerCase();
          const haystack = [
            source,
            assetType,
            cableType,
            jointType,
            piaKind,
            routeType,
            name,
            notes,
            importedName,
          ].join(" ");
          const fibreNumber =
            Number(String(item.fibreCount || "").replace(/\D/g, "")) || 0;

          if (asset.id === editingAssetId) return false;
          if (asset.geometry?.type !== "LineString") return false;

          // Never show Openreach / PIA / suggested reference infrastructure
          // inside designed-network parent/through cable selectors.
          if (isOpenreachReferenceAsset(asset)) return false;
          if (item.readOnly === true || item.isReferenceAsset === true) return false;
          if (
            source.includes("openreach") ||
            source.includes("pia") ||
            assetType === "pia-route" ||
            cableType.includes("pia") ||
            cableType.includes("overlay") ||
            jointType.includes("pia") ||
            jointType.includes("route") ||
            piaKind ||
            routeType ||
            haystack.includes("osp:") ||
            haystack.includes("cnd:") ||
            haystack.includes("missing duct") ||
            haystack.includes("new duct") ||
            haystack.includes("new sleeve") ||
            haystack.includes("suggested duct") ||
            haystack.includes("suggested route") ||
            name.startsWith("md") ||
            name.startsWith("sl")
          ) {
            return false;
          }

          if (assetType && assetType !== "cable") return false;

          // Customer drops are not valid AFN through/parent cables.
          if (
            isDropCable(asset) ||
            cableType.includes("drop") ||
            name.includes("drop")
          ) {
            return false;
          }

          // Keep broad so newly drawn Link/Distribution/Spine/ULW/OH cables
          // appear immediately, including older saved records with only size.
          return (
            cableType.includes("feeder") ||
            cableType.includes("link") ||
            cableType.includes("spine") ||
            cableType.includes("distribution") ||
            cableType.includes("ulw") ||
            installMethod === "oh" ||
            installMethod.includes("overhead") ||
            installMethod.includes("underground") ||
            fibreNumber >= 12
          );
        })
        .sort((a, b) =>
          String((a as any).name || (a as any).cableId || a.id).localeCompare(
            String((b as any).name || (b as any).cableId || b.id),
            undefined,
            { numeric: true, sensitivity: "base" },
          ),
        ),
    [allMapAssets, activeProjectArea, editingAssetId],
  );

  const allDistributionPointsForAfnAllocation = useMemo(
    () =>
      allMapAssets.filter((asset) => asset.assetType === "distribution-point"),
    [allMapAssets],
  );

  const connectedHomesForSelectedDp = useMemo<ConnectedHomeForSelectedDp[]>(() => {
    if (!editingAssetId) return [];

    const drops = allMapAssets.filter((asset) => {
      return (
        isDropCable(asset) &&
        ((asset as any).fromAssetId === editingAssetId ||
          (asset as any).toAssetId === editingAssetId)
      );
    });

    return drops
      .map((drop, index) => {
        const fromId = (drop as any).fromAssetId;
        const toId = (drop as any).toAssetId;
        const homeId = fromId === editingAssetId ? toId : fromId;
        const home = allMapAssets.find((asset) => asset.id === homeId);
        const status =
          (home as any)?.customerStatus ||
          (home as any)?.homeStatus ||
          (home as any)?.status ||
          (drop as any)?.customerStatus ||
          (drop as any)?.homeStatus ||
          (drop as any)?.status ||
          "Planned";

        return {
          port: Number((drop as any).port || (drop as any).dpPort || index + 1),
          homeId: String(homeId || ""),
          homeName: String(home?.name || homeId || `Home ${index + 1}`),
          status: String(status),
        };
      })
      .sort((a, b) => a.port - b.port);
  }, [editingAssetId, allMapAssets]);

  return {
    availableParentCablesForBranchAllocation,
    allDistributionPointsForAfnAllocation,
    connectedHomesForSelectedDp,
  };
}
