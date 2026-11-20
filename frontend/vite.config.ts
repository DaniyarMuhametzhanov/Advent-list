/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Все запросы, которые начинаются с /api, Vite передаёт нашему Worker (cd worker && npm run dev).
    // Для браузера это один и тот же адрес localhost:5173, поэтому CORS не мешает.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true, // заголовок Host: localhost:8787, как будто браузер обратился к Worker напрямую
        // Worker пускает POST/PUT/DELETE только со своего адреса (заголовок Origin, защита от CSRF).
        // Браузер пишет Origin: localhost:5173 — подменяем на адрес Worker. Только при разработке:
        // на Cloudflare фронтенд и Worker живут по одному адресу, и подмена не нужна
        configure: proxy => proxy.on('proxyReq', req => {
          if (req.getHeader('origin')) req.setHeader('origin', 'http://localhost:8787')
        }),
      },
    },
  },
  // Настройки Vitest (тесты компонентов)
  test: {
    environment: 'jsdom',                  // ненастоящий браузер внутри Node: есть document, window, кнопки
    setupFiles: ['./src/test/setup.ts'],   // этот файл выполняется перед каждым файлом с тестами
    include: ['src/**/*.test.{ts,tsx}'],   // тесты лежат рядом с кодом; папку e2e не трогаем
  },
})
