import { prepareQuery } from './rank.js';

export function matchingSnippet(resource, query, length = 240) {
  const text = String(resource.contentText || resource.snippet || '').replace(/\s+/g, ' ').trim();
  if (text.length <= length) return text;
  const lower = text.toLocaleLowerCase();
  const words = prepareQuery(query).topics.filter(word => word.length > 2 && !/\d/.test(word));
  const positions = words.map(word => lower.indexOf(word)).filter(position => position >= 0);
  let start = positions.length ? Math.max(0, Math.min(...positions) - 70) : 0;
  if (start) {
    const boundary = text.indexOf(' ', start);
    if (boundary >= 0) start = boundary + 1;
  }
  let end = Math.min(text.length, start + length);
  if (end < text.length) {
    const boundary = text.lastIndexOf(' ', end);
    if (boundary > start) end = boundary;
  }
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
