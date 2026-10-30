// Друзья и заявки в друзья.
//   GET    /api/users/search?q=Анна        — найти людей по имени или @нику
//   GET    /api/friends                    — мои друзья
//   DELETE /api/friends/:userId            — удалить из друзей
//   POST   /api/friend-requests {toUserId} — отправить заявку
//   GET    /api/friend-requests/incoming   — заявки мне
//   POST   /api/friend-requests/:id/accept | /decline — ответить на заявку
import { Hono } from 'hono';
import type { App } from '../env';
import { badRequest, conflict, notFound } from '../errors';
import { idParam, jsonBody, now } from '../lib/validate';
import { areFriends, pair } from '../lib/friendship';
import { notify, telegramIdOf } from '../lib/notify';

export const friendRoutes = new Hono<App>();


type Person = { id: number; name: string };

// Мои друзья: те, кто во второй колонке пары со мной, и те, кто в первой
async function friendsOf(db: D1Database, me: number) {
    const { results } = await db.prepare(
        `SELECT id, name FROM users
         WHERE id IN (SELECT user_b_id FROM friendships WHERE user_a_id = ?1)
            OR id IN (SELECT user_a_id FROM friendships WHERE user_b_id = ?1)
         ORDER BY name`).bind(me).all<Person>();
    return results;
}

friendRoutes.get('/users/search', async c => {
    const me = c.get('me').id;
    const text = (c.req.query('q') ?? '').trim().toLowerCase();
    if (!text) return c.json([]);

    // LIKE в SQLite не различает большие и маленькие буквы только для латиницы. Поэтому ищем
    // по name_lower (имя заранее переведено в маленькие буквы). Знаки % и _ в запросе экранируем,
    // иначе «%» нашёл бы всех
    const pattern = `%${text.replace(/[\\%_]/g, ch => '\\' + ch)}%`;
    const username = text.replace(/^@/, '');
    const { results } = await c.env.DB.prepare(
        `SELECT u.id, u.name,
                CASE
                  WHEN EXISTS (SELECT 1 FROM friendships f WHERE (f.user_a_id = ?1 AND f.user_b_id = u.id)
                                                             OR (f.user_b_id = ?1 AND f.user_a_id = u.id)) THEN 'FRIEND'
                  WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.from_user_id = ?1 AND r.to_user_id = u.id
                                                                 AND r.status = 'PENDING') THEN 'REQUEST_SENT'
                  WHEN EXISTS (SELECT 1 FROM friend_requests r WHERE r.from_user_id = u.id AND r.to_user_id = ?1
                                                                 AND r.status = 'PENDING') THEN 'REQUEST_RECEIVED'
                  ELSE 'NONE'
                END AS relation
         FROM users u
         WHERE u.id <> ?1 AND (u.name_lower LIKE ?2 ESCAPE '\\' OR lower(u.username) = ?3)
         ORDER BY u.name LIMIT 20`)
        .bind(me, pattern, username).all<Person & { relation: string }>();
    return c.json(results);
});

friendRoutes.get('/friends', async c => c.json(await friendsOf(c.env.DB, c.get('me').id)));

friendRoutes.delete('/friends/:userId{[0-9]+}', async c => {
    const me = c.get('me').id;
    const friend = idParam(c, 'userId');
    const [a, b] = pair(me, friend);
    const db = c.env.DB;
    // Одной транзакцией: убрать дружбу, а ещё все доступы к дням и запросы доступа в обе стороны.
    // Бывший друг больше не видит мои дни, а я — его
    await db.batch([
        db.prepare('DELETE FROM friendships WHERE user_a_id = ? AND user_b_id = ?').bind(a, b),
        db.prepare(`DELETE FROM wish_access WHERE (viewer_id = ?1 AND wish_id IN (SELECT id FROM wishes WHERE owner_id = ?2))
                                              OR (viewer_id = ?2 AND wish_id IN (SELECT id FROM wishes WHERE owner_id = ?1))`)
            .bind(me, friend),
        db.prepare(`DELETE FROM access_requests WHERE (from_user_id = ?1 AND wish_id IN (SELECT id FROM wishes WHERE owner_id = ?2))
                                                  OR (from_user_id = ?2 AND wish_id IN (SELECT id FROM wishes WHERE owner_id = ?1))`)
            .bind(me, friend),
    ]);
    return c.body(null, 204);
});

friendRoutes.post('/friend-requests', async c => {
    const me = c.get('me');
    const body = await jsonBody(c);
    const to = body.toUserId;
    if (typeof to !== 'number' || !Number.isInteger(to)) {
        throw badRequest('Данные заполнены неверно', { toUserId: 'Укажите, кому отправить заявку' });
    }
    if (to === me.id) throw conflict('Нельзя добавить в друзья самого себя');
    const db = c.env.DB;
    const toTelegramId = await telegramIdOf(db, to);
    if (toTelegramId === null) throw notFound(`Пользователь с id ${to} не найден`);
    if (await areFriends(db, me.id, to)) throw conflict('Вы уже друзья');

    const pending = (from: number, toUser: number) => db.prepare(
        `SELECT 1 AS ok FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'PENDING'`)
        .bind(from, toUser).first('ok');
    if (await pending(me.id, to)) throw conflict('Заявка уже отправлена');
    if (await pending(to, me.id)) throw conflict('Этот человек уже прислал вам заявку. Примите её');

    await db.prepare(`INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at) VALUES (?, ?, 'PENDING', ?)`)
        .bind(me.id, to, now()).run();
    notify(c, toTelegramId, `👋 ${me.name} хочет добавить вас в друзья в адвент-календаре`);
    return c.body(null, 201);
});

friendRoutes.get('/friend-requests/incoming', async c => {
    const { results } = await c.env.DB.prepare(
        `SELECT r.id, u.id AS fromId, u.name AS fromName FROM friend_requests r JOIN users u ON u.id = r.from_user_id
         WHERE r.to_user_id = ? AND r.status = 'PENDING' ORDER BY r.created_at, r.id`)
        .bind(c.get('me').id).all<{ id: number; fromId: number; fromName: string }>();
    return c.json(results.map(r => ({ id: r.id, from: { id: r.fromId, name: r.fromName } })));
});

// Чужую заявку (не мне) или уже отвеченную не находим: для них ответ 404
async function findIncomingPending(db: D1Database, me: number, id: number) {
    const request = await db.prepare(
        `SELECT id, from_user_id AS fromId FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'PENDING'`)
        .bind(id, me).first<{ id: number; fromId: number }>();
    if (!request) throw notFound(`Заявка с id ${id} не найдена`);
    return request;
}

friendRoutes.post('/friend-requests/:id{[0-9]+}/accept', async c => {
    const me = c.get('me');
    const db = c.env.DB;
    const request = await findIncomingPending(db, me.id, idParam(c, 'id'));
    const [a, b] = pair(me.id, request.fromId);
    await db.batch([
        db.prepare(`UPDATE friend_requests SET status = 'ACCEPTED' WHERE id = ?`).bind(request.id),
        // OR IGNORE: если дружба уже есть, ничего не делать
        db.prepare('INSERT OR IGNORE INTO friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)').bind(a, b, now()),
    ]);
    const fromTelegramId = await telegramIdOf(db, request.fromId);
    if (fromTelegramId !== null) notify(c, fromTelegramId, `🤝 ${me.name} принял(а) вашу заявку в друзья`);
    return c.body(null, 204);
});

friendRoutes.post('/friend-requests/:id{[0-9]+}/decline', async c => {
    const request = await findIncomingPending(c.env.DB, c.get('me').id, idParam(c, 'id'));
    await c.env.DB.prepare(`UPDATE friend_requests SET status = 'DECLINED' WHERE id = ?`).bind(request.id).run();
    return c.body(null, 204);
});
