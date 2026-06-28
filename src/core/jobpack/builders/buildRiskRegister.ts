import type { BuildPartnerJobPackIssue, JobPackExportFile, BuildPartnerJobPackSection } from '../jobPackModels';
import { csvRows } from '../jobPackAssetUtils';

export function buildRiskRegister(issues: BuildPartnerJobPackIssue[]): { section: BuildPartnerJobPackSection; file: JobPackExportFile } {
  const rows = [['Level', 'Category', 'Asset', 'Message', 'Required Action'], ...issues.map((i) => [i.level, i.category, i.assetName || i.assetId || 'Area', i.message, i.requiredAction])];
  return {
    section: {
      key: 'risk_register',
      title: 'Risk / Issue Register',
      fileName: '13_Risk_Register.md',
      lines: issues.length ? issues.map((i) => `${i.level.toUpperCase()} · ${i.assetName || 'Area'} · ${i.message}`) : ['No issue checks raised.'],
    },
    file: { path: '07_Risks/Risk_Register.csv', fileType: 'csv', mimeType: 'text/csv', content: csvRows(rows) },
  };
}
