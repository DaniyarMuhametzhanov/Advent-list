import { useEffect, useState } from 'react';
import type { UserId, Wish } from './types';
import type { FriendRequestDto } from './api/friends';
import type { AccessRequestDto } from './api/access';
import { USERS, fakeIdFor } from './data/fakeData';
import { useLogout, useMe } from './api/useAuth';
import { useFakeStore } from './data/useFakeStore';
import { dateKey, formatDate } from './lib/dates';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { FriendsPanel } from './components/FriendsPanel';
import { DayModal } from './components/DayModal';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useDeleteWish, useMyWishes, useSaveWish } from './api/useMyWishes';
import {
  useAcceptFriendRequest, useDeclineFriendRequest, useFriendCalendar, useFriends,
  useIncomingRequests, useRemoveFriend, useSendFriendRequest,
} from './api/useFriends';
import { toFriendWishes, toWishesByDate } from './api/toWishesByDate';
import {
  useDenyAccessRequest, useGrantAccessRequest, useIncomingAccessRequests, useRequestAccess, useSetAccess,
} from './api/useAccess';

export default function App() {
  // Кто «я» — теперь знает сервер. RequireAuth не пустит сюда без входа, поэтому data точно есть.
  const user = useMe().data!;
  const me = fakeIdFor(user);
  const [selected, setSelected] = useState<UserId>(me);  // чей календарь выбрали
  const logoutMutation = useLogout();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [openDay, setOpenDay] = useState<{ date: string; origin: { x: number; y: number } } | null>(null);

  const store = useFakeStore(me);
  const toast = useToast();

  // Друзья и заявки в друзья — с сервера
  const friendsQuery = useFriends();
  const incomingQuery = useIncomingRequests();
  const sendRequestMutation = useSendFriendRequest();
  const acceptMutation = useAcceptFriendRequest();
  const declineMutation = useDeclineFriendRequest();
  const removeFriendMutation = useRemoveFriend();

  const myFriends = (friendsQuery.data ?? []).map(fakeIdFor);
  const incoming = incomingQuery.data ?? [];

  // Доступ к дням — тоже с сервера
  const accessRequestsQuery = useIncomingAccessRequests();
  const setAccessMutation = useSetAccess();
  const requestAccessMutation = useRequestAccess();
  const grantRequestMutation = useGrantAccessRequest();
  const denyRequestMutation = useDenyAccessRequest();
  const accessRequests = accessRequestsQuery.data ?? [];

  // Чей календарь открыт. Если человека удалили из друзей, показываем свой.
  const owner = selected === me || myFriends.includes(selected) ? selected : me;

  // Настоящие данные с сервера: мои желания и календарь друга за месяц
  const myWishesQuery = useMyWishes();
  const saveMutation = useSaveWish();
  const deleteMutation = useDeleteWish();
  const monthKey = dateKey(month.year, month.month, 1).slice(0, 7); // '2026-10'
  const friendCalendarQuery = useFriendCalendar(owner === me ? null : USERS[owner].serverId, monthKey);

  const myWishes = toWishesByDate(myWishesQuery.data ?? [], store.wishes[me] ?? {});
  const ownerWishes = owner === me ? myWishes : toFriendWishes(friendCalendarQuery.data ?? [], me);

  const loading = owner === me ? myWishesQuery : friendCalendarQuery;
  const status = loading.isPending ? 'Загружаю желания…'
      : loading.error ? 'Не получилось загрузить желания: ' + loading.error.message
          : undefined;

  const badge = incoming.length + accessRequests.length;

  // Файл, брошенный мимо рамки, не должен открываться вместо страницы
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  function changeMonth(step: number) {
    const d = new Date(month.year, month.month + step, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function logout() {
    logoutMutation.mutate(); // на /login отправит RequireAuth, когда узнает, что мы вышли
  }

  // Окно закрыли, подсказку показали
  function done(text: string) {
    setOpenDay(null);
    toast.showToast(text);
  }

  function saveDay(date: string, wish: Wish) {
    const isNew = myWishes[date] === undefined;
    saveMutation.mutate({ date, input: { title: wish.title, comment: wish.comment } }, {
      onSuccess: async saved => {
        store.saveWish(date, wish);  // картинку пока помнит браузер
        // У нового желания доступ включаем только сейчас: до сохранения у него не было id
        if (isNew) {
          try {
            await Promise.all(wish.access.map(friend =>
                setAccessMutation.mutateAsync({ wishId: saved.id, friendId: USERS[friend].serverId, open: true })));
          } catch (error) {
            toast.showToast((error as Error).message); // желание сохранилось, а доступ — нет
            return;
          }
        }
        done('Сохранено');
      },
      onError: error => toast.showToast(error.message),
    });
  }

  // Переключатель «кто видит этот день» у уже сохранённого желания: меняем сразу на сервере
  function changeAccess(date: string, friend: UserId, open: boolean) {
    const wishId = myWishes[date]?.id;
    if (wishId === undefined) return;
    setAccessMutation.mutate({ wishId, friendId: USERS[friend].serverId, open }, {
      onSuccess: () => toast.showToast(`${USERS[friend].name} ${open ? 'теперь видит' : 'больше не видит'} этот день`),
      onError: error => toast.showToast(error.message),
    });
  }

  function askAccess(date: string) {
    const wishId = ownerWishes[date]?.id;
    if (wishId === undefined) return;
    requestAccessMutation.mutate(wishId, {
      onSuccess: () => toast.showToast('Запрос отправлен'),
      onError: error => toast.showToast(error.message),
    });
  }

  function grantRequest(request: AccessRequestDto) {
    grantRequestMutation.mutate(request.id, {
      onSuccess: () => toast.showToast(`${request.from.name} теперь видит ${formatDate(request.date)}`),
      onError: error => toast.showToast(error.message),
    });
  }

  function denyRequest(request: AccessRequestDto) {
    denyRequestMutation.mutate(request.id, {
      onSuccess: () => toast.showToast('В доступе отказано'),
      onError: error => toast.showToast(error.message),
    });
  }

  function deleteDay(date: string) {
    const id = myWishes[date]?.id;
    if (id === undefined) {
      store.deleteWish(date);
      done('Удалено');
      return;
    }
    deleteMutation.mutate(id, {
      onSuccess: () => {
        store.deleteWish(date);
        done('Удалено');
      },
      onError: error => toast.showToast(error.message),
    });
  }

  function addFriend(serverId: number) {
    sendRequestMutation.mutate(serverId, {
      onSuccess: () => toast.showToast('Заявка отправлена'),
      onError: error => toast.showToast(error.message),
    });
  }

  function acceptFriend(request: FriendRequestDto) {
    acceptMutation.mutate(request.id, {
      onSuccess: () => toast.showToast(`${request.from.name} теперь у вас в друзьях`),
      onError: error => toast.showToast(error.message),
    });
  }

  function declineFriend(request: FriendRequestDto) {
    declineMutation.mutate(request.id, {
      onSuccess: () => toast.showToast('Заявка отклонена'),
      onError: error => toast.showToast(error.message),
    });
  }

  function removeFriend(id: UserId) {
    const friend = USERS[id];
    if (!confirm(`Удалить ${friend.name} из друзей?`)) return;
    removeFriendMutation.mutate(friend.serverId, {
      onSuccess: () => toast.showToast(`${friend.name} больше не в друзьях`),
      onError: error => toast.showToast(error.message),
    });
  }

  function openCalendar(id: UserId) {
    setSelected(id);
    document.getElementById('cal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openDayAt(date: string, cell: HTMLElement) {
    const r = cell.getBoundingClientRect();
    setOpenDay({ date, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  }

  return (
      <>
        <Header me={me} badge={badge} onLogout={logout}
                onFriendsClick={() => document.getElementById('side')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

        <main className="wrap">
          <Calendar
              me={me} owner={owner} year={month.year} month={month.month}
              wishes={ownerWishes} myFriends={myFriends} status={status}
              onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)}
              onSelectOwner={setSelected} onOpenDay={openDayAt}
          />
          <FriendsPanel
              me={me} owner={owner} myFriends={myFriends}
              incoming={incoming} accessRequests={accessRequests}
              onOpenCalendar={openCalendar}
              onAddFriend={addFriend}
              onAccept={acceptFriend}
              onDecline={declineFriend}
              onRemoveFriend={removeFriend}
              onGrant={grantRequest}
              onDeny={denyRequest}
          />
        </main>

        {/* key: при открытии другого дня окно создаётся заново с чистой формой */}
        {openDay && (
            <DayModal
                key={owner + openDay.date}
                date={openDay.date} me={me} owner={owner}
                wish={ownerWishes[openDay.date]}
                myFriends={myFriends}
                alreadyAsked={ownerWishes[openDay.date]?.requested ?? false}
                origin={openDay.origin}
                onClose={() => setOpenDay(null)}
                onSave={saveDay}
                onDelete={deleteDay}
                onSetAccess={changeAccess}
                onRequestAccess={askAccess}
                onToast={toast.showToast}
            />
        )}

        <Toast text={toast.text} visible={toast.visible} />
      </>
  );
}