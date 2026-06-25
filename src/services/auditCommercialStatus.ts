// =====================================================
// FILE: src/services/auditCommercialStatus.ts
// PURPOSE: Convert saved audit logs into commercial payment blockers.
//          Read-only by default. Uses the existing auditService collections
//          and never writes into map asset chunks.
// =====================================================

import type { AuditLog } from "./auditService";
import { createAssetChangeLog, loadAllAuditLogs, loadAssetAuditLogs } from "./auditService";

export type CommercialPaymentStatus = "approved" | "review" | "blocked" | "unknown";
export type CommercialQualityStatus = "pass" | "advisory" | "fail" | "unknown";

export type CommercialAuditBlocker = {
  assetId: string;
  assetName?: string;
  assetType?: string;
  auditId: string;
  auditType?: string;
  auditTitle?: string;
  contractor?: string;
  qualityStatus: CommercialQualityStatus;
  paymentStatus: CommercialPaymentStatus;
  reason: string;
  comment?: string;
  changedAt: string;
  changedByEmail?: string;
  changedByName?: string;
  latestAudit: AuditLog;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function getAfter(log: AuditLog): any {
  return log.after && typeof log.after === "object" ? (log.after as any) : {};
}

function isAuditFormLog(log: AuditLog): boolean {
  const after = getAfter(log);
  return log.action === "tested" && Boolean(after.auditType || after.auditTitle || after.result);
}

function normaliseResult(value: unknown): CommercialQualityStatus {
  const result = lower(value);
  if (result === "pass" || result === "passed") return "pass";
  if (result === "advisory" || result === "advise" || result === "review") return "advisory";
  if (result === "fail" || result === "failed") return "fail";
  return "unknown";
}

export function paymentStatusForQuality(status: CommercialQualityStatus): CommercialPaymentStatus {
  if (status === "pass") return "approved";
  if (status === "advisory") return "review";
  if (status === "fail") return "blocked";
  return "unknown";
}

function getLatestAuditFormLog(logs: AuditLog[]): AuditLog | null {
  return logs
    .filter(isAuditFormLog)
    .sort((a, b) => text(b.changedAt).localeCompare(text(a.changedAt)))[0] || null;
}

export function buildCommercialBlockerFromLatestAudit(log: AuditLog | null): CommercialAuditBlocker | null {
  if (!log) return null;

  const after = getAfter(log);
  const qualityStatus = normaliseResult(after.result);
  const paymentStatus = paymentStatusForQuality(qualityStatus);

  if (qualityStatus !== "fail" && qualityStatus !== "advisory") return null;

  const auditTitle = text(after.auditTitle) || text(log.reason).replace(/ completed:.*/i, "") || "Audit";
  const auditType = text(after.auditType || log.context) || undefined;
  const contractor = text(after.contractor) || text((after.answers || {}).contractor) || text(log.changedByName) || "Unknown";

  return {
    assetId: log.assetId,
    assetName: log.assetName,
    assetType: log.assetType,
    auditId: log.id,
    auditType,
    auditTitle,
    contractor,
    qualityStatus,
    paymentStatus,
    reason:
      qualityStatus === "fail"
        ? `${auditTitle} failed. Payment should remain blocked until remedial work and re-audit pass.`
        : `${auditTitle} marked advisory. Payment requires review before release.`,
    comment: log.comment,
    changedAt: log.changedAt,
    changedByEmail: log.changedByEmail,
    changedByName: log.changedByName,
    latestAudit: log,
  };
}

export async function loadAssetCommercialBlocker(assetId: string): Promise<CommercialAuditBlocker | null> {
  if (!assetId) return null;
  const logs = await loadAssetAuditLogs(assetId, 100);
  return buildCommercialBlockerFromLatestAudit(getLatestAuditFormLog(logs));
}

export async function loadAllCommercialBlockers(maxResults = 500): Promise<CommercialAuditBlocker[]> {
  const logs = await loadAllAuditLogs(maxResults);
  const latestByAsset = new Map<string, AuditLog>();

  logs.filter(isAuditFormLog).forEach((log) => {
    const existing = latestByAsset.get(log.assetId);
    if (!existing || text(log.changedAt).localeCompare(text(existing.changedAt)) > 0) {
      latestByAsset.set(log.assetId, log);
    }
  });

  return Array.from(latestByAsset.values())
    .map(buildCommercialBlockerFromLatestAudit)
    .filter((blocker): blocker is CommercialAuditBlocker => Boolean(blocker))
    .sort((a, b) => text(b.changedAt).localeCompare(text(a.changedAt)));
}


export async function loadCommercialBlockersForAssets(
  assets: Array<{ id?: string; assetId?: string; name?: string; label?: string } | string>,
  maxResults = 500,
): Promise<CommercialAuditBlocker[]> {
  const seen = new Set<string>();
  const assetIds = assets
    .flatMap((asset) => {
      if (typeof asset === "string") return [asset];
      return [asset?.id, asset?.assetId, asset?.name, asset?.label];
    })
    .map(text)
    .filter(Boolean)
    .filter((assetId) => {
      if (seen.has(assetId)) return false;
      seen.add(assetId);
      return true;
    })
    .slice(0, maxResults);

  const blockers: CommercialAuditBlocker[] = [];
  const batchSize = 25;

  for (let index = 0; index < assetIds.length; index += batchSize) {
    const batch = assetIds.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (assetId) => {
        try {
          return await loadAssetCommercialBlocker(assetId);
        } catch (err) {
          console.warn(`Commercial blocker lookup failed for ${assetId}`, err);
          return null;
        }
      }),
    );

    results.forEach((blocker) => {
      if (blocker) blockers.push(blocker);
    });
  }

  return blockers.sort((a, b) => text(b.changedAt).localeCompare(text(a.changedAt)));
}

export async function createCommercialReleaseLog(args: {
  projectId?: string | null;
  asset: any;
  reason: string;
  comment?: string;
}) {
  return createAssetChangeLog({
    projectId: args.projectId,
    asset: args.asset,
    action: "updated",
    reason: args.reason || "Commercial payment status reviewed",
    comment: args.comment,
    context: "commercial-payment-review",
    after: {
      commercialReview: true,
      paymentStatus: "reviewed",
      reviewedAt: new Date().toISOString(),
    },
  });
}
