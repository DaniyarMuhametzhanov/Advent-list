// Анна, Борис и Вика: цвета аватарок и родительный падеж («календарь Анны»).
// Всё остальное (желания, друзья, доступ, картинки) приходит с сервера.
import type { User, UserId } from '../types';

export const USERS: Record<UserId, User> = {
    anna:  { id: 'anna',  serverId: 1, name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
    boris: { id: 'boris', serverId: 2, name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
    vika:  { id: 'vika',  serverId: 3, name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};

// Человек с сервера → его UserId в наших компонентах.
// Анна, Борис и Вика уже есть в USERS (там у них цвет и родительный падеж).
// Нового человека добавляем на лету.
export function fakeIdFor(user: { id: number; name: string }): UserId {
    const known = Object.values(USERS).find(u => u.serverId === user.id);
    if (known) return known.id;
    const id = 'user' + user.id;
    USERS[id] = { id, serverId: user.id, name: user.name, gen: user.name, color: '#6B7280' };
    return id;
}

// Обратный перевод: id из базы → UserId в компонентах. Нужен для списка «кому открыт день»
export function idForServerId(serverId: number): UserId {
    return Object.values(USERS).find(u => u.serverId === serverId)?.id ?? 'user' + serverId;
}