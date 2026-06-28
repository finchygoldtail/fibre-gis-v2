import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows } from '../jobPackAssetUtils';

export function buildAssetSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const rows = [
    ['Asset ID', 'Name', 'Type', 'Status', 'Location', 'Photos', 'Notes'],
    ...records.map((record) => [record.id, record.name, record.type, record.status, record.location, record.photoCount, record.notes || '']),
  ];
  return {
    section: {
      key: 'asset_schedule',
      title: 'Asset Schedule',
      fileName: '05_Asset_Schedule.md',
      lines: [`${records.length} assets included in this Job Pack.`, 'Full schedule exported as 05_Schedules/Asset_Schedule.csv.'],
    },
    file: { path: '05_Schedules/Asset_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
