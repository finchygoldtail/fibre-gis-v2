import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isDp } from '../jobPackAssetUtils';

export function buildDpSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const dps = records.filter(isDp);
  const rows = [['DP ID', 'Name', 'Status', 'Location', 'Linked DP', 'Photos', 'Notes'], ...dps.map((r) => [r.id, r.name, r.status, r.location, r.linkedDp || '', r.photoCount, r.notes || ''])];
  return {
    section: { key: 'dp_schedule', title: 'DP / CBT / AFN Schedule', fileName: '09_DP_Schedule.md', lines: [`${dps.length} DPs / CBTs / AFNs included.`, 'Confirm serving homes, splitter/port allocation, labels and power readings.'] },
    file: { path: '05_Schedules/DP_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
