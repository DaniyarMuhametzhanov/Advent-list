// Точка входа Worker: сюда приходят все запросы на /api/*.
// Остальные адреса (страницы React, картинки, стили) Cloudflare отдаёт сам из frontend/dist.
//
// Hono — маленькая библиотека для адресов (роутер), как @RestController и @GetMapping в Spring.
// Обработчики проверяются в порядке подключения: первый подходящий, который вернул ответ, побеждает
import { Hono } from 'hono';
import type { App } from './env';
import { toProblem } from './errors';
import { requireUser, sameOrigin } from './auth/middleware';
import { authRoutes, meRoutes } from './routes/auth';
import { wishRoutes } from './routes/wishes';
import { imageRoutes } from './routes/images';
import { friendRoutes } from './routes/friends';
import { accessRoutes } from './routes/access';
import { holidayRoutes } from './routes/holidays';
import { adminRoutes } from './routes/admin';

const app = new Hono<App>().basePath('/api');

// 0. Защитные заголовки на все ответы API (как в SecurityConfig на Java):
//    мы отдаём только JSON и картинки — никаких скриптов, и в рамку нас не вставить
app.use('*', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
});

// 1. Защита от подделки запросов с чужих сайтов (CSRF) — для всех адресов
app.use('*', sameOrigin);

// 2. Без входа: проверка «сервер жив», регистрация, вход, выход
app.get('/health', c => c.json({ status: 'ok' }));
app.route('/', authRoutes);

// 3. Всё остальное — только для вошедших
app.use('*', requireUser);
app.route('/', meRoutes);
app.route('/', wishRoutes);
app.route('/', imageRoutes);
app.route('/', friendRoutes);
app.route('/', accessRoutes);
app.route('/', holidayRoutes);
app.route('/', adminRoutes);

app.notFound(c => c.json({ status: 404, detail: 'Нет такого адреса' }, 404));
app.onError(toProblem);

export default app;
