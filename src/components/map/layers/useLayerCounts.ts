import { useMemo } from "react";
import type { SavedMapAsset } from "../types";
import {
  getAssetClassificationText,
  getCableLayerKind,
  isAreaAsset,
  isCableAsset,
  isDistributionPointAsset,
  isDropCableAsset,
  isHomeAsset,
  isJointAsset,
  hasPointGeometry,
} from "../../../services/spatialApi/spatialAssetLayerRules";

type AreaLevel = "L0" | "L1" | "L2" | "L3";

type UseLayerCountsArgs = {
  visibleProjectAreas: SavedMapAsset[];
  visibleProjectAssets: SavedMapAsset[];
  visibleOpenreachAssets: SavedMapAsset[];
};

function normaliseAreaLevel(value: unknown): AreaLevel {
  const level = String(value || "L0").toUpperCase();

  if (level === "L1" || level === "L2" || level === "L3") {
    return level;
  }

  return "L0";
}

export function useLayerCounts({
  visibleProjectAreas,
  visibleProjectAssets,
  visibleOpenreachAssets,
}: UseLayerCountsArgs) {
  return useMemo(() => {
    const isPole = (asset: SavedMapAsset) =>
      hasPointGeometry(asset) && getAssetClassificationText(asset).includes("pole");

    const isChamber = (asset: SavedMapAsset) => {
      const text = getAssetClassificationText(asset);
      return hasPointGeometry(asset) && (text.includes("chamber") || text.includes("manhole"));
    };

    const isStreetCab = (asset: SavedMapAsset) => {
      const text = getAssetClassificationText(asset);
      return text.includes("street cab") || text.includes("streetcab") || text.includes("cabinet");
    };

    const homeKey = (asset: SavedMapAsset) => {
      const item = asset as any;
      const raw =
        item.uprn ||
        item.UPRN ||
        item.properties?.UPRN ||
        item.properties?.uprn ||
        item.homeId ||
        item.address ||
        item.label ||
        item.name ||
        item.id;

      if (raw) return String(raw).trim().toLowerCase();

      if (asset.geometry?.type === "Point") {
        const [lat, lng] = asset.geometry.coordinates as [number, number];
        return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
      }

      return "";
    };

    const isDropLinkedToHome = (drop: SavedMapAsset, home: SavedMapAsset) => {
      if (!isDropCableAsset(drop)) return false;
      const dropItem = drop as any;
      const homeItem = home as any;
      const homeKeys = [
        home.id,
        homeItem.uprn,
        homeItem.UPRN,
        homeItem.properties?.UPRN,
        homeItem.properties?.uprn,
        homeItem.homeId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const dropKeys = [
        dropItem.fromAssetId,
        dropItem.toAssetId,
        dropItem.homeId,
        dropItem.connectedHomeId,
        dropItem.toHomeId,
        dropItem.fromHomeId,
        dropItem.uprn,
        dropItem.UPRN,
      ].map((value) => String(value || "").trim());

      return homeKeys.some((key) => dropKeys.includes(key));
    };

    const getHomeStatusForLayer = (home: SavedMapAsset): "unconnected" | "connected" | "live" => {
      const item = home as any;
      const status = String(
        item.customerStatus ||
          item.homeStatus ||
          item.status ||
          item.buildStatus ||
          item.serviceStatus ||
          item.connectionStatus ||
          item.properties?.status ||
          "",
      )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

      if (status === "live") return "live";

      const metadataConnection = String(item.connection || item.properties?.connection || "").toLowerCase();
      if (item.connectedDpId || item.properties?.connectedDpId || item.connectedDP || item.dpId || metadataConnection === "connected") {
        return "connected";
      }

      const drop = visibleProjectAssets.find((asset) => isDropLinkedToHome(asset, home));
      if (!drop) return "unconnected";

      const dropStatus = String((drop as any).customerStatus || (drop as any).homeStatus || (drop as any).status || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

      return dropStatus === "live" ? "live" : "connected";
    };

    const homesByKey = new Map<string, SavedMapAsset>();
    visibleProjectAssets.filter(isHomeAsset).forEach((asset) => {
      const key = homeKey(asset);
      if (key && !homesByKey.has(key)) homesByKey.set(key, asset);
    });

    const canonicalHomes = Array.from(homesByKey.values());
    const connectedHomes = canonicalHomes.filter((home) => getHomeStatusForLayer(home) === "connected");
    const unconnectedHomes = canonicalHomes.filter((home) => getHomeStatusForLayer(home) === "unconnected");
    const liveHomes = canonicalHomes.filter((home) => getHomeStatusForLayer(home) === "live");

    const designCables = visibleProjectAssets.filter((asset) => isCableAsset(asset) && !isDropCableAsset(asset));
    const dropCables = visibleProjectAssets.filter(isDropCableAsset);
    const projectAreaAssets = visibleProjectAreas.filter(isAreaAsset);
    const openreachDucts = visibleOpenreachAssets.filter((asset) => asset.geometry?.type === "LineString");
    const openreachPoles = visibleOpenreachAssets.filter((asset) => getAssetClassificationText(asset).includes("pole"));
    const openreachChambers = visibleOpenreachAssets.filter((asset) => {
      const text = getAssetClassificationText(asset);
      return text.includes("chamber") || text.includes("manhole") || text.includes("joint chamber");
    });
    const suggestedPoles = visibleOpenreachAssets.filter((asset) => {
      const text = getAssetClassificationText(asset);
      return text.includes("suggested") && text.includes("pole");
    });
    const suggestedChambers = visibleOpenreachAssets.filter((asset) => {
      const text = getAssetClassificationText(asset);
      return text.includes("suggested") && (text.includes("chamber") || text.includes("manhole"));
    });
    const suggestedDucts = visibleOpenreachAssets.filter((asset) => {
      const text = getAssetClassificationText(asset);
      return asset.geometry?.type === "LineString" && text.includes("suggested");
    });

    return {
      areas: projectAreaAssets.length,
      l0: projectAreaAssets.filter((asset) => normaliseAreaLevel((asset as any).areaLevel) === "L0").length,
      l1: projectAreaAssets.filter((asset) => normaliseAreaLevel((asset as any).areaLevel) === "L1").length,
      l2: projectAreaAssets.filter((asset) => normaliseAreaLevel((asset as any).areaLevel) === "L2").length,
      l3: projectAreaAssets.filter((asset) => normaliseAreaLevel((asset as any).areaLevel) === "L3").length,
      agJoints: visibleProjectAssets.filter(isJointAsset).length,
      streetCabs: visibleProjectAssets.filter(isStreetCab).length,
      poles: visibleProjectAssets.filter(isPole).length,
      newPoles: visibleProjectAssets.filter((asset) => {
        const text = getAssetClassificationText(asset);
        return isPole(asset) && (text.includes("new pole") || text.includes("np ") || text.includes("np:") || text.includes("np-"));
      }).length,
      orPoles: openreachPoles.length,
      suggestedPoles: suggestedPoles.length,
      chambers: visibleProjectAssets.filter(isChamber).length,
      orChambers: openreachChambers.length,
      suggestedChambers: suggestedChambers.length,
      homes: homesByKey.size,
      homesConnected: connectedHomes.length,
      homesUnconnected: unconnectedHomes.length,
      homesLive: liveHomes.length,
      cables: designCables.length,
      feeders: designCables.filter((asset) => getCableLayerKind(asset) === "feeder").length,
      links: designCables.filter((asset) => getCableLayerKind(asset) === "link").length,
      dropCables: dropCables.length,
      ulw96: designCables.filter((asset) => getCableLayerKind(asset) === "ulw96").length,
      ulw48: designCables.filter((asset) => getCableLayerKind(asset) === "ulw48").length,
      ulw36: designCables.filter((asset) => getCableLayerKind(asset) === "ulw36").length,
      ulw24: designCables.filter((asset) => getCableLayerKind(asset) === "ulw24").length,
      ulw12: designCables.filter((asset) => getCableLayerKind(asset) === "ulw12").length,
      orDucts: openreachDucts.length,
      suggestedDucts: suggestedDucts.length,
      distributionPoints: visibleProjectAssets.filter(isDistributionPointAsset).length,
    };
  }, [visibleProjectAreas, visibleProjectAssets, visibleOpenreachAssets]);
}
