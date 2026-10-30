// Точка входа Worker: сюда приходят все запросы на /api/*.
// Остальные адреса (страницы React, картинки, стили) Cloudflare отдаёт сам из frontend/dist.
//
// Hono — маленькая библиотека для адресов (роутер), как @RestController и @GetMapping в Spring.
// Обработчики проверяются в порядке подключения: первый подходящий, который вернул ответ, побеждает
import { Hono } from 'hono';
import type { App } from './env';
import { toProblem } from './errors';
import { requireUser, telegramAuth } from './auth/middleware';
import { authRoutes } from './routes/auth';
import { wishRoutes } from './routes/wishes';
import { imagePublicRoutes, imageRoutes } from './routes/images';
import { friendRoutes } from './routes/friends';
import { accessRoutes } from './routes/access';
import { holidayRoutes } from './routes/holidays';
import { botRoutes } from './routes/bot';

const app = new Hono<App>().basePath('/api');

// 0. Защитные заголовки на все ответы API (как в SecurityConfig на Java):
//    мы отдаём только JSON и картинки — никаких скриптов, и в рамку нас не вставить
app.use('*', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
});

// 1. Без входа: проверка «сервер жив», бот и картинки по подписанному адресу
app.get('/health', c => c.json({ status: 'ok' }));
app.route('/telegram', botRoutes);
app.route('/', imagePublicRoutes);

// 2. Нужен Telegram, но аккаунта ещё может не быть: «кто я» и регистрация
app.use('/me', telegramAuth);
app.use('/auth/*', telegramAuth);
app.route('/', authRoutes);

// 3. Всё остальное — только для зарегистрированных
app.use('*', telegramAuth, requireUser);
app.route('/', wishRoutes);
app.route('/', imageRoutes);
app.route('/', friendRoutes);
app.route('/', accessRoutes);
app.route('/', holidayRoutes);

app.notFound(c => c.json({ status: 404, detail: 'Нет такого адреса' }, 404));
app.onError(toProblem);

export default app;
