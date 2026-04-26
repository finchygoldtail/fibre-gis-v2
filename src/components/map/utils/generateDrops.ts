import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../firebase";

const MAX_OH_DROP_DISTANCE_METERS = 65;

function getDistanceMeters(a: any, b: any): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function generateDropsFromDP(
  dp: any,
  homes: any[]
) {
  if (dp.assetType !== "distribution-point") {
    console.warn("Not a distribution point");
    return { created: 0, skipped: homes.length };
  }

  let created = 0;
  let skipped = 0;

  for (const home of homes) {
    if (!home.lat || !home.lng) continue;

    const distance = getDistanceMeters(
      { lat: dp.lat, lng: dp.lng },
      { lat: home.lat, lng: home.lng }
    );

    if (distance > MAX_OH_DROP_DISTANCE_METERS) {
      skipped++;
      continue;
    }

    await addDoc(collection(db, "projects/main-network/cables"), {
      assetType: "cable",
      cableType: "Drop",
      installMethod: "OH",

      geometry: {
        type: "LineString",
        coordinates: [
          [dp.lat, dp.lng],
          [home.lat, home.lng],
        ],
      },

      fromAssetId: dp.id,
      toAssetId: home.id,

      lengthMeters: distance,

      createdBy: auth.currentUser?.uid,
      createdByEmail: auth.currentUser?.email,
      createdAt: serverTimestamp(),
    });

    created++;
  }

  return { created, skipped };
}