// Страница администратора «Доступ». Только для супер-пользователей (роль ADMIN).
//   GET    /api/admin/emails         — кому разрешена регистрация (и зарегистрировался ли уже)
//   POST   /api/admin/emails {email} — разрешить email регистрироваться
//   DELETE /api/admin/emails/:email  — убрать из списка: регистрация и вход для него закрываются
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { App } from '../env';
import { ApiError, badRequest, conflict, notFound } from '../errors';
import { jsonBody, now } from '../lib/validate';
import { adminEmails, normalizeEmail } from '../lib/roles';

export const adminRoutes = new Hono<App>();

// «Охранник»: дальше пускаем только администратора. Роль проверяем на сервере, а не на фронтенде:
// спрятанную кнопку можно обойти, отправив запрос вручную
const requireAdmin = createMiddleware<App>(async (c, next) => {
    if (c.get('me').role !== 'ADMIN') throw new ApiError(403, 'Только для администратора');
    await next();
});

adminRoutes.use('/admin/*', requireAdmin);

adminRoutes.get('/admin/emails', async c => {
    const { results } = await c.env.DB.prepare(
        `SELECT e.email, e.added_at AS addedAt, u.name, u.id IS NOT NULL AS registered
         FROM allowed_emails e LEFT JOIN users u ON u.email = e.email
         ORDER BY e.added_at DESC`)
        .all<{ email: string; addedAt: string; name: string | null; registered: number }>();
    return c.json({
        admins: adminEmails(c.env), // администраторы из настроек: им можно всегда, в списке их нет
        emails: results.map(r => ({ ...r, registered: r.registered === 1 })),
    });
});

adminRoutes.post('/admin/emails', async c => {
    const body = await jsonBody(c);
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        throw badRequest('Данные заполнены неверно', { email: 'Это не похоже на email' });
    }
    // OR IGNORE: email уже в списке — ничего не делать
    const result = await c.env.DB.prepare('INSERT OR IGNORE INTO allowed_emails (email, added_at) VALUES (?, ?)')
        .bind(email, now()).run();
    if (result.meta.changes === 0) throw conflict('Этот email уже в списке');
    return c.body(null, 201);
});

adminRoutes.delete('/admin/emails/:email', async c => {
    const email = normalizeEmail(c.req.param('email'));
    // Администратора закрыть нельзя: иначе можно остаться совсем без администратора
    const isAdmin = adminEmails(c.env).includes(email) || await c.env.DB.prepare(
        `SELECT 1 AS ok FROM users WHERE email = ? AND role = 'ADMIN'`).bind(email).first('ok') !== null;
    if (isAdmin) throw conflict('Это администратор: у него доступ всегда');

    const db = c.env.DB;
    const result = await db.prepare('DELETE FROM allowed_emails WHERE email = ?').bind(email).run();
    if (result.meta.changes === 0) throw notFound('Такого email нет в списке');
    // Человек уже вошёл? Удаляем его сессии: доступ закрывается сразу, а не когда истечёт cookie
    await db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)').bind(email).run();
    return c.body(null, 204);
});
