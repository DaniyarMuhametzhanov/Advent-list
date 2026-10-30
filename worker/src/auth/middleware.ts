// «Охранники» для запросов (middleware): выполняются ДО обработчика и решают, пускать ли дальше.
//
// Фронтенд в каждом запросе присылает заголовок
//   Authorization: tma <initData>
// Cookie и сессий больше нет: каждый запрос сам доказывает, от кого он (stateless-аутентификация).
// Плюс: не нужна защита от CSRF. Чужой сайт не может подставить этот заголовок, браузер сам его не добавляет
import { createMiddleware } from 'hono/factory';
import type { App, CurrentUser, TelegramUser } from '../env';
import { ApiError } from '../errors';
import { verifyInitData } from './telegram';

// 1. Кто пришёл? Проверяем подпись Telegram. Нет или неверная → 401
export const telegramAuth = createMiddleware<App>(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    let user: TelegramUser | null = null;

    if (header.startsWith('tma ')) {
        user = await verifyInitData(header.slice(4), c.env.BOT_TOKEN);
    } else if (c.env.DEV_AUTH === '1' && header.startsWith('dev ')) {
        // Только для разработки на своём компьютере: «dev 1001:Анна» = войти как Telegram-пользователь 1001
        const [id, name] = header.slice(4).split(':');
        if (/^\d+$/.test(id) && name) user = { id: Number(id), first_name: decodeURIComponent(name) };
    }

    if (!user) throw new ApiError(401, 'Откройте календарь через Telegram');
    c.set('telegramUser', user);
    await next();
});

// Имя для календаря: «Анна Петрова» или просто «Анна»
export function displayName(user: TelegramUser) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 100) || 'Без имени';
}

// Найти человека в нашей базе по его id в Telegram
export async function findByTelegramId(db: D1Database, telegramId: number): Promise<CurrentUser | null> {
    return db.prepare('SELECT id, telegram_id AS telegramId, name, username FROM users WHERE telegram_id = ?')
        .bind(telegramId).first<CurrentUser>();
}

// Человек сменил имя или @ник в Telegram — обновляем и у нас. Пишем в базу, только если что-то поменялось
export async function syncProfile(db: D1Database, me: CurrentUser, tg: TelegramUser): Promise<CurrentUser> {
    const name = displayName(tg);
    const username = tg.username ?? null;
    if (me.name === name && me.username === username) return me;
    await db.prepare('UPDATE users SET name = ?, name_lower = ?, username = ? WHERE id = ?')
        .bind(name, name.toLowerCase(), username, me.id).run();
    return { ...me, name, username };
}

// 2. Есть ли он у нас? Пока не принял условия (не зарегистрировался) — 403
export const requireUser = createMiddleware<App>(async (c, next) => {
    const tg = c.get('telegramUser');
    const me = await findByTelegramId(c.env.DB, tg.id);
    if (!me) throw new ApiError(403, 'Сначала примите условия использования');
    c.set('me', await syncProfile(c.env.DB, me, tg));
    await next();
});
