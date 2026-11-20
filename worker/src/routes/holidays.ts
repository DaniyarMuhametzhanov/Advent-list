// Свои праздники (дни рождения и т. п.). Видит и меняет только владелец.
//   GET    /api/holidays                 — все мои праздники
//   POST   /api/holidays/:month/:day     — добавить праздник {title}
//   PUT    /api/holidays/:id             — переименовать {title}
//   DELETE /api/holidays/:id             — удалить
import { Hono } from 'hono';
import type { App } from '../env';
import { badRequest, notFound } from '../errors';
import { checkText, idParam, isRealDate, jsonBody } from '../lib/validate';

export const holidayRoutes = new Hono<App>();


const TITLE_RULES = {
    title: { required: 'Введите название праздника', max: 40, maxMessage: 'Название праздника не длиннее 40 символов' },
};

type HolidayRow = { id: number; month: number; day: number; title: string };

holidayRoutes.get('/holidays', async c => {
    const { results } = await c.env.DB.prepare(
        'SELECT id, month, day, title FROM holidays WHERE owner_id = ? ORDER BY month, day, id')
        .bind(c.get('me').id).all<HolidayRow>();
    return c.json(results);
});

holidayRoutes.post('/holidays/:month{[0-9]+}/:day{[0-9]+}', async c => {
    const month = idParam(c, 'month');
    const day = idParam(c, 'day');
    // 29 февраля можно (бывает в високосный год, проверяем на 2024), 31 апреля — нельзя
    if (month < 1 || month > 12 || !isRealDate(2024, month, day)) {
        throw badRequest(`Такой даты нет: ${day}.${month}`);
    }
    const { title } = checkText(await jsonBody(c), TITLE_RULES);
    const holiday = await c.env.DB.prepare(
        'INSERT INTO holidays (owner_id, month, day, title) VALUES (?, ?, ?, ?) RETURNING id, month, day, title')
        .bind(c.get('me').id, month, day, title!.trim()).first<HolidayRow>();
    return c.json(holiday, 201);
});

holidayRoutes.put('/holidays/:id{[0-9]+}', async c => {
    const { title } = checkText(await jsonBody(c), TITLE_RULES);
    // Ищем сразу по id и владельцу: так чужой праздник не найдётся
    const holiday = await c.env.DB.prepare(
        'UPDATE holidays SET title = ? WHERE id = ? AND owner_id = ? RETURNING id, month, day, title')
        .bind(title!.trim(), idParam(c, 'id'), c.get('me').id).first<HolidayRow>();
    if (!holiday) throw notFound(`Праздник с id ${c.req.param('id')} не найден`);
    return c.json(holiday);
});

holidayRoutes.delete('/holidays/:id{[0-9]+}', async c => {
    const result = await c.env.DB.prepare('DELETE FROM holidays WHERE id = ? AND owner_id = ?')
        .bind(idParam(c, 'id'), c.get('me').id).run();
    if (result.meta.changes === 0) throw notFound(`Праздник с id ${c.req.param('id')} не найден`);
    return c.body(null, 204);
});
