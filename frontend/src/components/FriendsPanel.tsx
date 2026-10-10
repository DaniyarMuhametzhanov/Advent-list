import { useState } from 'react';
import type { AccessRequest, UserId, WishesByDate } from '../types';
import type { FriendRequestDto, UserSearchDto } from '../api/friends';
import { useUserSearch } from '../api/useFriends';
import { USERS, fakeIdFor } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { Avatar } from './Avatar';

type Props = {
    me: UserId;
    owner: UserId;
    myFriends: UserId[];
    myWishes: WishesByDate;
    incoming: FriendRequestDto[];           // заявки в друзья, которые пришли мне
    accessRequests: AccessRequest[];
    onOpenCalendar: (id: UserId) => void;
    onAddFriend: (serverId: number) => void;
    onAccept: (request: FriendRequestDto) => void;
    onDecline: (request: FriendRequestDto) => void;
    onRemoveFriend: (id: UserId) => void;
    onGrant: (from: UserId, date: string) => void;
    onDeny: (from: UserId, date: string) => void;
};

export function FriendsPanel(props: Props) {
    const { me, owner, myFriends, myWishes, incoming, accessRequests } = props;
    const [query, setQuery] = useState('');

    const incomingAccess = accessRequests.filter(r => r.owner === me);

    return (
        <aside className="card side" id="side" aria-label="Друзья">
            <h2>Друзья</h2>

            <div>
                <h3><label htmlFor="search">Найти человека</label></h3>
                <input className="field" id="search" type="search" placeholder="Имя" autoComplete="off"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                    <SearchResults query={query} onAddFriend={props.onAddFriend} />
                </div>
            </div>

            <div>
                <h3>Заявки в друзья<Count n={incoming.length} /></h3>
                {incoming.length === 0 && <p className="hint">Новых заявок нет.</p>}
                {incoming.map(r => (
                    <div className="note" key={r.id}>
                        <div className="row">
                            <Avatar user={USERS[fakeIdFor(r.from)]} large />
                            <span className="grow">{r.from.name} хочет добавить вас в друзья</span>
                        </div>
                        <div className="acts">
                            <button className="btn sm" onClick={() => props.onAccept(r)}>Принять</button>
                            <button className="btn sm ghost" onClick={() => props.onDecline(r)}>Отклонить</button>
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
                        <div className="row" key={id}>
                            <button className="friend row" aria-current={owner === id}
                                    onClick={() => props.onOpenCalendar(id)}>
                                <Avatar user={USERS[id]} large />
                                <span className="grow">{USERS[id].name}<small>Открыть календарь</small></span>
                            </button>
                            <button className="btn sm ghost" title="Удалить из друзей"
                                    aria-label={`Удалить ${USERS[id].name} из друзей`}
                                    onClick={() => props.onRemoveFriend(id)}>✕</button>
                        </div>
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

// Результаты поиска приходят с сервера, уже со статусом «кем мне приходится человек»
function SearchResults({ query, onAddFriend }: { query: string; onAddFriend: (serverId: number) => void }) {
    const search = useUserSearch(query);

    if (!query.trim()) return <p className="hint">Начните вводить имя, например «Вика».</p>;
    if (search.isPending) return <p className="hint">Ищу…</p>;
    if (search.isError) return <p className="hint">Не получилось найти: {search.error.message}</p>;
    if (search.data.length === 0) return <p className="hint">Никого не нашли.</p>;

    return (
        <ul className="list">
            {search.data.map(u => (
                <li className="row" key={u.id}>
                    <Avatar user={USERS[fakeIdFor(u)]} large />
                    <span className="grow">{u.name}</span>
                    <RelationAction user={u} onAddFriend={onAddFriend} />
                </li>
            ))}
        </ul>
    );
}

function RelationAction({ user, onAddFriend }: { user: UserSearchDto; onAddFriend: (serverId: number) => void }) {
    switch (user.relation) {
        case 'FRIEND':
            return <span className="hint">Уже в друзьях</span>;
        case 'REQUEST_SENT':
            return <span className="hint">Заявка отправлена</span>;
        case 'REQUEST_RECEIVED':
            return <span className="hint">Ждёт вашего ответа</span>;
        default:
            return <button className="btn sm" onClick={() => onAddFriend(user.id)}>Добавить в друзья</button>;
    }
}