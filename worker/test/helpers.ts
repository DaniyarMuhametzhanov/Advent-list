// Запуск нашего Worker для тестов: настоящий движок Cloudflare (workerd) на своём компьютере
// через Miniflare. База D1 временная, в памяти
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

export const ADMIN_EMAIL = 'admin@test.ru';

export async function startWorker() {
    // Собрать src/index.ts в один файл JavaScript (как это делает wrangler)
    const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'esm', write: false,
        target: 'es2022', platform: 'neutral' });
    const mf = new Miniflare({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: '2026-07-01',
        d1Databases: ['DB'],
        bindings: { ADMIN_EMAILS: ADMIN_EMAIL, PRIVACY_VERSION: 'p-1', TERMS_VERSION: 't-1' },
    });
    // Создать таблицы: выполнить все миграции по порядку, по одной команде
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('migrations').sort()) {
        const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--.*$/gm, '');
        await db.batch(sql.split(';').map((s: string) => s.trim()).filter(Boolean).map((s: string) => db.prepare(s)));
    }
    return mf;
}
