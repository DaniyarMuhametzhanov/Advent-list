// Вход через Telegram.
//   GET  /api/me             — кто я. 403 — администратор ещё не открыл доступ, 404 — ещё не принял условия
//   POST /api/auth/register  — принять условия и создать аккаунт (данные берём из Telegram, не из запроса).
//                              Только для тех, кому администратор открыл доступ
import { Hono } from 'hono';
import type { App } from '../env';
import { ApiError, badRequest, notFound } from '../errors';
import { NO_ACCESS, displayName, findByTelegramId, syncProfile } from '../auth/middleware';
import { accessStatus, requestAccess } from '../lib/userAccess';
import { jsonBody, now } from '../lib/validate';

export const authRoutes = new Hono<App>();


// Что фронтенд узнаёт о себе (как MeResponse в Java, только вместо email — @ник)
const meResponse = (me: { id: number; name: string; username: string | null }) =>
    ({ id: me.id, name: me.name, username: me.username });

// Что видит человек без доступа
const NO_ACCESS_TEXT = {
    PENDING: `${NO_ACCESS}. Мы отправили ему запрос: бот напишет вам, когда доступ откроют.`,
    DENIED: `${NO_ACCESS}. Пока он доступ не открыл.`,
};

authRoutes.get('/me', async c => {
    const tg = c.get('telegramUser');
    // Первый раз без доступа — заявка уходит администратору сама
    const status = await requestAccess(c.env, tg, p => c.executionCtx.waitUntil(p));
    if (status !== 'ALLOWED') throw new ApiError(403, NO_ACCESS_TEXT[status]);
    const me = await findByTelegramId(c.env.DB, tg.id);
    if (!me) throw notFound('Аккаунт ещё не создан');
    return c.json(meResponse(await syncProfile(c.env.DB, me, tg)));
});

authRoutes.post('/auth/register', async c => {
    const body = await jsonBody(c);
    const errors: Record<string, string> = {};
    if (body.privacyAccepted !== true) errors.privacyAccepted = 'Нужно согласие на обработку персональных данных';
    if (body.termsAccepted !== true) errors.termsAccepted = 'Нужно принять Условия использования и подтвердить возраст 18+';
    if (Object.keys(errors).length > 0) throw badRequest('Данные заполнены неверно', errors);

    const tg = c.get('telegramUser');
    // Регистрироваться может только тот, кого разрешил администратор. Проверяем здесь, на сервере
    if (await accessStatus(c.env, tg.id) !== 'ALLOWED') throw new ApiError(403, NO_ACCESS);
    if (await findByTelegramId(c.env.DB, tg.id)) throw new ApiError(409, 'Аккаунт уже создан');

    const name = displayName(tg);
    const time = now();
    // batch — несколько команд одной транзакцией: либо выполнятся все, либо ни одна
    await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO users (telegram_id, name, name_lower, username, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(tg.id, name, name.toLowerCase(), tg.username ?? null, time),
        // Версии документов берём из настроек сервера, а не из запроса: так их нельзя подменить
        consent(c.env.DB, tg.id, 'PRIVACY_POLICY', c.env.PRIVACY_VERSION, time),
        consent(c.env.DB, tg.id, 'TERMS', c.env.TERMS_VERSION, time),
    ]).catch(e => {
        // Два запроса пришли одновременно, и второй упёрся в UNIQUE (telegram_id)
        if (String(e).includes('UNIQUE')) throw new ApiError(409, 'Аккаунт уже создан');
        throw e;
    });
    const me = (await findByTelegramId(c.env.DB, tg.id))!;
    return c.json(meResponse(me), 201);
});

// Запомнить согласие человека (его id найдём по telegram_id: он только что добавлен в той же транзакции)
function consent(db: D1Database, telegramId: number, type: string, version: string, time: string) {
    return db.prepare(`INSERT INTO consents (user_id, type, document_version, accepted_at)
                       SELECT id, ?, ?, ? FROM users WHERE telegram_id = ?`).bind(type, version, time, telegramId);
}
