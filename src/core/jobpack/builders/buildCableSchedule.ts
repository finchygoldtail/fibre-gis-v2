import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isCable } from '../jobPackAssetUtils';

export function buildCableSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const cables = records.filter(isCable);
  const rows = [['Cable ID', 'Name', 'Cable Type', 'Fibre Count', 'Install Method', 'Length m', 'From', 'To', 'Location'], ...cables.map((r) => [r.id, r.name, r.cableType || '', r.fibreCount || '', r.installMethod || '', r.routeLengthMeters || '', r.upstreamAsset || '', r.downstreamAsset || '', r.location])];
  return {
    section: { key: 'cable_schedule', title: 'Cable Schedule', fileName: '10_Cable_Schedule.md', lines: [`${cables.length} cable routes included.`, `${Math.round(cables.reduce((sum, r) => sum + (r.routeLengthMeters || 0), 0))} m total recorded route length.`, 'Confirm cable labels, route, fibre count and install method before build.'] },
    file: { path: '05_Schedules/Cable_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
