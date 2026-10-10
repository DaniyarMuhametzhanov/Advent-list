// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';
import { idForServerId } from '../data/fakeData';

const DEFAULT_IMG: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Название, комментарий и доступ — с сервера.
// Картинку пока берём из памяти браузера (local), её на сервере ещё нет (этап 9).
export function toWishesByDate(list: WishDto[], local: WishesByDate): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: local[dto.date]?.img ?? DEFAULT_IMG,
            access: dto.access.map(idForServerId),
        };
    }
    return result;
}

// Календарь друга. access: [me] значит «мне этот день открыт».
// У закрытого дня сервер не присылает название и комментарий, поэтому там пустые строки.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: DEFAULT_IMG,
            access: day.open ? [me] : [],
            requested: day.requested,
        };
    }
    return result;
}
