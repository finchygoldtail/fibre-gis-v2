import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows } from '../jobPackAssetUtils';

export function buildPhotoManifest(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const rows = [['Asset ID', 'Asset Name', 'Type', 'Photo Count', 'Status'], ...records.map((r) => [r.id, r.name, r.type, r.photoCount, r.photoCount > 0 ? 'Evidence present' : 'Evidence missing / pending'])];
  return {
    section: { key: 'photo_manifest', title: 'Photo Manifest', fileName: '16_Photo_Manifest.md', lines: [`${records.reduce((sum, r) => sum + r.photoCount, 0)} photos referenced by assets in this pack.`, 'Photo files are referenced from the live Alistra GIS asset records.'] },
    file: { path: '09_Photos/Photo_Manifest.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
