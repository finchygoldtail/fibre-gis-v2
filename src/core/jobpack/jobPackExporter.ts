import type { BuildPartnerJobPackResult, JobPackExportFile } from './jobPackModels';
import { buildJobPackManifest } from './jobPackManifest';

export function sectionMarkdownFile(path: string, title: string, lines: string[]): JobPackExportFile {
  return {
    path,
    fileType: 'md',
    mimeType: 'text/markdown',
    content: [`# ${title}`, '', ...lines.map((line) => `- ${line}`), ''].join('\n'),
  };
}

export function buildBuildPartnerExportFiles(jobPack: BuildPartnerJobPackResult, files: JobPackExportFile[]): JobPackExportFile[] {
  const sectionFiles = jobPack.buildPartnerSections.map((section) =>
    sectionMarkdownFile(`01_Documents/${section.fileName}`, section.title, section.lines),
  );

  return [
    buildJobPackManifest(jobPack),
    ...sectionFiles,
    ...files,
    {
      path: '99_Data/job-pack.json',
      fileType: 'json',
      mimeType: 'application/json',
      content: JSON.stringify(jobPack, null, 2),
    },
  ];
}
