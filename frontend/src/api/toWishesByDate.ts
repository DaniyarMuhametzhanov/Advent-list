// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';
import { idForServerId } from '../data/fakeData';

// Картинки нет — показываем подарок на розовом фоне
const NO_IMAGE: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Адрес картинки с сервера → то, что понимает WishThumb
function image(url: string | null): WishImage {
    return url ? { src: url } : NO_IMAGE;
}

// Всё — с сервера: название, комментарий, доступ и адреса картинок.
export function toWishesByDate(list: WishDto[]): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: image(dto.imageUrl),
            thumb: image(dto.thumbUrl),
            access: dto.access.map(idForServerId),
        };
    }
    return result;
}

// Календарь друга. access: [me] значит «мне этот день открыт».
// У закрытого дня сервер не присылает ни названия, ни картинки.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: image(day.imageUrl),
            thumb: image(day.thumbUrl),
            access: day.open ? [me] : [],
            requested: day.requested,
            holidays: day.holidays ?? [],
        };
    }
    return result;
}
