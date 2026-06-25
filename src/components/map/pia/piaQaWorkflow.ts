import L from "leaflet";
import type { SavedMapAsset } from "../types";
import type { PiaQaStatus } from "./piaQaTypes";
import { getPiaQaStatusMeta } from "./piaQaTypes";

export function isPiaQaAsset(asset: SavedMapAsset | null | undefined): boolean {
  return asset?.assetType === "pole" || asset?.assetType === "chamber";
}

export function getPiaQaDetails(asset: SavedMapAsset | null | undefined) {
  if (!asset) return undefined;
  return asset.assetType === "pole"
    ? asset.poleDetails?.piaQa
    : asset.assetType === "chamber"
      ? asset.chamberDetails?.piaQa
      : undefined;
}

export function getPiaQaStatusForAsset(asset: SavedMapAsset): PiaQaStatus {
  const explicit = getPiaQaDetails(asset)?.status;
  if (explicit) return explicit;

  const photos =
    asset.assetType === "pole"
      ? asset.poleDetails?.photos
      : asset.assetType === "chamber"
        ? asset.chamberDetails?.photos
        : [];

  return Array.isArray(photos) && photos.length > 0
    ? "photos_uploaded"
    : "not_started";
}

export function isPiaQaModeEnabled(layers: Record<string, any>): boolean {
  return layers.piaContractorView === true || layers.piaQaView === true;
}

export function shouldShowAssetForPiaQaFilters(
  asset: SavedMapAsset,
  layers: Record<string, any>,
): boolean {
  if (!isPiaQaAsset(asset)) return true;
  if (!isPiaQaModeEnabled(layers)) return true;

  const status = getPiaQaStatusForAsset(asset);

  if (status === "not_started" && layers.piaNotStarted === false) return false;
  if (status === "photos_uploaded" && layers.piaPhotosUploaded === false) return false;
  if (status === "contractor_pass" && layers.piaContractorPass === false) return false;
  if (status === "please_review" && layers.piaPleaseReview === false) return false;
  if (status === "pia_pass" && layers.piaPass === false) return false;
  if (status === "pia_fail" && layers.piaFail === false) return false;

  return true;
}

function createPiaQaIcon(shape: "circle" | "square", status: PiaQaStatus) {
  const meta = getPiaQaStatusMeta(status);
  const radius = shape === "circle" ? "50%" : "3px";
  const label = meta.shortLabel;

  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${meta.colour};
        border: 2px solid #ffffff;
        border-radius: ${radius};
        box-sizing: border-box;
        display: grid;
        place-items: center;
        color: #ffffff;
        font-size: 9px;
        font-weight: 900;
        box-shadow: 0 2px 9px rgba(15,23,42,0.45);
      ">${label}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

export function getPiaQaIconForAsset(asset: SavedMapAsset) {
  const status = getPiaQaStatusForAsset(asset);
  return createPiaQaIcon(asset.assetType === "pole" ? "circle" : "square", status);
}

export function getPiaQaStatusLabel(asset: SavedMapAsset): string {
  return getPiaQaStatusMeta(getPiaQaStatusForAsset(asset)).label;
}
