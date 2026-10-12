import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { alias: {
  '@huggingface/transformers': resolve('node_modules/@huggingface/transformers/dist/transformers.web.js')
} }, build: { outDir: 'dist/semantic', emptyOutDir: true,
  assetsInlineLimit: 0,
  rollupOptions: { input: 'src/semantic/engine.js', output: { entryFileNames: 'engine.js', chunkFileNames: '[name].js', assetFileNames: 'assets/[name][extname]' } } } });
