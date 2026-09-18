import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const entries = Object.freeze({
  index: resolve(import.meta.dirname, 'src/index.ts'),
  three: resolve(import.meta.dirname, 'src/three.ts'),
  rendering: resolve(import.meta.dirname, 'src/rendering.ts'),
  'creator-api': resolve(import.meta.dirname, 'src/creator-api.ts'),
  'creator-dom': resolve(import.meta.dirname, 'src/creator-dom.ts'),
  compat: resolve(import.meta.dirname, 'src/compat.ts'),
});

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: entries,
      formats: ['es'],
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: (id) => id === 'three' || id.startsWith('three/'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
