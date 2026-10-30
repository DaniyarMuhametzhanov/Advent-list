// Мои желания и календари.
//   GET    /api/wishes             — все мои желания
//   GET    /api/wishes/:id         — одно моё желание
//   PUT    /api/wishes/:date       — создать или изменить желание на дату
//   DELETE /api/wishes/:id         — удалить
//   GET    /api/calendars/:userId?month=2026-10 — занятые дни человека за месяц (мои или друга)
import { Hono } from 'hono';
import type { App, Env } from '../env';
import { ApiError, notFound } from '../errors';
import { checkText, dateParam, idParam, jsonBody, monthParam, now } from '../lib/validate';
import { imageUrls } from '../lib/imageUrls';
import { areFriends } from '../lib/friendship';
import { deleteImageFiles } from '../lib/imageFiles';

export const wishRoutes = new Hono<App>();


// Строка из таблицы wishes (имена столбцов переводим в стиль JavaScript: wish_date → date)
type WishRow = { id: number; date: string; title: string; comment: string | null; imageKey: string | null };
const WISH_COLUMNS = 'id, wish_date AS date, title, comment, image_key AS imageKey';

// Желание для владельца (как WishResponse в Java): с адресами картинок и списком «кому открыт»
async function wishResponse(env: Env, me: number, wish: WishRow, access: number[]) {
    return { id: wish.id, date: wish.date, title: wish.title, comment: wish.comment, access,
        ...await imageUrls(env, wish, me) };
}

// id друзей, которым открыто это желание
async function accessOf(db: D1Database, wishId: number) {
    const { results } = await db.prepare('SELECT viewer_id FROM wish_access WHERE wish_id = ? ORDER BY id')
        .bind(wishId).all<{ viewer_id: number }>();
    return results.map(r => r.viewer_id);
}

export async function findMyWish(db: D1Database, me: number, id: number) {
    const wish = await db.prepare(`SELECT ${WISH_COLUMNS} FROM wishes WHERE id = ? AND owner_id = ?`)
        .bind(id, me).first<WishRow>();
    if (!wish) throw notFound(`Желание с id ${id} не найдено`);
    return wish;
}

// Моё желание целиком: для ответа после сохранения или загрузки картинки
export async function myWishResponse(env: Env, me: number, id: number) {
    const wish = await findMyWish(env.DB, me, id);
    return wishResponse(env, me, wish, await accessOf(env.DB, id));
}

wishRoutes.get('/wishes', async c => {
    const me = c.get('me').id;
    const db = c.env.DB;
    // Два запроса одной пачкой: желания и все доступы к ним
    const [wishes, access] = await db.batch<WishRow | { wishId: number; viewerId: number }>([
        db.prepare(`SELECT ${WISH_COLUMNS} FROM wishes WHERE owner_id = ? ORDER BY wish_date`).bind(me),
        db.prepare(`SELECT a.wish_id AS wishId, a.viewer_id AS viewerId FROM wish_access a
                    JOIN wishes w ON w.id = a.wish_id WHERE w.owner_id = ? ORDER BY a.id`).bind(me),
    ]);
    // { id желания → [id друзей] }
    const byWish = new Map<number, number[]>();
    for (const row of access.results as { wishId: number; viewerId: number }[]) {
        byWish.set(row.wishId, [...(byWish.get(row.wishId) ?? []), row.viewerId]);
    }
    return c.json(await Promise.all((wishes.results as WishRow[])
        .map(wish => wishResponse(c.env, me, wish, byWish.get(wish.id) ?? []))));
});

wishRoutes.get('/wishes/:id{[0-9]+}', async c => {
    return c.json(await myWishResponse(c.env, c.get('me').id, idParam(c, 'id')));
});

wishRoutes.put('/wishes/:date', async c => {
    const me = c.get('me').id;
    const date = dateParam(c.req.param('date'), 'date');
    const { title, comment } = checkText(await jsonBody(c), {
        title: { required: 'Название обязательно', max: 100, maxMessage: 'Название не длиннее 100 символов' },
        comment: { max: 1000, maxMessage: 'Комментарий не длиннее 1000 символов' },
    });
    const time = now();
    // UPSERT: нет желания на эту дату — добавить, есть — обновить. Одной командой
    const saved = await c.env.DB.prepare(
        `INSERT INTO wishes (owner_id, wish_date, title, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_id, wish_date) DO UPDATE SET title = excluded.title, comment = excluded.comment,
                                                         updated_at = excluded.updated_at
         RETURNING id`)
        .bind(me, date, title, comment, time, time).first<number>('id');
    return c.json(await myWishResponse(c.env, me, saved!));
});

// Доступы и запросы доступа к желанию удалит сама база (ON DELETE CASCADE).
// А файлы картинки в R2 база не видит — их удаляем сами
wishRoutes.delete('/wishes/:id{[0-9]+}', async c => {
    const me = c.get('me').id;
    const wish = await findMyWish(c.env.DB, me, idParam(c, 'id'));
    await c.env.DB.prepare('DELETE FROM wishes WHERE id = ?').bind(wish.id).run();
    if (wish.imageKey) await deleteImageFiles(c.env, wish.imageKey);
    return c.body(null, 204);
});

wishRoutes.get('/calendars/:userId{[0-9]+}', async c => {
    const viewer = c.get('me').id;
    const owner = idParam(c, 'userId');
    const month = monthParam(c.req.query('month'));
    const isOwner = viewer === owner;
    const db = c.env.DB;

    // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
    if (!isOwner && !await areFriends(db, viewer, owner)) {
        throw new ApiError(403, 'Календарь доступен только друзьям');
    }

    // Все желания владельца за месяц + отметки «открыт мне» и «я просил доступ» одним запросом
    const { results } = await db.prepare(
        `SELECT w.id, w.wish_date AS date, w.title, w.comment, w.image_key AS imageKey,
                EXISTS (SELECT 1 FROM wish_access a WHERE a.wish_id = w.id AND a.viewer_id = ?1) AS isOpen,
                EXISTS (SELECT 1 FROM access_requests r WHERE r.wish_id = w.id AND r.from_user_id = ?1) AS isRequested
         FROM wishes w WHERE w.owner_id = ?2 AND w.wish_date LIKE ?3 ORDER BY w.wish_date`)
        .bind(viewer, owner, `${month}-%`).all<WishRow & { isOpen: number; isRequested: number }>();

    // Свои праздники владельца по датам: { '03-25': ['День рождения Влада'] }. Без года — каждый год
    const holidays = await db.prepare(
        'SELECT month, day, title FROM holidays WHERE owner_id = ? AND month = ? ORDER BY day, id')
        .bind(owner, Number(month.slice(5))).all<{ month: number; day: number; title: string }>();
    const holidaysByDay = new Map<number, string[]>();
    for (const h of holidays.results) holidaysByDay.set(h.day, [...(holidaysByDay.get(h.day) ?? []), h.title]);

    return c.json(await Promise.all(results.map(async wish => {
        const open = isOwner || wish.isOpen === 1;
        // Главное правило: у закрытого дня название, комментарий, картинка и праздники даже не попадают в ответ
        if (!open) {
            return { wishId: wish.id, date: wish.date, open: false, requested: wish.isRequested === 1,
                title: null, comment: null, imageUrl: null, thumbUrl: null, holidays: [] };
        }
        return { wishId: wish.id, date: wish.date, open: true, requested: false, title: wish.title,
            comment: wish.comment, ...await imageUrls(c.env, wish, viewer),
            holidays: holidaysByDay.get(Number(wish.date.slice(8))) ?? [] };
    })));
});
