// Бот в Telegram. Когда человек пишет боту, Telegram присылает нам POST /api/telegram/webhook
// с описанием сообщения (Update). Как подключить — docs/stage-15.md, шаг «Webhook».
import { Hono } from 'hono';
import type { App } from '../env';
import { openAppButton, sendMessage } from '../lib/telegramBot';

export const botRoutes = new Hono<App>();

type Update = { message?: { chat: { id: number }; text?: string } };

botRoutes.post('/webhook', async c => {
    // Telegram присылает пароль, который мы задали при подключении webhook (secret_token).
    // Без него кто угодно мог бы слать нам «сообщения от Telegram»
    if (!c.env.WEBHOOK_SECRET || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.WEBHOOK_SECRET) {
        return c.body(null, 401);
    }
    const update = await c.req.json<Update>().catch(() => ({}) as Update);
    const message = update.message;

    // На любое сообщение (и на /start) отвечаем кнопкой, которая открывает календарь
    if (message) {
        const appUrl = new URL(c.req.url).origin;
        const text = message.text?.startsWith('/start')
            ? '🎁 Привет! Это адвент-календарь желаний.\n\nОтмечай в календаре, что хочешь получить, и делись днями с друзьями.'
            : 'Календарь открывается кнопкой ниже 👇';
        c.executionCtx.waitUntil(sendMessage(c.env, message.chat.id, text, openAppButton(appUrl)));
    }
    // Telegram ждёт ответ 200, иначе будет присылать то же сообщение снова
    return c.body(null, 200);
});
