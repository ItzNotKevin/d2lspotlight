import { documentPassages, passageMatches, mergePassageMatches } from '../src/search/semantic/passages.js';
import { resourceText, cosineSimilarity } from '../src/search/semantic/model.js';
import { semanticQueryText, semanticNaturalQuery } from '../src/search/rank.js';
import { semanticConstraintsMatch, hybridSearch } from '../src/search/hybrid.js';
import { filterResources } from '../src/learn/search.js';
import { pdfRevision, mergePdfResults, notesSection } from '../src/search/pdf/core.js';
import { searchPdfCache } from '../src/search/pdf/background.js';

export function validateSearchEvaluation(data) {
  if (!Array.isArray(data.resources) || !Array.isArray(data.documents) || !Array.isArray(data.queries) || !data.queries.length) throw new Error('Expected resources, documents, and nonempty queries arrays.');
  const ids = new Set();
  for (const resource of data.resources) {
    if (typeof resource.id !== 'string' || !resource.id || ids.has(resource.id)) throw new Error('Resources need unique IDs.');
    ids.add(resource.id);
  }
  for (const document of data.documents) {
    if (!ids.has(document.resourceId) || !Array.isArray(document.pages)) throw new Error('Document must reference an existing resource and contain pages.');
    for (const page of document.pages) if (!Number.isInteger(page.page) || page.page < 1 || typeof page.text !== 'string') throw new Error('Pages need a positive physical page/location index and text.');
  }
  for (const query of data.queries) if (typeof query.text !== 'string' || !query.text.trim() || !Array.isArray(query.relevant) || query.relevant.some(id => !ids.has(id))) throw new Error('Queries need text and relevant resource IDs (or an empty list for no answer).');
}

export async function evaluateSearch(data, { embed }) {
  validateSearchEvaluation(data);
  const resources = data.resources.map(resource => ({ ...resource, accountId: 'evaluation', notesSection: notesSection(resource) }));
  const byId = new Map(resources.map(resource => [resource.id, resource]));
  const documents = data.documents.map(document => ({ ...document, id: document.resourceId, accountId: 'evaluation', revision: pdfRevision(byId.get(document.resourceId)) }));
  const { passages } = documentPassages(resources, documents);
  const vectors = [];
  for (const resource of [...resources, ...passages]) {
    const context = await embed(resourceText(resource));
    vectors.push({ resource, context, title: resource.semanticPassage ? context : await embed(resourceText(resource, 'title')) });
  }
  const rows = [];
  for (const query of data.queries) {
    const vector = await embed(semanticQueryText(query.text));
    const natural = await embed(semanticNaturalQuery(query.text) || semanticQueryText(query.text));
    const allowed = new Set(filterResources(resources, { ...query.filters, history: data.history || {} }).filter(resource => semanticConstraintsMatch(resource, query.text)).map(resource => resource.id));
    const matches = vectors.filter(({ resource }) => allowed.has(resource.resourceId || resource.id)).map(({ resource, context, title }) => ({ id: resource.id,
      score: Math.max(cosineSimilarity(vector, context), cosineSimilarity(vector, title), cosineSimilarity(natural, context), cosineSimilarity(natural, title)) }));
    const keyword = await searchPdfCache({ all: async () => documents }, { accountId: 'evaluation', resources: resources.filter(resource => resource.source === 'LEARN'), history: data.history || {} }, query.text, query.filters);
    const semantic = passageMatches(matches, passages);
    const metadata = hybridSearch(resources, { query: query.text, ...query.filters, history: data.history || {} }, matches);
    const results = mergePdfResults(metadata, mergePassageMatches(keyword, semantic), 100, query.text);
    const top5 = [...new Set(results.map(resource => resource.resourceId || resource.id))].slice(0, 5);
    const hits = top5.filter(id => query.relevant.includes(id));
    rows.push({ query: query.text, expected: query.relevant, top5, hit: hits.length > 0, recall: query.relevant.length ? hits.length / query.relevant.length : null,
      unexpectedAnswer: query.relevant.length === 0 && top5.length > 0 });
  }
  const positives = rows.filter(row => row.expected.length), negatives = rows.filter(row => !row.expected.length);
  return { queries: rows.length, positiveQueries: positives.length, noAnswerQueries: negatives.length,
    hitAt5: positives.length ? positives.filter(row => row.hit).length / positives.length : null,
    recallAt5: positives.length ? positives.reduce((sum, row) => sum + row.recall, 0) / positives.length : null,
    noAnswerFalsePositiveRate: negatives.length ? negatives.filter(row => row.unexpectedAnswer).length / negatives.length : null, rows };
}
