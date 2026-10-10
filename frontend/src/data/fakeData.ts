// Фейковые данные: те же люди и желания, что в макете.
// На этапе 5 их заменят настоящие данные с сервера.
import type { User, UserId, Wish, WishesByDate } from '../types';
import { dateKey } from '../lib/dates';

export const USERS: Record<UserId, User> = {
    anna:  { id: 'anna',  serverId: 1, name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
    boris: { id: 'boris', serverId: 2, name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
    vika:  { id: 'vika',  serverId: 3, name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};

// Дата в текущем месяце: day(8) → '2026-10-08'
const now = new Date();
const day = (d: number) => dateKey(now.getFullYear(), now.getMonth(), d);

const wish = (emoji: string, bg: string, title: string, comment: string, access: UserId[] = []): Wish =>
    ({ img: { emoji, bg }, title, comment, access });

export const INITIAL_WISHES: Record<UserId, WishesByDate> = {
    anna: {
        [day(3)]:  wish('🎧', '#FBE4EC', 'Наушники', 'Беспроводные, с шумоподавлением. Цвет — любой, кроме белого.'),
        [day(8)]:  wish('📚', '#DDF3EC', 'Книга', '«Мастер и Маргарита» в красивом издании с иллюстрациями.', ['boris']),
        [day(12)]: wish('🎭', '#FFF3D1', 'Поход в театр', 'Два билета на любой спектакль, лучше в выходной.'),
        [day(17)]: wish('👟', '#E3ECFB', 'Кроссовки для бега', 'Размер 38, для асфальта.'),
        [day(21)]: wish('🎨', '#FBE4EC', 'Набор акварели', '24 цвета и пара кистей из белки.', ['boris']),
        [day(26)]: wish('🎟️', '#DDF3EC', 'Билеты на концерт', 'Хочу на джазовый вечер в филармонии.'),
    },
    boris: {
        [day(5)]:  wish('🎲', '#FFF3D1', 'Настольная игра', 'Что-нибудь на компанию из четырёх человек.', ['anna']),
        [day(19)]: wish('☕', '#E3ECFB', 'Термос', 'На 0,5 литра, чтобы помещался в рюкзак.'),
    },
    vika: {
        [day(10)]: wish('🧶', '#FBE4EC', 'Плед', 'Тёплый, крупной вязки.'),
        [day(24)]: wish('📷', '#DDF3EC', 'Плёночный фотоаппарат', 'Простой, для прогулок.'),
    },
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