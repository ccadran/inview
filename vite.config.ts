import { defineConfig } from 'vite'

// Build de la lib : ESM, deux points d'entrée (cœur et Vue), dépendances externes.
export default defineConfig({
  build: {
    lib: {
      entry: { inview: 'src/index.ts', vue: 'src/vue.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: [/^gsap(\/.*)?$/, 'vue'],
      output: { chunkFileNames: 'core.js' },
    },
    target: 'es2022',
    emptyOutDir: true,
    sourcemap: true,
  },
})
