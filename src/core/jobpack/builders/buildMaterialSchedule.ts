import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isCable, isChamber, isDp, isJoint, isPole } from '../jobPackAssetUtils';

export function buildMaterialSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const materialRows: unknown[][] = [
    ['Item', 'Quantity', 'Basis'],
    ['Poles', records.filter(isPole).length, 'Pole assets in live map'],
    ['Chambers', records.filter(isChamber).length, 'Chamber assets in live map'],
    ['DP / CBT / AFN', records.filter(isDp).length, 'Distribution point assets in live map'],
    ['Joints', records.filter(isJoint).length, 'Joint assets in live map'],
    ['Cable route metres', Math.round(records.filter(isCable).reduce((sum, r) => sum + (r.routeLengthMeters || 0), 0)), 'Measured from live map route geometry where available'],
  ];
  return {
    section: { key: 'material_schedule', title: 'Material Schedule', fileName: '14_Material_Schedule.md', lines: ['Material quantities are estimated from the live map.', 'Build Partner must validate final material take-off before construction.'] },
    file: { path: '08_Materials/Material_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(materialRows) },
  };
}
