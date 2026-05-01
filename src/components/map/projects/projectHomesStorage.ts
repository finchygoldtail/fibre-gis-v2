import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import type { SavedMapAsset } from "../types";

const CHUNK_SIZE = 250;

function safeProjectDocId(projectId: string): string {
  return String(projectId || "unknown-project").replace(/\//g, "_");
}

function chunksCollection(projectId: string) {
  return collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "projectHomes",
    safeProjectDocId(projectId),
    "chunks"
  );
}

export async function loadProjectHomes(projectId: string): Promise<SavedMapAsset[]> {
  const snap = await getDocs(chunksCollection(projectId));

  const chunks = snap.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as { chunkIndex?: number; homesJson?: string };
      return {
        chunkIndex: Number(data.chunkIndex ?? 0),
        homesJson: String(data.homesJson || "[]"),
      };
    })
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  return chunks.flatMap((chunk) => {
    try {
      const homes = JSON.parse(chunk.homesJson);
      return Array.isArray(homes) ? (homes as SavedMapAsset[]) : [];
    } catch {
      return [];
    }
  });
}

export async function saveProjectHomes(
  projectId: string,
  homes: SavedMapAsset[]
): Promise<number> {
  const cleanedHomes = homes.map((home) => ({
    ...home,
    assetType: "home",
    projectId,
    mappingRows: [],
  }));

  const chunks: SavedMapAsset[][] = [];
  for (let i = 0; i < cleanedHomes.length; i += CHUNK_SIZE) {
    chunks.push(cleanedHomes.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((homesChunk, chunkIndex) =>
      setDoc(doc(chunksCollection(projectId), `chunk_${chunkIndex}`), {
        chunkIndex,
        homesJson: JSON.stringify(homesChunk),
        count: homesChunk.length,
        updatedAt: new Date().toISOString(),
      })
    )
  );

  return cleanedHomes.length;
}
