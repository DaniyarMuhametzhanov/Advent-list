// «Пульт» с данными: всё состояние приложения и действия над ним.
// Пока всё живёт в памяти браузера. На этапе 5 эти функции начнут ходить на сервер.
import { useState } from 'react';
import type { UserId, Wish } from '../types';
import {
    INITIAL_ACCESS_REQUESTS, INITIAL_FRIEND_REQUESTS, INITIAL_FRIENDS, INITIAL_WISHES, USERS,
} from './fakeData';

export function useFakeStore(me: UserId) {
    const [wishes, setWishes] = useState(INITIAL_WISHES);
    const [friends, setFriends] = useState(INITIAL_FRIENDS);
    const [friendRequests, setFriendRequests] = useState(INITIAL_FRIEND_REQUESTS);
    const [accessRequests, setAccessRequests] = useState(INITIAL_ACCESS_REQUESTS);

    const isFriend = (a: UserId, b: UserId) =>
        a !== b && friends.some(pair => pair.includes(a) && pair.includes(b));

    const friendsOf = (user: UserId) =>
        Object.keys(USERS).filter(id => isFriend(user, id));

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
        updateMyWish(date, old => old && {
            ...old,
            access: open ? [...old.access, friend] : old.access.filter(id => id !== friend),
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

    function sendFriendRequest(to: UserId) {
        setFriendRequests(list => [...list, { from: me, to }]);
    }

    function acceptFriend(from: UserId) {
        setFriendRequests(list => list.filter(r => !(r.from === from && r.to === me)));
        setFriends(list => [...list, [me, from]]);
    }

    function declineFriend(from: UserId) {
        setFriendRequests(list => list.filter(r => !(r.from === from && r.to === me)));
    }

    return {
        wishes, friendRequests, accessRequests,
        isFriend, friendsOf,
        saveWish, deleteWish, setAccess, denyAccess, requestAccess,
        sendFriendRequest, acceptFriend, declineFriend,
    };
}