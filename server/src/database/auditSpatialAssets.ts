import { pool } from "../config/database.js";

type CliArgs = {
  businessId: string;
  areaId?: string;
};

async function auditSpatialAssets(args: CliArgs) {
  const params = [args.businessId, args.areaId || null];

  const [byType, byGeometry, invalid, recentImports] = await Promise.all([
    pool.query(
      `
        SELECT asset_type, COUNT(*)::int AS count
        FROM map_assets
        WHERE business_id = $1
          AND ($2::text IS NULL OR area_id = $2)
        GROUP BY asset_type
        ORDER BY count DESC, asset_type
      `,
      params,
    ),
    pool.query(
      `
        SELECT asset_type, ST_GeometryType(geometry) AS geometry_type, COUNT(*)::int AS count
        FROM map_assets
        WHERE business_id = $1
          AND ($2::text IS NULL OR area_id = $2)
        GROUP BY asset_type, ST_GeometryType(geometry)
        ORDER BY asset_type, geometry_type
      `,
      params,
    ),
    pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE geometry IS NULL)::int AS null_geometry,
          COUNT(*) FILTER (WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry))::int AS invalid_geometry,
          COUNT(*)::int AS total
        FROM map_assets
        WHERE business_id = $1
          AND ($2::text IS NULL OR area_id = $2)
      `,
      params,
    ),
    pool.query(
      `
        SELECT
          id::text,
          area_id,
          source,
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
        LIMIT 5
      `,
      params,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        businessId: args.businessId,
        areaId: args.areaId || null,
        totals: invalid.rows[0] || { total: 0, null_geometry: 0, invalid_geometry: 0 },
        byType: byType.rows,
        byGeometry: byGeometry.rows,
        recentImports: recentImports.rows,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1];
    if (!key.startsWith("--")) continue;
    values.set(key.slice(2), next && !next.startsWith("--") ? next : "true");
  }

  return {
    businessId: values.get("business-id") || "fibre-gis-v2",
    areaId: values.get("area-id") || undefined,
  };
}

auditSpatialAssets(parseArgs(process.argv.slice(2)))
  .catch((err) => {
    console.error("Spatial asset audit failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
