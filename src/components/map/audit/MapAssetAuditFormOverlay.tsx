import React from "react";
import AuditFormEngine from "../../audits/AuditFormEngine";
import AuditModal from "../../audits/AuditModal";
import {
  chamberAuditTemplate,
  jointAuditTemplate,
  poleAuditTemplate,
} from "../../audits/auditTemplates";
import { createAuditFormLog } from "../../../services/auditService";
import type { SavedMapAsset } from "../types";
import type { AuditTemplate } from "../../audits/AuditFormEngine";

type Props = {
  asset: SavedMapAsset | null;
  areaName?: string | null;
  projectId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

function templateForAsset(asset: SavedMapAsset | null): AuditTemplate | null {
  const type = String(
    (asset as any)?.assetType || (asset as any)?.type || (asset as any)?.jointType || "",
  ).toLowerCase();

  if (type.includes("pole")) return poleAuditTemplate;
  if (type.includes("chamber")) return chamberAuditTemplate;
  if (type.includes("joint") || type.includes("cmj") || type.includes("lmj")) return jointAuditTemplate;

  return null;
}

function getAssetName(asset: SavedMapAsset): string {
  return String((asset as any).name || (asset as any).label || asset.id || "Selected asset");
}

export default function MapAssetAuditFormOverlay({
  asset,
  areaName,
  projectId,
  onClose,
  onSaved,
}: Props) {
  const template = templateForAsset(asset);

  if (!asset || !template) return null;

  const assetName = getAssetName(asset);

  return (
    <AuditModal open title={template.title} onClose={onClose}>
      <AuditFormEngine
        template={template}
        assetId={asset.id}
        assetName={assetName}
        areaName={areaName || "Selected area"}
        onClose={onClose}
        onSave={async (audit) => {
          await createAuditFormLog({
            projectId,
            asset,
            auditType: audit.auditType,
            auditTitle: template.title,
            result: audit.result,
            contractor: audit.contractor,
            answers: audit.answers || {},
            comments: audit.comments,
            signature: audit.signature,
            photos: audit.photos || [],
          });
          onSaved?.();
          onClose();
        }}
      />
    </AuditModal>
  );
}
