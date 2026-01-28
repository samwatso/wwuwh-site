import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Use relative paths for Capacitor native builds, /app/ for web
const isNative = process.env.CAPACITOR_BUILD === 'true'

export default defineConfig({
  plugins: [react()],
  base: isNative ? './' : '/app/',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
