import { defineConfig, devices } from '@playwright/test';

// Настройки Playwright (сквозные тесты в настоящем браузере)
export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,                    // один тест может идти до минуты: в нём два человека и много шагов
    use: {
        baseURL: 'http://localhost:5173', // page.goto('/login') откроет http://localhost:5173/login
        trace: 'retain-on-failure',      // если тест упал — сохранить «запись» всех шагов для разбора
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Перед тестами запустить фронтенд (или взять уже запущенный).
    // Бэкенд, PostgreSQL и MinIO запускаешь сам — см. docs/stage-10.md
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
    },
});
