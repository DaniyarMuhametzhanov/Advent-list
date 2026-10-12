import { useState, type MouseEvent } from 'react';
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
    holidays?: string[];   // праздники этого дня: официальный и/или свои
    myFriends: UserId[];
    onOpen: (date: string, cell: HTMLElement) => void;
};

// Одна клетка календаря. У неё 5 разных видов (состояний).
export function DayCell({ date, day, wish, me, isOwn, isToday, holidays = [], myFriends, onOpen }: Props) {
    // Праздник: синяя рамка (класс holiday) и название по центру клетки
    const today = (isToday ? ' today' : '') + (holidays.length > 0 ? ' holiday' : '');
    const holidayText = holidays.join(' · ');
    const num = <span className="num">{day}</span>;
    // Каждый праздник — своей строкой: сначала официальный, под ним свои.
    // В клетку влезают три строки. Если праздников больше — два и «+N», полный список во всплывающей подсказке (title)
    const shown = holidays.length <= 3 ? holidays : holidays.slice(0, 2);
    const more = holidays.length - shown.length;
    const hol = holidays.length > 0 && (
        <span className="hol" title={holidayText}>
            {shown.map((h, i) => <span key={i}>{h}</span>)}
            {more > 0 && <span className="more">+{more}</span>}
        </span>
    );
    // В подписи для экранных чтецов праздник идёт после даты: «25 октября, День Республики: добавить желание»
    const label = formatDate(date) + (holidayText ? `, ${holidayText}` : '');
    // Подписи праздников закрывают картинку. Поэтому в клетке с картинкой и праздником
    // первый клик только прячет подписи (peek — «подглядеть»), а второй открывает окно дня
    const [peek, setPeek] = useState(false);
    const hidePeek = () => setPeek(false);
    const open = (e: MouseEvent<HTMLElement>) => {
        const hasPicture = e.currentTarget.classList.contains('has') && !e.currentTarget.classList.contains('locked');
        // e.detail === 0 — «клик» с клавиатуры (Enter/пробел): там подглядывать нечего, сразу открываем
        if (hasPicture && holidays.length > 0 && !peek && e.detail !== 0) {
            setPeek(true);
            return;
        }
        onOpen(date, e.currentTarget);
    };

    // 1. Мой день, пусто → «+» при наведении
    if (!wish && isOwn) {
        return (
            <button className={'cell empty' + today} onClick={open} aria-label={`${label}: добавить желание`}>
                {num}{hol}<span className="plus" aria-hidden="true">+</span>
            </button>
        );
    }

    // 2. Чужой день, пусто → серая клетка, клик ничего не делает
    if (!wish) {
        return <div className={'cell empty off' + today} aria-label={`${label}: желания нет`}>{num}{hol}</div>;
    }

    // 3–4. Мой день с желанием или чужой открытый день
    if (isOwn || wish.access.includes(me)) {
        const seenBy = isOwn ? myFriends.filter(f => wish.access.includes(f)) : [];
        return (
            <button className={'cell has' + (isOwn ? '' : ' opened') + today + (peek ? ' peek' : '')} onClick={open}
                    onBlur={hidePeek} onMouseLeave={hidePeek} aria-label={`${label}: ${wish.title}`}>
                <WishThumb img={wish.thumb} />
                {num}{hol}
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
            {num}{hol}
            <span className="lock" aria-hidden="true">🔒</span>
        </button>
    );
}