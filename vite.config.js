import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Library mode leaves process.env checks intact; content scripts have no Node process.
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/content.jsx',
      name: 'D2LSpotlight',
      formats: ['iife'],
      fileName: () => 'spotlight.js'
    },
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        defaultHandler(warning);
      }
    }
  }
}));
