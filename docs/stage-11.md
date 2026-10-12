# Этап 11. Кэширование

## 🔹 Что делаем и зачем

Сейчас каждый раз, когда кто-то открывает календарь, сервер идёт в базу: берёт желания, праздники, доступы, проверяет дружбу.
Это 4–5 запросов к PostgreSQL на одно открытие страницы. Пока нас трое (Анна, Борис, Вика), это незаметно.
Но если календарь откроют тысячи людей, база будет снова и снова отвечать **на одни и те же вопросы**.

**Кэш** (cache) — это быстрая «шпаргалка» рядом с сервером. Первый раз ответ берём из базы и записываем в шпаргалку.
Следующие разы смотрим сразу в шпаргалку, а в базу не ходим.

Аналогия 🧊: холодильник на кухне и магазин. Магазин (база) — там есть всё, но идти далеко.
Холодильник (кэш) — рядом, но в нём только то, что ты уже принёс. И если в магазине продукт испортился (данные поменялись), а у тебя в холодильнике старый — надо его **выбросить**, иначе отравишься.

Вот это «выбросить вовремя» и есть самая трудная часть кэша. На этом этапе её и учимся делать.

План:

1. **Часть 1.** Кэш в памяти самого сервера — библиотека **Caffeine**.
2. **Часть 2.** Переносим кэш в отдельную программу **Redis**. Код сервисов при этом не меняется — меняются одна настройка и один класс.

После этапа будет 68 тестов бэкенда (было 59): 2 новых юнит-теста и 7 тестов правил кэша.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Кэш** (cache) | хранилище готовых ответов, чтобы не считать их заново |
| **Попадание в кэш** (cache hit) | ответ нашёлся в кэше, в базу не ходили |
| **Промах** (cache miss) | ответа в кэше нет, идём в базу и кладём ответ в кэш |
| **Ключ** (key) | «адрес» записи в кэше. Например, `5` — календарь человека с id 5 |
| **Сброс, инвалидация** (eviction, invalidation) | стереть запись из кэша, потому что данные в базе поменялись |
| **Время жизни** (TTL, time to live) | через сколько запись удалится сама, даже если её никто не стёр |
| **Устаревшие данные** (stale data) | в кэше лежит старое, а в базе уже новое. Главная опасность кэша |
| **Spring Cache** | часть Spring, которая даёт аннотации `@Cacheable` и класс `CacheManager`. Она не хранит данные сама, а работает поверх Caffeine, Redis и других |
| **Caffeine** | библиотека Java: кэш прямо в памяти нашего сервера. Очень быстрая |
| **Redis** | отдельная программа-хранилище «ключ → значение» в оперативной памяти. Запускаем её в Docker, как PostgreSQL и MinIO |
| **Прокси** (proxy) | «секретарь», которого Spring ставит перед твоим классом. Все вызовы снаружи идут через него, и он может что-то сделать до и после (проверить кэш, открыть транзакцию) |
| **Сериализация** (serialization) | превращение объекта Java в байты, чтобы отправить его в другую программу (например, в Redis) |

## 🔹 Что кладём в кэш, а что нет

Главное правило из задания:

> Кэшируем данные календаря **владельца**, а права смотрящего применяем уже **после** кэша.

Почему так? Представь, что мы кэшируем готовый ответ «календарь Анны». Первым его открыл Борис, которому открыт день 10 января.
Ответ с открытым днём лёг в кэш. Потом календарь открывает Вика, которой этот день **закрыт**… и получает его из кэша открытым. 💥 Секрет утёк.

Поэтому в кэше лежит то, что **одинаково для всех**: календарь, как его видит сам владелец (все дни открыты).
А «что из этого можно этому человеку» решаем каждый раз заново, уже после кэша:

```
GET /api/calendars/1?month=2026-12   (смотрит Борис, id 2)
   │
   ├─ 1. Друзья ли Борис и Анна?        ← кэш «friends»,   ключ "1:2"
   │
   ├─ 2. Все дни Анны, все открыты      ← кэш «calendars», ключ 1
   │      └─ оставляем только декабрь
   │
   ├─ 3. Какие дни Анны открыты Борису? ← кэш «openDays»,  ключ "2:1"
   │
   ├─ 4. К каким дням Борис уже просил доступ?  ← база (без кэша)
   │
   └─ 5. Каждый день: открыт Борису → отдаём как есть
                      закрыт        → стираем название, комментарий, картинку и праздники
```

Шаг 5 — то самое «права после кэша». Даже если в кэше лежат все секреты Анны, закрытый день уходит из сервера пустым.

Три кэша:

| Кэш | Ключ | Что лежит | Зачем |
|---|---|---|---|
| `calendars` | id владельца, `1` | все дни владельца со всеми полями и праздниками | самый «тяжёлый» ответ: желания + праздники |
| `openDays` | `"смотрящий:владелец"`, `"2:1"` | id желаний владельца, открытых смотрящему | доступы — второй запрос на каждое открытие |
| `friends` | `"меньший:больший"`, `"1:2"` | `true` / `false` | дружбу проверяем на каждое открытие чужого календаря |

Почему в `calendars` весь календарь, а не один месяц? Праздник «25 марта» без года виден в марте **каждого** года.
Если бы ключ был «владелец + месяц», при новом празднике пришлось бы стирать март 2026, март 2027, март 2028… А так стираем одну запись — `1`. Желаний у одного человека максимум несколько сотен, это немного.

Что **не** кэшируем:

- **«Я уже просил доступ»** (`requested`). Меняется каждый раз, когда друг нажимает «Попросить». Запрос маленький — кэш тут сложнее, чем польза.
- **Список своих желаний** для редактора (`GET /api/wishes`). Его смотрит только владелец, и сразу после изменений.
- **Картинки.** Их уже кэширует браузер: в адресе есть `v=...` (этап 9).

## 🔹 Когда стирать кэш

Это таблица — «сердце» этапа. Каждая строка — место в коде, где после изменения мы вызываем «ластик».

| Что поменялось | Где в коде | Что стираем |
|---|---|---|
| Желание сохранено или удалено | `WishService.saveForDate`, `delete` | `calendars` владельца |
| Загружена картинка | `WishImageService.upload` | `calendars` владельца (новый адрес картинки) |
| Праздник добавлен, переименован, удалён | `HolidayService.create`, `rename`, `delete` | `calendars` владельца |
| Владелец открыл день другу | `AccessService.grant` (и «Открыть» на запросе) | `openDays` этого друга |
| Владелец закрыл день | `AccessService.revoke` | `openDays` этого друга |
| Приняли заявку в друзья | `FriendService.accept` | `friends` пары и `openDays` в обе стороны |
| Удалили из друзей | `FriendService.removeFriend` | `friends` пары и `openDays` в обе стороны (доступы удалены) |

А удалённое желание в `openDays`? Его id там может остаться, но это не страшно: в `calendars` этого желания уже нет, показывать нечего.

## 🔹 Две ловушки Spring Cache

### Ловушка 1. Вызов изнутри класса идёт мимо кэша

`@Cacheable` работает через **прокси** (proxy) — «секретаря» перед классом:

```
WishService ──вызов──▶ [секретарь: «есть в кэше?»] ──▶ OwnerCalendarService.allDays()
```

Секретарь видит только звонки **снаружи**. Если метод класса вызывает свой же метод (`this.allDays()`), звонок идёт мимо секретаря, и кэш не сработает. Ошибки не будет — просто кэша не будет.

Поэтому кэшируемый метод `allDays` живёт в **отдельном** классе `OwnerCalendarService`, а не внутри `WishService`.
С `@Transactional` то же самое — эту ловушку ты уже мог встречать.

С `areFriends` наоборот: внутри `FriendService` её вызывают `sendRequest` и `accept`. Эти вызовы идут мимо кэша, прямо в базу — и это хорошо: при заявке в друзья нужен самый свежий ответ.

### Ловушка 2. Стереть кэш до того, как база сохранила

Метод с `@Transactional` записывает изменения в базу **в самом конце**, при коммите (commit). Если стереть кэш раньше, может случиться так:

```
Анна закрывает день            Борис открывает календарь
───────────────────            ─────────────────────────
стёрли кэш openDays
                               промах → читаем базу: день ЕЩЁ открыт (коммита не было)
                               кладём в кэш «открыт»
коммит: день закрыт
                               ...10 минут Борис видит закрытый день открытым
```

Решение — `TransactionAwareCacheManagerProxy`: он откладывает и «положить в кэш», и «стереть из кэша» до момента **после коммита**.
А если транзакция откатилась (ошибка), кэш вообще не трогается.

Полностью гонку это не убирает (два запроса могут пересечься ещё хитрее), поэтому у каждой записи есть **время жизни** 10 минут — страховка: даже если что-то пошло не так, через 10 минут запись исчезнет сама.

---

## 🔹 Перед началом

1. В корне `advent-list` выполни `git status`. Если там ещё изменения этапа 10 — сначала закоммить их (шаг 9 этапа 10). Так коммит этапа 11 будет отдельным.
2. Запусти Docker Desktop и `docker compose up -d`.
3. Проверь, что всё зелёное: в папке `backend` выполни `.\mvnw test` — должно быть `Tests run: 59, Failures: 0`.

---

# Часть 1. Caffeine: кэш в памяти сервера

## 🔹 Шаг 1. Библиотеки

Открой `backend/pom.xml`. Найди зависимость `software.amazon.awssdk` / `s3` и **прямо перед ней** добавь две:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-cache</artifactId>
		</dependency>
		<dependency>
			<groupId>com.github.ben-manes.caffeine</groupId>
			<artifactId>caffeine</artifactId>
		</dependency>
```

- `spring-boot-starter-cache` — сам Spring Cache: аннотации `@Cacheable`, `@EnableCaching`.
- `caffeine` — где будут храниться данные. Версию не пишем: её выбирает Spring Boot.

Нажми в IntelliJ **Load Maven Changes**.

## 🔹 Шаг 2. Настройка кэша и «ластики»

Создай папку `backend/src/main/java/com/adventcalendar/calendar/cache` и в ней два файла.

### 2.1. `CacheConfig.java` — какой кэш и с какими правилами

```java
package com.adventcalendar.calendar.cache;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.cache.transaction.TransactionAwareCacheManagerProxy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// @EnableCaching включает @Cacheable: без него Spring просто не замечает эти аннотации
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    CacheManager cacheManager() {
        CaffeineCacheManager caffeine = new CaffeineCacheManager(
                CalendarCaches.CALENDARS, CalendarCaches.OPEN_DAYS, CalendarCaches.FRIENDS);
        caffeine.setCaffeine(Caffeine.newBuilder()
                .maximumSize(10_000)                      // не больше 10 000 записей в каждом кэше
                .expireAfterWrite(Duration.ofMinutes(10))); // страховка: запись живёт максимум 10 минут
        // Записать или стереть кэш — только после того, как база сохранила изменения (после коммита).
        // Если транзакция откатится, кэш тоже не тронется
        return new TransactionAwareCacheManagerProxy(caffeine);
    }
}
```

Разбор:

- `@EnableCaching` — «включатель». Без него `@Cacheable` — просто надпись, которую никто не читает.
- `CacheManager` — «завхоз» всех кэшей (cache manager). У него можно попросить кэш по имени: `getCache("calendars")`.
- `new CaffeineCacheManager("calendars", "openDays", "friends")` — завхоз, который хранит три кэша в памяти сервера.
- `maximumSize(10_000)` — если записей станет больше, Caffeine выбросит те, к которым давно не обращались. Так память не закончится.
- `expireAfterWrite(10 минут)` — время жизни (TTL). Страховка из «Ловушки 2».
- `TransactionAwareCacheManagerProxy` — обёртка (декоратор, decorator) из «Ловушки 2»: всё откладывает до коммита.

### 2.2. `CalendarCaches.java` — названия кэшей и «ластики»

```java
package com.adventcalendar.calendar.cache;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

// Названия кэшей и «ластики»: какой кэш стереть, когда что-то поменялось.
// Ключи здесь должны совпадать с key = "..." в @Cacheable
@Component
public class CalendarCaches {

    // Все дни владельца, как их видит он сам. Ключ: id владельца
    public static final String CALENDARS = "calendars";
    // Какие дни владельца открыты смотрящему. Ключ: "смотрящий:владелец"
    public static final String OPEN_DAYS = "openDays";
    // Друзья ли двое. Ключ: "меньший id:больший id"
    public static final String FRIENDS = "friends";

    private final CacheManager cacheManager;

    public CalendarCaches(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    // Поменялось желание, картинка или праздник владельца
    public void calendarChanged(Long ownerId) {
        evict(CALENDARS, ownerId);
    }

    // Владелец открыл или закрыл свой день смотрящему
    public void accessChanged(Long ownerId, Long viewerId) {
        evict(OPEN_DAYS, viewerId + ":" + ownerId);
    }

    // Двое стали друзьями или перестали. При удалении из друзей пропадают и доступы в обе стороны
    public void friendshipChanged(Long a, Long b) {
        evict(FRIENDS, Math.min(a, b) + ":" + Math.max(a, b));
        accessChanged(a, b);
        accessChanged(b, a);
    }

    private void evict(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.evict(key);
        }
    }
}
```

Разбор:

- Константы `CALENDARS`, `OPEN_DAYS`, `FRIENDS` — названия кэшей в одном месте, чтобы не опечататься в строке.
- `evict(cacheName, key)` — стереть одну запись (evict — «выселить»).
- Методы названы по смыслу: «календарь поменялся», «доступ поменялся», «дружба поменялась». Сервисам не надо знать, какие кэши и с какими ключами стирать — они просто сообщают, **что** случилось.

> 💡 Почему не аннотация `@CacheEvict`? Она есть в Spring и стирает кэш по ключу из параметров метода.
> Но у нас ключ часто **не** в параметрах: в `accept(me, requestId)` нет id второго друга — он появляется только внутри метода.
> Плюс ловушка 1: `grantRequest` вызывает `grant` изнутри класса, и `@CacheEvict` на `grant` бы не сработал.
> Явный вызов `caches.accessChanged(...)` работает всегда и хорошо виден в коде.

## 🔹 Шаг 3. Закрытый день из открытого

Открой `wish/CalendarDayResponse.java`. Раньше закрытый день делали из `Wish`. Теперь у нас из кэша приходит уже готовый **открытый** день, и закрытый надо сделать из него.

Замени метод `closed`:

```java
    public static CalendarDayResponse closed(Wish wish, boolean requested) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, requested, null, null, null, null,
                List.of());
    }
```

на такой:

```java
    // Тот же день, но закрытый: оставляем только id и дату, всё остальное стираем
    public CalendarDayResponse closed(boolean requested) {
        return new CalendarDayResponse(wishId, date, false, requested, null, null, null, null, List.of());
    }
```

Разница: метод больше не `static`. Он вызывается у готового дня: `day.closed(true)`.
Запись (record) нельзя изменить, поэтому мы не «стираем поля», а создаём **новый** объект без секретов. Объект в кэше остаётся целым.

## 🔹 Шаг 4. `OwnerCalendarService` — что лежит в кэше

Создай файл `wish/OwnerCalendarService.java`:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.holiday.Holiday;
import com.adventcalendar.calendar.holiday.HolidayRepository;
import java.time.MonthDay;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Календарь владельца целиком, как его видит сам владелец: все дни открыты.
// Ответ не зависит от того, КТО смотрит, поэтому его можно положить в кэш один раз для всех.
// Права смотрящего применяет WishService уже ПОСЛЕ кэша
@Service
public class OwnerCalendarService {

    private final WishRepository wishRepository;
    private final HolidayRepository holidayRepository;

    public OwnerCalendarService(WishRepository wishRepository, HolidayRepository holidayRepository) {
        this.wishRepository = wishRepository;
        this.holidayRepository = holidayRepository;
    }

    // Первый вызов для владельца идёт в базу, следующие берут готовый ответ из кэша «calendars»
    @Cacheable(cacheNames = CalendarCaches.CALENDARS, key = "#ownerId")
    @Transactional(readOnly = true)
    public List<CalendarDayResponse> allDays(Long ownerId) {
        // Свои праздники владельца по датам: { 03-25: ["День рождения Влада"] }. Без года — каждый год
        Map<MonthDay, List<String>> holidays = holidayRepository
                .findAllByOwnerIdOrderByMonthAscDayAscIdAsc(ownerId).stream()
                .collect(Collectors.groupingBy(Holiday::getDate,
                        Collectors.mapping(Holiday::getTitle, Collectors.toList())));
        return wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId).stream()
                .map(wish -> CalendarDayResponse.open(wish,
                        holidays.getOrDefault(MonthDay.from(wish.getDate()), List.of())))
                .toList();
    }
}
```

Разбор `@Cacheable(cacheNames = CalendarCaches.CALENDARS, key = "#ownerId")`:

- `cacheNames` — в какой кэш класть.
- `key = "#ownerId"` — ключ записи. `#ownerId` — значение параметра `ownerId`. Это язык выражений Spring (**SpEL**, Spring Expression Language): `#имя` значит «параметр с таким именем».
- Что делает секретарь (прокси) при вызове `allDays(1)`:
  1. смотрит в кэш `calendars` по ключу `1`;
  2. нашёл → сразу возвращает, **тело метода не выполняется** (cache hit);
  3. не нашёл → выполняет метод (два запроса к базе), кладёт результат по ключу `1`, возвращает (cache miss).

Обрати внимание: метод знает **только** владельца. Здесь нет ни слова о том, кто смотрит. Это и делает его безопасным для кэша.

`MonthDay.from(wish.getDate())` — «месяц и число» из полной даты. Так праздник `03-25` подходит к желанию на 25 марта любого года.

## 🔹 Шаг 5. Репозитории

### 5.1. `access/WishAccessRepository.java`

Найди старый метод:

```java
    // Какие из этих желаний открыты человеку viewerId
    @Query("select a.wishId from WishAccess a where a.viewerId = :viewerId and a.wishId in :wishIds")
    List<Long> findOpenWishIds(Long viewerId, Collection<Long> wishIds);
```

и замени его на новый:

```java
    // Какие дни владельца ownerId открыты человеку viewerId (за все месяцы сразу).
    // Ответ кладём в кэш «openDays». Стирает его CalendarCaches.accessChanged
    @Cacheable(cacheNames = CalendarCaches.OPEN_DAYS, key = "#viewerId + ':' + #ownerId")
    @Query("""
            select a.wishId from WishAccess a, Wish w
            where a.wishId = w.id and a.viewerId = :viewerId and w.owner.id = :ownerId
            """)
    Set<Long> findOpenWishIdsOfOwner(Long viewerId, Long ownerId);
```

Добавь импорты:

```java
import com.adventcalendar.calendar.cache.CalendarCaches;
import java.util.Set;
import org.springframework.cache.annotation.Cacheable;
```

Разбор:

- Старый метод спрашивал «какие из **этих** id открыты». Набор id каждый раз разный (разные месяцы), и ключ кэша был бы неудобный.
  Новый спрашивает проще: «какие дни **этого владельца** открыты **этому человеку**». Ключ — два числа.
- `@Cacheable` можно ставить и на метод репозитория: Spring Data тоже создаёт для него прокси.
- `key = "#viewerId + ':' + #ownerId"` — склеиваем строку `"2:1"`. Ровно такой же ключ собирает `CalendarCaches.accessChanged`. **Если ключи не совпадут, ластик будет стирать не ту запись**, и кэш будет устаревать. Тест в шаге 8 это проверяет.
- Возвращаем `Set` (множество): нам нужно только «есть / нет», а `contains` у множества быстрый.

### 5.2. Удаляем то, что больше не нужно

Эти два метода использовал только старый `calendar()`. Теперь они лишние — удали их:

- в `wish/WishRepository.java` — метод `findAllByOwnerIdAndDateBetweenOrderByDateAsc` вместе с комментарием над ним;
- в `holiday/HolidayRepository.java` — метод `findAllByOwnerIdAndMonthOrderByDayAscIdAsc` вместе с комментарием.

## 🔹 Шаг 6. `WishService` — права после кэша

Открой `wish/WishService.java`.

### 6.1. Новые соседи

`HolidayRepository` здесь больше не нужен — праздники теперь собирает `OwnerCalendarService`. Вместо него — `OwnerCalendarService` и `CalendarCaches`.

Импорты: удали

```java
import com.adventcalendar.calendar.holiday.Holiday;
import com.adventcalendar.calendar.holiday.HolidayRepository;
```

и добавь

```java
import com.adventcalendar.calendar.cache.CalendarCaches;
```

Поля и конструктор замени так (последние две строки полей и конструктора — новые):

```java
    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;
    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;
    private final ImageStorage imageStorage;
    private final OwnerCalendarService ownerCalendar;
    private final CalendarCaches caches;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService,
                       WishAccessRepository accessRepository, AccessRequestRepository requestRepository,
                       ImageStorage imageStorage, OwnerCalendarService ownerCalendar, CalendarCaches caches) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
        this.imageStorage = imageStorage;
        this.ownerCalendar = ownerCalendar;
        this.caches = caches;
    }
```

### 6.2. Ластики при изменении желания

В `saveForDate` добавь одну строку:

```java
        wish.update(request.title(), request.comment());
        caches.calendarChanged(ownerId);
        return withAccess(wishRepository.save(wish));
```

В `delete` — тоже одну, сразу после `wishRepository.delete(wish);`:

```java
        wishRepository.delete(wish);
        caches.calendarChanged(ownerId);
```

Не страшно, что ластик стоит **до** `save`: благодаря `TransactionAwareCacheManagerProxy` он сработает только после коммита.

### 6.3. Новый `calendar`

Замени метод `calendar` **и** метод `openDay` под ним (он больше не нужен) на это:

```java
    @Transactional(readOnly = true)
    public List<CalendarDayResponse> calendar(Long viewerId, Long ownerId, YearMonth month) {
        boolean isOwner = viewerId.equals(ownerId);
        // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
        if (!isOwner && !friendService.areFriends(viewerId, ownerId)) {
            throw new NotFriendsException();
        }
        // 1. Из кэша: все дни владельца, ВСЕ открыты. Оставляем только нужный месяц
        List<CalendarDayResponse> days = ownerCalendar.allDays(ownerId).stream()
                .filter(day -> YearMonth.from(day.date()).equals(month))
                .toList();
        if (isOwner) {
            return days;
        }

        // 2. После кэша: права смотрящего. Какие дни ему открыты и к каким он уже просил доступ
        Set<Long> openIds = accessRepository.findOpenWishIdsOfOwner(viewerId, ownerId);
        List<Long> ids = days.stream().map(CalendarDayResponse::wishId).toList();
        Set<Long> requestedIds = new HashSet<>(requestRepository.findRequestedWishIds(viewerId, ids));

        // Главное правило: у закрытого дня название, комментарий и праздники даже не попадают в ответ
        return days.stream()
                .map(day -> openIds.contains(day.wishId())
                        ? day
                        : day.closed(requestedIds.contains(day.wishId())))
                .toList();
    }
```

Разбор по шагам:

1. `friendService.areFriends(...)` — проверка дружбы. Её тоже закэшируем (шаг 7.1), но это происходит внутри `FriendService`, здесь ничего менять не надо.
2. `ownerCalendar.allDays(ownerId)` — вызов **другого** класса, значит через прокси, значит кэш работает (помнишь ловушку 1?).
3. `.filter(day -> YearMonth.from(day.date()).equals(month))` — из всего календаря оставляем один месяц. Это быстрая работа в памяти, без базы.
4. Владельцу отдаём как есть: ему открыто всё.
5. Другу: `findOpenWishIdsOfOwner` — из кэша `openDays`; `findRequestedWishIds` — из базы.
6. Открытый день — отдаём **тот же** объект из кэша. Закрытый — **новый** объект без секретов (`day.closed(...)`).

## 🔹 Шаг 7. Ластики в остальных сервисах

Во все четыре сервиса добавляем одно и то же: поле `CalendarCaches caches`, параметр в конструктор и вызов ластика после изменения.
Импорт везде один:

```java
import com.adventcalendar.calendar.cache.CalendarCaches;
```

### 7.1. `friend/FriendService.java` — кэш дружбы и ластики

Поле и конструктор (новое — последнее поле, последний параметр и последняя строка):

```java
    private final AccessRequestRepository accessRequestRepository;
    private final CalendarCaches caches;

    public FriendService(FriendshipRepository friendshipRepository,
                         FriendRequestRepository requestRepository,
                         UserRepository userRepository,
                         WishAccessRepository accessRepository,
                         AccessRequestRepository accessRequestRepository,
                         CalendarCaches caches) {
        this.friendshipRepository = friendshipRepository;
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.accessRepository = accessRepository;
        this.accessRequestRepository = accessRequestRepository;
        this.caches = caches;
    }
```

Над `areFriends` добавь `@Cacheable` и комментарий:

```java
    // Ответ кладём в кэш «friends». Пара (1, 2) и (2, 1) — одна и та же дружба, поэтому ключ «меньший:больший».
    // Внимание: вызов areFriends ИЗНУТРИ этого же класса идёт мимо кэша (см. docs/stage-11.md)
    @Cacheable(cacheNames = CalendarCaches.FRIENDS, key = "T(Math).min(#x, #y) + ':' + T(Math).max(#x, #y)")
    @Transactional(readOnly = true)
    public boolean areFriends(Long x, Long y) {
```

и импорт `import org.springframework.cache.annotation.Cacheable;`.

`T(Math).min(#x, #y)` в SpEL — это вызов `Math.min(x, y)` из Java. Зачем «меньший:больший»? Борис спрашивает «друг ли мне Анна» (`areFriends(2, 1)`), а Анна — «друг ли мне Борис» (`areFriends(1, 2)`). Это один и тот же вопрос, и ключ у обоих `"1:2"`. Ластик `friendshipChanged` собирает ключ точно так же.

В конце `removeFriend` (после последнего `deleteAllSentTo`):

```java
        accessRequestRepository.deleteAllSentTo(friendId, me);
        caches.friendshipChanged(me, friendId);
    }
```

В `accept` — после блока `if`:

```java
        if (!areFriends(me, fromId)) {
            friendshipRepository.save(Friendship.between(me, fromId));
        }
        caches.friendshipChanged(me, fromId);
    }
```

Почему при **новой** дружбе тоже стираем? Если Вика до дружбы пробовала открыть календарь Анны, в кэше лежит `"1:3" → false`. Без ластика Вика 10 минут после принятия заявки видела бы «Вы не друзья».

### 7.2. `access/AccessService.java`

Поле, параметр конструктора и `this.caches = caches;` — как выше. Затем в `grant`:

```java
        if (!accessRepository.existsByWishIdAndViewerId(wishId, friendId)) {
            accessRepository.save(new WishAccess(wishId, friendId));
            caches.accessChanged(me, friendId);
        }
```

и в `revoke`:

```java
        accessRepository.deleteByWishIdAndViewerId(wishId, friendId);
        caches.accessChanged(me, friendId);
    }
```

`grantRequest` вызывает `grant` изнутри, и ластик сработает и там — это обычный вызов метода, без прокси.

### 7.3. `image/WishImageService.java`

Конструктор становится таким:

```java
    private final ImageStorage storage;
    private final CalendarCaches caches;

    public WishImageService(WishRepository wishRepository, WishAccessRepository accessRepository,
                            ImageProcessor processor, ImageStorage storage, CalendarCaches caches) {
        this.wishRepository = wishRepository;
        this.accessRepository = accessRepository;
        this.processor = processor;
        this.storage = storage;
        this.caches = caches;
    }
```

В `upload`, сразу после `wish.setImageKey(newKey);`:

```java
        wish.setImageKey(newKey);
        caches.calendarChanged(me); // у дня новый адрес картинки
```

### 7.4. `holiday/HolidayService.java`

```java
    private final UserRepository userRepository;
    private final CalendarCaches caches;

    public HolidayService(HolidayRepository repository, UserRepository userRepository, CalendarCaches caches) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.caches = caches;
    }
```

`caches.calendarChanged(me);` добавь в трёх местах:

- в `create` — перед `return`: `caches.calendarChanged(me); // праздники видны в календаре`
- в `rename` — перед `return`;
- в `delete` — после `repository.delete(...)`.

Запусти сервер: он должен стартовать без ошибок. Если пишет `... required a bean of type 'CalendarCaches' that could not be found` — проверь `@Component` над `CalendarCaches` (шаг 2.2).

## 🔹 Шаг 8. Тесты

### 8.1. Чиним юнит-тесты

В конструкторах трёх сервисов появился новый параметр. `@InjectMocks` подставляет заглушки по типу, а для `CalendarCaches` заглушки нет — подставит `null`, и тест упадёт с `NullPointerException`.

**`access/AccessServiceTest.java`** и **`image/WishImageServiceTest.java`** — добавь в каждый одну заглушку к остальным `@Mock` и импорт:

```java
import com.adventcalendar.calendar.cache.CalendarCaches;
...
    @Mock CalendarCaches caches;
```

**`wish/WishServiceTest.java`** — изменений больше, потому что `calendar()` теперь берёт дни из `OwnerCalendarService`, а не из репозиториев.

1. Импорты: удали `import com.adventcalendar.calendar.holiday.HolidayRepository;`, добавь `import com.adventcalendar.calendar.cache.CalendarCaches;` и `import java.util.Set;`.
2. Заглушки: замени `@Mock HolidayRepository holidayRepository;` на две:

   ```java
       @Mock OwnerCalendarService ownerCalendar;
       @Mock CalendarCaches caches;
   ```

3. Метод `ownerHasOneWish` замени на:

   ```java
       // «Кэш» владельца: один открытый день 10 января 2030 с праздником
       private void ownerHasOneWish() {
           when(ownerCalendar.allDays(OWNER_ID))
                   .thenReturn(List.of(CalendarDayResponse.open(wish, List.of("День рождения"))));
       }
   ```

4. В `strangerCannotSeeCalendar` последняя строка:

   ```java
           verifyNoInteractions(ownerCalendar); // до календаря (и до кэша) дело даже не дошло
   ```

5. В `closedDayHasNoTitleCommentAndImage` замени строку с `findOpenWishIds` на

   ```java
           when(accessRepository.findOpenWishIdsOfOwner(VIEWER_ID, OWNER_ID)).thenReturn(Set.of());
   ```

   и добавь в конец ещё одну проверку — праздник у закрытого дня тоже секрет:

   ```java
           assertThat(day.holidays()).isEmpty();
   ```

6. В `openDayShowsEverything` замени строку с `findOpenWishIds` на

   ```java
           when(accessRepository.findOpenWishIdsOfOwner(VIEWER_ID, OWNER_ID)).thenReturn(Set.of(5L));
   ```

   и добавь в конец

   ```java
           assertThat(day.holidays()).containsExactly("День рождения");
   ```

7. После `openDayShowsEverything` добавь два новых теста:

   ```java
       @Test
       void otherMonthsAreFilteredOut() {
           ownerHasOneWish(); // желание в январе 2030

           assertThat(service.calendar(OWNER_ID, OWNER_ID, YearMonth.of(2030, 2))).isEmpty();
       }

       @Test
       void savingWishClearsOwnerCalendarCache() {
           when(wishRepository.findByOwnerIdAndDate(OWNER_ID, wish.getDate())).thenReturn(Optional.of(wish));
           when(wishRepository.save(wish)).thenReturn(wish);

           service.saveForDate(OWNER_ID, wish.getDate(), new WishRequest("Новое", null));

           verify(caches).calendarChanged(OWNER_ID);
       }
   ```

8. В `deletingWishAlsoDeletesItsImageFiles` добавь в конец:

   ```java
           verify(caches).calendarChanged(OWNER_ID);
   ```

`verify(caches).calendarChanged(OWNER_ID)` — «ластик вызвали, и именно для этого владельца». Юнит-тест не проверяет сам кэш — он проверяет, что сервис **не забыл** про ластик.

### 8.2. Новый тест: правила кэша

Создай `backend/src/test/java/com/adventcalendar/calendar/cache/CacheRulesTest.java`:

```java
package com.adventcalendar.calendar.cache;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.friend.FriendRequestRepository;
import com.adventcalendar.calendar.friend.FriendRequestStatus;
import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

// Правила кэша. Здесь НЕТ @Transactional, и это важно: кэш пишется только после коммита,
// а в тесте с @Transactional коммита не бывает (всё откатывается) — кэш бы просто не работал.
// Поэтому всё, что тест создал, удаляем сами в @AfterEach
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
class CacheRulesTest {

    private static final String SECRET_TITLE = "Секретный подарок";
    private static final String MONTH = "2031-01";

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired FriendRequestRepository friendRequestRepository;
    @Autowired WishRepository wishRepository;
    @Autowired CacheManager cacheManager;

    User owner;
    User friend;
    User stranger;
    Wish wish;

    @BeforeEach
    void setUp() {
        clearCaches();
        owner = userRepository.save(new User("Хозяин", "cache-owner@test.local", "x"));
        friend = userRepository.save(new User("Друг", "cache-friend@test.local", "x"));
        stranger = userRepository.save(new User("Чужой", "cache-stranger@test.local", "x"));
        friendshipRepository.save(Friendship.between(owner.getId(), friend.getId()));

        wish = new Wish(owner, LocalDate.of(2031, 1, 10));
        wish.update(SECRET_TITLE, "Никому не говорить");
        wish = wishRepository.save(wish);
    }

    @AfterEach
    void tearDown() {
        // Желания, друзья, доступы и праздники удалит сама база: ON DELETE CASCADE
        userRepository.deleteAllInBatch(List.of(owner, friend, stranger));
        clearCaches();
    }

    private void clearCaches() {
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    private String calendarOf(User u) {
        return "/api/calendars/" + u.getId() + "?month=" + MONTH;
    }

    @Test
    void secondReadComesFromCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        // Меняем название в обход сервиса, прямо в базе. Кэш об этом не знает
        Wish fromDb = wishRepository.findById(wish.getId()).orElseThrow();
        fromDb.update("Изменено в базе", null);
        wishRepository.save(fromDb);

        // Всё ещё старое название: ответ пришёл из кэша, а не из базы
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));
    }

    @Test
    void savingWishThroughApiClearsCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        mvc.perform(put("/api/wishes/2031-01-10").with(as(owner)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"Новый велосипед\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].title").value("Новый велосипед"));
    }

    @Test
    void ownersCachedCalendarDoesNotLeakToFriend() throws Exception {
        // Хозяин смотрит первым: в кэше лежит его календарь со ВСЕМИ секретами
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].open").value(true));

        // Друг берёт тот же кэш, но закрытый день ему всё равно приходит пустым
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void grantAndRevokeClearAccessCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false));

        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true));

        mvc.perform(delete("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void removedFriendLosesCalendarAtOnce() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isOk()); // теперь в кэше: «друзья» и «день открыт»

        mvc.perform(delete("/api/friends/{id}", friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isForbidden());
    }

    @Test
    void newFriendSeesCalendarAtOnce() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isForbidden()); // в кэше: «не друзья»

        mvc.perform(post("/api/friend-requests").with(as(stranger)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\": " + owner.getId() + "}"))
                .andExpect(status().isCreated());
        Long requestId = friendRequestRepository
                .findAllByToUserIdAndStatusOrderByCreatedAtAsc(owner.getId(), FriendRequestStatus.PENDING)
                .getFirst().getId();
        mvc.perform(post("/api/friend-requests/{id}/accept", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isOk());
    }

    @Test
    void newHolidayClearsCache() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].holidays").isEmpty());

        mvc.perform(post("/api/holidays/1/10").with(as(owner)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"День рождения\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get(calendarOf(owner)).with(as(owner)))
                .andExpect(jsonPath("$[0].holidays[0]").value("День рождения"));
    }
}
```

Что тут важно понять:

- **Почему без `@Transactional`.** В `AccessRulesTest` всё откатывается после теста. Отката «после коммита» не бывает, значит кэш в таких тестах вообще не заполняется (это даже хорошо: старые тесты не мешают друг другу через кэш). А здесь нам нужен **настоящий** кэш, поэтому коммиты настоящие, и убираем за собой сами в `@AfterEach`.
- **`secondReadComesFromCache`** — доказывает, что кэш вообще работает. Меняем базу в обход сервиса (ластик не вызывается) — и видим старое название. Это и есть «устаревшие данные», только специально.
- **`ownersCachedCalendarDoesNotLeakToFriend`** — главный тест этапа. Сначала смотрит хозяин, и в кэш ложатся все секреты. Потом друг — и секрета в ответе нет.
- Остальные тесты — по одному на строку таблицы «Когда стирать кэш»: если забыть ластик, тест покраснеет.

### 8.3. Запуск

В папке `backend`:

```
.\mvnw test
```

Ждём: `Tests run: 68, Failures: 0, Errors: 0`.

> 💡 Хочешь убедиться, что тесты правда ловят ошибку? Закомментируй строку `caches.accessChanged(me, friendId);` в `AccessService.grant` и запусти только новый тест:
> `.\mvnw test -Dtest=CacheRulesTest`. Упадёт `grantAndRevokeClearAccessCache`: друг не видит день, который ему только что открыли. Верни строку обратно.

## 🔹 Шаг 9. Посмотреть на кэш своими глазами

Временно добавь в `application.properties`:

```properties
logging.level.org.springframework.cache=TRACE
```

Запусти сервер, войди как Анна и открой календарь. Перелистни месяц туда и обратно. В логе сервера будет:

```
No cache entry for key '1' in cache(s) [calendars]        ← промах: идём в базу
Creating cache entry for key '1' in cache(s) [calendars]  ← кладём в кэш
Cache entry for key '1' found in cache(s) [calendars]     ← попадание: базу не трогаем
```

Теперь поменяй любое желание и снова открой календарь — опять будет `No cache entry`: ластик сработал.

Перезапусти сервер — и кэш пустой. Caffeine живёт в памяти сервера и умирает вместе с ним.
Строку `logging.level...` потом убери: в обычной работе этот лог слишком болтливый.

---

# Часть 2. Redis: кэш в отдельной программе

## 🔹 Зачем менять Caffeine на Redis

У Caffeine две проблемы, которые видны, когда приложение растёт:

1. **Кэш умирает при перезапуске сервера.** После каждого обновления версии все первые запросы идут в базу.
2. **Несколько серверов — несколько разных кэшей.** Если запустить две копии бэкенда (так делают, чтобы выдержать нагрузку), у каждой своя память.
   Анна закрыла день через сервер А — ластик стёр кэш сервера А. А Борис попал на сервер Б, где лежит старое «день открыт». 💥

**Redis** — отдельная программа. Все копии сервера ходят в **один** Redis, значит кэш один на всех, и ластик стирает его для всех сразу.

```
Caffeine:                         Redis:
┌─────────┐  ┌─────────┐          ┌─────────┐  ┌─────────┐
│ сервер А│  │ сервер Б│          │ сервер А│  │ сервер Б│
│ [кэш А] │  │ [кэш Б] │          └────┬────┘  └────┬────┘
└─────────┘  └─────────┘               └─────┬──────┘
   разные кэши — беда                    ┌───┴───┐
                                         │ Redis │  один кэш
                                         └───────┘
```

Цена: каждое обращение к кэшу — это поход по сети в другую программу. Это медленнее, чем Caffeine, но всё равно намного быстрее, чем запрос в PostgreSQL.

Хорошая новость: благодаря Spring Cache **сервисы не меняются**. `@Cacheable` и `CalendarCaches` ничего не знают о том, где лежат данные. Меняем только «завхоза» (`CacheManager`).

## 🔹 Шаг 10. Redis в Docker

Открой `docker-compose.yml` в корне `advent-list` и добавь сервис **после `minio`** (перед `volumes:`), с тем же отступом, что у `minio`:

```yaml
  redis:
    image: redis:8
    container_name: advent-redis
    ports:
      - "6379:6379"
```

Тома (volume) не делаем специально: кэш — это копия данных из базы. Потерять его не страшно, он заполнится заново.

Запусти: `docker compose up -d`. Проверь, что Redis отвечает:

```
docker exec -it advent-redis redis-cli ping
```

Должно быть `PONG`.

## 🔹 Шаг 11. Библиотеки

В `backend/pom.xml` замени зависимость `caffeine`:

```xml
		<dependency>
			<groupId>com.github.ben-manes.caffeine</groupId>
			<artifactId>caffeine</artifactId>
		</dependency>
```

на Redis:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-redis</artifactId>
		</dependency>
```

`spring-boot-starter-cache` оставь. **Load Maven Changes**.

## 🔹 Шаг 12. Адрес Redis

В `application.properties` перед блоком `# Хранилище картинок` добавь:

```properties
# Кэш (Redis из docker-compose.yml)
spring.data.redis.host=localhost
spring.data.redis.port=6379
```

## 🔹 Шаг 13. Новый `CacheConfig`

Замени **всё** содержимое `cache/CacheConfig.java`:

```java
package com.adventcalendar.calendar.cache;

import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

// @EnableCaching включает @Cacheable: без него Spring просто не замечает эти аннотации
@Configuration
@EnableCaching
public class CacheConfig {

    // Кэш теперь живёт не в памяти сервера, а в отдельной программе Redis.
    // Адрес Redis Spring берёт из spring.data.redis.* в application.properties
    @Bean
    CacheManager cacheManager(RedisConnectionFactory redis) {
        RedisCacheConfiguration settings = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10)); // страховка: запись живёт максимум 10 минут
        return RedisCacheManager.builder(redis)
                .cacheDefaults(settings)
                // Записать или стереть кэш — только после коммита, как и с Caffeine
                .transactionAware()
                .build();
    }
}
```

Разбор:

- `RedisConnectionFactory redis` — «телефон» до Redis. Его создаёт Spring Boot сам по настройкам из шага 12, а мы просим его параметром метода.
- `entryTtl(10 минут)` — то же время жизни, что было у Caffeine. Здесь его соблюдает уже сам Redis.
- `.transactionAware()` — то же, что `TransactionAwareCacheManagerProxy` в части 1: всё после коммита.
- `maximumSize` больше нет: размер памяти ограничивают в настройках самого Redis. Для учебного проекта не нужно.

## 🔹 Шаг 14. Redis умеет хранить только байты

Caffeine хранил **сами объекты Java** в памяти сервера. Redis — другая программа, объект Java ей не передашь. Его надо превратить в байты — **сериализовать** (serialize), а при чтении собрать обратно.

По умолчанию Spring делает это стандартным способом Java (Java serialization). Для этого класс должен быть помечен «меня можно превращать в байты» — `Serializable`.

Что у нас лежит в кэшах:

| Кэш | Тип | Нужно что-то делать? |
|---|---|---|
| `calendars` | `List<CalendarDayResponse>` | да: наш класс |
| `openDays` | `Set<Long>` | нет: `Set` и `Long` из Java уже `Serializable` |
| `friends` | `Boolean` | нет |

Открой `wish/CalendarDayResponse.java`, добавь импорт и `implements Serializable`:

```java
import java.io.Serializable;
...
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment, String imageUrl, String thumbUrl,
                                  List<String> holidays) implements Serializable {
```

Если забыть — при первом открытии календаря будет ошибка `SerializationException: Cannot serialize`.

## 🔹 Шаг 15. Redis для тестов

Тестам тоже нужен Redis, иначе Spring не сможет создать `CacheManager`. Сделаем, как с PostgreSQL на этапе 10: одноразовый Redis в Docker.

Открой `src/test/java/.../TestcontainersConfiguration.java`. Добавь импорт:

```java
import org.testcontainers.containers.GenericContainer;
```

и **перед** методом `minio()` новый бин:

```java
    // Redis для кэша. name = "redis": так Spring понимает, что это Redis, и сам подставит его адрес
    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redis() {
        return new GenericContainer<>(DockerImageName.parse("redis:8")).withExposedPorts(6379);
    }
```

- Для Redis у Testcontainers нет отдельного класса вроде `PostgreSQLContainer`, поэтому берём универсальный `GenericContainer` — «любой образ Docker».
- `withExposedPorts(6379)` — какой порт внутри контейнера открыть. Снаружи Testcontainers выберет случайный свободный.
- `@ServiceConnection(name = "redis")` — Spring видит имя `redis` и сам подставляет адрес и порт контейнера вместо `spring.data.redis.*`. Новых библиотек в `pom.xml` для этого не надо.

Запусти:

```
.\mvnw test
```

Снова `Tests run: 68, Failures: 0`. Те же тесты, что и с Caffeine, — и все проходят. Это лучшее доказательство, что сервисы правда не зависят от того, где лежит кэш.

## 🔹 Шаг 16. Посмотреть на кэш в Redis

Запусти сервер, войди как Анна, открой свой календарь. Потом войди как Борис (в другом браузере или окне инкогнито) и открой календарь Анны.

Теперь загляни в Redis:

```
docker exec -it advent-redis redis-cli
```

Внутри `redis-cli` по очереди:

```
KEYS *
```

Увидишь примерно:

```
1) "calendars::1"
2) "friends::1:2"
3) "openDays::2:1"
```

Ключ в Redis = `имя кэша::ключ`. Узнаёшь ключи из таблицы в начале этапа? 🙂

```
TTL calendars::1
```

Сколько секунд записи осталось жить, например `(integer) 571`. Через 10 минут после записи будет `-2` — записи нет.

```
GET calendars::1
```

Покажет «кашу» из байтов, в которой можно разглядеть названия желаний. Это и есть сериализованный объект Java.

Теперь проверь ластик: в браузере Анны поменяй любое желание и снова выполни `KEYS *`. Ключа `calendars::1` нет — его стёрли. Открой календарь — ключ появится снова.

И главное отличие от Caffeine: **перезапусти сервер** и сразу выполни `KEYS *`. Ключи на месте — кэш пережил перезапуск.

Выйти из `redis-cli`: `exit`.

> 💡 Стереть весь кэш разом: `docker exec -it advent-redis redis-cli FLUSHALL`. Пригодится, если поменял класс, который лежит в кэше (например, добавил поле в `CalendarDayResponse`), и старые записи стали мешать.

## 🔹 Шаг 17. Всё вместе

1. `docker compose up -d` — теперь поднимаются PostgreSQL, MinIO **и Redis**.
2. Сервер, фронтенд — как обычно.
3. Тесты:

| Что | Где | Команда | Нужно |
|---|---|---|---|
| Бэкенд | `backend` | `.\mvnw test` | Docker Desktop |
| Фронтенд | `frontend` | `npm test` | — |
| Сквозной | `frontend` | `npm run e2e` | `docker compose up -d` + сервер |

Фронтенд мы не меняли: ответ сервера выглядит точно так же, как раньше. Но прогони `npm run e2e`. В сквозном тесте Анна и Борис становятся друзьями, Борис видит закрытый день (он ложится в кэш), Анна открывает его — и Борис сразу видит картинку. Это проверка ластиков «вживую», через настоящий сервер и настоящий Redis.

## 🔹 Шаг 18. Коммит

В корне `advent-list`:

```
git add .
git commit -m "Этап 11: кэш календаря (Caffeine, затем Redis), сброс при изменениях"
```

## 🔹 Если что-то не так

| Ошибка | Почему | Что делать |
|---|---|---|
| Кэш не работает: в логе нет `cache entry` | нет `@EnableCaching` | шаг 2.1 |
| Кэш не работает, хотя `@EnableCaching` есть | кэшируемый метод вызван изнутри своего класса | ловушка 1: метод должен быть в другом классе |
| `required a bean of type 'CalendarCaches'` | нет `@Component` над `CalendarCaches` | шаг 2.2 |
| Юнит-тест: `NullPointerException` на `caches` | нет `@Mock CalendarCaches caches` | шаг 8.1 |
| `cannot find symbol findOpenWishIds` | старый метод удалён | шаг 5.1: теперь `findOpenWishIdsOfOwner` |
| Друг видит день открытым после «Закрыть» | ластик не вызван или ключи не совпадают | шаги 5.1 и 7.2, тест `grantAndRevokeClearAccessCache` |
| `CacheRulesTest`: всё время «старые данные» в разных тестах | не очищается кэш | `clearCaches()` в `@BeforeEach` и `@AfterEach` |
| `Unable to connect to Redis` при запуске сервера | Redis не запущен | `docker compose up -d` |
| `port is already allocated` для 6379 | на компьютере уже есть Redis | в `docker-compose.yml` `"6380:6379"`, в `application.properties` `port=6380` |
| `SerializationException: Cannot serialize` | класс не `Serializable` | шаг 14 |
| `SerializationException` при чтении после изменения класса | в Redis лежат старые байты | `redis-cli FLUSHALL` |
| Тесты: `Could not find a valid Docker environment` | Docker Desktop не запущен | запусти Docker Desktop |

## 🔹 Созданные и изменённые файлы

```
docker-compose.yml                                  + сервис redis
backend/
├── pom.xml                                         + spring-boot-starter-cache, spring-boot-starter-data-redis
├── src/main/resources/application.properties       + spring.data.redis.*
├── src/main/java/com/adventcalendar/calendar/
│   ├── cache/CacheConfig.java                      ← новый: CacheManager (Caffeine → Redis)
│   ├── cache/CalendarCaches.java                   ← новый: названия кэшей и ластики
│   ├── wish/OwnerCalendarService.java              ← новый: календарь владельца, @Cacheable
│   ├── wish/CalendarDayResponse.java               closed() из готового дня, Serializable
│   ├── wish/WishService.java                       права после кэша; ластики
│   ├── wish/WishRepository.java                    − лишний метод
│   ├── access/WishAccessRepository.java            findOpenWishIdsOfOwner + @Cacheable
│   ├── access/AccessService.java                   ластики в grant / revoke
│   ├── friend/FriendService.java                   @Cacheable на areFriends; ластики
│   ├── image/WishImageService.java                 ластик в upload
│   └── holiday/
│       ├── HolidayService.java                     ластики
│       └── HolidayRepository.java                  − лишний метод
└── src/test/java/com/adventcalendar/calendar/
    ├── TestcontainersConfiguration.java            + Redis
    ├── cache/CacheRulesTest.java                   ← новый: 7 тестов правил кэша
    ├── wish/WishServiceTest.java                   под OwnerCalendarService; +2 теста
    ├── access/AccessServiceTest.java               + @Mock CalendarCaches
    └── image/WishImageServiceTest.java             + @Mock CalendarCaches
```

## Главное, что нужно запомнить

- **Кэш = готовые ответы рядом.** Самое трудное в нём — вовремя **стереть** запись, когда данные поменялись. Для каждого изменения в коде должен быть свой «ластик».
- **В кэш — только то, что одинаково для всех.** Мы кэшируем календарь владельца, а права смотрящего применяем **после** кэша. Иначе один человек может получить чужой ответ.
- **`@Cacheable` работает через прокси**: только для вызовов из другого класса. Вызов изнутри своего класса идёт мимо кэша.
- **Писать и стирать кэш — после коммита** (`TransactionAwareCacheManagerProxy` / `.transactionAware()`), а **время жизни** (TTL) — страховка на всякий случай.
- **Caffeine** — быстро, но в памяти одного сервера. **Redis** — один общий кэш для всех серверов, переживает перезапуск. Благодаря Spring Cache переход между ними — замена одного класса.
