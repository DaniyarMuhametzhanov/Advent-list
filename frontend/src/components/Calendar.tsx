import type { UserId, WishesByDate } from '../types';
import type { HolidayDto } from '../api/holidays';
import { USERS } from '../data/fakeData';
import { DOW, MONTHS, dateKey, daysInMonth, firstWeekday, todayKey } from '../lib/dates';
import { Avatar } from './Avatar';
import { DayCell } from './DayCell';
import { monthDay, officialHoliday } from '../data/holidays';

type Props = {
    status?: string;
    me: UserId;
    owner: UserId;           // чей календарь открыт
    year: number;
    month: number;           // 0–11
    wishes: WishesByDate;    // желания владельца
    myFriends: UserId[];
    myHolidays: Record<string, HolidayDto[]>; // мои праздники по дням { '03-15': [...] }
    tabs: UserId[];          // друзья, чьи вкладки показываем на главной
    onPrev: () => void;
    onNext: () => void;
    onSelectOwner: (id: UserId) => void;
    onHideTab: (id: UserId) => void; // крестик на вкладке друга
    onOpenDay: (date: string, cell: HTMLElement) => void;
};

export function Calendar(props: Props) {
    const { me, owner, year, month, wishes, myFriends } = props;
    const isOwn = owner === me;
    const today = todayKey();

    // Номера дней месяца: [1, 2, ..., 31]
    const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstWeekday(year, month) }, (_, i) => i);

    return (
        <section className="card cal" id="cal" aria-label="Календарь желаний">
            <div className="whose">
                <button className="chip" aria-pressed={isOwn} onClick={() => props.onSelectOwner(me)}>
                    <Avatar user={USERS[me]} />
                    Мой календарь
                </button>
                {/* У вкладок друзей есть крестик. Кнопку нельзя класть внутрь кнопки, поэтому они рядом в общей обёртке */}
                {props.tabs.map(id => (
                    <span key={id} className="tab" data-active={owner === id}>
                        <button className="chip" aria-pressed={owner === id} onClick={() => props.onSelectOwner(id)}>
                            <Avatar user={USERS[id]} />
                            {'Календарь ' + USERS[id].gen}
                        </button>
                        <button className="tab-x" onClick={() => props.onHideTab(id)}
                                aria-label={`Убрать с главной: ${USERS[id].name}`}
                                title="Убрать с главной (из друзей не удаляет)">✕</button>
                    </span>
                ))}
            </div>

            <div className="cal-head">
                <h1 className="month">{MONTHS[month]} <span>{year}</span></h1>
                <button className="nav" onClick={props.onPrev} aria-label="Предыдущий месяц">←</button>
                <button className="nav" onClick={props.onNext} aria-label="Следующий месяц">→</button>
            </div>

            {props.status && <p className="sub">{props.status}</p>}

            <div className="grid">
                {DOW.map((d, i) => <div key={d} className={i > 4 ? 'dow we' : 'dow'}>{d}</div>)}
                {blanks.map(i => <div key={'blank' + i} />)}
                {days.map(d => {
                    const date = dateKey(year, month, d);
                    // Официальный праздник видят все. Свои праздники хозяина — он сам
                    // и друзья, которым он открыл этот день (их присылает сервер вместе с днём)
                    const own = isOwn
                        ? (props.myHolidays[monthDay(date)] ?? []).map(h => h.title)
                        : (wishes[date]?.holidays ?? []);
                    const holidays = [officialHoliday(date), ...own].filter((h): h is string => !!h);
                    return (
                        <DayCell key={date} date={date} day={d} wish={wishes[date]} me={me}
                                 isOwn={isOwn} isToday={date === today} holidays={holidays} myFriends={myFriends} onOpen={props.onOpenDay} />
                    );
                })}
            </div>

            <div className="legend">
                {isOwn ? (
                    <>
                        <span><i />Пусто</span>
                        <span><i className="l-has" />Есть желание</span>
                        <span>👁 Сколько друзей видят день</span>
                        <span><i className="l-today" />Сегодня</span>
                        <span><i className="l-hol" />Праздник</span>
                    </>
                ) : (
                    <>
                        <span><i />Пусто</span>
                        <span><i className="l-lock" />🔒 Закрыто</span>
                        <span><i className="l-open" />Открыто для вас</span>
                        <span><i className="l-today" />Сегодня</span>
                        <span><i className="l-hol" />Праздник</span>
                    </>
                )}
            </div>
        </section>
    );
}