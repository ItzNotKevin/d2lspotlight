import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingSnippet } from '../src/search/snippet.js';

test('website previews show the matching passage rather than an unrelated opening paragraph', () => {
  const contentText = 'General information about the course. '.repeat(20) + 'Academic advising can help with course selection. ' + 'More course information. '.repeat(20);
  const result = matchingSnippet({ contentText, snippet: 'Unrelated opening paragraph.' }, 'cs246 advising');
  assert.match(result, /Academic advising can help/);
  assert.ok(result.startsWith('…') && result.endsWith('…'));
  assert.ok(result.length <= 242);
});

test('PDF excerpts and short passages retain their original text, with whitespace normalized', () => {
  assert.equal(matchingSnippet({ snippet: 'An ordered\n arrangement of objects.' }, 'permutation'), 'An ordered arrangement of objects.');
  assert.equal(matchingSnippet({}, 'cs246'), '');
  const text = 'A course overview. '.repeat(40);
  assert.ok(matchingSnippet({ contentText: text }, 'cs246').startsWith('A course overview.'));
});
