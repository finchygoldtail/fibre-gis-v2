import type { LatLngLiteral } from "leaflet";
import type { SavedMapAsset } from "../types";

export type OsmBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type OsmElement = {
  type: "way" | "relation";
  id: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

const EXCLUDED_BUILDING_TYPES = new Set([
  "garage",
  "garages",
  "shed",
  "roof",
  "industrial",
  "commercial",
  "retail",
  "warehouse",
  "school",
  "church",
  "chapel",
  "hospital",
  "public",
  "service",
]);

function isLikelyHomeBuilding(tags?: Record<string, string>) {
  const building = (tags?.building || "").toLowerCase();

  if (!building) return false;
  if (EXCLUDED_BUILDING_TYPES.has(building)) return false;

  return true;
}

function createHomeName(index: number, element: OsmElement) {
  const houseNumber = element.tags?.["addr:housenumber"];
  const street = element.tags?.["addr:street"];

  if (houseNumber && street) return `${houseNumber} ${street}`;
  if (houseNumber) return `Home ${houseNumber}`;

  return `OSM Home ${index + 1}`;
}

export async function loadOsmBuildingsAsHomes(
  bounds: OsmBounds,
  existingAssets: SavedMapAsset[]
): Promise<SavedMapAsset[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  const query = `
    [out:json][timeout:25];
    (
      way["building"](${bbox});
      relation["building"](${bbox});
    );
    out center tags;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap request failed: ${response.status}`);
  }

  const data = await response.json();
  const elements = (data.elements || []) as OsmElement[];

  const existingOsmIds = new Set(
    existingAssets
      .map((asset) => asset.osmId)
      .filter((id): id is string => Boolean(id))
  );

  const existingHomeKeys = new Set(
    existingAssets
      .filter((asset) => asset.assetType === "home" && asset.geometry.type === "Point")
      .map((asset) => {
        if (asset.geometry.type !== "Point") return "";
        const [lat, lng] = asset.geometry.coordinates;
        return `${lat.toFixed(6)},${lng.toFixed(6)}`;
      })
  );

  const homes: SavedMapAsset[] = [];

  for (const element of elements) {
    if (!element.center) continue;
    if (!isLikelyHomeBuilding(element.tags)) continue;

    const osmId = `${element.type}/${element.id}`;
    if (existingOsmIds.has(osmId)) continue;

    const point: LatLngLiteral = {
      lat: element.center.lat,
      lng: element.center.lon,
    };

    const homeKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    if (existingHomeKeys.has(homeKey)) continue;

    homes.push({
      id: crypto.randomUUID(),
      name: createHomeName(homes.length, element),
      assetType: "home",
      jointType: "Home",
      notes: "Imported from OpenStreetMap building data",
      source: "osm",
      osmId,
      geometry: {
        type: "Point",
        coordinates: [point.lat, point.lng],
      },
    });
  }

  return homes;
}
