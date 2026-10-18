import React from 'react';
import { documentCoverage } from './coverage.js';

export function DocumentProgress({ resources, pdf, canIndex }) {
  if (!pdf.status || !resources.length) return null;
  const coverage = documentCoverage(resources, pdf.status);
  const current = resources.find(resource => resource.id === pdf.currentResource);
  return <div className={`ls-document-progress ${coverage.indexed === coverage.total && !current ? 'is-complete' : ''}`}>
    <p className="ls-coverage" role="status">
      {coverage.indexed} of {coverage.total} documents indexed
      {!pdf.enabled ? ' · indexing paused' : ''}
      {coverage.pending ? ` · ${coverage.pending} pending` : ''}
      {coverage.failures.length ? ` · ${coverage.failures.length} failed` : ''}
      {coverage.replaced ? ` · ${coverage.replaced} replaced to make space` : ''}.
      {current ? ` Processing: ${current.title}.` : ''}
    </p>
    <progress aria-label="Document indexing progress in this search scope" value={coverage.indexed} max={coverage.total} />
    {coverage.indexed < coverage.total && <p className="ls-coverage">Some contents aren’t indexed yet; document titles remain searchable.{!canIndex ? ' Open Spotlight on signed-in LEARN to index or retry documents.' : ''}</p>}
    {coverage.partial > 0 && <p className="ls-coverage">{coverage.partial} indexed {coverage.partial === 1 ? 'document has' : 'documents have'} unreadable or omitted pages; content search is incomplete.</p>}
    {coverage.failures.length > 0 && <details>
      <summary>Failed documents ({coverage.failures.length})</summary>
      <ul>{coverage.failures.map(({ resource, error }) => <li key={resource.id}>
        <span>{resource.title}: {error}</span>{' '}
        <button className="ls-chip" disabled={!canIndex || !pdf.enabled || Boolean(pdf.currentResource)} onClick={() => pdf.retry(resource.id)}>Retry {resource.title}</button>
      </li>)}</ul>
    </details>}
  </div>;
}
