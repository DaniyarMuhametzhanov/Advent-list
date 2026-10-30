// Кому открыт мой день.
//   PUT    /api/wishes/:wishId/access/:friendId — открыть день другу
//   DELETE /api/wishes/:wishId/access/:friendId — закрыть день от друга
//   POST   /api/wishes/:wishId/access-requests  — попросить друга открыть мне его день
//   GET    /api/access-requests/incoming        — запросы к моим дням
//   POST   /api/access-requests/:id/grant | /deny — ответить на запрос
import { Hono } from 'hono';
import type { App } from '../env';
import { conflict, notFound } from '../errors';
import { idParam, now } from '../lib/validate';
import { areFriends } from '../lib/friendship';
import { notify, telegramIdOf } from '../lib/notify';
import { findMyWish } from './wishes';

export const accessRoutes = new Hono<App>();


// Владелец открывает свой день другу. Если друг просил доступ к этому дню, запрос выполнен — убираем его
async function grant(db: D1Database, me: number, wishId: number, friendId: number) {
    await findMyWish(db, me, wishId);
    if (!await areFriends(db, me, friendId)) throw conflict('Открыть день можно только другу');
    await db.batch([
        db.prepare('INSERT OR IGNORE INTO wish_access (wish_id, viewer_id, created_at) VALUES (?, ?, ?)')
            .bind(wishId, friendId, now()),
        db.prepare('DELETE FROM access_requests WHERE wish_id = ? AND from_user_id = ?').bind(wishId, friendId),
    ]);
}

accessRoutes.put('/wishes/:wishId{[0-9]+}/access/:friendId{[0-9]+}', async c => {
    await grant(c.env.DB, c.get('me').id, idParam(c, 'wishId'), idParam(c, 'friendId'));
    return c.body(null, 204);
});

accessRoutes.delete('/wishes/:wishId{[0-9]+}/access/:friendId{[0-9]+}', async c => {
    const wish = await findMyWish(c.env.DB, c.get('me').id, idParam(c, 'wishId'));
    await c.env.DB.prepare('DELETE FROM wish_access WHERE wish_id = ? AND viewer_id = ?')
        .bind(wish.id, idParam(c, 'friendId')).run();
    return c.body(null, 204);
});

accessRoutes.post('/wishes/:wishId{[0-9]+}/access-requests', async c => {
    const me = c.get('me');
    const wishId = idParam(c, 'wishId');
    const db = c.env.DB;
    const wish = await db.prepare(
        `SELECT w.owner_id AS ownerId, w.wish_date AS date, u.telegram_id AS ownerTelegramId,
                EXISTS (SELECT 1 FROM wish_access a WHERE a.wish_id = w.id AND a.viewer_id = ?1) AS isOpen,
                EXISTS (SELECT 1 FROM access_requests r WHERE r.wish_id = w.id AND r.from_user_id = ?1) AS isRequested
         FROM wishes w JOIN users u ON u.id = w.owner_id WHERE w.id = ?2`)
        .bind(me.id, wishId)
        .first<{ ownerId: number; date: string; ownerTelegramId: number; isOpen: number; isRequested: number }>();
    if (!wish) throw notFound(`Желание с id ${wishId} не найдено`);
    if (wish.ownerId === me.id) throw conflict('Это ваш собственный день');
    // Чужой человек (не друг) не должен даже узнать, что такое желание есть, поэтому 404
    if (!await areFriends(db, me.id, wish.ownerId)) throw notFound(`Желание с id ${wishId} не найдено`);
    if (wish.isOpen) throw conflict('Этот день вам уже открыт');
    if (wish.isRequested) throw conflict('Запрос уже отправлен');

    await db.prepare('INSERT INTO access_requests (wish_id, from_user_id, created_at) VALUES (?, ?, ?)')
        .bind(wishId, me.id, now()).run();
    notify(c, wish.ownerTelegramId, `🔐 ${me.name} просит открыть ваш день ${formatDay(wish.date)}`);
    return c.body(null, 201);
});

// '2026-10-05' → '5 октября'
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function formatDay(date: string) {
    return `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

accessRoutes.get('/access-requests/incoming', async c => {
    const { results } = await c.env.DB.prepare(
        `SELECT r.id, w.id AS wishId, w.wish_date AS date, w.title, u.id AS fromId, u.name AS fromName
         FROM access_requests r JOIN wishes w ON w.id = r.wish_id JOIN users u ON u.id = r.from_user_id
         WHERE w.owner_id = ? ORDER BY r.created_at, r.id`)
        .bind(c.get('me').id)
        .all<{ id: number; wishId: number; date: string; title: string; fromId: number; fromName: string }>();
    // Это моё желание, его название мне показывать можно
    return c.json(results.map(r => ({ id: r.id, wishId: r.wishId, date: r.date, title: r.title,
        from: { id: r.fromId, name: r.fromName } })));
});

async function findRequestToMe(db: D1Database, me: number, id: number) {
    const request = await db.prepare(
        `SELECT r.id, r.wish_id AS wishId, r.from_user_id AS fromId FROM access_requests r
         JOIN wishes w ON w.id = r.wish_id WHERE r.id = ? AND w.owner_id = ?`)
        .bind(id, me).first<{ id: number; wishId: number; fromId: number }>();
    if (!request) throw notFound(`Запрос с id ${id} не найден`);
    return request;
}

// «Открыть» на запросе = выдать доступ (запрос удалится внутри grant)
accessRoutes.post('/access-requests/:id{[0-9]+}/grant', async c => {
    const me = c.get('me');
    const request = await findRequestToMe(c.env.DB, me.id, idParam(c, 'id'));
    await grant(c.env.DB, me.id, request.wishId, request.fromId);
    const fromTelegramId = await telegramIdOf(c.env.DB, request.fromId);
    if (fromTelegramId !== null) notify(c, fromTelegramId, `🎁 ${me.name} открыл(а) вам свой день`);
    return c.body(null, 204);
});

// «Отказать» = просто удалить запрос. День остаётся закрытым
accessRoutes.post('/access-requests/:id{[0-9]+}/deny', async c => {
    const request = await findRequestToMe(c.env.DB, c.get('me').id, idParam(c, 'id'));
    await c.env.DB.prepare('DELETE FROM access_requests WHERE id = ?').bind(request.id).run();
    return c.body(null, 204);
});
