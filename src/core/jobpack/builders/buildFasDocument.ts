import type { BuildPartnerJobPackAssetRecord, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows, isCable, isDp } from '../jobPackAssetUtils';

export function buildFasDocument(records: BuildPartnerJobPackAssetRecord[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const rows = [
    ['Row', 'Source Asset', 'Destination / DP', 'Cable', 'Fibre Count', 'Status', 'Notes'],
    ...records
      .filter((record) => isCable(record) || isDp(record))
      .map((record, index) => [index + 1, record.upstreamAsset || '', record.linkedDp || record.downstreamAsset || record.name, record.name, record.fibreCount || '', record.status, record.notes || '']),
  ];
  return {
    section: {
      key: 'fas',
      title: 'FAS / Fibre Allocation Summary',
      fileName: '11_FAS_Summary.md',
      lines: [
        'FAS export is generated from live cable and DP allocation metadata.',
        'Any missing fibre counts or DP allocations must be corrected on the live map before final issue.',
        'Full FAS draft exported as 06_FAS/FAS_Draft.csv.',
      ],
    },
    file: { path: '06_FAS/FAS_Draft.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
