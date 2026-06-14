import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Trystero's torrent strategy references a few node globals; map them to browser equivalents.
export default defineConfig({
  base: '/tenpai/',
  plugins: [react()],
  define: {
    global: 'globalThis'
  },
  server: {
    port: 5173,
    host: true
  }
})
