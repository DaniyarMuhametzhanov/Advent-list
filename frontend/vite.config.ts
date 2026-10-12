/// <reference types="vitest/config" />
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
  // Настройки Vitest (тесты компонентов)
  test: {
    environment: 'jsdom',                  // ненастоящий браузер внутри Node: есть document, window, кнопки
    setupFiles: ['./src/test/setup.ts'],   // этот файл выполняется перед каждым файлом с тестами
    include: ['src/**/*.test.{ts,tsx}'],   // тесты лежат рядом с кодом; папку e2e не трогаем
  },
})
