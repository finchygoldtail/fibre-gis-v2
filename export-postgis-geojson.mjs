import fs from "node:fs/promises";

const API = "https://api.alistragis.com";
const BUSINESS_ID = "fibre-gis-v2";
const OUT_FILE = "C:/Users/ali_b/Downloads/alistragis-postgis-export.geojson";
const CHECKPOINT_EVERY_AREAS = 25;

const UK_BOUNDS = {
  minLng: -8.7,
  minLat: 49.8,
  maxLng: 2.0,
  maxLat: 61.2,
};

const ASSET_TYPES = [
  "area",
  "distribution-point",
  "ag-joint",
  "chamber",
  "home",
  "cable",
  "pole",
  "street-cab",
];

async function getJson(path, attempt = 1) {
  const res = await fetch(`${API}${path}`);
  const text = await res.text();

  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      const delayMs = 1000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return getJson(path, attempt + 1);
    }

    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return JSON.parse(text);
}

function params(values) {
  return new URLSearchParams(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, String(value)]),
    ),
  );
}

function featureKey(feature) {
  return String(
    feature?.id ||
      feature?.properties?.id ||
      feature?.properties?.postgisId ||
      JSON.stringify(feature?.geometry || {}),
  );
}

function areaIdOf(feature) {
  return String(
    feature?.properties?.areaId ||
      feature?.properties?.name ||
      feature?.properties?.metadata?.ag_code ||
      "",
  ).trim();
}

async function fetchAssets(query) {
  const geojson = await getJson(`/api/assets?${params(query)}`);
  return Array.isArray(geojson.features) ? geojson.features : [];
}

async function writeOutput(byId, label) {
  const output = {
    type: "FeatureCollection",
    features: Array.from(byId.values()),
  };

  await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`${label}: wrote ${output.features.length} unique features`);
}

async function main() {
  const byId = new Map();

  console.log("Fetching area polygons...");
  const areas = await fetchAssets({
    businessId: BUSINESS_ID,
    ...UK_BOUNDS,
    assetTypes: "area",
    limit: 10000,
  });

  areas.forEach((feature) => byId.set(featureKey(feature), feature));

  const areaIds = Array.from(new Set(areas.map(areaIdOf).filter(Boolean))).sort();
  console.log(`Found ${areas.length} area features, ${areaIds.length} area ids.`);

  for (const [index, areaId] of areaIds.entries()) {
    const features = await fetchAssets({
      businessId: BUSINESS_ID,
      areaId,
      ...UK_BOUNDS,
      assetTypes: ASSET_TYPES.join(","),
      limit: 10000,
    });

    features.forEach((feature) => byId.set(featureKey(feature), feature));

    if ((index + 1) % CHECKPOINT_EVERY_AREAS === 0 || index === areaIds.length - 1) {
      console.log(
        `Exported ${index + 1}/${areaIds.length} areas, ${byId.size} unique features so far...`,
      );
      await writeOutput(byId, "Checkpoint");
    }
  }

  await writeOutput(byId, "Final export");
  console.log(OUT_FILE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
