import { auth } from "../../firebase";
import {
  deleteSpatialRecord,
  listSpatialRecords,
  saveSpatialRecord,
} from "./spatialRecordService";

const JOINT_MAPPING_RECORD = "joint-mapping";
const JOINT_MAPPING_CHUNK_RECORD = "joint-mapping-chunk";
const JOINT_MAPPING_CHUNK_SIZE = 250;

type JointMappingChunkData = {
  chunkIndex?: number;
  rowsJson?: string;
};

export async function saveJointMappingRowsToPostgisRecords(jointId: string, rows: any[][]) {
  const existingChunks = await listSpatialRecords<JointMappingChunkData>(
    JOINT_MAPPING_CHUNK_RECORD,
    {
      parentType: JOINT_MAPPING_RECORD,
      parentId: jointId,
      limit: 10000,
    },
  );

  await Promise.all(
    existingChunks.map((record) =>
      deleteSpatialRecord(JOINT_MAPPING_CHUNK_RECORD, record.recordId),
    ),
  );

  const chunks: any[][][] = [];
  for (let i = 0; i < rows.length; i += JOINT_MAPPING_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + JOINT_MAPPING_CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((chunkRows, index) =>
      saveSpatialRecord(
        JOINT_MAPPING_CHUNK_RECORD,
        jointMappingChunkId(jointId, index),
        {
          chunkIndex: index,
          rowsJson: JSON.stringify(chunkRows),
        },
        {
          parentType: JOINT_MAPPING_RECORD,
          parentId: jointId,
        },
      ),
    ),
  );

  await saveSpatialRecord(JOINT_MAPPING_RECORD, jointId, {
    jointId,
    rowCount: rows.length,
    chunkCount: chunks.length,
    updatedAt: new Date().toISOString(),
    updatedByUid: auth.currentUser?.uid || "unknown",
    updatedByEmail: auth.currentUser?.email || "unknown",
  });
}

export async function loadJointMappingRowsFromPostgisRecords(
  jointId: string,
): Promise<any[][]> {
  const chunks = await listSpatialRecords<JointMappingChunkData>(
    JOINT_MAPPING_CHUNK_RECORD,
    {
      parentType: JOINT_MAPPING_RECORD,
      parentId: jointId,
      limit: 10000,
    },
  );

  return chunks
    .map((record) => ({
      id: record.recordId,
      index:
        typeof record.data.chunkIndex === "number"
          ? record.data.chunkIndex
          : Number(record.recordId.split("chunk_").pop()),
      rows: safeJsonParse(record.data.rowsJson, []),
    }))
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => (Array.isArray(chunk.rows) ? chunk.rows : []))
    .filter((row) => Array.isArray(row));
}

function jointMappingChunkId(jointId: string, index: number): string {
  return `${jointId}:chunk_${String(index).padStart(5, "0")}`;
}

function safeJsonParse(value: unknown, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
