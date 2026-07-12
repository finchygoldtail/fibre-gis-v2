import { collection, getDocs } from "firebase/firestore";

import { db } from "../../../firebase";
import { spatialApiConfig } from "../../../services/spatialApi/spatialApiConfig";
import { loadJointMappingRowsFromPostgisRecords } from "../../../services/spatialApi/jointMappingRecordStorage";

export type MappingRowsByAssetId = Record<string, any[][]>;

type MappingChunkDoc = {
  rowsJson?: string;
  rows?: any[];
  chunkIndex?: number;
};

function safeJsonParse(value: unknown, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function loadJointMappingRowsFromFirestore(
  jointId: string,
): Promise<any[][]> {
  if (spatialApiConfig.postgisOnly) {
    return loadJointMappingRowsFromPostgisRecords(jointId);
  }

  const chunksRef = collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "jointMappings",
    jointId,
    "chunks",
  );

  const snapshot = await getDocs(chunksRef);

  return snapshot.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as MappingChunkDoc;

      let rows: any[] = [];

      // Current shared format: JSON string, avoids Firestore nested-array errors.
      if (typeof data.rowsJson === "string") {
        rows = safeJsonParse(data.rowsJson, []);
      }

      // Backwards compatibility with earlier test formats.
      if (!rows.length && Array.isArray(data.rows)) {
        rows = data.rows.map((row: any) =>
          Array.isArray(row)
            ? row
            : Array.isArray(row?.values)
              ? row.values
              : row,
        );
      }

      return {
        id: chunkDoc.id,
        index:
          typeof data.chunkIndex === "number"
            ? data.chunkIndex
            : Number(chunkDoc.id.replace("chunk_", "")),
        rows: Array.isArray(rows) ? rows : [],
      };
    })
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => chunk.rows)
    .filter((row) => Array.isArray(row));
}
