// Уведомления от бота: «вам пришла заявка в друзья» и т. п.
// Отправляем «в фоне» (waitUntil): ответ человеку уходит сразу, не дожидаясь Telegram
import type { Context } from 'hono';
import type { App } from '../env';
import { openAppButton, sendMessage } from './telegramBot';

export function notify(c: Context<App>, telegramId: number, text: string) {
    const appUrl = new URL(c.req.url).origin; // адрес нашего же сайта: https://advent-calendar.<вы>.workers.dev
    c.executionCtx.waitUntil(sendMessage(c.env, telegramId, text, openAppButton(appUrl)));
}

// telegram_id человека по его id в нашей базе
export async function telegramIdOf(db: D1Database, userId: number) {
    return db.prepare('SELECT telegram_id FROM users WHERE id = ?').bind(userId).first<number>('telegram_id');
}
