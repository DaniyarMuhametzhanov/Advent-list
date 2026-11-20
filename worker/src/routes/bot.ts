// Бот в Telegram. Когда человек пишет боту или нажимает кнопку под сообщением, Telegram присылает нам
// POST /api/telegram/webhook с описанием события (Update). Как подключить — docs/stage-15.md, шаг «Webhook».
//
// Для всех:            /start — кнопка «Открыть календарь», /id — узнать свой Telegram id
// Для администраторов: /users — кто с доступом и кто ждёт, /allow 123 и /deny 123 — открыть или закрыть доступ,
//                      кнопки «Разрешить / Отказать» под заявкой
import { Hono, type Context } from 'hono';
import type { App, TelegramUser } from '../env';
import { callTelegram, openAppButton, sendMessage } from '../lib/telegramBot';
import { accessStatus, adminIds, describe, isAdmin, requestAccess, setAccess } from '../lib/userAccess';

export const botRoutes = new Hono<App>();

type Update = {
    message?: { chat: { id: number }; from?: TelegramUser; text?: string };
    // Нажатие кнопки под сообщением бота (у нас — «Разрешить» или «Отказать»)
    callback_query?: { id: string; from: TelegramUser; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } };
};

botRoutes.post('/webhook', async c => {
    // Telegram присылает пароль, который мы задали при подключении webhook (secret_token).
    // Без него кто угодно мог бы слать нам «сообщения от Telegram»
    if (!c.env.WEBHOOK_SECRET || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.WEBHOOK_SECRET) {
        return c.body(null, 401);
    }
    const update = await c.req.json<Update>().catch(() => ({}) as Update);
    if (update.callback_query) await onButton(c, update.callback_query);
    else if (update.message?.from) await onMessage(c, update.message.chat.id, update.message.from, update.message.text ?? '');
    // Telegram ждёт ответ 200, иначе будет присылать то же сообщение снова
    return c.body(null, 200);
});

type Ctx = Context<App>;
const later = (c: Ctx, promise: Promise<unknown>) => c.executionCtx.waitUntil(promise);

async function onMessage(c: Ctx, chatId: number, from: TelegramUser, text: string) {
    const reply = (answer: string, markup?: unknown) => later(c, sendMessage(c.env, chatId, answer, markup));
    const [command, arg] = text.trim().split(/\s+/);

    if (command === '/id') return reply(`Ваш Telegram id: ${from.id}`);

    // Команды администратора. Остальным они просто не работают
    if (isAdmin(c.env, from.id) && ['/users', '/allow', '/deny'].includes(command)) {
        if (command === '/users') return reply(await usersList(c));
        const telegramId = Number(arg);
        if (!Number.isInteger(telegramId) || telegramId <= 0) return reply(`Напишите так: ${command} 123456789`);
        return decide(c, telegramId, command === '/allow' ? 'ALLOWED' : 'DENIED', reply);
    }

    // Нет доступа — заявка уходит администраторам (один раз), человеку объясняем, что ждать
    const status = await requestAccess(c.env, from, p => later(c, p));
    if (status === 'PENDING') return reply('🔐 Календарь работает по приглашению. Мы отправили запрос администратору: я напишу, когда доступ откроют.');
    if (status === 'DENIED') return reply('🔐 Календарь работает по приглашению. Администратор пока не открыл вам доступ.');

    const appUrl = new URL(c.req.url).origin;
    reply(command === '/start'
        ? '🎁 Привет! Это адвент-календарь желаний.\n\nОтмечай в календаре, что хочешь получить, и делись днями с друзьями.'
        : 'Календарь открывается кнопкой ниже 👇', openAppButton(appUrl));
}

// Кнопка «Разрешить» или «Отказать» под заявкой
async function onButton(c: Ctx, query: NonNullable<Update['callback_query']>) {
    const match = /^(allow|deny):(\d+)$/.exec(query.data ?? '');
    // Нажать может только администратор. Чужое нажатие (например, пересланное сообщение) игнорируем
    if (!match || !isAdmin(c.env, query.from.id)) {
        later(c, callTelegram(c.env, 'answerCallbackQuery', { callback_query_id: query.id, text: 'Только для администратора' }));
        return;
    }
    const status = match[1] === 'allow' ? 'ALLOWED' : 'DENIED';
    const telegramId = Number(match[2]);
    await decide(c, telegramId, status);
    const verdict = status === 'ALLOWED' ? '✅ Доступ открыт' : '❌ Отказано';
    later(c, callTelegram(c.env, 'answerCallbackQuery', { callback_query_id: query.id, text: verdict }));
    // Убираем кнопки и дописываем решение, чтобы было видно, что заявка обработана
    if (query.message) {
        later(c, callTelegram(c.env, 'editMessageText', {
            chat_id: query.message.chat.id, message_id: query.message.message_id,
            text: `${query.message.text ?? 'Заявка'}\n\n${verdict}`,
        }));
    }
}

// Записать решение и сообщить человеку
async function decide(c: Ctx, telegramId: number, status: 'ALLOWED' | 'DENIED', reply?: (text: string) => void) {
    if (isAdmin(c.env, telegramId)) return reply?.('Это администратор: у него доступ всегда');
    const before = await accessStatus(c.env, telegramId);
    await setAccess(c.env, telegramId, status);
    if (status === 'ALLOWED') {
        reply?.(`✅ Доступ открыт: ${telegramId}`);
        if (before !== 'ALLOWED') {
            later(c, sendMessage(c.env, telegramId, '✅ Администратор открыл вам адвент-календарь!',
                openAppButton(new URL(c.req.url).origin)));
        }
    } else {
        reply?.(`❌ Доступ закрыт: ${telegramId}`);
    }
}

// /users — список для администратора
async function usersList(c: Ctx) {
    const { results } = await c.env.DB.prepare(
        `SELECT telegram_id AS telegramId, name, username, status FROM user_access
         WHERE status IN ('ALLOWED', 'PENDING') ORDER BY status, name`)
        .all<{ telegramId: number; name: string; username: string | null; status: string }>();
    const lines = (status: string) => results.filter(r => r.status === status).map(r => `• ${describe(r)}`);
    const allowed = lines('ALLOWED');
    const pending = lines('PENDING');
    return [
        `👑 Администраторы: ${adminIds(c.env).join(', ')}`,
        `\n✅ С доступом (${allowed.length}):`, ...(allowed.length ? allowed : ['никого']),
        `\n⏳ Ждут решения (${pending.length}):`, ...(pending.length ? pending : ['никого']),
        '\nОткрыть: /allow 123456789\nЗакрыть: /deny 123456789',
    ].join('\n');
}
