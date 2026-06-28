import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isChamber } from '../jobPackAssetUtils';

export function buildChamberSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const chambers = records.filter(isChamber);
  const rows = [['Chamber ID', 'Name', 'Status', 'Location', 'Photos', 'Notes'], ...chambers.map((r) => [r.id, r.name, r.status, r.location, r.photoCount, r.notes || ''])];
  return {
    section: { key: 'chamber_schedule', title: 'Chamber Schedule', fileName: '07_Chamber_Schedule.md', lines: [`${chambers.length} chambers included.`, 'Confirm lid type, duct entries, cable route and photo evidence.'] },
    file: { path: '05_Schedules/Chamber_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
