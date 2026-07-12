import crypto from "node:crypto";
import { pool } from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";

export type RecordQuery = {
  businessId: string;
  recordType: string;
  parentType?: string | null;
  parentId?: string | null;
  limit: number;
};

export type WritableRecord = {
  businessId: string;
  recordType: string;
  recordId: string;
  parentType?: string | null;
  parentId?: string | null;
  data: Record<string, unknown>;
};

type AppRecordRow = {
  id: string;
  business_id: string;
  record_type: string;
  record_id: string;
  parent_type: string | null;
  parent_id: string | null;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export async function queryRecords(query: RecordQuery) {
  const result = await pool.query<AppRecordRow>(
    `
      SELECT
        id::text,
        business_id,
        record_type,
        record_id,
        parent_type,
        parent_id,
        data,
        created_at,
        updated_at
      FROM app_records
      WHERE business_id = $1
        AND record_type = $2
        AND ($3::text IS NULL OR parent_type = $3)
        AND ($4::text IS NULL OR parent_id = $4)
      ORDER BY updated_at DESC, record_id
      LIMIT $5
    `,
    [
      normaliseRequiredText(query.businessId, "businessId"),
      normaliseRequiredText(query.recordType, "recordType"),
      normaliseOptionalText(query.parentType),
      normaliseOptionalText(query.parentId),
      query.limit,
    ],
  );

  return {
    businessId: query.businessId,
    recordType: query.recordType,
    count: result.rows.length,
    records: result.rows.map(rowToRecord),
  };
}

export async function getRecord(
  businessId: string,
  recordType: string,
  recordId: string,
) {
  const result = await pool.query<AppRecordRow>(
    `
      SELECT
        id::text,
        business_id,
        record_type,
        record_id,
        parent_type,
        parent_id,
        data,
        created_at,
        updated_at
      FROM app_records
      WHERE business_id = $1
        AND record_type = $2
        AND record_id = $3
      LIMIT 1
    `,
    [
      normaliseRequiredText(businessId, "businessId"),
      normaliseRequiredText(recordType, "recordType"),
      normaliseRequiredText(recordId, "recordId"),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Record not found");
  return rowToRecord(row);
}

export async function upsertRecord(input: WritableRecord) {
  const record = normaliseWritableRecord(input);
  const result = await pool.query<AppRecordRow>(
    `
      INSERT INTO app_records (
        id,
        business_id,
        record_type,
        record_id,
        parent_type,
        parent_id,
        data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (business_id, record_type, record_id) DO UPDATE SET
        parent_type = EXCLUDED.parent_type,
        parent_id = EXCLUDED.parent_id,
        data = EXCLUDED.data,
        updated_at = NOW()
      RETURNING
        id::text,
        business_id,
        record_type,
        record_id,
        parent_type,
        parent_id,
        data,
        created_at,
        updated_at
    `,
    [
      crypto.randomUUID(),
      record.businessId,
      record.recordType,
      record.recordId,
      record.parentType,
      record.parentId,
      JSON.stringify(record.data),
    ],
  );

  return rowToRecord(result.rows[0]);
}

export async function deleteRecord(
  businessId: string,
  recordType: string,
  recordId: string,
) {
  const result = await pool.query<{ record_id: string }>(
    `
      DELETE FROM app_records
      WHERE business_id = $1
        AND record_type = $2
        AND record_id = $3
      RETURNING record_id
    `,
    [
      normaliseRequiredText(businessId, "businessId"),
      normaliseRequiredText(recordType, "recordType"),
      normaliseRequiredText(recordId, "recordId"),
    ],
  );

  if (!result.rows[0]) throw new HttpError(404, "Record not found");
  return { deleted: true, recordId: result.rows[0].record_id };
}

function normaliseWritableRecord(input: WritableRecord): WritableRecord {
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "Record payload is required");
  }

  return {
    businessId: normaliseRequiredText(input.businessId, "businessId"),
    recordType: normaliseRequiredText(input.recordType, "recordType"),
    recordId: normaliseRequiredText(input.recordId, "recordId"),
    parentType: normaliseOptionalText(input.parentType),
    parentId: normaliseOptionalText(input.parentId),
    data:
      input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? input.data
        : {},
  };
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

function rowToRecord(row: AppRecordRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    recordType: row.record_type,
    recordId: row.record_id,
    parentType: row.parent_type,
    parentId: row.parent_id,
    data: row.data ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
