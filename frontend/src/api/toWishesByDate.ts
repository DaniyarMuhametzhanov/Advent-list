// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';

const DEFAULT_IMG: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Сервер пока хранит только название и комментарий.
// Картинку и доступ берём из памяти браузера (local), пока их нет на сервере (этапы 8 и 9).
export function toWishesByDate(list: WishDto[], local: WishesByDate): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        const old = local[dto.date];
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: old?.img ?? DEFAULT_IMG,
            access: old?.access ?? [],
        };
    }
    return result;
}

// Календарь друга. access: [me] значит «мне этот день открыт».
// До этапа 8 сервер присылает все дни друзей закрытыми: без названия и комментария.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: DEFAULT_IMG,
            access: day.open ? [me] : [],
        };
    }
    return result;
}