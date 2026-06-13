// src/services/homeIntelligence.ts

import type { SavedMapAsset } from "../components/map/types";

function normaliseHomeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function isDropCableLinkedToHome(
  drop: SavedMapAsset,
  home: SavedMapAsset,
): boolean {
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
    .map((v) => String(v || "").trim())
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
  ].map((v) => String(v || "").trim());

  return homeKeys.some((key) => dropKeys.includes(key));
}

export function getHomeConnectionStatus(
  home: SavedMapAsset,
  allAssets: SavedMapAsset[],
  isDropCableAsset: (asset: SavedMapAsset) => boolean,
): "unconnected" | "connected" | "live" {
  const item = home as any;

  const ownStatus = normaliseHomeStatus(
    item.customerStatus ||
      item.homeStatus ||
      item.status ||
      item.buildStatus ||
      item.serviceStatus ||
      item.connectionStatus ||
      item.properties?.status,
  );

  if (ownStatus === "live") return "live";

  const metadataConnection = String(
    item.connection || item.properties?.connection || "",
  ).toLowerCase();

  if (
    item.connectedDpId ||
    item.properties?.connectedDpId ||
    item.connectedDP ||
    item.dpId ||
    metadataConnection === "connected"
  ) {
    return "connected";
  }

  const drop = allAssets.find(
    (asset) =>
      isDropCableAsset(asset) &&
      isDropCableLinkedToHome(asset, home),
  );

  if (!drop) return "unconnected";

  const dropStatus = normaliseHomeStatus(
    (drop as any).customerStatus ||
      (drop as any).homeStatus ||
      (drop as any).status,
  );

  return dropStatus === "live" ? "live" : "connected";
}