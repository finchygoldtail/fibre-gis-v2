import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isJoint } from '../jobPackAssetUtils';

export function buildJointSchedule(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const joints = records.filter(isJoint);
  const rows = [['Joint ID', 'Name', 'Type', 'Location', 'Photos', 'Notes'], ...joints.map((r) => [r.id, r.name, r.type, r.location, r.photoCount, r.notes || ''])];
  return {
    section: { key: 'joint_schedule', title: 'Joint Schedule', fileName: '08_Joint_Schedule.md', lines: [`${joints.length} joints included.`, 'Confirm tray records, splice records, labels and photo evidence.'] },
    file: { path: '05_Schedules/Joint_Schedule.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
