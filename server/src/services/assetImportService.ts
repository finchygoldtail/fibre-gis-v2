import crypto from "node:crypto";
import { pool } from "../config/database.js";
import type { GeoJsonFeature, GeoJsonGeometry } from "../types/geojson.js";

export type ImportAssetsArgs = {
  businessId: string;
  projectId?: string | null;
  areaId?: string | null;
  source: string;
  sourceRevision?: string | null;
  sourceFile?: string | null;
  features: GeoJsonFeature[];
  dryRun?: boolean;
};

export type ImportAssetsResult = {
  importRunId?: string;
  read: number;
  valid: number;
  insertedOrUpdated: number;
  skipped: number;
  dryRun: boolean;
  byType: Record<string, number>;
};

type PreparedAsset = {
  id: string;
  businessId: string;
  projectId: string | null;
  areaId: string | null;
  assetType: string;
  assetSubtype: string | null;
  name: string | null;
  status: string | null;
  geometry: GeoJsonGeometry;
  metadata: Record<string, unknown>;
  source: string;
  sourceRevision: string | null;
};

export async function importGeoJsonAssets(args: ImportAssetsArgs): Promise<ImportAssetsResult> {
  const prepared = args.features
    .map((feature) => prepareFeature(feature, args))
    .filter((asset): asset is PreparedAsset => Boolean(asset));

  const byType = prepared.reduce<Record<string, number>>((summary, asset) => {
    summary[asset.assetType] = (summary[asset.assetType] || 0) + 1;
    return summary;
  }, {});

  let importRunId: string | undefined;

  if (!args.dryRun && prepared.length > 0) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const asset of prepared) {
        await client.query(
          `
            INSERT INTO map_assets (
              id,
              business_id,
              project_id,
              area_id,
              asset_type,
              asset_subtype,
              name,
              status,
              geometry,
              metadata,
              source,
              source_revision
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              ST_SetSRID(ST_GeomFromGeoJSON($9), 4326),
              $10::jsonb,
              $11,
              $12
            )
            ON CONFLICT (id) DO UPDATE SET
              business_id = EXCLUDED.business_id,
              project_id = EXCLUDED.project_id,
              area_id = EXCLUDED.area_id,
              asset_type = EXCLUDED.asset_type,
              asset_subtype = EXCLUDED.asset_subtype,
              name = EXCLUDED.name,
              status = EXCLUDED.status,
              geometry = EXCLUDED.geometry,
              metadata = EXCLUDED.metadata,
              source = EXCLUDED.source,
              source_revision = EXCLUDED.source_revision,
              updated_at = NOW()
          `,
          [
            asset.id,
            asset.businessId,
            asset.projectId,
            asset.areaId,
            asset.assetType,
            asset.assetSubtype,
            asset.name,
            asset.status,
            JSON.stringify(asset.geometry),
            JSON.stringify(asset.metadata),
            asset.source,
            asset.sourceRevision,
          ],
        );
      }

      importRunId = crypto.randomUUID();
      await client.query(
        `
          INSERT INTO import_runs (
            id,
            business_id,
            project_id,
            area_id,
            source,
            source_revision,
            source_file,
            read_count,
            valid_count,
            inserted_or_updated_count,
            skipped_count,
            by_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        `,
        [
          importRunId,
          args.businessId,
          args.projectId || null,
          args.areaId || null,
          args.source,
          args.sourceRevision || null,
          args.sourceFile || null,
          args.features.length,
          prepared.length,
          prepared.length,
          args.features.length - prepared.length,
          JSON.stringify(byType),
        ],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    importRunId,
    read: args.features.length,
    valid: prepared.length,
    insertedOrUpdated: args.dryRun ? 0 : prepared.length,
    skipped: args.features.length - prepared.length,
    dryRun: Boolean(args.dryRun),
    byType,
  };
}

function prepareFeature(
  feature: GeoJsonFeature,
  args: ImportAssetsArgs,
): PreparedAsset | null {
  if (!feature || feature.type !== "Feature" || !isSupportedGeometry(feature.geometry)) {
    return null;
  }

  const props = feature.properties || {};
  const externalId = normaliseText(
    feature.id ||
      props.id ||
      props.assetId ||
      props.asset_id ||
      props.globalid ||
      props.GlobalID ||
      props.name ||
      props.Name,
  );
  const id = toStableUuid(`${args.businessId}:${args.source}:${externalId || JSON.stringify(feature.geometry)}`);
  const assetType = normaliseAssetType(
    props.assetType || props.asset_type || props.type || props.layer || props.Layer,
  );

  if (!assetType) return null;

  return {
    id,
    businessId: args.businessId,
    projectId: normaliseText(props.projectId || props.project_id) || args.projectId || null,
    areaId: normaliseText(props.areaId || props.area_id || props.ag || props.AG) || args.areaId || null,
    assetType,
    assetSubtype: normaliseText(props.assetSubtype || props.asset_subtype || props.subtype) || null,
    name: normaliseText(props.name || props.Name || props.label || props.Label) || externalId || null,
    status: normaliseText(props.status || props.Status || props.buildStatus) || null,
    geometry: feature.geometry,
    metadata: props,
    source: args.source,
    sourceRevision: args.sourceRevision || null,
  };
}

function isSupportedGeometry(geometry: GeoJsonGeometry | null | undefined): geometry is GeoJsonGeometry {
  return Boolean(
    geometry &&
      (geometry.type === "Point" ||
        geometry.type === "LineString" ||
        geometry.type === "Polygon" ||
        geometry.type === "MultiPoint" ||
        geometry.type === "MultiLineString" ||
        geometry.type === "MultiPolygon"),
  );
}

function normaliseAssetType(value: unknown): string {
  const raw = normaliseText(value).toLowerCase();
  if (!raw) return "";
  if (raw === "dp" || raw.includes("distribution point")) return "distribution-point";
  if (raw.includes("pole")) return "pole";
  if (raw.includes("chamber")) return "chamber";
  if (raw.includes("feeder")) return "feederCable";
  if (raw.includes("link")) return "linkCable";
  if (raw.includes("drop")) return "drop-cable";
  if (raw.includes("cable") || raw.includes("route")) return "cable";
  if (raw.includes("home") || raw.includes("premise") || raw.includes("property")) return "home";
  if (raw.includes("area") || raw.includes("polygon")) return "area";
  if (raw.includes("street") || raw.includes("cab")) return "street-cab";
  if (raw.includes("joint")) return "joint";
  return raw.replace(/[\s_]+/g, "-");
}

function normaliseText(value: unknown): string {
  return String(value ?? "").trim();
}

function toStableUuid(value: string): string {
  const hash = crypto.createHash("sha1").update(value).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
