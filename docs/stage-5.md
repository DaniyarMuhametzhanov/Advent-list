# Этап 5. Связь фронта и бэка

## 🔹 Что делаем и зачем

Сейчас у нас две половинки, которые друг о друге не знают:

- **сервер** (backend) на Spring Boot умеет отдавать и сохранять желания в PostgreSQL;
- **интерфейс** (frontend) на React показывает календарь, но на **фейковых данных** из `fakeData.ts`.

На этом этапе соединяем их. После этапа **свои желания** (календарь Анны) будут браться из базы данных:
создал желание → обновил страницу (F5) → оно на месте. Это и есть главный признак, что связь работает.

Что **не** трогаем (это следующие этапы):

| Что | Где пока живёт | Когда переедет на сервер |
|---|---|---|
| Вход, «кто я» | переключатель «Смотреть как» | этап 6 |
| Друзья, заявки, Борис и Вика | фейковые данные в браузере | этап 7 |
| Кому открыт день | память браузера | этап 8 |
| Картинки | память браузера | этап 9 |

Почему с сервера берём только Анну: в `WishService` сейчас записано `CURRENT_USER_ID = 1L`.
Пока нет входа, сервер считает, что любой запрос пришёл от Анны.

## 🔹 Как будет устроено

```
Браузер (localhost:5173)
   │  fetch('/api/wishes')
   ▼
Vite — сервер разработки (5173)
   │  «/api/... — это не мне, передам дальше»   ← прокси
   ▼
Spring Boot (8080)  →  PostgreSQL в Docker (5434)
```

Три новых понятия:

| Понятие | Простыми словами |
|---|---|
| **CORS** | правило браузера: страница с одного адреса не может читать ответы с другого адреса, если тот не разрешил |
| **Прокси** (proxy) | посредник: принимает запрос и передаёт его дальше, как секретарь переводит звонок |
| **TanStack Query** | библиотека, которая загружает данные с сервера, запоминает их и сама показывает «загрузка / ошибка / готово» |

## 🔹 Шаг 1. Запусти базу и сервер

В корне `advent-list`:

```
docker compose up -d
```

- `up` — запустить контейнеры из `docker-compose.yml`;
- `-d` — в фоне (**detached**), чтобы терминал освободился.

Потом в IntelliJ запусти `BackendApplication` (зелёный треугольник). В логе должно быть `Tomcat started on port 8080`.

Проверь в браузере: открой `http://localhost:8080/api/wishes`. Должен прийти список из трёх желаний Анны
(5, 12 и 24 октября), примерно такой:

```json
[{"id":1,"date":"2026-10-05","title":"Книга «Маленький принц»","comment":"Лучше в твёрдой обложке"}, ...]
```

Если пришло — сервер готов. Если нет — сначала почини этапы 1–3, без работающего сервера дальше идти нет смысла.

## 🔹 Шаг 2. Эксперимент: увидеть CORS своими глазами

Запусти фронтенд (второй терминал, папка `frontend`):

```
npm run dev
```

Открой `http://localhost:5173`, нажми **F12** → вкладка **Console** и вставь:

```js
await fetch('http://localhost:8080/api/wishes')
```

Появится красная ошибка примерно такого вида:

```
Access to fetch at 'http://localhost:8080/api/wishes' from origin 'http://localhost:5173'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present...
```

### Что произошло

У каждой страницы есть «адрес происхождения» (**origin**) — это три вещи вместе: **протокол + хост + порт**.

| Адрес | Протокол | Хост | Порт |
|---|---|---|---|
| `http://localhost:5173` | http | localhost | **5173** |
| `http://localhost:8080` | http | localhost | **8080** |

Порты разные → для браузера это **разные сайты**. Браузер по умолчанию не даёт странице читать ответы
чужого сайта (**политика одного источника**, same-origin policy). Это защита: иначе любой сайт в соседней вкладке
мог бы читать, например, твою почту от твоего имени.

**CORS** (Cross-Origin Resource Sharing, «обмен между разными источниками») — способ, которым **сервер** говорит
браузеру: «этому адресу можно меня читать». Он делает это заголовком ответа `Access-Control-Allow-Origin`.
Наш Spring такого заголовка не отправляет, поэтому браузер ответ спрятал.

⚠️ Важная деталь: CORS — это защита **в браузере**, а не на сервере. Запрос до Spring дошёл, и Spring его выполнил.
Браузер просто не отдал ответ странице. Postman и `curl` правил CORS не соблюдают, поэтому там всё работало.

### Два способа решить

1. **Разрешить на сервере**: в Spring добавить настройку CORS (аннотация `@CrossOrigin` или общий `CorsConfigurationSource`).
2. **Сделать так, чтобы адрес был один**: браузер ходит только на `5173`, а Vite сам передаёт `/api/...` на `8080` (**прокси**).

Выбираем **прокси**. Причина: при публикации (этап 14) будет так же — Caddy отдаёт и сайт, и `/api` с одного адреса.
Значит, CORS не понадобится нигде, и не нужно держать в коде настройку, которая работает только на твоём компьютере.

## 🔹 Шаг 3. Прокси Vite

Открой `frontend/vite.config.ts` и замени содержимое:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Все запросы, которые начинаются с /api, Vite передаёт серверу Spring Boot.
    // Для браузера это один и тот же адрес localhost:5173, поэтому CORS не мешает.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
```

- `server` — настройки сервера разработки (тот, что запускается через `npm run dev`).
- `proxy` — правила пересылки: ключ `'/api'` — какие адреса пересылать, значение — куда.
- Запрос `http://localhost:5173/api/wishes` Vite перешлёт на `http://localhost:8080/api/wishes` и вернёт ответ браузеру.

Остановись (`Ctrl + C`) и снова запусти `npm run dev` — настройки Vite читаются только при запуске.

Проверь в консоли браузера (F12 → Console) на странице `http://localhost:5173`:

```js
await (await fetch('/api/wishes')).json()
```

Теперь адрес **без** `http://localhost:8080`, просто `/api/wishes`. Должен прийти массив из трёх желаний, без красных ошибок.
Ещё можно открыть `http://localhost:5173/api/wishes` прямо в адресной строке.

💡 Прокси работает **только** при `npm run dev`. В собранном сайте (`dist`) его нет — там эту роль потом возьмёт Caddy.

## 🔹 Шаг 4. Установи TanStack Query

В папке `frontend`:

```
npm install @tanstack/react-query
```

### Зачем библиотека, если есть `fetch`

Можно загрузить данные голым `fetch` внутри `useEffect`. Но тогда самому придётся писать:
состояние «загружается», состояние «ошибка», повтор при сбое, защиту от двойной загрузки,
обновление списка после сохранения. TanStack Query делает это за нас.

Аналогия 📒: TanStack Query — это секретарь с блокнотом. Ты просишь «дай мои желания».
Если в блокноте свежий ответ — он отдаёт его сразу. Если нет — звонит на сервер, а пока ждёт, говорит «загружаю».
Когда ты что-то поменял, ты говоришь «запись устарела», и он перезванивает.

| Термин | Простыми словами |
|---|---|
| **Запрос** (query) | чтение данных: «дай список желаний». Хук `useQuery` |
| **Мутация** (mutation) | изменение данных: сохранить, удалить. Хук `useMutation` |
| **Ключ запроса** (queryKey) | имя записи в блокноте, например `['wishes', 'mine']` |
| **Кэш** (cache) | сам блокнот: запомненные ответы сервера |
| **Инвалидация** (invalidation) | пометка «запись устарела, загрузи заново» |

## 🔹 Шаг 5. Подключи TanStack Query в `main.tsx`

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Хранилище ответов сервера для всего приложения
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- `new QueryClient()` — создаём тот самый «блокнот» (**клиент запросов**). Один на всё приложение.
- `<QueryClientProvider client={...}>` — оборачиваем приложение, чтобы любой компонент внутри мог пользоваться
  этим блокнотом (**провайдер**, provider). Без обёртки хуки `useQuery` выдадут ошибку.

## 🔹 Шаг 6. Функции для общения с сервером

Создай папку `frontend/src/api` и в ней файл `wishes.ts`:

```ts
// Всё общение с сервером про желания — в одном файле.

// Так желание приходит с сервера (это WishResponse из Java)
export type WishDto = {
    id: number;
    date: string;           // '2026-10-05'
    title: string;
    comment: string | null; // комментария может не быть
};

// Так желание уходит на сервер (это WishRequest из Java)
export type WishInput = {
    title: string;
    comment: string;
};

// Общая функция: отправить запрос, проверить ответ, достать JSON.
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        // Наш GlobalExceptionHandler отвечает в формате ProblemDetail: { detail, errors? }
        const problem = await response.json().catch(() => null);
        const fieldError = problem?.errors && Object.values(problem.errors)[0];
        throw new Error(fieldError ?? problem?.detail ?? `Ошибка сервера: ${response.status}`);
    }

    // 204 No Content — тела нет (так отвечает удаление)
    if (response.status === 204) return undefined as T;
    return response.json();
}

export function fetchMyWishes() {
    return request<WishDto[]>('/api/wishes');
}

export function saveWish(date: string, input: WishInput) {
    return request<WishDto>(`/api/wishes/${date}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteWish(id: number) {
    return request<void>(`/api/wishes/${id}`, { method: 'DELETE' });
}
```

Разбор по частям:

1. **Типы `WishDto` и `WishInput`** повторяют Java-классы `WishResponse` и `WishRequest`.
   DTO (Data Transfer Object, «объект для передачи данных») — форма данных, в которой они едут по сети.
   `comment: string | null` — комментарий может быть пустым (в базе это `NULL`).
2. **`async function`** — функция, внутри которой можно ждать ответа через `await`. Она возвращает
   **обещание** (**Promise**) — «результат будет позже».
3. **`request<T>`** — `<T>` значит «тип ответа подставим при вызове» (**обобщённый тип**, generic).
   `request<WishDto[]>` вернёт массив желаний, `request<void>` — ничего.
4. **`fetch(url, init)`** — встроенная функция браузера для HTTP-запросов. В `init` передаём метод (`PUT`, `DELETE`),
   тело (`body`) и заголовки. `Content-Type: application/json` говорит Spring: «в теле JSON».
5. **`response.ok`** — `true`, если код ответа 200–299. ⚠️ `fetch` **не** выбрасывает ошибку на 400 или 500,
   это надо проверять самому. Мы бросаем `Error` с понятным текстом.
6. **Текст ошибки** берём из ответа нашего `GlobalExceptionHandler` (формат **ProblemDetail**):
   сначала первую ошибку поля из `errors` (например, «Комментарий не длиннее 1000 символов»), иначе `detail`.
7. **204** — так Spring отвечает на удаление: «готово, тела нет». Пытаться читать JSON из пустого тела нельзя.
8. `JSON.stringify(input)` — превращает объект в строку JSON для отправки.

## 🔹 Шаг 7. Хуки TanStack Query

Файл `frontend/src/api/useMyWishes.ts`:

```ts
// Хуки TanStack Query: загрузить мои желания, сохранить, удалить.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteWish, fetchMyWishes, saveWish, type WishInput } from './wishes';

// «Имя» этих данных в хранилище TanStack Query
const MY_WISHES = ['wishes', 'mine'];

export function useMyWishes() {
    return useQuery({
        queryKey: MY_WISHES,
        queryFn: fetchMyWishes,
    });
}

export function useSaveWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ date, input }: { date: string; input: WishInput }) => saveWish(date, input),
        // Данные на сервере поменялись → старый список устарел, загрузим заново
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}

export function useDeleteWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteWish(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}
```

- **`useQuery({ queryKey, queryFn })`** — «держи в блокноте под именем `queryKey` результат функции `queryFn`».
  Возвращает объект: `data` (данные), `isPending` (ещё грузится), `isError` и `error` (что-то сломалось).
- **`useMutation({ mutationFn, onSuccess })`** — даёт функцию `mutate(...)`, которая выполнит изменение.
- **`invalidateQueries`** — после успешного сохранения говорим «список желаний устарел». TanStack Query
  сам загрузит его заново, и календарь перерисуется со свежими данными с сервера.
- `useQueryClient()` — достаёт тот самый блокнот, который мы создали в `main.tsx`.

## 🔹 Шаг 8. Номер желания в типе

Удалять желание сервер умеет только по `id` (`DELETE /api/wishes/{id}`). Значит, фронтенду нужно его помнить.

В `frontend/src/types.ts` добавь одну строку в тип `Wish`:

```ts
export type Wish = {
    id?: number;      // номер на сервере (у фейковых желаний его нет)
    title: string;
    ...
```

`?` значит «поле может отсутствовать» (**необязательное поле**). У Бориса и Вики его не будет.

## 🔹 Шаг 9. Перевод из «формы сервера» в «форму компонентов»

Сервер присылает **список**: `[{ id, date, title, comment }, ...]`.
Компоненты с этапа 4 ждут **объект по датам**: `{ '2026-10-05': { title, comment, img, access } }`.
Переписывать компоненты не будем — напишем маленький «переводчик» (**адаптер**).

Файл `frontend/src/api/toWishesByDate.ts`:

```ts
// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';

const DEFAULT_IMG: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Сервер пока хранит только название и комментарий.
// Картинку и доступ берём из памяти браузера (local), пока их нет на сервере (этапы 8 и 9).
export function toWishesByDate(list: WishDto[], local: WishesByDate): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        const old = local[dto.date];
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: old?.img ?? DEFAULT_IMG,
            access: old?.access ?? [],
        };
    }
    return result;
}
```

- Проходим по каждому желанию с сервера и кладём его в объект под ключом-датой.
- `dto.comment ?? ''` — если комментария нет (`null`), подставляем пустую строку.
  `??` значит «если слева `null` или `undefined`, возьми то, что справа».
- Картинки и доступа на сервере пока нет, поэтому берём их из памяти браузера (`local`).
  Если там пусто — ставим подарок 🎁 и пустой список доступа.

## 🔹 Шаг 10. Маленькая правка в `useFakeStore.ts`

Желание 5 октября есть на сервере, но его нет в фейковой памяти браузера. Если открыть его и поставить
галочку доступа для Бориса, старый код ничего не сделает: он меняет доступ только у желания, которое уже есть в памяти.

В функции `setAccess` замени вызов `updateMyWish(...)` на такой:

```ts
        updateMyWish(date, old => {
            // Желание может быть только на сервере, а здесь его ещё нет — тогда начинаем с пустого
            const base = old ?? { title: '', comment: '', img: { emoji: '🎁', bg: '#FBE4EC' }, access: [] };
            return {
                ...base,
                access: open ? [...base.access, friend] : base.access.filter(id => id !== friend),
            };
        });
```

Теперь, если записи в памяти нет, начинаем с пустой и добавляем в неё доступ.

## 🔹 Шаг 11. Место для «Загружаю…» в календаре

Пока данные едут с сервера или если сервер не ответил, человек должен это видеть, а не пустой календарь.
Покажем текст вместо подсказки под названием месяца.

В `frontend/src/components/Calendar.tsx`:

1) в `type Props` добавь поле:

```ts
    status?: string;         // «Загружаю…» или текст ошибки вместо подсказки
```

2) замени абзац `<p className="sub">...</p>` на:

```tsx
            <p className="sub">
                {props.status ?? (isOwn
                    ? 'Нажмите на число, чтобы добавить или изменить желание.'
                    : <>Вы — <b>{USERS[me].name}</b> и смотрите адвент-календарь <b>{USERS[owner].gen}</b>. Закрытые дни отмечены замком.</>)}
            </p>
```

Если `status` передан — показываем его, иначе прежнюю подсказку.

## 🔹 Шаг 12. Подключи сервер в `App.tsx`

Компоненты почти не меняются: меняется только **откуда** `App` берёт желания и **куда** их сохраняет.

**12.1.** Импорты. Поменяй строку с типами и добавь две новые:

```tsx
import type { UserId, Wish } from './types';
...
import { useDeleteWish, useMyWishes, useSaveWish } from './api/useMyWishes';
import { toWishesByDate } from './api/toWishesByDate';
```

**12.2.** Сразу после `const toast = useToast();` добавь:

```tsx
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
```

- `annaWishes` — желания Анны с сервера в «форме компонентов». Пока данные не пришли, `data` пустое, и мы берём `[]`.
- `wishesOf(id)` — одна функция «дай желания человека»: для Анны с сервера, для остальных из фейка.
- `status` — что написать в календаре Анны: «загружаю», ошибку или ничего.

**12.3.** Перед функцией `openCalendar` добавь функции сохранения и удаления:

```tsx
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
```

- `mutate(данные, { onSuccess, onError })` — отправить изменение на сервер. Окно закрываем **только после успеха**:
  если сервер ответил ошибкой, окно остаётся открытым, введённый текст не пропадает, а внизу появляется текст ошибки.
- После успеха ещё и записываем желание в фейковую память — там хранятся картинка и доступ, которых пока нет на сервере.
- `annaWishes[date]?.id` — `?.` значит «если желания нет, не падай, а верни `undefined`» (**опциональная цепочка**).

**12.4.** В разметке (`return`) замени четыре места:

| Было | Стало |
|---|---|
| `wishes={store.wishes[owner]} myFriends={myFriends}` (в `Calendar`) | `wishes={wishesOf(owner)} myFriends={myFriends} status={status}` |
| `myWishes={store.wishes[me]}` (в `FriendsPanel`) | `myWishes={wishesOf(me)}` |
| `wish={store.wishes[owner][openDay.date]}` (в `DayModal`) | `wish={wishesOf(owner)[openDay.date]}` |
| `onSave={(date, wish) => { ... }}` и `onDelete={date => { ... }}` | `onSave={saveDay}` и `onDelete={deleteDay}` |

## 🔹 Шаг 13. Проверь, что всё работает

Должны быть запущены: Docker с базой, `BackendApplication` и `npm run dev`. Открой `http://localhost:5173`,
нажми **F12** → вкладка **Network** (Сеть), фильтр **Fetch/XHR**. Там видно каждый запрос к серверу.

| # | Что сделать | Что должно быть |
|---|---|---|
| 1 | Открыть страницу | в Network запрос `wishes` со статусом 200; в октябре у Анны желания **5, 12 и 24** (из базы), а не фейковые |
| 2 | Нажать на пустой день, ввести название, «Сохранить» | запрос `PUT .../2026-10-15` → 200, подсказка «Сохранено», сразу за ним снова `GET wishes` |
| 3 | Нажать **F5** | желание на месте ✅ — значит, оно в базе, а не в памяти браузера |
| 4 | Открыть `http://localhost:8080/api/wishes` | новое желание есть и там |
| 5 | Изменить название, сохранить, F5 | новое название осталось |
| 6 | Удалить желание, F5 | запрос `DELETE` → 204, после F5 желания нет |
| 7 | Вставить в комментарий текст длиннее 1000 символов, сохранить | окно не закрылось, внизу «Комментарий не длиннее 1000 символов» (это ответ **сервера**) |
| 8 | Остановить `BackendApplication`, нажать F5 | несколько секунд «Загружаю желания…», потом «Не получилось загрузить желания: Ошибка сервера: 500» |

Про пункт 8: TanStack Query по умолчанию **повторяет** неудачный запрос 3 раза с паузами (**retry**), поэтому
ошибка появляется не сразу. Код 500 здесь отдаёт сам Vite: он не смог переслать запрос, потому что сервер выключен.
В его терминале при этом видно `http proxy error ... ECONNREFUSED`.

Чего пока ждать **не надо**:
- картинка и доступ к дню пропадают после F5 — они ещё не на сервере (этапы 8 и 9);
- «Смотреть как Борис» показывает его фейковые желания — Борис и Вика на сервер переедут вместе с входом и друзьями.

## 🔹 Шаг 14. Проверка сборки и линтера

В папке `frontend`:

```
npm run build
npm run lint
```

`build` должен закончиться `✓ built in ...`, `lint` — без ошибок.

## 🔹 Шаг 15. Сохрани в Git

Останови `npm run dev` (`Ctrl + C`). В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 5: связь фронта и бэка через TanStack Query и прокси Vite"
```

В `git status` должны быть изменения в `package.json` и `package-lock.json` (новая библиотека) — их коммитим обязательно.

## 🔹 Частые проблемы

| Что видишь | Почему | Что сделать |
|---|---|---|
| Ошибка CORS в консоли | где-то в коде полный адрес `http://localhost:8080/...` | пиши только `/api/...`, без адреса |
| 500 и `ECONNREFUSED` в терминале Vite | Spring не запущен или упал | запусти `BackendApplication`, посмотри его лог |
| 404 на `/api/wishes` | не перезапустил `npm run dev` после правки `vite.config.ts` | перезапусти |
| Календарь пустой, ошибок нет | открыт не октябрь 2026, а тестовые желания в октябре | листай стрелками к октябрю |
| `No QueryClient set` | забыл обёртку в `main.tsx` | вернись к шагу 5 |
| Spring падает с ошибкой подключения к базе | контейнер не запущен | `docker compose up -d` |

## 🔹 Созданные и изменённые файлы

```
frontend/
├── package.json, package-lock.json     + @tanstack/react-query
├── vite.config.ts                      прокси /api → localhost:8080
└── src/
    ├── main.tsx                        QueryClient и QueryClientProvider
    ├── App.tsx                         желания Анны с сервера, saveDay / deleteDay
    ├── types.ts                        поле id у Wish
    ├── api/                            ← новая папка
    │   ├── wishes.ts                   fetch-запросы к серверу
    │   ├── useMyWishes.ts              useQuery и useMutation
    │   └── toWishesByDate.ts           перевод «форма сервера» → «форма компонентов»
    ├── data/useFakeStore.ts            setAccess работает и для желаний с сервера
    └── components/Calendar.tsx         проп status («Загружаю…», ошибка)
```

## Главное, что нужно запомнить

- **Origin** = протокол + хост + порт. Разный порт → разный сайт, и браузер прячет ответ (**CORS**). Сервер запрос при этом выполнил.
- **Прокси Vite** делает адрес одним (`5173`), поэтому CORS не нужен. В коде пишем только `/api/...`.
- `fetch` **не** считает 400 и 500 ошибкой — проверяй `response.ok` сам.
- **TanStack Query**: `useQuery` читает и запоминает, `useMutation` меняет, `invalidateQueries` говорит «перезагрузи».
- Проверка, что данные реально на сервере: сохранил → **F5** → данные на месте.
