import type { BuildPartnerJobPackAssetRecord, BuildPartnerJobPackSection } from '../jobPackModels';
import { isCable } from '../jobPackAssetUtils';

export function buildConstructionNotes(records: BuildPartnerJobPackAssetRecord[]): BuildPartnerJobPackSection {
  const oh = records.filter((record) => isCable(record) && String(record.installMethod || '').toLowerCase().includes('oh')).length;
  const ug = records.filter((record) => isCable(record) && String(record.installMethod || '').toLowerCase().includes('under')).length;
  return {
    key: 'construction_notes',
    title: 'Construction Notes',
    fileName: '03_Construction_Notes.md',
    lines: [
      `Overhead routes: ${oh}`,
      `Underground routes: ${ug}`,
      'Confirm route on site before build starts.',
      'Label all cables, DPs, joints, chambers and pole routes to match the live map.',
      'Capture photo evidence before closing any task.',
      'Redline changes must be returned to Delivery before As-Built generation.',
    ],
  };
}
