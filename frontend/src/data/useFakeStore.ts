// «Пульт» с данными, которых ещё нет на сервере. Остались только картинки желаний (они переедут на этапе 9).
// Друзья (этап 7), доступы к дням и запросы доступа (этап 8) теперь живут на сервере.
import { useState } from 'react';
import type { UserId, Wish } from '../types';
import { INITIAL_WISHES } from './fakeData';

export function useFakeStore(me: UserId) {
    const [wishes, setWishes] = useState(INITIAL_WISHES);

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
    }

    return { wishes, saveWish, deleteWish };
}
