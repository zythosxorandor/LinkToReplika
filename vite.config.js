import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' // or ./manifest.config.ts

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    strictPort: true,
    hmr: { clientPort: 5173 }, // helps on Windows/firewalls
    port: 5173
  },
  build: {
    outDir: 'dist', // <- load this folder in chrome://extensions
    sourcemap: true
  }
})
