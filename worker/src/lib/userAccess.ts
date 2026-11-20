// Доступ по приглашению. Пользоваться календарём может только тот, кого разрешил администратор.
//
// Администраторы перечислены в настройке ADMIN_TELEGRAM_IDS (wrangler.jsonc): их Telegram id через запятую.
// Им доступ открыт всегда, и именно им бот присылает заявки с кнопками «Разрешить» и «Отказать».
import type { Env, TelegramUser } from '../env';
import { displayName } from '../auth/middleware';
import { now } from './validate';
import { sendMessage } from './telegramBot';

export type AccessStatus = 'PENDING' | 'ALLOWED' | 'DENIED';

// '111, 222' → [111, 222]
export function adminIds(env: Env): number[] {
    return (env.ADMIN_TELEGRAM_IDS ?? '').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
}

export const isAdmin = (env: Env, telegramId: number) => adminIds(env).includes(telegramId);

// Что решил администратор об этом человеке. null — человек ещё ни разу не приходил
export async function accessStatus(env: Env, telegramId: number): Promise<AccessStatus | null> {
    if (isAdmin(env, telegramId)) return 'ALLOWED';
    return env.DB.prepare('SELECT status FROM user_access WHERE telegram_id = ?')
        .bind(telegramId).first<AccessStatus>('status');
}

// Кнопки под заявкой у администратора. callback_data — то, что Telegram пришлёт нам при нажатии
export function decisionButtons(telegramId: number) {
    return { inline_keyboard: [[
        { text: '✅ Разрешить', callback_data: `allow:${telegramId}` },
        { text: '❌ Отказать', callback_data: `deny:${telegramId}` },
    ]] };
}

// «Иван Петров (@ivan, id 123456)»
export function describe(person: { name: string; username: string | null; telegramId: number }) {
    return `${person.name}${person.username ? ` (@${person.username}, id ${person.telegramId})` : ` (id ${person.telegramId})`}`;
}

// Человек без доступа открыл календарь или бота. Первый раз — записываем заявку и пишем администраторам.
// Повторно не пишем, чтобы не засыпать администратора одинаковыми сообщениями.
// Возвращает решение о человеке (для нового — PENDING)
export async function requestAccess(env: Env, tg: TelegramUser,
                                    waitUntil: (p: Promise<unknown>) => void): Promise<AccessStatus> {
    const current = await accessStatus(env, tg.id);
    if (current) return current;

    const name = displayName(tg);
    const username = tg.username ?? null;
    // OR IGNORE: если два запроса пришли одновременно, заявка всё равно будет одна
    const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO user_access (telegram_id, name, username, status, requested_at) VALUES (?, ?, ?, 'PENDING', ?)`)
        .bind(tg.id, name, username, now()).run();
    if (inserted.meta.changes > 0) {
        const text = `🙋 ${describe({ name, username, telegramId: tg.id })} просит доступ к календарю`;
        for (const admin of adminIds(env)) waitUntil(sendMessage(env, admin, text, decisionButtons(tg.id)));
    }
    return 'PENDING';
}

// Решение администратора. Человека, который ещё не приходил, тоже можно разрешить заранее (по id)
export async function setAccess(env: Env, telegramId: number, status: 'ALLOWED' | 'DENIED') {
    const time = now();
    await env.DB.prepare(
        `INSERT INTO user_access (telegram_id, name, username, status, requested_at, decided_at)
         VALUES (?, ?, NULL, ?, ?, ?)
         ON CONFLICT (telegram_id) DO UPDATE SET status = excluded.status, decided_at = excluded.decided_at`)
        .bind(telegramId, `id ${telegramId}`, status, time, time).run();
}
