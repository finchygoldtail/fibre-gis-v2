import type { BuildPartnerJobPackAssetRecord, BuildPartnerJobPackIssue } from './jobPackModels';
import { isCable, isChamber, isDp, isPole } from './jobPackAssetUtils';

function issue(args: Omit<BuildPartnerJobPackIssue, 'id'>): BuildPartnerJobPackIssue {
  return { id: `jp-issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...args };
}

export function validateJobPackAssets(records: BuildPartnerJobPackAssetRecord[]): BuildPartnerJobPackIssue[] {
  const issues: BuildPartnerJobPackIssue[] = [];

  if (!records.length) {
    issues.push(issue({
      level: 'blocker',
      category: 'scope',
      message: 'No assets found in the selected workspace area.',
      requiredAction: 'Load or select the correct project area before issuing a Job Pack.',
    }));
  }

  records.forEach((record) => {
    if (!record.name || record.name === 'Unnamed asset') {
      issues.push(issue({
        level: 'warning',
        category: 'asset-data',
        assetId: record.id,
        assetName: record.name,
        message: 'Asset has no clear name or label.',
        requiredAction: 'Name the asset on the live map before issuing to the build partner.',
      }));
    }

    if (record.location === 'Location TBC') {
      issues.push(issue({
        level: 'blocker',
        category: 'geometry',
        assetId: record.id,
        assetName: record.name,
        message: 'Asset has no usable geometry/location.',
        requiredAction: 'Fix the live map geometry before creating the controlled Job Pack.',
      }));
    }

    if (isCable(record) && !record.fibreCount) {
      issues.push(issue({
        level: 'warning',
        category: 'cable',
        assetId: record.id,
        assetName: record.name,
        message: 'Cable has no fibre count recorded.',
        requiredAction: 'Set the fibre count so the FAS and cable schedule are correct.',
      }));
    }

    if (isCable(record) && !record.installMethod) {
      issues.push(issue({
        level: 'warning',
        category: 'cable',
        assetId: record.id,
        assetName: record.name,
        message: 'Cable install method is missing.',
        requiredAction: 'Set OH or Underground before issuing construction instructions.',
      }));
    }

    if ((isPole(record) || isChamber(record) || isDp(record)) && record.photoCount === 0) {
      issues.push(issue({
        level: 'warning',
        category: 'evidence',
        assetId: record.id,
        assetName: record.name,
        message: 'No photo evidence is attached to this asset.',
        requiredAction: 'Upload or confirm photo evidence before final walk-off.',
      }));
    }
  });

  return issues;
}
