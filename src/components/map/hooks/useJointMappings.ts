import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import type { SavedMapAsset } from "../types";

const BUSINESS_ID = "fibre-gis-v2";

async function loadJointMappingRowsForMapAsset(jointId: string): Promise<any[][]> {
  const chunksRef = collection(
    db,
    "businesses",
    BUSINESS_ID,
    "jointMappings",
    jointId,
    "chunks",
  );

  const snapshot = await getDocs(chunksRef);

  return snapshot.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as any;
      let rows: any[][] = [];

      try {
        rows = typeof data.rowsJson === "string" ? JSON.parse(data.rowsJson) : [];
      } catch {
        rows = [];
      }

      return {
        id: chunkDoc.id,
        index:
          typeof data.chunkIndex === "number"
            ? data.chunkIndex
            : Number(String(chunkDoc.id).replace("chunk_", "")),
        rows,
      };
    })
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => (Array.isArray(chunk.rows) ? chunk.rows : []));
}

function hasExternalMappingRows(asset: SavedMapAsset): boolean {
  const item = asset as any;

  return Boolean(
    item.mappingRowsRef ||
      item.mappingRowsCount ||
      item.mappingRowsSummary?.rowCount,
  );
}

export function useJointMappings(operationalSavedJoints: SavedMapAsset[]) {
  const [jointMappingRowsById, setJointMappingRowsById] = useState<
    Record<string, any[][]>
  >({});
  const [isLoadingJointMappings, setIsLoadingJointMappings] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const jointsWithExternalRows = operationalSavedJoints.filter(hasExternalMappingRows);

    if (jointsWithExternalRows.length === 0) {
      setJointMappingRowsById({});
      setIsLoadingJointMappings(false);
      return;
    }

    setIsLoadingJointMappings(true);

    Promise.all(
      jointsWithExternalRows.map(async (asset: any) => {
        try {
          const rows = await loadJointMappingRowsForMapAsset(asset.id);
          return [asset.id, rows] as const;
        } catch (err) {
          console.warn(
            "Failed to hydrate joint mapping rows for map asset",
            asset?.name || asset?.id,
            err,
          );
          return [asset.id, []] as const;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setJointMappingRowsById(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingJointMappings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operationalSavedJoints]);

  const hydratedOperationalSavedJoints = useMemo(
    () =>
      operationalSavedJoints.map((asset: any) => {
        const externalRows = jointMappingRowsById[asset.id];

        if (!Array.isArray(externalRows) || externalRows.length === 0) {
          return asset;
        }

        return {
          ...asset,
          mappingRows: externalRows,
          mappingRowsCount: externalRows.length,
          mappingRowsSummary: {
            ...(asset.mappingRowsSummary || {}),
            rowCount: externalRows.length,
          },
        } as SavedMapAsset;
      }),
    [operationalSavedJoints, jointMappingRowsById],
  );

  return {
    jointMappingRowsById,
    hydratedOperationalSavedJoints,
    isLoadingJointMappings,
  };
}
