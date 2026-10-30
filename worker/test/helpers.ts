// Запуск нашего Worker для тестов: настоящий движок Cloudflare (workerd) на своём компьютере
// через Miniflare. База D1 и хранилище R2 — временные, в памяти
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { signInitData } from '../src/auth/telegram';

export const BOT_TOKEN = '123456:test-token';
export const WEBHOOK_SECRET = 'test-webhook-secret';

// Сообщения, которые бот «отправил» в Telegram. Настоящий api.telegram.org в тестах не вызываем
export const sentMessages: { chat_id: number; text: string; reply_markup?: unknown }[] = [];

export async function startWorker() {
    // Собрать src/index.ts в один файл JavaScript (как это делает wrangler)
    const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'esm', write: false,
        target: 'es2022', platform: 'neutral' });
    const mf = new Miniflare({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: '2026-07-01',
        d1Databases: ['DB'],
        r2Buckets: ['IMAGES'],
        bindings: { BOT_TOKEN, WEBHOOK_SECRET, PRIVACY_VERSION: 'p-1', TERMS_VERSION: 't-1' },
        // Все запросы Worker наружу (fetch) попадают сюда
        outboundService: async (request: Request) => {
            if (request.url.includes('api.telegram.org')) sentMessages.push(await request.json());
            return new Response('{"ok":true}');
        },
    });
    // Создать таблицы: выполнить миграцию по одной команде
    const db = await mf.getD1Database('DB');
    const sql = readFileSync('migrations/0001_init.sql', 'utf8').replace(/--.*$/gm, '');
    await db.batch(sql.split(';').map((s: string) => s.trim()).filter(Boolean).map((s: string) => db.prepare(s)));
    return mf;
}

// «Человек из Telegram»: заголовок Authorization с настоящей подписью
export async function tg(id: number, firstName: string, username?: string) {
    const user = JSON.stringify({ id, first_name: firstName, ...(username && { username }) });
    return 'tma ' + await signInitData({ user, auth_date: String(Math.floor(Date.now() / 1000)) }, BOT_TOKEN);
}
