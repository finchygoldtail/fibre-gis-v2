import L from "leaflet";

import { getTupleDistanceMeters as distanceBetweenLatLngMeters } from "../../../utils/mapMeasure";
import type { SavedMapAsset } from "../types";

export type HomeCluster = {
  id: string;
  assets: SavedMapAsset[];
  position: [number, number];
};

export type HomeStack = {
  id: string;
  assets: SavedMapAsset[];
  position: [number, number];
};

export const HOME_STACK_DISTANCE_METERS = 1.75;

const homeClusterIconCache = new Map<string, L.DivIcon>();
const homeStackIconCache = new Map<string, L.DivIcon>();

function getPointLatLng(asset: SavedMapAsset): [number, number] | null {
  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const lat = Number(asset.geometry.coordinates[0]);
    const lng = Number(asset.geometry.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }

  const lat = Number((asset as any).lat);
  const lng = Number((asset as any).lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];

  return null;
}

export function createHomeClusterIcon(count: number) {
  const size = count >= 100 ? 44 : count >= 25 ? 38 : 32;
  const cacheKey = `${size}:${count}`;
  const cached = homeClusterIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #334155;
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
        font-weight: 800;
        font-size: 0.8rem;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  homeClusterIconCache.set(cacheKey, icon);
  return icon;
}

export function createHomeStackIcon(count: number) {
  const size = count >= 10 ? 42 : 36;
  const cacheKey = `${size}:${count}`;
  const cached = homeStackIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #ef4444;
        color: #ffffff;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 3px rgba(239,68,68,0.35), 0 8px 20px rgba(15,23,42,0.42);
        font-weight: 900;
        font-size: 0.82rem;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  homeStackIconCache.set(cacheKey, icon);
  return icon;
}

export function getHomeDisplayName(home: SavedMapAsset): string {
  const item = home as any;
  return String(
    item.address ||
      item.fullAddress ||
      item.name ||
      item.label ||
      item.uprn ||
      item.UPRN ||
      item.properties?.UPRN ||
      home.id ||
      "Home",
  );
}

export function groupStackedHomeAssets(homes: SavedMapAsset[]): HomeStack[] {
  const positionsById = new Map<string, [number, number]>();
  const buckets = new Map<string, SavedMapAsset[]>();
  const cellSizeMeters = HOME_STACK_DISTANCE_METERS;
  const metersPerDegreeLat = 111_320;

  homes.forEach((home) => {
    const position = getPointLatLng(home);
    if (!position) return;

    positionsById.set(home.id, position);
    const [lat, lng] = position;
    const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
    const x = Math.floor((lng * metersPerDegreeLng) / cellSizeMeters);
    const y = Math.floor((lat * metersPerDegreeLat) / cellSizeMeters);
    const key = `${x}:${y}`;
    const bucket = buckets.get(key) || [];
    bucket.push(home);
    buckets.set(key, bucket);
  });

  const visited = new Set<string>();
  const stacks: HomeStack[] = [];

  homes.forEach((seed) => {
    if (visited.has(seed.id)) return;

    const seedPosition = positionsById.get(seed.id);
    if (!seedPosition) return;

    const [seedLat, seedLng] = seedPosition;
    const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((seedLat * Math.PI) / 180));
    const seedX = Math.floor((seedLng * metersPerDegreeLng) / cellSizeMeters);
    const seedY = Math.floor((seedLat * metersPerDegreeLat) / cellSizeMeters);
    const group: SavedMapAsset[] = [seed];
    visited.add(seed.id);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = buckets.get(`${seedX + dx}:${seedY + dy}`) || [];
        bucket.forEach((candidate) => {
          if (candidate.id === seed.id || visited.has(candidate.id)) return;
          const candidatePosition = positionsById.get(candidate.id);
          if (!candidatePosition) return;

          if (distanceBetweenLatLngMeters(seedPosition, candidatePosition) <= HOME_STACK_DISTANCE_METERS) {
            group.push(candidate);
            visited.add(candidate.id);
          }
        });
      }
    }

    if (group.length < 2) return;

    let latTotal = 0;
    let lngTotal = 0;
    group.forEach((home) => {
      const position = positionsById.get(home.id);
      if (!position) return;
      latTotal += position[0];
      lngTotal += position[1];
    });

    stacks.push({
      id: `home-stack-${group.map((home) => home.id).join("-")}`,
      assets: group,
      position: [latTotal / group.length, lngTotal / group.length],
    });
  });

  return stacks;
}

export function getHomeClusterBounds(cluster: HomeCluster): L.LatLngBounds | null {
  const positions = cluster.assets
    .map((home) => getPointLatLng(home))
    .filter(Boolean) as [number, number][];

  if (positions.length === 0) return null;

  return L.latLngBounds(positions.map(([lat, lng]) => L.latLng(lat, lng)));
}

export function clusterHomeAssets(homes: SavedMapAsset[], map: L.Map): HomeCluster[] {
  const zoom = map.getZoom();

  if (zoom >= 17 || homes.length < 2) {
    return homes
      .map((home) => {
        const position = getPointLatLng(home);
        if (!position) return null;
        return { id: home.id, assets: [home], position };
      })
      .filter(Boolean) as HomeCluster[];
  }

  const gridSize = zoom >= 15 ? 48 : 64;
  const buckets = new Map<string, SavedMapAsset[]>();

  homes.forEach((home) => {
    const position = getPointLatLng(home);
    if (!position) return;

    const point = map.latLngToLayerPoint(L.latLng(position[0], position[1]));
    const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(home);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    let latTotal = 0;
    let lngTotal = 0;

    bucket.forEach((home) => {
      const position = getPointLatLng(home);
      if (!position) return;
      latTotal += position[0];
      lngTotal += position[1];
    });

    return {
      id: `home-cluster-${key}-${bucket.length}`,
      assets: bucket,
      position: [latTotal / bucket.length, lngTotal / bucket.length],
    };
  });
}
