import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { UserId } from '../types';
import type { FriendRequestDto, UserSearchDto } from '../api/friends';
import type { AccessRequestDto } from '../api/access';
import { useUserSearch } from '../api/useFriends';
import { USERS, fakeIdFor } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { Avatar } from './Avatar';
import { KebabMenu } from './KebabMenu';

type Props = {
    open: boolean;                          // панель выдвинута?
    onClose: () => void;
    me: UserId;
    owner: UserId;
    myFriends: UserId[];
    incoming: FriendRequestDto[];           // заявки в друзья, которые пришли мне
    accessRequests: AccessRequestDto[];     // запросы доступа к моим дням
    onOpenCalendar: (id: UserId) => void;
    onAddFriend: (serverId: number) => void;
    onAccept: (request: FriendRequestDto) => void;
    onDecline: (request: FriendRequestDto) => void;
    onRemoveFriend: (id: UserId) => void;
    hiddenTabs: UserId[];                   // друзья, чьи вкладки убраны с главной
    onShowTab: (id: UserId) => void;        // вернуть вкладку на главную
    onHideTab: (id: UserId) => void;        // убрать вкладку с главной
    onGrant: (request: AccessRequestDto) => void;
    onDeny: (request: AccessRequestDto) => void;
};

export function FriendsPanel(props: Props) {
    const { open, onClose, owner, myFriends, incoming, accessRequests } = props;
    const [query, setQuery] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);

    // open пришёл сверху (из App): показываем или прячем выезжающую панель
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog ref={dialogRef} className="drawer" aria-labelledby="friendsTitle"
                onClose={onClose}                                          // закрыли клавишей Esc
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}> {/* клик по тёмному фону */}
            <aside className="side" id="side">
                <div className="side-head">
                    <h2 id="friendsTitle">Друзья</h2>
                    <button className="x" onClick={onClose} aria-label="Закрыть">✕</button>
                </div>

                <Section title="Найти человека" defaultOpen>
                    <input className="field" type="search" placeholder="Имя" autoComplete="off" aria-label="Найти человека"
                           value={query} onChange={e => setQuery(e.target.value)} />
                    <SearchResults query={query} onAddFriend={props.onAddFriend} />
                </Section>

                {/* Раздел сам раскрывается, когда в нём появилось что-то новое */}
                <Section title="Заявки в друзья" count={incoming.length} defaultOpen={incoming.length > 0}>
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
                </Section>

                <Section title="Запросы доступа к дням" count={accessRequests.length} defaultOpen={accessRequests.length > 0}>
                    {accessRequests.length === 0 && <p className="hint">Никто не просит доступ.</p>}
                    {accessRequests.map(r => (
                        <div className="note" key={r.id}>
                            <div className="row">
                                <Avatar user={USERS[fakeIdFor(r.from)]} large />
                                <span className="grow">
                                    {r.from.name} просит доступ к {formatDate(r.date)}
                                    <small>{r.title}</small>
                                </span>
                            </div>
                            <div className="acts">
                                <button className="btn sm" onClick={() => props.onGrant(r)}>Открыть</button>
                                <button className="btn sm ghost" onClick={() => props.onDeny(r)}>Отказать</button>
                            </div>
                        </div>
                    ))}
                </Section>

                <Section title={`Мои друзья (${myFriends.length})`} defaultOpen>
                    {myFriends.length === 0 && <p className="hint">Пока никого. Найдите человека по имени и отправьте заявку.</p>}
                    {myFriends.map(id => (
                        <div className="row" key={id}>
                            <button className="friend row" aria-current={owner === id}
                                    onClick={() => props.onOpenCalendar(id)}>
                                <Avatar user={USERS[id]} large />
                                <span className="grow">{USERS[id].name}<small>Открыть календарь</small></span>
                                <span className="go" aria-hidden="true">→</span>
                            </button>
                            <KebabMenu label={`Действия: ${USERS[id].name}`} items={[
                                props.hiddenTabs.includes(id)
                                    ? { label: 'Добавить на главный экран', onClick: () => props.onShowTab(id) }
                                    : { label: 'Убрать с главного экрана', onClick: () => props.onHideTab(id) },
                                { label: 'Удалить из друзей', onClick: () => props.onRemoveFriend(id), danger: true },
                            ]} />
                        </div>
                    ))}
                </Section>
            </aside>
        </dialog>
    );
}

// Раскрывающийся раздел панели. <details> умеет открываться и закрываться сам, без useState.
// defaultOpen меняется с false на true, когда пришло что-то новое, — тогда раздел раскроется
function Section({ title, count = 0, defaultOpen = false, children }:
                     { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
    return (
        <details className="sec" open={defaultOpen || undefined}>
            <summary>
                <span className="grow">{title}</span>
                <Count n={count} />
                <span className="chev" aria-hidden="true">›</span>
            </summary>
            <div className="sec-body">{children}</div>
        </details>
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