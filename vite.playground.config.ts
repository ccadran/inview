import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Playground : une page par cas de test, servie par `pnpm dev`.
export default defineConfig({
  root: 'playground',
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: { '@ccadran/inview': resolve(import.meta.dirname, 'src/index.ts') },
  },
})
