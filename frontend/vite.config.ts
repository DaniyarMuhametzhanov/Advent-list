import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Все запросы, которые начинаются с /api, Vite передаёт серверу Spring Boot.
    // Для браузера это один и тот же адрес localhost:5173, поэтому CORS не мешает.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})