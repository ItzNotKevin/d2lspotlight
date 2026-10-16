// A bounded projection-based baseline for upright pages. This finds ink bands,
// not semantic text or formula regions; diagrams and columns remain ambiguous.
export function segmentInk(image, { maxRegions = 60, signal } = {}) {
  const { width, height, channels, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width * height > 4_000_000 || ![1, 3, 4].includes(channels) || data.length !== width * height * channels
    || !Number.isInteger(maxRegions) || maxRegions < 1 || maxRegions > 100) throw new Error('Invalid or oversized OCR segmentation input.');
  const ink = new Uint8Array(width * height), columns = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted();
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const gray = channels === 1 ? data[i] : .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
      const alpha = channels === 4 ? data[i + 3] / 255 : 1;
      const dark = gray * alpha + 255 * (1 - alpha) < 200;
      ink[y * width + x] = Number(dark);
      columns[x] += Number(dark);
    }
  }
  // Suppress dense screenshot sidebars and full-width dark UI rows. A rendered
  // PDF normally has neither, but the evaluation screenshots do.
  const ignoredColumns = columns.map((count, x) => Number(count > height * .65
    || ((x < width * .15 || x > width * .85) && count > height * .4)));
  const rows = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted();
    let longest = 0, run = 0;
    for (let x = 0; x < width; x++) {
      if (ignoredColumns[x]) ink[y * width + x] = 0;
      run = ink[y * width + x] ? run + 1 : 0;
      longest = Math.max(longest, run);
      rows[y] += ink[y * width + x];
    }
    if (longest > width * .5 || rows[y] > width * .65) {
      ink.fill(0, y * width, (y + 1) * width);
      rows[y] = 0;
    }
  }
  const minimumInk = Math.max(3, Math.floor(width * .002));
  const bands = [];
  let top = -1, last = -1;
  const gap = Math.max(2, Math.round(height * .003));
  function addBand(bottom, bandTop = top, depth = 0) {
    // Descenders or a stray stroke can bridge adjacent lines. Split only at a
    // strong interior valley; do not manufacture uniform slices of diagrams.
    if (depth < 4 && bottom - bandTop > height * .075) {
      const peak = Math.max(...rows.subarray(bandTop, bottom + 1));
      let valley = -1, minimum = Infinity;
      for (let y = bandTop + Math.ceil((bottom - bandTop) * .25); y < bottom - (bottom - bandTop) * .25; y++) {
        const average = (rows[y - 1] + rows[y] + rows[y + 1]) / 3;
        if (average < minimum) { minimum = average; valley = y; }
      }
      if (minimum < peak * .18) {
        addBand(valley, bandTop, depth + 1); addBand(bottom, valley + 1, depth + 1); return;
      }
    }
    const counts = new Uint32Array(width);
    for (let y = bandTop; y <= bottom; y++) for (let x = 0; x < width; x++) counts[x] += ink[y * width + x];
    let left = -1, right = -1, pixels = 0;
    const horizontalGap = Math.max(12, Math.round(width * .035));
    for (let x = 0; x <= width; x++) {
      if (x < width && counts[x]) { if (left < 0) left = x; right = x; pixels += counts[x]; }
      else if (left >= 0 && (x - right > horizontalGap || x === width)) {
        if (right - left >= 6 && bottom - bandTop >= 3 && pixels >= 20) bands.push({ box: [left, bandTop, right, bottom], pixels });
        left = -1; pixels = 0;
      }
    }
  }
  for (let y = 0; y <= height; y++) {
    signal?.throwIfAborted();
    if (y < height && rows[y] >= minimumInk) { if (top < 0) top = y; last = y; }
    else if (top >= 0 && (y - last > gap || y === height)) { addBand(last); top = -1; }
  }
  const pad = Math.max(3, Math.round(width * .004));
  return { partial: bands.length > maxRegions,
    regions: bands.slice(0, maxRegions).map(({ box: [x1, y1, x2, y2], pixels }) => ({
      box: [Math.max(0, x1 - pad), Math.max(0, y1 - pad), Math.min(width - 1, x2 + pad), Math.min(height - 1, y2 + pad)],
      kind: (y2 - y1) > height * .12 ? 'large-ink-region' : 'ink-band', pixels
    })) };
}
