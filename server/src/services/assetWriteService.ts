import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import type { WritableMapAsset, AssetWriteActor } from "../types/assets.js";
import type { GeoJsonFeature, GeoJsonGeometry } from "../types/geojson.js";

type AssetRow = {
  id: string;
  business_id: string;
  project_id: string | null;
  area_id: string | null;
  asset_type: string;
  asset_subtype: string | null;
  name: string | null;
  status: string | null;
  metadata: Record<string, unknown>;
  source: string | null;
  source_revision: string | null;
  geometry: GeoJsonGeometry;
  created_at: Date;
  updated_at: Date;
};

type AssetWriteOptions = {
  actor?: AssetWriteActor;
  reason?: string | null;
};

type WipeMapDataOptions = AssetWriteOptions & {
  includeExchangeRecords?: boolean;
  includeJointMappingRecords?: boolean;
};

const EXCHANGE_RECORD_TYPES = [
  "exchange",
  "exchange-olt",
  "exchange-hd-splitter-panel",
  "exchange-feeder-panel",
] as const;

const JOINT_MAPPING_RECORD_TYPES = [
  "joint-mapping",
  "joint-mapping-chunk",
] as const;

export async function upsertMapAsset(
  input: WritableMapAsset,
  options: AssetWriteOptions = {},
): Promise<GeoJsonFeature> {
  const asset = normaliseWritableAsset(input);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const before = await getAssetRow(client, asset.id, asset.businessId);
    const result = await client.query<AssetRow>(
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
        RETURNING
          id::text,
          business_id,
          project_id,
          area_id,
          asset_type,
          asset_subtype,
          name,
          status,
          metadata,
          source,
          source_revision,
          ST_AsGeoJSON(geometry)::json AS geometry,
          created_at,
          updated_at
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

    const after = result.rows[0];
    await insertAuditLog(client, {
      assetId: asset.id,
      businessId: asset.businessId,
      action: before ? "update" : "create",
      actor: options.actor,
      before,
      after,
      reason: options.reason,
    });

    await client.query("COMMIT");
    return rowToFeature(after);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMapAsset(
  businessId: string,
  assetId: string,
  options: AssetWriteOptions = {},
): Promise<{ deleted: true; id: string }> {
  const id = normaliseUuid(assetId, "asset id");
  const cleanBusinessId = normaliseRequiredText(businessId, "businessId");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const before = await getAssetRow(client, id, cleanBusinessId);
    if (!before) throw new HttpError(404, "Asset not found");

    await client.query("DELETE FROM map_assets WHERE id = $1 AND business_id = $2", [
      id,
      cleanBusinessId,
    ]);

    await insertAuditLog(client, {
      assetId: id,
      businessId: cleanBusinessId,
      action: "delete",
      actor: options.actor,
      before,
      after: null,
      reason: options.reason,
    });

    await client.query("COMMIT");
    return { deleted: true, id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function wipeMapData(
  businessId: string,
  options: WipeMapDataOptions = {},
): Promise<{
  deleted: true;
  businessId: string;
  mapAssetsDeleted: number;
  appRecordsDeleted: number;
  recordTypesDeleted: string[];
}> {
  const cleanBusinessId = normaliseRequiredText(businessId, "businessId");
  const recordTypes = [
    ...(options.includeExchangeRecords === false ? [] : EXCHANGE_RECORD_TYPES),
    ...(options.includeJointMappingRecords === false ? [] : JOINT_MAPPING_RECORD_TYPES),
  ];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const mapAssetResult = await client.query<{ id: string }>(
      `
        DELETE FROM map_assets
        WHERE business_id = $1
        RETURNING id::text
      `,
      [cleanBusinessId],
    );

    const appRecordResult = recordTypes.length
      ? await client.query<{ id: string }>(
          `
            DELETE FROM app_records
            WHERE business_id = $1
              AND record_type = ANY($2::text[])
            RETURNING id::text
          `,
          [cleanBusinessId, recordTypes],
        )
      : { rowCount: 0 };

    await insertAuditLog(client, {
      assetId: null,
      businessId: cleanBusinessId,
      action: "bulk-delete",
      actor: options.actor,
      before: {
        mapAssetsDeleted: mapAssetResult.rowCount ?? 0,
        appRecordsDeleted: appRecordResult.rowCount ?? 0,
        recordTypesDeleted: recordTypes,
      },
      after: null,
      reason: options.reason,
    });

    await client.query("COMMIT");
    return {
      deleted: true,
      businessId: cleanBusinessId,
      mapAssetsDeleted: mapAssetResult.rowCount ?? 0,
      appRecordsDeleted: appRecordResult.rowCount ?? 0,
      recordTypesDeleted: [...recordTypes],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function normaliseWritableAsset(input: WritableMapAsset): Required<WritableMapAsset> {
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "Asset payload is required");
  }

  if (!isSupportedGeometry(input.geometry)) {
    throw new HttpError(400, "Asset geometry must be Point, LineString, Polygon, MultiPoint, MultiLineString, or MultiPolygon");
  }

  const id = input.id ? normaliseUuid(input.id, "asset id") : crypto.randomUUID();

  return {
    id,
    businessId: normaliseRequiredText(input.businessId, "businessId"),
    projectId: normaliseOptionalText(input.projectId),
    areaId: normaliseOptionalText(input.areaId),
    assetType: normaliseRequiredText(input.assetType, "assetType"),
    assetSubtype: normaliseOptionalText(input.assetSubtype),
    name: normaliseOptionalText(input.name),
    status: normaliseOptionalText(input.status),
    geometry: input.geometry,
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
    source: normaliseOptionalText(input.source) || "postgis-api",
    sourceRevision: normaliseOptionalText(input.sourceRevision),
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

function normaliseRequiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new HttpError(400, `${field} is required`);
  return text;
}

function normaliseOptionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normaliseUuid(value: string, field: string): string {
  const text = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new HttpError(400, `${field} must be a UUID`);
  }
  return text;
}

async function getAssetRow(
  client: PoolClient,
  id: string,
  businessId: string,
): Promise<AssetRow | null> {
  const result = await client.query<AssetRow>(
    `
      SELECT
        id::text,
        business_id,
        project_id,
        area_id,
        asset_type,
        asset_subtype,
        name,
        status,
        metadata,
        source,
        source_revision,
        ST_AsGeoJSON(geometry)::json AS geometry,
        created_at,
        updated_at
      FROM map_assets
      WHERE id = $1 AND business_id = $2
      LIMIT 1
    `,
    [id, businessId],
  );

  return result.rows[0] || null;
}

async function insertAuditLog(
  client: PoolClient,
  args: {
    assetId: string | null;
    businessId: string;
    action: "create" | "update" | "delete" | "bulk-delete";
    actor?: AssetWriteActor;
    before: AssetRow | Record<string, unknown> | null;
    after: AssetRow | Record<string, unknown> | null;
    reason?: string | null;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO asset_audit_logs (
        id,
        asset_id,
        business_id,
        action,
        actor_uid,
        actor_email,
        before_asset,
        after_asset,
        reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
    `,
    [
      crypto.randomUUID(),
      args.assetId,
      args.businessId,
      args.action,
      args.actor?.uid || null,
      args.actor?.email || null,
      args.before ? JSON.stringify(toAuditPayload(args.before)) : null,
      args.after ? JSON.stringify(toAuditPayload(args.after)) : null,
      normaliseOptionalText(args.reason),
    ],
  );
}

function toAuditPayload(value: AssetRow | Record<string, unknown>) {
  return isAssetRow(value) ? rowToFeature(value) : value;
}

function isAssetRow(value: AssetRow | Record<string, unknown>): value is AssetRow {
  return (
    value &&
    typeof value === "object" &&
    "business_id" in value &&
    "asset_type" in value &&
    "geometry" in value
  );
}

function rowToFeature(row: AssetRow): GeoJsonFeature {
  return {
    type: "Feature",
    id: row.id,
    geometry: row.geometry,
    properties: {
      businessId: row.business_id,
      projectId: row.project_id,
      areaId: row.area_id,
      assetType: row.asset_type,
      assetSubtype: row.asset_subtype,
      name: row.name,
      status: row.status,
      source: row.source,
      sourceRevision: row.source_revision,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}
