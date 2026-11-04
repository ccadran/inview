import { defineConfig } from 'vite'

// Build de la lib : un seul module ESM, sans dépendance embarquée.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'inview.js',
    },
    target: 'es2022',
    emptyOutDir: true,
    sourcemap: true,
  },
})
