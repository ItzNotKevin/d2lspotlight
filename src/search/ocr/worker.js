import { pipeline, env } from '@huggingface/transformers';
import { OCR_MODELS } from './config.js';
import { recognizeHandwriting } from './recognize.js';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useWasmCache = false;
env.localModelPath = new URL('./ocr-models/', self.location.href).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./wasm/ort-wasm-simd-threaded.asyncify.mjs', self.location.href).href,
  wasm: new URL('./wasm/ort-wasm-simd-threaded.asyncify.wasm', self.location.href).href
};
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let engines;
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ id: data.id, progress: 'loading local models' });
    engines ||= Promise.all(OCR_MODELS.map(async model => {
      const pipe = await pipeline('image-to-text', model.id, { dtype: 'q8', device: 'wasm', local_files_only: true });
      return [model.role, async image => (await pipe(image, { max_new_tokens: model.role === 'math' ? 32 : 48, do_sample: false })).map(item => item.generated_text).join('\n')];
    })).then(Object.fromEntries);
    const ready = await engines;
    self.postMessage({ id: data.id, progress: 'recognizing regions' });
    let regions = 0;
    const result = await recognizeHandwriting(data.image, ready, () => {}, () => self.postMessage({ id: data.id, progress: `recognized ${++regions} regions` }), { startRegion: data.regionOffset || 0, regionLimit: 8 });
    self.postMessage({ id: data.id, ok: true, result });
  } catch (error) { engines = null; self.postMessage({ id: data.id, ok: false, error: `Handwriting model failed: ${String(error.message || 'unavailable').slice(0, 220)}` }); }
};
