import { RawImage } from '@huggingface/transformers';
import { segmentInk } from './segment.js';
import { mathSearchAliases } from './math.js';

export function cleanOcrText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const words = text.match(/[a-zA-Z]{2,}/g) || [];
  // Conservatively drop short graph labels, alphabet runs, repetitive generation,
  // and LaTeX from the prose model. This is a quality filter, not a confidence score.
  if (!words.length || (words.length === 1 && words[0].length < 4) || /\\|(?:\b[a-z]\s+){4}/i.test(text) || words.length > 100) return '';
  const counts = new Map();
  for (const word of words) counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) || 0) + 1);
  if (Math.max(...counts.values()) > Math.max(3, words.length * .45)) return '';
  return text.slice(0, 2000);
}

export async function recognizeHandwriting(image, engines, check = () => {}, onRegion = () => {}, { startRegion = 0, regionLimit = 40 } = {}) {
  let raw = new RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4);
  raw.grayscale();
  for (let i = 0; i < raw.data.length; i++) raw.data[i] = raw.data[i] < 200 ? 0 : 255;
  const segmented = segmentInk(raw, { maxRegions: 40 });
  const passages = [], operators = new Set();
  const nextRegion = Math.min(startRegion + regionLimit, segmented.regions.length);
  for (const region of segmented.regions.slice(startRegion, nextRegion)) {
    check();
    const crop = await raw.crop(region.box);
    const [x1, y1, x2, y2] = region.box;
    // Very tall/skinny regions are usually axes, arrows or marginal labels.
    if ((x2 - x1) < 25 || (y2 - y1) > image.height * .3) continue;
    const words = await engines.handwriting(crop.clone ? crop.clone().rgb() : new RawImage(new Uint8ClampedArray(crop.data), crop.width, crop.height, 1).rgb());
    check();
    const text = cleanOcrText(words);
    if (text) passages.push(text);
    // Keep only operator aliases from the math engine, not its often incorrect
    // formula transcription. A match remains explicitly labelled OCR.
    // A text-line crop may split off a sum's limits or a fraction's numerator.
    // Give the math engine vertical context while keeping prose crops tight.
    const extra = Math.round((y2 - y1) * .55);
    const mathBox = [Math.max(0, x1 - 4), Math.max(0, y1 - extra), Math.min(raw.width - 1, x2 + 4), Math.min(raw.height - 1, y2 + extra)];
    const formula = await engines.math(await raw.crop(mathBox));
    onRegion({ box: region.box, mathBox, words, formula });
    check();
    const aliases = mathSearchAliases(formula);
    if (aliases) operators.add(aliases);
  }
  return { ocrText: passages.join('\n').slice(0, 12000), ocrAliases: [...operators].join(' '),
    regionOffset: startRegion, nextRegion, ocrPageComplete: nextRegion >= segmented.regions.length,
    ocrPartial: segmented.partial, ocrRegions: segmented.regions.length };
}
