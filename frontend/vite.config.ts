import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The Symfony app, started with `symfony serve` or `php -S` from backend/
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
