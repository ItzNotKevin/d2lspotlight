import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentInk } from '../src/search/ocr/segment.js';

function fixture(width = 200, height = 200) {
  const data = new Uint8Array(width * height).fill(255);
  return { width, height, channels: 1, data, rect(x1, y1, x2, y2, color = 0) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) data[y * width + x] = color;
  } };
}
test('finds separated ink bands in reading order and keeps padding inside the image', () => {
  const im = fixture(); im.rect(10, 20, 80, 30); im.rect(15, 70, 100, 82);
  const { regions, partial } = segmentInk(im);
  assert.equal(regions.length, 2); assert.equal(partial, false);
  assert.ok(regions[0].box[1] < 20 && regions[0].box[3] > 30);
  assert.ok(regions[1].box[1] > regions[0].box[3]);
});
test('suppresses full-width rules and dense sidebars without deleting the note text', () => {
  const im = fixture(); im.rect(0, 0, 10, 199); im.rect(0, 10, 199, 11); im.rect(30, 50, 90, 60);
  const result = segmentInk(im);
  assert.equal(result.regions.length, 1);
  assert.ok(result.regions[0].box[0] > 10);
});
test('blank and transparent pages produce no regions; truncation and cancellation are explicit', () => {
  assert.equal(segmentInk(fixture()).regions.length, 0);
  assert.equal(segmentInk({ width: 10, height: 10, channels: 4, data: new Uint8Array(400) }).regions.length, 0);
  const im = fixture(); im.rect(10, 20, 60, 30); im.rect(10, 70, 60, 80);
  assert.equal(segmentInk(im, { maxRegions: 1 }).partial, true);
  const abort = new AbortController(); abort.abort();
  assert.throws(() => segmentInk(im, { signal: abort.signal }), { name: 'AbortError' });
  assert.throws(() => segmentInk({ width: 5000, height: 5000, channels: 1, data: [] }), /oversized/);
});

test('splits weak bridging ink between lines and separates distant columns', () => {
  const im = fixture(); im.rect(10, 20, 70, 30); im.rect(10, 65, 70, 75);
  im.rect(10, 31, 12, 64);
  im.rect(140, 20, 180, 30);
  const { regions } = segmentInk(im);
  assert.ok(regions.some(region => region.box[0] > 100), 'Distant column gets its own crop');
  assert.ok(regions.some(region => region.box[1] >= 30), 'Bridged lines are split at an ink valley');
});
