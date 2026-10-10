import { useEffect, useState } from 'react';
import type { UserId, Wish } from './types';
import { USERS } from './data/fakeData';
import { useFakeStore } from './data/useFakeStore';
import { formatDate } from './lib/dates';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { FriendsPanel } from './components/FriendsPanel';
import { DayModal } from './components/DayModal';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useDeleteWish, useMyWishes, useSaveWish } from './api/useMyWishes';
import { toWishesByDate } from './api/toWishesByDate';

export default function App() {
  const [me, setMe] = useState<UserId>('anna');        // кто «я» (пока через «Смотреть как»)
  const [owner, setOwner] = useState<UserId>('anna');  // чей календарь открыт
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [openDay, setOpenDay] = useState<{ date: string; origin: { x: number; y: number } } | null>(null);

  const store = useFakeStore(me);
  const toast = useToast();

  // Настоящие данные с сервера. Вход появится на этапе 6, а пока сервер считает,
  // что «я» — это Анна (id = 1). Поэтому с сервера берём только календарь Анны.
  const myWishesQuery = useMyWishes();
  const saveMutation = useSaveWish();
  const deleteMutation = useDeleteWish();

  const annaWishes = toWishesByDate(myWishesQuery.data ?? [], store.wishes.anna);
  const wishesOf = (id: UserId) => (id === 'anna' ? annaWishes : store.wishes[id]);

  const status = owner !== 'anna' ? undefined
      : myWishesQuery.isPending ? 'Загружаю желания…'
          : myWishesQuery.isError ? 'Не получилось загрузить желания: ' + myWishesQuery.error.message
              : undefined;

  const myFriends = store.friendsOf(me);
  const badge = store.friendRequests.filter(r => r.to === me).length
      + store.accessRequests.filter(r => r.owner === me).length;

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

  function changeMe(id: UserId) {
    // Остаёмся в том же календаре, если новый «я» — его владелец или друг владельца
    setOwner(owner === id || store.isFriend(id, owner) ? owner : id);
    setMe(id);
    setOpenDay(null);
    toast.showToast(`Вы смотрите как ${USERS[id].name}`);
  }
  // Окно закрыли, подсказку показали
  function done(text: string) {
    setOpenDay(null);
    toast.showToast(text);
  }

  function saveDay(date: string, wish: Wish) {
    if (me !== 'anna') {            // Борис и Вика пока живут только в браузере
      store.saveWish(date, wish);
      done('Сохранено');
      return;
    }
    saveMutation.mutate({ date, input: { title: wish.title, comment: wish.comment } }, {
      onSuccess: () => {
        store.saveWish(date, wish);  // картинку и доступ пока помнит браузер
        done('Сохранено');
      },
      onError: error => toast.showToast(error.message),
    });
  }

  function deleteDay(date: string) {
    const id = annaWishes[date]?.id;
    if (me !== 'anna' || id === undefined) {
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

  function openCalendar(id: UserId) {
    setOwner(id);
    document.getElementById('cal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openDayAt(date: string, cell: HTMLElement) {
    const r = cell.getBoundingClientRect();
    setOpenDay({ date, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  }

  return (
      <>
        <Header me={me} badge={badge} onChangeMe={changeMe}
                onFriendsClick={() => document.getElementById('side')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

        <main className="wrap">
          <Calendar
              me={me} owner={owner} year={month.year} month={month.month}
              wishes={wishesOf(owner)} myFriends={myFriends} status={status}
              onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)}
              onSelectOwner={setOwner} onOpenDay={openDayAt}
          />
          <FriendsPanel
              me={me} owner={owner} myFriends={myFriends} myWishes={wishesOf(me)}
              friendRequests={store.friendRequests} accessRequests={store.accessRequests}
              onOpenCalendar={openCalendar}
              onAddFriend={id => { store.sendFriendRequest(id); toast.showToast('Заявка отправлена'); }}
              onAccept={id => { store.acceptFriend(id); toast.showToast(`${USERS[id].name} теперь у вас в друзьях`); }}
              onDecline={id => { store.declineFriend(id); toast.showToast('Заявка отклонена'); }}
              onGrant={(id, date) => { store.setAccess(date, id, true); toast.showToast(`${USERS[id].name} теперь видит ${formatDate(date)}`); }}
              onDeny={(id, date) => { store.denyAccess(id, date); toast.showToast('В доступе отказано'); }}
          />
        </main>

        {/* key: при открытии другого дня окно создаётся заново с чистой формой */}
        {openDay && (
            <DayModal
                key={owner + openDay.date}
                date={openDay.date} me={me} owner={owner}
                wish={wishesOf(owner)[openDay.date]}
                myFriends={myFriends}
                alreadyAsked={store.accessRequests.some(r => r.from === me && r.owner === owner && r.date === openDay.date)}
                origin={openDay.origin}
                onClose={() => setOpenDay(null)}
                onSave={saveDay}
                onDelete={deleteDay}
                onSetAccess={(date, friend, open) => {
                  store.setAccess(date, friend, open);
                  toast.showToast(`${USERS[friend].name} ${open ? 'теперь видит' : 'больше не видит'} этот день`);
                }}
                onRequestAccess={date => { store.requestAccess(owner, date); toast.showToast('Запрос отправлен'); }}
                onToast={toast.showToast}
            />
        )}

        <Toast text={toast.text} visible={toast.visible} />
      </>
  );
}