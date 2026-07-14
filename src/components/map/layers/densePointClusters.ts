import L from "leaflet";

import type { SavedMapAsset } from "../types";

export type DensePointCluster = {
  id: string;
  assets: SavedMapAsset[];
  position: [number, number];
  kind: "distribution-point" | "pole" | "chamber" | "mixed";
};

export const DENSE_POINT_CLUSTER_MAX_ZOOM = 17;

const iconCache = new Map<string, L.DivIcon>();

export function isDensePointClusterAsset(asset: SavedMapAsset): boolean {
  return (
    asset.geometry?.type === "Point" &&
    (asset.assetType === "pole" || asset.assetType === "chamber")
  );
}

export function createDensePointClusterIcon(cluster: DensePointCluster): L.DivIcon {
  const count = cluster.assets.length;
  const size = count >= 100 ? 44 : count >= 25 ? 38 : 32;
  const colour = getClusterColour(cluster.kind);
  const label = getClusterLabel(cluster.kind);
  const cacheKey = `${cluster.kind}:${size}:${count}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        min-width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: ${colour};
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.35);
        font-weight: 900;
        font-size: 0.72rem;
        line-height: 1;
      ">
        <span>${label}${count}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

export function getDensePointClusterBounds(cluster: DensePointCluster): L.LatLngBounds | null {
  const positions = cluster.assets
    .map(getPointLatLng)
    .filter(Boolean) as [number, number][];

  if (positions.length === 0) return null;

  return L.latLngBounds(positions.map(([lat, lng]) => L.latLng(lat, lng)));
}

export function clusterDensePointAssets(
  assets: SavedMapAsset[],
  map: L.Map,
): DensePointCluster[] {
  const zoom = map.getZoom();

  if (zoom >= DENSE_POINT_CLUSTER_MAX_ZOOM || assets.length < 2) {
    return assets
      .map((asset) => {
        const position = getPointLatLng(asset);
        if (!position) return null;
        return {
          id: asset.id,
          assets: [asset],
          position,
          kind: getClusterKind([asset]),
        };
      })
      .filter(Boolean) as DensePointCluster[];
  }

  const gridSize = zoom >= 16 ? 46 : zoom >= 14 ? 58 : 72;
  const buckets = new Map<string, SavedMapAsset[]>();

  assets.forEach((asset) => {
    const position = getPointLatLng(asset);
    if (!position) return;

    const point = map.latLngToLayerPoint(L.latLng(position[0], position[1]));
    const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(asset);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    let latTotal = 0;
    let lngTotal = 0;

    bucket.forEach((asset) => {
      const position = getPointLatLng(asset);
      if (!position) return;
      latTotal += position[0];
      lngTotal += position[1];
    });

    return {
      id: `dense-point-cluster-${key}-${bucket.length}`,
      assets: bucket,
      position: [latTotal / bucket.length, lngTotal / bucket.length],
      kind: getClusterKind(bucket),
    };
  });
}

function getPointLatLng(asset: SavedMapAsset): [number, number] | null {
  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const lat = Number(asset.geometry.coordinates[0]);
    const lng = Number(asset.geometry.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }

  return null;
}

function getClusterKind(assets: SavedMapAsset[]): DensePointCluster["kind"] {
  const kinds = new Set(assets.map((asset) => asset.assetType));
  if (kinds.size !== 1) return "mixed";

  const [kind] = Array.from(kinds);
  if (kind === "distribution-point" || kind === "pole" || kind === "chamber") {
    return kind;
  }

  return "mixed";
}

function getClusterColour(kind: DensePointCluster["kind"]): string {
  if (kind === "distribution-point") return "#059669";
  if (kind === "pole") return "#92400e";
  if (kind === "chamber") return "#4b5563";
  return "#334155";
}

function getClusterLabel(kind: DensePointCluster["kind"]): string {
  if (kind === "distribution-point") return "D";
  if (kind === "pole") return "P";
  if (kind === "chamber") return "C";
  return "";
}
