import React from 'react';
import {
  EngineeringDocumentType,
  EngineeringQueueStatus,
} from './engineeringTypes';
import type {
  EngineeringQueueItem,
  EngineeringQueueSummary,
} from './engineeringTypes';
import {
  summariseEngineeringQueue,
} from './engineeringQueue';

export interface EngineeringQueueCardProps {
  items: EngineeringQueueItem[];
  title?: string;
  onOpenQueue?: () => void;
  className?: string;
}

function formatDocumentLabel(documentType: EngineeringDocumentType): string {
  switch (documentType) {
    case EngineeringDocumentType.BuildPack:
      return 'Build Pack';
    case EngineeringDocumentType.FAS:
      return 'FAS';
    case EngineeringDocumentType.AsBuilt:
      return 'As-Built';
    case EngineeringDocumentType.WalkOffPack:
      return 'Walk-Off Pack';
    case EngineeringDocumentType.CommercialPack:
      return 'Commercial Pack';
    case EngineeringDocumentType.CompletionPack:
      return 'Completion Pack';
    case EngineeringDocumentType.MaintenancePack:
      return 'Maintenance Pack';
    case EngineeringDocumentType.QAPack:
      return 'QA Pack';
    default:
      return documentType;
  }
}

function getActiveQueueItems(items: EngineeringQueueItem[]): EngineeringQueueItem[] {
  return items.filter((item) => ![
    EngineeringQueueStatus.Complete,
    EngineeringQueueStatus.Cancelled,
    EngineeringQueueStatus.Rejected,
  ].includes(item.status));
}

function getHighestRiskItem(items: EngineeringQueueItem[]): EngineeringQueueItem | undefined {
  const active = getActiveQueueItems(items);
  return active.find((item) => item.approvalRequired) ?? active[0];
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function EngineeringQueueCard({
  items,
  title = 'Engineering Queue',
  onOpenQueue,
  className = '',
}: EngineeringQueueCardProps) {
  const summary: EngineeringQueueSummary = summariseEngineeringQueue(items);
  const activeItems = getActiveQueueItems(items);
  const highestRiskItem = getHighestRiskItem(items);

  return (
    <section className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Live map changes waiting for document review, approval, or regeneration.
          </p>
        </div>

        {onOpenQueue ? (
          <button
            type="button"
            onClick={onOpenQueue}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
          >
            Open
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <QueueMetric label="Build Packs" value={summary.pendingBuildPacks} />
        <QueueMetric label="FAS" value={summary.pendingFAS} />
        <QueueMetric label="Major Changes" value={summary.pendingMajorChanges} />
        <QueueMetric label="Reviews" value={summary.pendingEngineeringReviews} />
        <QueueMetric label="Approvals" value={summary.pendingApprovals} />
      </div>

      {highestRiskItem ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-950">
            Next action: {highestRiskItem.approvalRequired ? 'Manager approval required' : 'Engineering review required'}
          </div>
          <div className="mt-1 text-sm text-amber-900">
            {highestRiskItem.areaName ?? highestRiskItem.areaId} · {highestRiskItem.reason}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {highestRiskItem.pendingDocuments.map((documentType) => (
              <span
                key={documentType}
                className="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-950"
              >
                {formatDocumentLabel(documentType)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          No pending engineering reviews, approvals, Build Packs, or FAS regenerations.
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        {activeItems.length} active queue item{activeItems.length === 1 ? '' : 's'} from the Engineering Core.
      </div>
    </section>
  );
}

export default EngineeringQueueCard;
