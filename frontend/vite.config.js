import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          // Only pin packages that are actually reached from the eager
          // (non-lazy) import graph. Everything else — including libs only
          // reached via dynamic import() like xlsx/jspdf/html2canvas-pro/
          // react-to-print — must NOT get a manualChunks name here, or
          // Rollup merges their code into this same always-loaded chunk
          // even though they're only imported on demand.
          if (
            id.includes('node_modules/axios/') ||
            id.includes('node_modules/lucide-react/') ||
            id.includes('node_modules/jwt-decode/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
})