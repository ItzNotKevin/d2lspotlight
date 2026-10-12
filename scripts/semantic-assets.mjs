import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/semantic/wasm', { recursive: true });
for (const suffix of ['mjs', 'wasm']) {
  const name = `ort-wasm-simd-threaded.asyncify.${suffix}`;
  await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `dist/semantic/wasm/${name}`);
}
