import type { BuildPartnerJobPackAssetRecord, BuildPartnerJobPackSection } from '../jobPackModels';
import { isCable } from '../jobPackAssetUtils';

export function buildTrafficManagement(records: BuildPartnerJobPackAssetRecord[]): BuildPartnerJobPackSection {
  const ugRoutes = records.filter((record) => isCable(record) && String(record.installMethod || '').toLowerCase().includes('under')).length;
  return {
    key: 'traffic_management',
    title: 'Traffic Management Notes',
    fileName: '15_Traffic_Management.md',
    lines: [
      `${ugRoutes} underground cable route(s) may require civils / TM review depending on street classification.`,
      'Check permits, notices, access restrictions and reinstatement requirements before works.',
      'Any permit failure, blocked duct or no-access location must be returned as an ECR / blocker.',
    ],
  };
}
