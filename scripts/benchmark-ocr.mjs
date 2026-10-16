import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pipeline, RawImage, env } from '@huggingface/transformers';
import { mathSearchAliases } from '../src/search/ocr/math.js';
import { segmentInk } from '../src/search/ocr/segment.js';

// Evaluation only: model downloads are allowed, source images never leave this
// process. Put private manifests/reports under ignored benchmark-results/.
const [manifestFile, candidate = 'handwriting'] = process.argv.slice(2);
const models = { handwriting: 'Xenova/trocr-small-handwritten', math: 'Xenova/texify', math2: 'onnx-community/TexTeller3-ONNX' };
if (!manifestFile || !models[candidate]) throw new Error('Usage: npm run benchmark:ocr -- <local-manifest.json> [handwriting|math|math2]');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
if (!Array.isArray(manifest.samples) || !manifest.samples.length || manifest.samples.length > 20) throw new Error('Supply 1–20 samples.');
env.cacheDir = resolve('benchmark-assets/ocr');
env.allowLocalModels = false;
const model = models[candidate];
// Record an immutable revision so later evaluations can reproduce the result.
const metadataResponse = await fetch(`https://huggingface.co/api/models/${model}`, { signal: AbortSignal.timeout(30000) });
if (!metadataResponse.ok) throw new Error(`Could not resolve model revision: ${metadataResponse.status}`);
const { sha: revision } = await metadataResponse.json();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid model revision.');
console.log(`Loading ${model} (${revision}); inference is local.`);
const loadedAt = performance.now();
const recognizer = await pipeline('image-to-text', model, { revision, dtype: 'q8', device: 'cpu' });
const loadMs = Math.round(performance.now() - loadedAt);
const rows = [];
const reportFile = resolve(manifest.output || `benchmark-results/ocr-${candidate}.json`);
await mkdir(dirname(reportFile), { recursive: true });
try {
  for (const sample of manifest.samples) {
    if (typeof sample.image !== 'string' || /^[a-z]+:\/\//i.test(sample.image)) throw new Error('Only local sample images are accepted.');
    const path = isAbsolute(sample.image) ? sample.image : resolve(dirname(manifestFile), sample.image);
    let image = await RawImage.read(path);
    // Optional normalized bounds are an evaluation aid, not an automatic page
    // segmentation algorithm. Report them to avoid overstating page accuracy.
    if (sample.crop) {
      if (!Array.isArray(sample.crop) || sample.crop.length !== 4 || sample.crop.some(n => !Number.isFinite(n) || n < 0 || n > 1)
        || sample.crop[0] >= sample.crop[2] || sample.crop[1] >= sample.crop[3]) throw new Error('Invalid crop.');
      image = await image.crop(sample.crop.map((n, i) => Math.floor(n * (i % 2 ? image.height - 1 : image.width - 1))));
    }
    if (sample.preprocess === 'threshold') {
      image.grayscale();
      for (let i = 0; i < image.data.length; i++) image.data[i] = image.data[i] < 200 ? 0 : 255;
      image.rgb();
    } else if (sample.preprocess) throw new Error('Unknown preprocessing mode.');
    // TexTeller's published processor expects one grayscale channel.
    if (candidate === 'math2') image.grayscale();
    const started = performance.now();
    let segmentation = null;
    if (sample.segment) {
      if (sample.segment !== 'ink-bands') throw new Error('Unknown segmentation mode.');
      const scale = Math.min(1, 1600 / image.width, 2000 / image.height);
      if (scale < 1) image = await image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
      segmentation = segmentInk(image, { maxRegions: 40 });
    }
    const regions = segmentation?.regions || [{ box: [0, 0, image.width - 1, image.height - 1], kind: 'supplied-image' }];
    const outputs = [];
    for (const region of regions) {
      const output = await recognizer(await image.crop(region.box), { max_new_tokens: candidate === 'handwriting' ? 128 : 256, do_sample: false });
      outputs.push({ ...region, text: output.map(item => item.generated_text).join('\n') });
    }
    const text = outputs.map(item => item.text).join('\n');
    const aliases = mathSearchAliases(text);
    const searchable = `${text} ${aliases}`.toLowerCase();
    const row = { id: sample.id, crop: sample.crop || null, preprocess: sample.preprocess || 'none', segment: sample.segment || null,
      segmentationPartial: segmentation?.partial || false, imageSize: [image.width, image.height], regions: outputs,
      text, aliases, inferenceMs: Math.round(performance.now() - started),
      checks: (sample.expected || []).map(keyword => ({ keyword, found: searchable.includes(keyword.toLowerCase()) })),
      negativeChecks: (sample.absent || []).map(keyword => ({ keyword, invented: searchable.includes(keyword.toLowerCase()) })) };
    rows.push(row);
    console.log(JSON.stringify(row));
    await writeFile(reportFile, JSON.stringify({ model, revision, dtype: 'q8', device: 'cpu', loadMs, samples: rows }, null, 2) + '\n');
  }
} finally { await recognizer.dispose(); }
console.log(`Report: ${reportFile}`);
