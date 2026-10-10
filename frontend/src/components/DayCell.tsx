import type { MouseEvent } from 'react';
import type { UserId, Wish } from '../types';
import { USERS } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { WishThumb } from './WishThumb';

type Props = {
    date: string;          // '2026-10-08'
    day: number;           // 8
    wish?: Wish;           // желание в этот день (если есть)
    me: UserId;
    isOwn: boolean;        // это мой календарь?
    isToday: boolean;
    myFriends: UserId[];
    onOpen: (date: string, cell: HTMLElement) => void;
};

// Одна клетка календаря. У неё 5 разных видов (состояний).
export function DayCell({ date, day, wish, me, isOwn, isToday, myFriends, onOpen }: Props) {
    const today = isToday ? ' today' : '';
    const num = <span className="num">{day}</span>;
    const label = formatDate(date);
    const open = (e: MouseEvent<HTMLElement>) => onOpen(date, e.currentTarget);

    // 1. Мой день, пусто → «+» при наведении
    if (!wish && isOwn) {
        return (
            <button className={'cell empty' + today} onClick={open} aria-label={`${label}: добавить желание`}>
                {num}<span className="plus" aria-hidden="true">+</span>
            </button>
        );
    }

    // 2. Чужой день, пусто → серая клетка, клик ничего не делает
    if (!wish) {
        return <div className={'cell empty off' + today} aria-label={`${label}: желания нет`}>{num}</div>;
    }

    // 3–4. Мой день с желанием или чужой открытый день
    if (isOwn || wish.access.includes(me)) {
        const seenBy = isOwn ? myFriends.filter(f => wish.access.includes(f)) : [];
        return (
            <button className={'cell has' + (isOwn ? '' : ' opened') + today} onClick={open}
                    aria-label={`${label}: ${wish.title}`}>
                <WishThumb img={wish.img} />
                {num}
                {seenBy.length > 0 && (
                    <span className="shared" title={'Видят: ' + seenBy.map(f => USERS[f].name).join(', ')}>
            👁 {seenBy.length}
          </span>
                )}
                <span className="cap">{wish.title}</span>
            </button>
        );
    }

    // 5. Чужой закрытый день → размытый фон и замок, без названия и картинки
    return (
        <button className={'cell has locked' + today} onClick={open} aria-label={`${label}: день закрыт`}>
            <span className="blur" />
            {num}
            <span className="lock" aria-hidden="true">🔒</span>
        </button>
    );
}