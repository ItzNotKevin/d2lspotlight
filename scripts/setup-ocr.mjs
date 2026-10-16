import { ensureOcrAssets } from './ocr-assets.mjs';
await ensureOcrAssets();
console.log('OCR assets are ready. Normal builds also prepare these automatically.');
