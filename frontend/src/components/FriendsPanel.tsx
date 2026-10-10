import { useState } from 'react';
import type { AccessRequest, FriendRequest, UserId, WishesByDate } from '../types';
import { USERS } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { Avatar } from './Avatar';

type Props = {
    me: UserId;
    owner: UserId;
    myFriends: UserId[];
    myWishes: WishesByDate;
    friendRequests: FriendRequest[];
    accessRequests: AccessRequest[];
    onOpenCalendar: (id: UserId) => void;
    onAddFriend: (id: UserId) => void;
    onAccept: (id: UserId) => void;
    onDecline: (id: UserId) => void;
    onGrant: (from: UserId, date: string) => void;
    onDeny: (from: UserId, date: string) => void;
};

export function FriendsPanel(props: Props) {
    const { me, owner, myFriends, myWishes, friendRequests, accessRequests } = props;
    const [query, setQuery] = useState('');

    const incomingFriends = friendRequests.filter(r => r.to === me);
    const incomingAccess = accessRequests.filter(r => r.owner === me);

    return (
        <aside className="card side" id="side" aria-label="Друзья">
            <h2>Друзья</h2>

            <div>
                <h3><label htmlFor="search">Найти человека</label></h3>
                <input className="field" id="search" type="search" placeholder="Имя" autoComplete="off"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                    <SearchResults query={query} {...props} />
                </div>
            </div>

            <div>
                <h3>Заявки в друзья<Count n={incomingFriends.length} /></h3>
                {incomingFriends.length === 0 && <p className="hint">Новых заявок нет.</p>}
                {incomingFriends.map(r => (
                    <div className="note" key={r.from}>
                        <div className="row">
                            <Avatar user={USERS[r.from]} large />
                            <span className="grow">{USERS[r.from].name} хочет добавить вас в друзья</span>
                        </div>
                        <div className="acts">
                            <button className="btn sm" onClick={() => props.onAccept(r.from)}>Принять</button>
                            <button className="btn sm ghost" onClick={() => props.onDecline(r.from)}>Отклонить</button>
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <h3>Запросы доступа к дням<Count n={incomingAccess.length} /></h3>
                {incomingAccess.length === 0 && <p className="hint">Никто не просит доступ.</p>}
                <div className="list">
                    {incomingAccess.map(r => (
                        <div className="note" key={r.from + r.date}>
                            <div className="row">
                                <Avatar user={USERS[r.from]} large />
                                <span className="grow">
                  {USERS[r.from].name} просит доступ к {formatDate(r.date)}
                                    <small>{myWishes[r.date]?.title}</small>
                </span>
                            </div>
                            <div className="acts">
                                <button className="btn sm" onClick={() => props.onGrant(r.from, r.date)}>Открыть</button>
                                <button className="btn sm ghost" onClick={() => props.onDeny(r.from, r.date)}>Отказать</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3>Мои друзья</h3>
                {myFriends.length === 0 && <p className="hint">Пока никого. Найдите человека по имени и отправьте заявку.</p>}
                <div className="list">
                    {myFriends.map(id => (
                        <button key={id} className="friend row" aria-current={owner === id}
                                onClick={() => props.onOpenCalendar(id)}>
                            <Avatar user={USERS[id]} large />
                            <span className="grow">{USERS[id].name}<small>Открыть календарь</small></span>
                        </button>
                    ))}
                </div>
            </div>

            <details className="script">
                <summary>Сценарий показа</summary>
                <ol>
                    <li>Смотрим как Анна: её календарь уже заполнен.</li>
                    <li>Анна открывает свободный день, загружает картинку, пишет комментарий и сохраняет.</li>
                    <li>Переключаемся на Бориса: в календаре Анны этот день с замком.</li>
                    <li>Возвращаемся к Анне и в окне дня включаем доступ для Бориса.</li>
                    <li>Снова Борис: день открыт, видны картинка и комментарий.</li>
                </ol>
            </details>
        </aside>
    );
}

// Красный кружок с числом. При нуле ничего не рисуем.
function Count({ n }: { n: number }) {
    return n > 0 ? <span className="badge">{n}</span> : null;
}

function SearchResults({ query, me, myFriends, friendRequests, onAddFriend, onAccept }: Props & { query: string }) {
    const q = query.trim().toLowerCase();
    if (!q) return <p className="hint">Начните вводить имя, например «Вика».</p>;

    const found = Object.values(USERS).filter(u => u.id !== me && u.name.toLowerCase().includes(q));
    if (found.length === 0) return <p className="hint">Никого не нашли. В демо есть Анна, Борис и Вика.</p>;

    return (
        <ul className="list">
            {found.map(u => {
                let action;
                if (myFriends.includes(u.id)) action = <span className="hint">Уже в друзьях</span>;
                else if (friendRequests.some(r => r.from === me && r.to === u.id)) action = <span className="hint">Заявка отправлена</span>;
                else if (friendRequests.some(r => r.from === u.id && r.to === me)) action = <button className="btn sm" onClick={() => onAccept(u.id)}>Принять</button>;
                else action = <button className="btn sm" onClick={() => onAddFriend(u.id)}>Добавить в друзья</button>;
                return (
                    <li className="row" key={u.id}>
                        <Avatar user={u} large />
                        <span className="grow">{u.name}</span>
                        {action}
                    </li>
                );
            })}
        </ul>
    );
}