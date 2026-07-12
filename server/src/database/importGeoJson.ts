import fs from "node:fs/promises";
import path from "node:path";
import { closeDatabasePool } from "../config/database.js";
import { importGeoJsonAssets } from "../services/assetImportService.js";
import type { GeoJsonFeature } from "../types/geojson.js";

type CliArgs = {
  file: string;
  businessId: string;
  projectId?: string;
  areaId?: string;
  source: string;
  sourceRevision?: string;
  dryRun: boolean;
};

async function importGeoJson(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(args.file);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const features = getFeatures(parsed);

  const result = await importGeoJsonAssets({
    businessId: args.businessId,
    projectId: args.projectId,
    areaId: args.areaId,
    source: args.source,
    sourceRevision: args.sourceRevision,
    sourceFile: path.basename(filePath),
    dryRun: args.dryRun,
    features,
  });

  console.log(JSON.stringify(result, null, 2));
}

function getFeatures(parsed: unknown): GeoJsonFeature[] {
  const item = parsed as any;
  if (item?.type === "FeatureCollection" && Array.isArray(item.features)) {
    return item.features as GeoJsonFeature[];
  }
  if (item?.type === "Feature") {
    return [item as GeoJsonFeature];
  }
  if (Array.isArray(item)) {
    return item as GeoJsonFeature[];
  }
  throw new Error("Expected GeoJSON FeatureCollection, Feature, or Feature array");
}

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    if (key === "dry-run") {
      values.set(key, true);
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
    index += 1;
  }

  const file = getRequired(values, "file");
  const businessId = getRequired(values, "business-id");

  return {
    file,
    businessId,
    projectId: getOptional(values, "project-id"),
    areaId: getOptional(values, "area-id"),
    source: getOptional(values, "source") || "geojson-import",
    sourceRevision: getOptional(values, "source-revision"),
    dryRun: values.get("dry-run") === true,
  };
}

function getRequired(values: Map<string, string | boolean>, key: string): string {
  const value = getOptional(values, key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function getOptional(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

importGeoJson()
  .then(async () => {
    await closeDatabasePool();
  })
  .catch(async (err) => {
    console.error("GeoJSON import failed", err);
    await closeDatabasePool();
    process.exit(1);
  });
