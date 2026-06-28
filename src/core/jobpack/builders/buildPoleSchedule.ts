import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isPole } from '../jobPackAssetUtils';

export function buildPoleSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const poles = records.filter(isPole);
  const rows = [['Pole ID', 'Name', 'Status', 'Location', 'Photos', 'Notes'], ...poles.map((r) => [r.id, r.name, r.status, r.location, r.photoCount, r.notes || ''])];
  return {
    section: { key: 'pole_schedule', title: 'Pole Schedule', fileName: '06_Pole_Schedule.md', lines: [`${poles.length} poles included.`, 'Check pole suitability, spans, PIA evidence and photo record.'] },
    file: { path: '05_Schedules/Pole_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
