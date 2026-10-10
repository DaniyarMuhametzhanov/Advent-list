// «Пульт» с данными, которых ещё нет на сервере: картинки, доступы к дням и запросы доступа.
// Друзья и заявки в друзья теперь живут на сервере (этап 7), поэтому их здесь больше нет.
import { useState } from 'react';
import type { UserId, Wish } from '../types';
import { INITIAL_ACCESS_REQUESTS, INITIAL_WISHES } from './fakeData';

export function useFakeStore(me: UserId) {
    const [wishes, setWishes] = useState(INITIAL_WISHES);
    const [accessRequests, setAccessRequests] = useState(INITIAL_ACCESS_REQUESTS);

    // Поменять одно моё желание. change получает старое желание и возвращает новое (или undefined = удалить).
    function updateMyWish(date: string, change: (old: Wish | undefined) => Wish | undefined) {
        setWishes(all => {
            const mine = { ...all[me] };
            const next = change(mine[date]);
            if (next) mine[date] = next;
            else delete mine[date];
            return { ...all, [me]: mine };
        });
    }

    function saveWish(date: string, data: Wish) {
        updateMyWish(date, () => data);
    }

    function deleteWish(date: string) {
        updateMyWish(date, () => undefined);
        // вместе с желанием удаляем и запросы доступа к нему
        setAccessRequests(list => list.filter(r => !(r.owner === me && r.date === date)));
    }

    function setAccess(date: string, friend: UserId, open: boolean) {
        updateMyWish(date, old => {
            // Желание может быть только на сервере, а здесь его ещё нет — тогда начинаем с пустого
            const base = old ?? { title: '', comment: '', img: { emoji: '🎁', bg: '#FBE4EC' }, access: [] };
            return {
                ...base,
                access: open ? [...base.access, friend] : base.access.filter(id => id !== friend),
            };
        });
        if (open) {
            setAccessRequests(list => list.filter(r => !(r.from === friend && r.owner === me && r.date === date)));
        }
    }

    function denyAccess(friend: UserId, date: string) {
        setAccessRequests(list => list.filter(r => !(r.from === friend && r.owner === me && r.date === date)));
    }

    function requestAccess(owner: UserId, date: string) {
        setAccessRequests(list => [...list, { from: me, owner, date }]);
    }

    return {
        wishes, accessRequests,
        saveWish, deleteWish, setAccess, denyAccess, requestAccess,
    };
}