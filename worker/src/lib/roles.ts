// Роли и регистрация по приглашению.
//
// Есть обычные пользователи (USER) и супер-пользователи (ADMIN). Зарегистрироваться и пользоваться
// календарём может только тот, чей email администратор добавил на странице «Доступ» (таблица allowed_emails).
// Первые администраторы перечислены в настройке ADMIN_EMAILS (wrangler.jsonc): им можно всегда,
// и роль ADMIN они получают сами
import type { Env, Role } from '../env';

// «Anna@Example.com » и «anna@example.com» — один и тот же человек
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// 'a@x.ru, b@y.ru' → ['a@x.ru', 'b@y.ru']
export function adminEmails(env: Env): string[] {
    return (env.ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean);
}

// Роль по настройкам: email в ADMIN_EMAILS → администратор
export const roleFor = (env: Env, email: string): Role => adminEmails(env).includes(email) ? 'ADMIN' : 'USER';

// Можно ли этому email регистрироваться и пользоваться календарём
export async function isAllowed(env: Env, email: string, role: Role = 'USER'): Promise<boolean> {
    if (role === 'ADMIN' || roleFor(env, email) === 'ADMIN') return true;
    return (await env.DB.prepare('SELECT 1 AS ok FROM allowed_emails WHERE email = ?').bind(email).first('ok')) !== null;
}
