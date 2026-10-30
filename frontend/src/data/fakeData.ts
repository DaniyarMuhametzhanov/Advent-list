// Люди в наших компонентах. Компоненты знают человека по UserId (строке), а сервер — по числу id.
//
// Анна, Борис и Вика остались только для тестов компонентов (DayCell.test.tsx и др.).
// Настоящих людей с сервера добавляем на лету с id 'user<число>'. Раньше Анна, Борис и Вика были
// людьми с id 1, 2 и 3 в базе, но в новой базе D1 это уже настоящие люди из Telegram
import type { User, UserId } from '../types';

export const USERS: Record<UserId, User> = {
    anna:  { id: 'anna',  serverId: -1, name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
    boris: { id: 'boris', serverId: -2, name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
    vika:  { id: 'vika',  serverId: -3, name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};

// Цвета кружков-аватарок. Цвет выбираем по id, поэтому у человека он всегда один и тот же
const COLORS = ['#C7356E', '#2C6FD1', '#1F8F74', '#B5651D', '#7B4FC9', '#0E7C86', '#6B7280'];

// Человек с сервера → его UserId в наших компонентах. Имя обновляем: его могли поменять в Telegram.
// Родительный падеж («календарь Анны») по имени не угадать, поэтому пишем имя как есть
export function fakeIdFor(user: { id: number; name: string }): UserId {
    const id = idForServerId(user.id);
    USERS[id] = { id, serverId: user.id, name: user.name, gen: user.name, color: COLORS[user.id % COLORS.length] };
    return id;
}

// Обратный перевод: id из базы → UserId в компонентах. Нужен для списка «кому открыт день»
export function idForServerId(serverId: number): UserId {
    return 'user' + serverId;
}
