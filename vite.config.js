import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  build: {
    // Only the lazily loaded MathJax runtime exceeds 500 kB. Everything fetched
    // on first paint must stay well below this limit.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
}))
