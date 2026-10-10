import type { UserId, WishesByDate } from '../types';
import { USERS } from '../data/fakeData';
import { DOW, MONTHS, dateKey, daysInMonth, firstWeekday, todayKey } from '../lib/dates';
import { Avatar } from './Avatar';
import { DayCell } from './DayCell';

type Props = {
    status?: string;
    me: UserId;
    owner: UserId;           // чей календарь открыт
    year: number;
    month: number;           // 0–11
    wishes: WishesByDate;    // желания владельца
    myFriends: UserId[];
    onPrev: () => void;
    onNext: () => void;
    onSelectOwner: (id: UserId) => void;
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
                {[me, ...myFriends].map(id => (
                    <button key={id} className="chip" aria-pressed={owner === id} onClick={() => props.onSelectOwner(id)}>
                        <Avatar user={USERS[id]} />
                        {id === me ? 'Мой календарь' : 'Календарь ' + USERS[id].gen}
                    </button>
                ))}
            </div>

            <div className="cal-head">
                <h1 className="month">{MONTHS[month]} <span>{year}</span></h1>
                <button className="nav" onClick={props.onPrev} aria-label="Предыдущий месяц">←</button>
                <button className="nav" onClick={props.onNext} aria-label="Следующий месяц">→</button>
            </div>

            <p className="sub">
                {props.status ?? (isOwn
                    ? 'Нажмите на число, чтобы добавить или изменить желание.'
                    : <>Вы — <b>{USERS[me].name}</b> и смотрите адвент-календарь <b>{USERS[owner].gen}</b>. Закрытые дни отмечены замком.</>)}
            </p>

            <div className="grid">
                {DOW.map((d, i) => <div key={d} className={i > 4 ? 'dow we' : 'dow'}>{d}</div>)}
                {blanks.map(i => <div key={'blank' + i} />)}
                {days.map(d => {
                    const date = dateKey(year, month, d);
                    return (
                        <DayCell key={date} date={date} day={d} wish={wishes[date]} me={me}
                                 isOwn={isOwn} isToday={date === today} myFriends={myFriends} onOpen={props.onOpenDay} />
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
                    </>
                ) : (
                    <>
                        <span><i />Пусто</span>
                        <span><i className="l-lock" />🔒 Закрыто</span>
                        <span><i className="l-open" />Открыто для вас</span>
                        <span><i className="l-today" />Сегодня</span>
                    </>
                )}
            </div>
        </section>
    );
}