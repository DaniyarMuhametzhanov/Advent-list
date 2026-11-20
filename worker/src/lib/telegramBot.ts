// Отправка сообщений от имени бота через Telegram Bot API.
// Бот может написать человеку, только если тот хоть раз открыл бота (нажал «Старт» или открыл Mini App)
import type { Env } from '../env';

// Кнопка под сообщением, которая открывает наш календарь внутри Telegram
export function openAppButton(appUrl: string, text = '🎁 Открыть календарь') {
    return { inline_keyboard: [[{ text, web_app: { url: appUrl } }]] };
}

// Вызвать любой метод Bot API: sendMessage, editMessageText, answerCallbackQuery...
// Не получилось (человек заблокировал бота, нет связи) — это не повод ломать запрос: только пишем в журнал
export async function callTelegram(env: Env, method: string, payload: Record<string, unknown>) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) console.warn(`Telegram ${method}:`, response.status, await response.text());
    } catch (e) {
        console.warn(`Telegram ${method}:`, e);
    }
}

export function sendMessage(env: Env, chatId: number, text: string, replyMarkup?: unknown) {
    return callTelegram(env, 'sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
}
