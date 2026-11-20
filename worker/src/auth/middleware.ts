// «Охранники» для запросов (middleware): выполняются ДО обработчика и решают, пускать ли дальше.
//
// Вход как в Java-версии: email и пароль, потом сессия в cookie. Cookie называется session,
// внутри случайный токен. Флаги cookie:
//   HttpOnly — JavaScript на странице её не видит (не украсть через XSS);
//   Secure   — только по HTTPS;
//   SameSite=Lax — браузер не отправляет её с POST-запросами с чужих сайтов.
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { App, CurrentUser } from '../env';
import { ApiError } from '../errors';
import { randomToken, sha256 } from './password';
import { isAllowed, roleFor } from '../lib/roles';

const COOKIE = 'session';
const SESSION_DAYS = 30;

// Защита от подделки запросов с чужих сайтов (CSRF). Браузер всегда пишет в заголовке Origin, с какого
// сайта отправлен запрос. Изменять данные (POST, PUT, DELETE) можно только с нашего же сайта.
// Вместе с SameSite=Lax это заменяет CSRF-токен из Java-версии
export const sameOrigin = createMiddleware<App>(async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
        if (c.req.header('Origin') !== new URL(c.req.url).origin) throw new ApiError(403, 'Запрос с чужого сайта');
    }
    await next();
});

// Новая сессия после входа или регистрации: токен — в cookie, его хеш — в базу
export async function startSession(c: Context<App>, userId: number) {
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(await sha256(token), userId, expires.toISOString()).run();
    setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires });
}

// Выход: удалить сессию из базы и cookie из браузера
export async function endSession(c: Context<App>) {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    deleteCookie(c, COOKIE, { path: '/', secure: true });
}

// Кто вошёл в этом браузере? null — никто (нет cookie, сессия удалена или истекла)
async function currentUser(c: Context<App>): Promise<CurrentUser | null> {
    const token = getCookie(c, COOKIE);
    if (!token) return null;
    return c.env.DB.prepare(
        `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`)
        .bind(await sha256(token), new Date().toISOString()).first<CurrentUser>();
}

// Email добавили в ADMIN_EMAILS — делаем человека администратором (пишем в базу, только если поменялось)
async function syncRole(c: Context<App>, me: CurrentUser): Promise<CurrentUser> {
    if (me.role === 'ADMIN' || roleFor(c.env, me.email) !== 'ADMIN') return me;
    await c.env.DB.prepare(`UPDATE users SET role = 'ADMIN' WHERE id = ?`).bind(me.id).run();
    return { ...me, role: 'ADMIN' };
}

// Текст для того, у кого администратор забрал доступ
export const NO_ACCESS = 'Администратор закрыл вам доступ к календарю';

// Пускаем только вошедших: не вошёл → 401. Администратор убрал email из списка → 403
export const requireUser = createMiddleware<App>(async (c, next) => {
    const found = await currentUser(c);
    if (!found) throw new ApiError(401, 'Войдите в аккаунт');
    const me = await syncRole(c, found);
    if (!await isAllowed(c.env, me.email, me.role)) throw new ApiError(403, NO_ACCESS);
    c.set('me', me);
    await next();
});
