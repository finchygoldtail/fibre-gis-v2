import type { JobPackDocumentModel } from '../../engineering/jobPackTypes';
import { escapeJobPackHtml, renderJobPackTitleBlock } from './JobPackHeader';

export type JobPackContentsItem = {
  pageNumber: number;
  title: string;
  description: string;
};

export function renderJobPackContentsPage(args: {
  jobPack: JobPackDocumentModel;
  pageNumber: number;
  pageCount: number;
  items: JobPackContentsItem[];
}): string {
  return `
    <section class="pdf-page text-page contents-page">
      <main class="text-area">
        <div class="document-title-block">
          <div class="document-eyebrow">Alistra GIS · Engineering Delivery</div>
          <h1>Job Pack Contents</h1>
          <p>Generated directly from the live Alistra GIS map. Use the route sheets and schedules as the controlled construction pack.</p>
        </div>
        <table class="contents-table">
          <thead><tr><th>Page</th><th>Section</th><th>Description</th></tr></thead>
          <tbody>
            ${args.items.map((item) => `<tr><td>${item.pageNumber}</td><td>${escapeJobPackHtml(item.title)}</td><td>${escapeJobPackHtml(item.description)}</td></tr>`).join('')}
          </tbody>
        </table>
      </main>
      ${renderJobPackTitleBlock({ jobPack: args.jobPack, layout: 'Contents', pageNumber: args.pageNumber, pageCount: args.pageCount, pageType: 'Register' })}
    </section>
  `;
}
