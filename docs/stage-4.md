# Этап 4. Фронтенд по макету

## 🔹 Что делаем и зачем

До сих пор у нас был только сервер. Его можно проверить в Postman, но обычный человек так сайтом не пользуется.
Теперь делаем **то, что человек видит в браузере** (**фронтенд**, frontend).

Берём готовый макет `Вишлист-календарь.html` и переносим его в React.
Данные пока **ненастоящие** (**фейковые данные**, mock): те же Анна, Борис и Вика прямо в коде.
С сервером фронтенд свяжем на этапе 5.

Почему сначала фейк: так мы разбираемся **только** с React, без сети, CORS и ошибок сервера.
Маленький рабочий шаг лучше большого нерабочего.

## 🔹 React простыми словами

В макете вся страница собирается одной большой функцией, которая склеивает HTML-строки.
В React страница собирается из **кирпичиков**, как из LEGO. Каждый кирпичик — это **компонент** (component).

| Понятие | Простыми словами | Пример у нас |
|---|---|---|
| **Компонент** | функция, которая возвращает кусок страницы | `DayCell` рисует одну клетку дня |
| **JSX** | HTML прямо внутри TypeScript-кода | `<button className="nav">←</button>` |
| **Пропсы** (props) | входные данные компонента, как аргументы функции | `<DayCell day={8} wish={...} />` |
| **Состояние** (state) | данные, при изменении которых React сам перерисует страницу | открытый месяц, список желаний |
| **Хук** (hook) | специальная функция React, имя начинается с `use` | `useState`, `useEffect` |

Главная разница с макетом 💡: в макете после каждого изменения нужно **самому** вызвать `render()`.
В React мы только меняем состояние (`setMonth(...)`), а React **сам** перерисует то, что изменилось.

## 🔹 Как будет устроено

```
App                     ← хранит всё состояние, раздаёт данные вниз
├── Header              ← логотип, «Смотреть как», кнопка «Друзья»
├── Calendar            ← чипы, название месяца, стрелки, сетка, легенда
│   └── DayCell × 31    ← одна клетка дня (5 разных видов)
├── FriendsPanel        ← поиск, заявки, запросы доступа, список друзей
├── DayModal            ← окно дня (своё / чужое открытое / чужое закрытое)
└── Toast               ← всплывающая подсказка снизу «Сохранено»
```

Данные текут **сверху вниз** через пропсы. Когда внизу что-то нажали (например, «Сохранить»),
компонент вызывает функцию, которую ему передали сверху (`onSave`). Аналогия 📞: родитель даёт ребёнку
номер телефона, а ребёнок звонит, когда что-то случилось.

## 🔹 Шаг 1. Проверь Node.js

В терминале (можно прямо в IntelliJ, вкладка **Terminal**):

```
node -v
npm -v
```

Нужен Node **20 или новее**. Если команда не найдена, поставь Node.js LTS с сайта nodejs.org и перезапусти IntelliJ.

- **Node.js** — программа, которая запускает JavaScript вне браузера. Нужна для инструментов сборки.
- **npm** — «магазин» библиотек для JavaScript (**менеджер пакетов**). Как Maven для Java.

## 🔹 Шаг 2. Создай проект Vite

В папке `frontend` сейчас лежит пустой файл `.gitkeep`. Он был нужен, чтобы Git видел пустую папку.
Vite не любит создавать проект в непустой папке, поэтому удали его. В терминале, в корне `advent-list`:

```
del frontend\.gitkeep
npm create vite@latest frontend -- --template react-ts
```

(`del` работает в PowerShell и в обычной командной строке; в Git Bash пиши `rm frontend/.gitkeep`)

- **Vite** — инструмент, который запускает фронтенд во время разработки и собирает его для публикации (**сборщик**).
- `--template react-ts` — шаблон «React + TypeScript».

Если Vite задаст вопросы:
- папка не пустая → выбери «Ignore files and continue»;
- предложит экспериментальный вариант сборщика → **No**;
- «Install with npm and start now?» → **No** (сделаем руками, чтобы видеть, что происходит).

Дальше:

```
cd frontend
npm install
npm run dev
```

- `npm install` скачивает библиотеки в папку `node_modules` (её **не** коммитим, она уже в `.gitignore`).
- `npm run dev` запускает **сервер разработки**. Открой адрес из терминала, обычно http://localhost:5173.
  Должна открыться стартовая страница Vite с логотипом.

Сервер разработки следит за файлами: сохранил файл — страница обновилась сама (**горячая перезагрузка**, hot reload).
Оставь его запущенным и работай дальше. Остановить: `Ctrl + C` в терминале.

> Открывать папку `frontend` удобно в VS Code, но можно и в IntelliJ. Подойдёт любой редактор.

## 🔹 Шаг 3. Уборка шаблона

Удали то, что нам не нужно:

```
src/assets/          (вся папка)
src/App.css
public/icons.svg
```

Создай пустые папки внутри `src`: `components`, `data`, `hooks`, `lib`.
Страница пока сломается, это нормально: мы сейчас всё заменим.

## 🔹 Шаг 4. index.html — шрифты и заголовок

Замени содержимое `frontend/index.html`:

`frontend/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@500;700&display=swap" />
    <title>Адвент-календарь</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Что поменялось по сравнению с шаблоном:
- `lang="ru"` — язык страницы русский (важно для экранных читалок и переносов).
- `<link ... fonts.googleapis.com ...>` — подключаем шрифты **Unbounded** (заголовки) и **Onest** (текст), как в макете.
- `<div id="root">` — пустой контейнер. React нарисует всё приложение внутри него.

## 🔹 Шаг 5. index.css — стили из макета

Стили переносим из макета **почти без изменений**. Классы (`cell`, `chip`, `badge`…) остаются те же,
поэтому React-компоненты будут выглядеть точно как макет.

Открой `Вишлист-календарь.html` в редакторе. Замени **всё** содержимое `frontend/src/index.css` так:

1. Первые две строки:

```css
/* Стили перенесены из макета «Вишлист-календарь.html» почти без изменений. */
body{margin:0}img{max-width:100%}[hidden]{display:none!important}
```

2. Ниже вставь из макета всё, что находится **внутри второго** `<style> ... </style>`:
   от строки `:root{` до строки `@media (prefers-reduced-motion:reduce){...}` включительно
   (в макете это строки 12–176). Сами теги `<style>` и `</style>` **не** копируй: в CSS-файле их не бывает.

Разбор того, что внутри:
- `:root{ --berry:#C7356E; ... }` — **CSS-переменные**: цвета и тени заданы один раз и используются везде как `var(--berry)`.
- `@media (max-width:900px)` — правила только для узких экранов (**адаптивная вёрстка**): колонка «Друзья» уходит под календарь.
- `@media (prefers-reduced-motion:reduce)` — если человек попросил систему убрать анимации, выключаем их.

`main.tsx` из шаблона **не меняй**: он уже подключает `index.css` и рисует `<App />` внутри `#root`.

## 🔹 Шаг 6. Типы данных — `src/types.ts`

**TypeScript** — это JavaScript, где у данных есть описание формы (**типы**). Ошибся в имени поля —
редактор подчеркнёт сразу, а не через час в браузере. Похоже на `record` и классы в Java.

`frontend/src/types.ts`:

```ts
// Типы данных: какие «формы» у наших объектов.

export type UserId = string;

export type User = {
  id: UserId;
  name: string;  // «Анна»
  gen: string;   // родительный падеж: «календарь Анны»
  color: string; // цвет кружка-аватарки
};

// Картинка желания: либо эмодзи на цветном фоне (фейк), либо загруженный файл.
export type WishImage = { emoji: string; bg: string } | { src: string };

export type Wish = {
  title: string;
  comment: string;
  img: WishImage;
  access: UserId[]; // друзья, которым открыт этот день
};

// Желания одного человека: ключ — дата '2026-10-08', значение — желание.
export type WishesByDate = Record<string, Wish>;

export type FriendRequest = { from: UserId; to: UserId };
export type AccessRequest = { from: UserId; owner: UserId; date: string };
```

Разбор:
- `type Wish = { ... }` — описание формы объекта, как `record Wish(...)` в Java.
- `{ emoji; bg } | { src }` — знак `|` значит «**или**» (**объединение типов**, union): картинка бывает одного из двух видов.
- `Record<string, Wish>` — словарь «ключ → значение», как `Map<String, Wish>` в Java.
- `access: UserId[]` — массив (список) id друзей.

## 🔹 Шаг 7. Даты — `src/lib/dates.ts`

Маленькие функции-помощники для дат. В `lib` кладём код, который не рисует ничего на экране.

`frontend/src/lib/dates.ts`:

```ts
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const pad = (n: number) => String(n).padStart(2, '0');

// month здесь от 0 до 11, как в JavaScript Date
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function todayKey(): string {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// '2026-10-08' → '8 октября'
export function formatDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Сколько пустых клеток поставить перед 1-м числом (неделя начинается с понедельника)
export function firstWeekday(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
```

Разбор:
- `export` — функцию можно использовать в других файлах (через `import`). Как `public` в Java.
- Месяц в JavaScript считается **с нуля**: январь = 0, декабрь = 11. Поэтому в `dateKey` пишем `month + 1`.
- `dateKey(2026, 9, 8)` → `'2026-10-08'`. Это тот же формат, что `LocalDate` в Java отдаёт в JSON.
  На этапе 5 даты с сервера подойдут без переделки.
- `firstWeekday`: `getDay()` считает неделю с воскресенья (0), а у нас она с понедельника. `(x + 6) % 7` сдвигает.

## 🔹 Шаг 8. Фейковые данные — `src/data/fakeData.ts`

Те же люди и желания, что в макете и в тестовых данных этапа 3.

`frontend/src/data/fakeData.ts`:

```ts
// Фейковые данные: те же люди и желания, что в макете.
// На этапе 5 их заменят настоящие данные с сервера.
import type { AccessRequest, FriendRequest, User, UserId, Wish, WishesByDate } from '../types';
import { dateKey } from '../lib/dates';

export const USERS: Record<UserId, User> = {
  anna:  { id: 'anna',  name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
  boris: { id: 'boris', name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
  vika:  { id: 'vika',  name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};

// Дата в текущем месяце: day(8) → '2026-10-08'
const now = new Date();
const day = (d: number) => dateKey(now.getFullYear(), now.getMonth(), d);

const wish = (emoji: string, bg: string, title: string, comment: string, access: UserId[] = []): Wish =>
  ({ img: { emoji, bg }, title, comment, access });

export const INITIAL_WISHES: Record<UserId, WishesByDate> = {
  anna: {
    [day(3)]:  wish('🎧', '#FBE4EC', 'Наушники', 'Беспроводные, с шумоподавлением. Цвет — любой, кроме белого.'),
    [day(8)]:  wish('📚', '#DDF3EC', 'Книга', '«Мастер и Маргарита» в красивом издании с иллюстрациями.', ['boris']),
    [day(12)]: wish('🎭', '#FFF3D1', 'Поход в театр', 'Два билета на любой спектакль, лучше в выходной.'),
    [day(17)]: wish('👟', '#E3ECFB', 'Кроссовки для бега', 'Размер 38, для асфальта.'),
    [day(21)]: wish('🎨', '#FBE4EC', 'Набор акварели', '24 цвета и пара кистей из белки.', ['boris']),
    [day(26)]: wish('🎟️', '#DDF3EC', 'Билеты на концерт', 'Хочу на джазовый вечер в филармонии.'),
  },
  boris: {
    [day(5)]:  wish('🎲', '#FFF3D1', 'Настольная игра', 'Что-нибудь на компанию из четырёх человек.', ['anna']),
    [day(19)]: wish('☕', '#E3ECFB', 'Термос', 'На 0,5 литра, чтобы помещался в рюкзак.'),
  },
  vika: {
    [day(10)]: wish('🧶', '#FBE4EC', 'Плед', 'Тёплый, крупной вязки.'),
    [day(24)]: wish('📷', '#DDF3EC', 'Плёночный фотоаппарат', 'Простой, для прогулок.'),
  },
};

export const INITIAL_FRIENDS: [UserId, UserId][] = [['anna', 'boris']];
export const INITIAL_FRIEND_REQUESTS: FriendRequest[] = [{ from: 'vika', to: 'anna' }];
export const INITIAL_ACCESS_REQUESTS: AccessRequest[] = [{ from: 'boris', owner: 'anna', date: day(12) }];
```

Разбор:
- `day(8)` даёт 8-е число **текущего** месяца, поэтому календарь не пустой в любой месяц, когда открываешь.
- `wish(...)` — короткая функция, чтобы не писать один и тот же объект шесть раз.
- `INITIAL_...` — начальные значения. «Начальные», потому что дальше они будут меняться в состоянии.

## 🔹 Шаг 9. Хранилище данных — `src/data/useFakeStore.ts`

Это «пульт» с данными: всё, что знает приложение, и все действия над этим (сохранить, удалить, открыть доступ…).
Это **свой хук** (custom hook): обычная функция с именем на `use`, внутри которой вызываются другие хуки.

Почему отдельным файлом 💡: на этапе 5 мы **заменим** эти функции на запросы к серверу,
а компоненты почти не поменяются. Та же идея, что слои controller / service / repository на бэкенде.

`frontend/src/data/useFakeStore.ts`:

```ts
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
```

Разбор:
- `const [wishes, setWishes] = useState(INITIAL_WISHES)` — **состояние**. `wishes` — текущее значение,
  `setWishes` — единственный правильный способ его поменять. После `setWishes` React перерисует страницу.
- **Важное правило React**: состояние **не меняют на месте**, а создают новую копию (**неизменяемость**, immutability).
  - ❌ `wishes.anna[date] = wish` — React не заметит изменения, экран не обновится.
  - ✅ `{ ...all, [me]: mine }` — новый объект. `...` (**spread**) значит «скопируй все поля отсюда».
- `setWishes(all => ...)` — передаём функцию, которая получает **текущее** значение и возвращает новое.
  Так безопаснее, если изменений несколько подряд.
- `list.filter(r => !(...))` — новый список без нужного элемента. Так мы «удаляем» из массива.
- `deleteWish` удаляет и запросы доступа к этому дню, как требует правило из задания.

## 🔹 Шаг 10. Toast — всплывающая подсказка

Toast (дословно «тост») — короткое сообщение внизу экрана, которое само исчезает.

`src/hooks/useToast.ts` — логика (текст и таймер):

`frontend/src/hooks/useToast.ts`:

```ts
import { useRef, useState } from 'react';

// Хук: хранит текст уведомления и сам прячет его через 2,4 секунды
export function useToast() {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  function showToast(message: string) {
    setText(message);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 2400);
  }

  return { text, visible, showToast };
}
```

`src/components/Toast.tsx` — внешний вид:

`frontend/src/components/Toast.tsx`:

```tsx
type Props = { text: string; visible: boolean };

export function Toast({ text, visible }: Props) {
  return (
    <div className={visible ? 'toast on' : 'toast'} role="status" aria-live="polite">
      {text}
    </div>
  );
}
```

Разбор:
- `useRef` — «ящик», куда можно положить значение, которое живёт между перерисовками, но **не** вызывает перерисовку.
  Тут храним номер таймера, чтобы отменить старый, если пришло новое сообщение.
- `type Props = {...}` и `function Toast({ text, visible }: Props)` — компонент принимает пропсы и сразу достаёт
  из них поля (**деструктуризация**, destructuring).
- `className` вместо `class`: в JSX слово `class` занято (в JavaScript это ключевое слово для классов).
- Плавное появление делает CSS: класс `on` меняет прозрачность, а `transition` анимирует это.

Почему хук и компонент в разных файлах: так работает «горячая перезагрузка» Vite. Файл с компонентами
должен экспортировать **только** компоненты.

## 🔹 Шаг 11. Маленькие компоненты: Avatar и WishThumb

`src/components/Avatar.tsx` — кружок с первой буквой имени:

`frontend/src/components/Avatar.tsx`:

```tsx
import type { User } from '../types';

type Props = { user: User; large?: boolean };

// Кружок с первой буквой имени
export function Avatar({ user, large = false }: Props) {
  return (
    <span className={large ? 'ava lg' : 'ava'} style={{ background: user.color }} aria-hidden="true">
      {user.name[0]}
    </span>
  );
}
```

`src/components/WishThumb.tsx` — картинка желания:

`frontend/src/components/WishThumb.tsx`:

```tsx
import type { WishImage } from '../types';

// Картинка желания: настоящая (src) или эмодзи на цветном фоне
export function WishThumb({ img }: { img: WishImage }) {
  if ('src' in img) return <img src={img.src} alt="" />;
  return <span className="ph" style={{ background: img.bg }} aria-hidden="true">{img.emoji}</span>;
}
```

Разбор:
- `style={{ background: user.color }}` — первые скобки «здесь JavaScript», вторые — сам объект со стилями.
- `large = false` — **значение по умолчанию**: если проп не передали, будет `false`.
- `'src' in img` — проверяем, какой из двух видов картинки пришёл. После этой проверки TypeScript
  **сам понимает**, что внутри `if` у картинки есть `src`, а ниже есть `emoji` и `bg` (**сужение типа**, narrowing).

## 🔹 Шаг 12. Шапка — `src/components/Header.tsx`

`frontend/src/components/Header.tsx`:

```tsx
import type { UserId } from '../types';
import { USERS } from '../data/fakeData';

type Props = {
  me: UserId;
  badge: number;
  onChangeMe: (id: UserId) => void;
  onFriendsClick: () => void;
};

export function Header({ me, badge, onChangeMe, onFriendsClick }: Props) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="logo"><i>🎁</i><span>Адвент-календарь</span></div>

        {/* Временный переключатель для демо. На этапе 6 его заменит настоящий вход. */}
        <label className="viewas" htmlFor="viewas">Смотреть как:
          <select id="viewas" value={me} onChange={e => onChangeMe(e.target.value)}>
            {Object.values(USERS).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>

        <button className="btn-friends" onClick={onFriendsClick}>
          Друзья{badge > 0 && <span className="badge">{badge}</span>}
        </button>
      </div>
    </header>
  );
}
```

Разбор:
- `<select value={me} onChange={...}>` — **управляемое поле** (controlled input): что показывает список, решает
  состояние `me`, а при выборе мы сообщаем наверх через `onChangeMe`.
- `Object.values(USERS).map(u => <option key={u.id} ...>)` — превращаем массив людей в массив тегов.
  Так в React рисуют списки.
- `key={u.id}` — уникальная метка каждого элемента списка. По ней React понимает, какой элемент изменился.
  Без `key` в консоли будет предупреждение.
- `{badge > 0 && <span ...>}` — «если `badge > 0`, нарисуй бейдж, иначе ничего» (**условный рендеринг**).
- «Смотреть как» — временная штука для демо. На этапе 6 её заменят настоящие вход и регистрация.

## 🔹 Шаг 13. Клетка дня — `src/components/DayCell.tsx`

У клетки **5 видов** (**состояний**), как в задании:

| Чей день | Есть желание? | Что видно |
|---|---|---|
| мой | нет | пустая клетка, при наведении «+» |
| чужой | нет | серая клетка, клик ничего не делает |
| мой | да | картинка, название, «👁 N» |
| чужой, доступ есть | да | картинка, название, зелёная рамка |
| чужой, доступа нет | да | размытый фон и 🔒, **без** названия и картинки |

`frontend/src/components/DayCell.tsx`:

```tsx
import type { MouseEvent } from 'react';
import type { UserId, Wish } from '../types';
import { USERS } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { WishThumb } from './WishThumb';

type Props = {
  date: string;          // '2026-10-08'
  day: number;           // 8
  wish?: Wish;           // желание в этот день (если есть)
  me: UserId;
  isOwn: boolean;        // это мой календарь?
  isToday: boolean;
  myFriends: UserId[];
  onOpen: (date: string, cell: HTMLElement) => void;
};

// Одна клетка календаря. У неё 5 разных видов (состояний).
export function DayCell({ date, day, wish, me, isOwn, isToday, myFriends, onOpen }: Props) {
  const today = isToday ? ' today' : '';
  const num = <span className="num">{day}</span>;
  const label = formatDate(date);
  const open = (e: MouseEvent<HTMLElement>) => onOpen(date, e.currentTarget);

  // 1. Мой день, пусто → «+» при наведении
  if (!wish && isOwn) {
    return (
      <button className={'cell empty' + today} onClick={open} aria-label={`${label}: добавить желание`}>
        {num}<span className="plus" aria-hidden="true">+</span>
      </button>
    );
  }

  // 2. Чужой день, пусто → серая клетка, клик ничего не делает
  if (!wish) {
    return <div className={'cell empty off' + today} aria-label={`${label}: желания нет`}>{num}</div>;
  }

  // 3–4. Мой день с желанием или чужой открытый день
  if (isOwn || wish.access.includes(me)) {
    const seenBy = isOwn ? myFriends.filter(f => wish.access.includes(f)) : [];
    return (
      <button className={'cell has' + (isOwn ? '' : ' opened') + today} onClick={open}
              aria-label={`${label}: ${wish.title}`}>
        <WishThumb img={wish.img} />
        {num}
        {seenBy.length > 0 && (
          <span className="shared" title={'Видят: ' + seenBy.map(f => USERS[f].name).join(', ')}>
            👁 {seenBy.length}
          </span>
        )}
        <span className="cap">{wish.title}</span>
      </button>
    );
  }

  // 5. Чужой закрытый день → размытый фон и замок, без названия и картинки
  return (
    <button className={'cell has locked' + today} onClick={open} aria-label={`${label}: день закрыт`}>
      <span className="blur" />
      {num}
      <span className="lock" aria-hidden="true">🔒</span>
    </button>
  );
}
```

Разбор:
- Несколько `if` с ранним `return`: каждый вид клетки описан отдельно, легко читать.
- `onOpen(date, e.currentTarget)` — передаём наверх дату и саму кнопку. Кнопка нужна, чтобы конфетти вылетело из её центра.
- `'cell has' + (isOwn ? '' : ' opened') + today` — собираем список CSS-классов из кусочков.
  `условие ? A : B` — короткий `if` (**тернарный оператор**).
- `wish?: Wish` — знак `?` значит «пропа может не быть» (тогда в нём `undefined`).

⚠️ Важно понять: сейчас закрытый день прячется **только в интерфейсе**. Данные-то в браузере есть целиком.
Это нормально для фейка, но в настоящем проекте сервер **не должен** отдавать название и картинку закрытого дня.
Это сделаем на этапе 8 и докажем тестами.

## 🔹 Шаг 14. Календарь — `src/components/Calendar.tsx`

`frontend/src/components/Calendar.tsx`:

```tsx
import type { UserId, WishesByDate } from '../types';
import { USERS } from '../data/fakeData';
import { DOW, MONTHS, dateKey, daysInMonth, firstWeekday, todayKey } from '../lib/dates';
import { Avatar } from './Avatar';
import { DayCell } from './DayCell';

type Props = {
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
        {isOwn
          ? 'Нажмите на число, чтобы добавить или изменить желание.'
          : <>Вы — <b>{USERS[me].name}</b> и смотрите адвент-календарь <b>{USERS[owner].gen}</b>. Закрытые дни отмечены замком.</>}
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
```

Разбор:
- `Array.from({ length: 31 }, (_, i) => i + 1)` — создаёт массив `[1, 2, ..., 31]`. `_` — «этот аргумент мне не нужен».
- `blanks` — пустые клетки перед 1-м числом, чтобы 1-е встало под нужный день недели.
- `[me, ...myFriends]` — массив «я + мои друзья» для чипов сверху.
- `aria-pressed={owner === id}` — у выбранного чипа `true`. CSS красит такую кнопку в тёмный цвет.
  Заодно экранные читалки понимают, какая кнопка нажата (**доступность**, accessibility).
- `<>...</>` — **фрагмент**: обёртка, которая не создаёт лишний тег в HTML.
- Компонент **ничего не меняет сам**. Стрелки вызывают `onPrev` / `onNext`, а месяц хранится в `App`.

## 🔹 Шаг 15. Окно дня — `src/components/DayModal.tsx`

Самый большой компонент. У окна **3 вида**: свой день (форма), чужой открытый (только чтение), чужой закрытый.
Поэтому внутри три маленьких компонента: `OwnDay`, `ReadOnlyDay`, `LockedDay`.

Перед этим создай `src/lib/confetti.ts`. Это конфетти из макета, переписанное на TypeScript.
Разбирать по строчкам не нужно: это рисование точек на холсте (`<canvas>`), к React отношения не имеет.

`frontend/src/lib/confetti.ts`:

```ts
// Конфетти на <canvas>. Логика перенесена из макета почти без изменений.
const COLORS = ['#C7356E', '#F4C04E', '#1F8F74', '#2C6FD1', '#F7B9CF', '#BFE6D8'];

type Part = {
  x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number;
  c: string; round: boolean; life: number; max: number;
};

export function burst(canvas: HTMLCanvasElement, x: number, y: number) {
  // Человек попросил систему поменьше анимаций → не показываем конфетти
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let parts: Part[] = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 10;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, s: 5 + Math.random() * 6,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length],
      round: i % 4 === 0, life: 0, max: 70 + Math.random() * 45,
    });
  }

  // Один кадр анимации: сдвинуть частицы и нарисовать заново
  const tick = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life < p.max);
    for (const p of parts) {
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.globalAlpha = Math.min(1, (p.max - p.life) / 20);
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.cos(p.life * 0.2));
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

Теперь само окно:

`frontend/src/components/DayModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { UserId, Wish, WishImage } from '../types';
import { USERS } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { burst } from '../lib/confetti';
import { Avatar } from './Avatar';
import { WishThumb } from './WishThumb';

type Props = {
  date: string;
  me: UserId;
  owner: UserId;
  wish?: Wish;
  myFriends: UserId[];
  alreadyAsked: boolean;                      // я уже просил доступ к этому дню?
  origin: { x: number; y: number } | null;    // откуда лететь конфетти (центр клетки)
  onClose: () => void;
  onSave: (date: string, wish: Wish) => void;
  onDelete: (date: string) => void;
  onSetAccess: (date: string, friend: UserId, open: boolean) => void;
  onRequestAccess: (date: string) => void;
  onToast: (text: string) => void;
};

export function DayModal(props: Props) {
  const { date, me, owner, wish, onClose } = props;
  const isOwn = owner === me;
  const isLocked = !isOwn && !!wish && !wish.access.includes(me);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiDone = useRef(false);

  // При появлении окна: открыть <dialog> и запустить конфетти
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // В режиме разработки React (StrictMode) запускает эффект дважды — защищаемся флагом
    if (!confettiDone.current && props.origin && !isLocked && canvasRef.current) {
      confettiDone.current = true;
      burst(canvasRef.current, props.origin.x, props.origin.y);
    }
    // пустой список = выполнить один раз, когда окно появилось
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let content;
  if (isOwn) content = <OwnDay {...props} />;
  else if (!isLocked && wish) content = <ReadOnlyDay wish={wish} />;
  else content = <LockedDay owner={owner} asked={props.alreadyAsked} onAsk={() => props.onRequestAccess(date)} />;

  const subtitle = isOwn
    ? (wish ? 'Ваше желание на этот день' : 'Новое желание')
    : isLocked ? `Календарь ${USERS[owner].gen}` : `Желание ${USERS[owner].gen}, только для чтения`;

  return (
    <dialog ref={dialogRef} aria-labelledby="dlgTitle"
            onClose={onClose}                                         // закрыли клавишей Esc
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>  {/* клик по тёмному фону */}
      <div className="dlg pop">
        <div className="dlg-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="dlgTitle">{formatDate(date)}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="x" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {content}
      </div>
      <canvas ref={canvasRef} className="fx" />
    </dialog>
  );
}

/* ---------- Свой день: форма ---------- */
function OwnDay({ date, wish, myFriends, onSave, onDelete, onSetAccess, onToast }: Props) {
  const [title, setTitle] = useState(wish?.title ?? '');
  const [comment, setComment] = useState(wish?.comment ?? '');
  const [draftImg, setDraftImg] = useState<WishImage | null>(null);
  const [draftAccess, setDraftAccess] = useState<UserId[]>([]); // доступ для ещё не сохранённого желания
  const [showError, setShowError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const img = draftImg ?? wish?.img;
  const access = wish ? wish.access : draftAccess;

  function readFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) { onToast('Нужен файл с картинкой'); return; }
    const reader = new FileReader();
    reader.onload = () => setDraftImg({ src: reader.result as string });
    reader.readAsDataURL(file); // картинка превращается в длинную строку data:image/...
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    readFile(e.dataTransfer.files[0]);
  }

  function toggleAccess(friend: UserId, open: boolean) {
    if (wish) onSetAccess(date, friend, open);  // у существующего желания — сразу
    else setDraftAccess(list => open ? [...list, friend] : list.filter(id => id !== friend));
  }

  function save() {
    if (!title.trim()) { setShowError(true); return; }
    onSave(date, {
      title: title.trim(),
      comment: comment.trim(),
      img: img ?? { emoji: '🎁', bg: '#FBE4EC' },
      access,
    });
  }

  return (
    <>
      <div>
        <div className={'preview drop' + (dragOver ? ' over' : '')}
             onDragOver={e => { e.preventDefault(); setDragOver(true); }}
             onDragLeave={() => setDragOver(false)}
             onDrop={onDrop}>
          {img ? <WishThumb img={img} /> : 'Перетащите картинку сюда'}
        </div>
        <div className="upload" style={{ marginTop: 10 }}>
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Загрузить</button>
          <span className="hint">или перетащите файл в рамку</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => readFile(e.target.files?.[0])} />
        </div>
      </div>

      <label className="lbl" htmlFor="fTitle">Название желания
        <input className="field" id="fTitle" maxLength={60} placeholder="Например, наушники"
               value={title} onChange={e => { setTitle(e.target.value); setShowError(false); }} />
      </label>
      {showError && <p className="err">Введите название желания.</p>}

      <label className="lbl" htmlFor="fComment">Комментарий / описание
        <textarea className="field" id="fComment" placeholder="Размер, цвет, ссылка, пожелания"
                  value={comment} onChange={e => setComment(e.target.value)} />
      </label>

      <div className="access">
        <h3>Кто видит этот день</h3>
        {myFriends.length === 0 && <p className="hint">Добавьте друзей, чтобы открыть им этот день.</p>}
        {myFriends.map(f => (
          <div className="row" key={f}>
            <Avatar user={USERS[f]} large />
            <label className="grow" htmlFor={'acc-' + f}>{USERS[f].name}</label>
            <span className="sw">
              <input type="checkbox" id={'acc-' + f} checked={access.includes(f)}
                     onChange={e => toggleAccess(f, e.target.checked)} />
              <span />
            </span>
          </div>
        ))}
        {myFriends.length > 0 && (
          <p className="hint">{wish ? 'Доступ меняется сразу, без сохранения.' : 'Доступ включится после сохранения.'}</p>
        )}
      </div>

      <div className="foot">
        <button className="btn" onClick={save}>Сохранить</button>
        {wish && (
          <button className="btn danger sp"
                  onClick={() => confirmDelete ? onDelete(date) : setConfirmDelete(true)}>
            {confirmDelete ? 'Точно удалить?' : 'Удалить'}
          </button>
        )}
      </div>
    </>
  );
}

/* ---------- Чужой открытый день: только чтение ---------- */
function ReadOnlyDay({ wish }: { wish: Wish }) {
  return (
    <>
      <div className="preview"><WishThumb img={wish.img} /></div>
      <p className="ro-title">{wish.title}</p>
      {wish.comment ? <p className="ro-text">{wish.comment}</p> : <p className="hint">Комментария нет.</p>}
    </>
  );
}

/* ---------- Чужой закрытый день ---------- */
function LockedDay({ owner, asked, onAsk }: { owner: UserId; asked: boolean; onAsk: () => void }) {
  return (
    <div className="lockmsg">
      <p>🔒 Владелец пока не открыл вам этот день</p>
      <button className="btn" onClick={onAsk} disabled={asked}>
        {asked ? 'Запрос отправлен' : 'Попросить доступ'}
      </button>
      {asked && <span className="hint">{USERS[owner].name} увидит запрос в разделе «Друзья».</span>}
    </div>
  );
}
```

Разбор главного:
- `<dialog>` — встроенное в браузер модальное окно. `showModal()` открывает его поверх страницы с затемнением,
  а клавиша Esc закрывает сама.
- `useRef<HTMLDialogElement>(null)` + `ref={dialogRef}` — так мы получаем доступ к **настоящему** HTML-элементу,
  чтобы вызвать у него `showModal()`.
- `useEffect(() => {...}, [])` — код, который выполняется **после** того, как компонент появился на экране
  (**эффект**, side effect). Пустой список `[]` в конце значит «один раз при появлении».
  Строка `eslint-disable-next-line` говорит проверщику кода: «да, я знаю, что список пустой, так и задумано».
- `confettiDone` — защита от двойного запуска. В режиме разработки React специально запускает эффекты
  **дважды** (**StrictMode**), чтобы ловить ошибки. Без флага конфетти вылетало бы два раза.
- Поля формы — **управляемые**: `value={title}` и `onChange={e => setTitle(e.target.value)}`.
  То, что видно в поле, всегда равно состоянию `title`.
- `{showError && <p className="err">...}` — ошибка «Введите название» видна, только если `showError === true`
  (**валидация** на клиенте; на сервере она у нас уже есть с этапа 2).
- **Доступ** (переключатели «Кто видит этот день»):
  - у **существующего** желания меняется сразу (`onSetAccess`);
  - у **нового** копится в `draftAccess` и применится при сохранении.
- `FileReader.readAsDataURL` превращает картинку в длинную строку `data:image/...`. Это временно:
  на этапе 9 картинки будут загружаться на сервер в MinIO.
- «Удалить» сначала превращается в «Точно удалить?», и только второй клик удаляет (**подтверждение**).

## 🔹 Шаг 16. Панель друзей — `src/components/FriendsPanel.tsx`

`frontend/src/components/FriendsPanel.tsx`:

```tsx
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
```

Разбор:
- `const [query, setQuery] = useState('')` — текст поиска живёт **внутри** панели (**локальное состояние**):
  он больше никому не нужен, поэтому не тащим его в `App`.
- `<SearchResults query={query} {...props} />` — `{...props}` передаёт все пропсы панели дальше разом.
- `Count` — крошечный компонент для красного бейджа. Возвращает `null`, если число 0: «ничего не рисовать».
- `myWishes[r.date]?.title` — `?.` значит «если желания нет, не падай, а верни `undefined`» (**опциональная цепочка**).

## 🔹 Шаг 17. Собираем всё — `src/App.tsx`

Замени содержимое `App.tsx` целиком:

`frontend/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { UserId } from './types';
import { USERS } from './data/fakeData';
import { useFakeStore } from './data/useFakeStore';
import { formatDate } from './lib/dates';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { FriendsPanel } from './components/FriendsPanel';
import { DayModal } from './components/DayModal';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';

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
          wishes={store.wishes[owner]} myFriends={myFriends}
          onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)}
          onSelectOwner={setOwner} onOpenDay={openDayAt}
        />
        <FriendsPanel
          me={me} owner={owner} myFriends={myFriends} myWishes={store.wishes[me]}
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
          wish={store.wishes[owner][openDay.date]}
          myFriends={myFriends}
          alreadyAsked={store.accessRequests.some(r => r.from === me && r.owner === owner && r.date === openDay.date)}
          origin={openDay.origin}
          onClose={() => setOpenDay(null)}
          onSave={(date, wish) => { store.saveWish(date, wish); setOpenDay(null); toast.showToast('Сохранено'); }}
          onDelete={date => { store.deleteWish(date); setOpenDay(null); toast.showToast('Удалено'); }}
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
```

Разбор:
- `App` — **главный компонент**. Он хранит общее состояние (кто я, чей календарь, какой месяц, какой день открыт)
  и раздаёт его вниз пропсами.
- `useState(() => {...})` — начальное значение считается функцией один раз, при первом запуске.
- `const store = useFakeStore(me)` — подключаем наш «пульт» с данными.
- `myFriends` и `badge` **не хранятся** в состоянии, а **вычисляются** из него при каждой перерисовке.
  Правило: если значение можно посчитать из того, что уже есть, не заводи для него отдельное состояние.
- `{openDay && <DayModal ... />}` — окно есть на странице, только когда какой-то день открыт.
- `key={owner + openDay.date}` — если открыть другой день, React создаст окно **заново** с чистой формой.
- `useEffect` с `addEventListener('drop', ...)` — запрещаем браузеру открывать картинку вместо сайта,
  если её бросили мимо рамки. Функция в `return` убирает обработчики, когда компонент исчезает (**очистка**, cleanup).

## 🔹 Шаг 18. Проверь руками

Если сервер разработки остановлен, запусти его в папке `frontend`: `npm run dev`.
Открой http://localhost:5173 и пройди **сценарий показа** из макета:

1. ✅ Смотрим как **Анна**: в календаре 6 желаний, у 8-го и 21-го числа значок «👁 1». Сегодняшний день в жёлтой рамке.
2. ✅ Нажми на пустой день (например, 15-е). Нажми «Сохранить» без названия: появится «Введите название желания».
3. ✅ Загрузи картинку (кнопкой или перетаскиванием), напиши название и комментарий, «Сохранить».
   Внизу «Сохранено», в клетке картинка и название.
4. ✅ «Смотреть как» → **Борис**. В календаре Анны 15-е размыто и с замком. Нажми: «Владелец пока не открыл вам этот день».
   «Попросить доступ» → кнопка стала «Запрос отправлен» и не нажимается.
5. ✅ Обратно **Анна**: на кнопке «Друзья» и в панели появился запрос от Бориса.
   Открой 15-е и включи переключатель «Борис». На клетке появился «👁 1».
6. ✅ Снова **Борис**: 15-е в зелёной рамке, внутри видны картинка и комментарий.
7. ✅ Как Анна прими заявку Вики: появился чип «Календарь Вики». Поиск «ви» показывает «Уже в друзьях».
8. ✅ Удали желание: «Удалить» → «Точно удалить?» → клетка снова пустая.
9. ✅ Стрелки ← → листают месяцы. Сделай окно браузера узким: «Друзья» уходят под календарь, в шапке появляется кнопка «Друзья».

Обнови страницу (F5): все твои изменения пропадут. Так и должно быть, данные пока живут только в памяти браузера.
На этапе 5 они начнут храниться на сервере.

Если что-то не так, открой **инструменты разработчика** (F12) → вкладка **Console**. Красные строки — ошибки, пришли их мне.

## 🔹 Шаг 19. Проверка сборки

В папке `frontend`:

```
npm run build
npm run lint
```

- `build` сначала проверяет типы TypeScript (`tsc`), потом собирает готовый сайт в папку `dist`.
  Должно закончиться строкой `✓ built in ...`. `dist` не коммитим (она в `.gitignore`).
- `lint` ищет подозрительные места в коде (**линтер**). Должно быть 0 предупреждений и 0 ошибок.

## 🔹 Шаг 20. Сохрани в Git

Останови сервер разработки (`Ctrl + C`). В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 4: фронтенд по макету на фейковых данных"
```

В `git status` **не** должно быть `node_modules` и `dist`. Если они есть, проверь `.gitignore`.
`package-lock.json` коммитим обязательно: в нём точные версии библиотек.

## 🔹 Созданные и изменённые файлы

```
frontend/
├── index.html                      шрифты, lang="ru", заголовок
├── package.json, package-lock.json список библиотек (создал Vite)
├── vite.config.ts, tsconfig*.json  настройки (создал Vite, не меняем)
└── src/
    ├── main.tsx                    точка входа (не меняем)
    ├── index.css                   стили из макета
    ├── App.tsx                     главный компонент, общее состояние
    ├── types.ts                    типы данных
    ├── lib/
    │   ├── dates.ts                работа с датами
    │   └── confetti.ts             конфетти
    ├── data/
    │   ├── fakeData.ts             Анна, Борис, Вика и их желания
    │   └── useFakeStore.ts         состояние и действия (на этапе 5 → сервер)
    ├── hooks/
    │   └── useToast.ts             логика подсказки
    └── components/
        ├── Header.tsx              шапка
        ├── Calendar.tsx            календарь месяца
        ├── DayCell.tsx             клетка дня (5 видов)
        ├── DayModal.tsx            окно дня (3 вида)
        ├── FriendsPanel.tsx        панель друзей
        ├── Toast.tsx               всплывающая подсказка
        ├── Avatar.tsx              кружок с буквой
        └── WishThumb.tsx           картинка желания
```

## Главное, что нужно запомнить

- **Компонент** — функция, которая получает **пропсы** и возвращает JSX. Страница собирается из компонентов, как из LEGO.
- **Состояние** (`useState`) меняют только через `set...` и только **новой копией**. Тогда React сам перерисует экран.
- Данные текут **сверху вниз** через пропсы, а события идут **снизу вверх** через функции `onSomething`.
- Работа с данными вынесена в `useFakeStore`. На этапе 5 поменяем только его, а компоненты почти не тронем.
- Скрыть закрытый день в интерфейсе **не равно** защитить его. Настоящая защита будет на сервере (этап 8).
