import { pool } from "../config/database.js";
import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry } from "../types/geojson.js";

export type AssetBoundsQuery = {
  businessId: string;
  projectId?: string;
  areaId?: string;
  assetTypes: string[];
  source?: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  zoom: number | null;
  limit: number;
};

export type AssetStatsQuery = {
  businessId: string;
  projectId?: string;
  areaId?: string;
  minLng?: number;
  minLat?: number;
  maxLng?: number;
  maxLat?: number;
};

export type ImportRunsQuery = {
  businessId: string;
  areaId?: string;
  limit: number;
};

export type AssetAuditQuery = {
  businessId: string;
  assetId: string;
  limit: number;
};

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
};

type AssetAuditRow = {
  id: string;
  asset_id: string;
  business_id: string;
  action: string;
  actor_uid: string | null;
  actor_email: string | null;
  before_asset: Record<string, unknown> | null;
  after_asset: Record<string, unknown> | null;
  reason: string | null;
  created_at: Date;
};

const MAX_LIMIT = 10_000;
const DEFAULT_LIMIT = 1_000;

export function normaliseLimit(limit: number | null): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export async function queryAssetsByBounds(
  query: AssetBoundsQuery,
): Promise<GeoJsonFeatureCollection> {
  const startedAt = performance.now();
  const sql = `
    WITH bounds AS (
      SELECT ST_MakeEnvelope($4, $5, $6, $7, 4326) AS geom
    )
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
      ST_AsGeoJSON(map_assets.geometry)::json AS geometry
    FROM map_assets, bounds
    WHERE business_id = $1
      AND ($2::text IS NULL OR project_id = $2)
      AND ($3::text IS NULL OR area_id = $3 OR area_id IS NULL)
      AND ($8::text IS NULL OR source = $8)
      AND (array_length($9::text[], 1) IS NULL OR asset_type = ANY($9::text[]))
      AND map_assets.geometry && bounds.geom
      AND ST_Intersects(map_assets.geometry, bounds.geom)
    ORDER BY asset_type, name NULLS LAST, id
    LIMIT $10
  `;

  const result = await pool.query<AssetRow>(sql, [
    query.businessId,
    query.projectId ?? null,
    query.areaId ?? null,
    query.minLng,
    query.minLat,
    query.maxLng,
    query.maxLat,
    query.source ?? null,
    query.assetTypes,
    query.limit + 1,
  ]);

  const truncated = result.rows.length > query.limit;
  const rows = truncated ? result.rows.slice(0, query.limit) : result.rows;

  return {
    type: "FeatureCollection",
    features: rows.map(rowToFeature),
    meta: {
      count: rows.length,
      zoom: query.zoom,
      truncated,
      limit: query.limit,
      queryMs: Math.round((performance.now() - startedAt) * 10) / 10,
    },
  };
}

export async function queryAssetStats(query: AssetStatsQuery) {
  const startedAt = performance.now();
  const hasBounds =
    Number.isFinite(query.minLng) &&
    Number.isFinite(query.minLat) &&
    Number.isFinite(query.maxLng) &&
    Number.isFinite(query.maxLat);

  const result = await pool.query<{
    asset_type: string;
    count: string;
  }>(
    `
      WITH bounds AS (
        SELECT CASE
          WHEN $4::double precision IS NULL THEN NULL
          ELSE ST_MakeEnvelope($4, $5, $6, $7, 4326)
        END AS geom
      )
      SELECT asset_type, COUNT(*)::text AS count
      FROM map_assets, bounds
      WHERE business_id = $1
        AND ($2::text IS NULL OR project_id = $2)
        AND ($3::text IS NULL OR area_id = $3 OR area_id IS NULL)
        AND (
          bounds.geom IS NULL OR (
            map_assets.geometry && bounds.geom
            AND ST_Intersects(map_assets.geometry, bounds.geom)
          )
        )
      GROUP BY asset_type
      ORDER BY asset_type
    `,
    [
      query.businessId,
      query.projectId ?? null,
      query.areaId ?? null,
      hasBounds ? query.minLng : null,
      hasBounds ? query.minLat : null,
      hasBounds ? query.maxLng : null,
      hasBounds ? query.maxLat : null,
    ],
  );

  const byType = result.rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.asset_type] = Number(row.count);
    return summary;
  }, {});

  return {
    businessId: query.businessId,
    projectId: query.projectId ?? null,
    areaId: query.areaId ?? null,
    bounded: hasBounds,
    total: Object.values(byType).reduce((sum, count) => sum + count, 0),
    byType,
    queryMs: Math.round((performance.now() - startedAt) * 10) / 10,
  };
}

export async function queryImportRuns(query: ImportRunsQuery) {
  const result = await pool.query<{
    id: string;
    business_id: string;
    project_id: string | null;
    area_id: string | null;
    source: string;
    source_revision: string | null;
    source_file: string | null;
    read_count: number;
    valid_count: number;
    inserted_or_updated_count: number;
    skipped_count: number;
    by_type: Record<string, number>;
    created_at: Date;
  }>(
    `
      SELECT
        id::text,
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
        by_type,
        created_at
      FROM import_runs
      WHERE business_id = $1
        AND ($2::text IS NULL OR area_id = $2)
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [query.businessId, query.areaId ?? null, query.limit],
  );

  return {
    businessId: query.businessId,
    areaId: query.areaId ?? null,
    count: result.rows.length,
    runs: result.rows.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      projectId: row.project_id,
      areaId: row.area_id,
      source: row.source,
      sourceRevision: row.source_revision,
      sourceFile: row.source_file,
      read: row.read_count,
      valid: row.valid_count,
      insertedOrUpdated: row.inserted_or_updated_count,
      skipped: row.skipped_count,
      byType: row.by_type ?? {},
      createdAt: row.created_at,
    })),
  };
}

export async function queryAssetAuditLogs(query: AssetAuditQuery) {
  const result = await pool.query<AssetAuditRow>(
    `
      SELECT
        id::text,
        asset_id::text,
        business_id,
        action,
        actor_uid,
        actor_email,
        before_asset,
        after_asset,
        reason,
        created_at
      FROM asset_audit_logs
      WHERE business_id = $1
        AND asset_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [query.businessId, query.assetId, query.limit],
  );

  return {
    businessId: query.businessId,
    assetId: query.assetId,
    count: result.rows.length,
    logs: result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      businessId: row.business_id,
      action: row.action,
      actorUid: row.actor_uid,
      actorEmail: row.actor_email,
      beforeAsset: row.before_asset,
      afterAsset: row.after_asset,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
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
    },
  };
}
