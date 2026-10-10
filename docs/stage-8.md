# Этап 8. Доступ к дням

## 🔹 Что делаем и зачем

Сейчас «кто видит этот день» и «Попросить доступ» живут только в браузере (`useFakeStore`).
Анна включает Борису доступ, но сервер об этом не знает. Поэтому на этапе 7 сервер присылал другу **все** дни закрытыми.

На этом этапе доступ переезжает на сервер:

1. **Выдать и забрать доступ.** Владелец дня включает или выключает переключатель у друга, и это сохраняется в базе.
2. **Запросы доступа.** Друг нажимает «Попросить доступ», владелец видит запрос и отвечает «Открыть» или «Отказать».
3. **Скрытие на сервере.** В календаре друга сервер сам решает, какие дни открыть. У закрытого дня название и комментарий **вообще не попадают в ответ**.
4. **Тесты.** Впервые пишем автоматические проверки: они доказывают, что все правила доступа работают.

Что **не** трогаем: картинки остаются в браузере до этапа 9.

Аналогия 🔑: у каждого дня есть дверь. Ключи от неё раздаёт только хозяин и только друзьям.
Охранник (сервер) пускает человека к содержимому дня, только если у того есть ключ. Нарисованный на двери замок (интерфейс) никого не остановит.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Право доступа** (permission) | запись «этому человеку можно смотреть это». У нас одна строка в таблице = один ключ к одному дню для одного друга |
| **Каскадное удаление** (ON DELETE CASCADE) | правило базы: удалили желание, и все строки, которые на него ссылались (доступы, запросы), удалились сами |
| **Массовое удаление** (bulk delete) | один SQL-запрос `DELETE ... WHERE ...`, который удаляет сразу много строк, без загрузки их в Java |
| **Автотест** (automated test) | код, который сам вызывает наш сервер и проверяет ответ. Запускается одной кнопкой, вместо того чтобы каждый раз кликать в Postman |
| **Интеграционный тест** (integration test) | тест, который поднимает всё приложение целиком (Spring, база, безопасность) и проверяет, как части работают вместе |
| **Утверждение** (assertion) | строчка в тесте «ожидаю, что...». Если ожидание не сбылось, тест падает (красный) |
| **Откат транзакции** (rollback) | «отменить всё, что сделали в базе». После каждого теста база возвращается в исходное состояние |
| **Идемпотентность** (idempotency) | повторить запрос можно сколько угодно раз, результат тот же. Открыть уже открытый день — не ошибка |

## 🔹 Как будет устроено

### Таблицы

```
wish_access (кому открыт день)             access_requests (кто просит доступ)
┌────┬──────────────────┬───────────┐      ┌────┬───────────────────┬──────────────┐
│ id │ wish_id          │ viewer_id │      │ id │ wish_id           │ from_user_id │
├────┼──────────────────┼───────────┤      ├────┼───────────────────┼──────────────┤
│ 1  │ 1 (Анна, 5.10)   │ 2 (Борис) │      │ 1  │ 2 (Анна, 12.10)   │ 2 (Борис)    │
│ 2  │ 4 (Борис, 8.10)  │ 1 (Анна)  │      └────┴───────────────────┴──────────────┘
└────┴──────────────────┴───────────┘
```

- `wish_access` — **кому открыт день**. Строка «желание 1, человек 2» значит «Борису можно смотреть желание Анны на 5 октября».
- `access_requests` — **запросы, которые ждут ответа**. Когда владелец ответил, строку удаляем.

**Улучшение по сравнению с черновиком в задании.** В черновике у `access_requests` было поле `status`, как у заявок в друзья.
Здесь оно не нужно: после «Открыть» день уже записан в `wish_access`, а после «Отказать» помнить нечего.
Поэтому храним только ждущие запросы. Это проще, и после отказа друг может попросить ещё раз (как в макете).

### Адреса (эндпоинты)

| Запрос | Кто может | Что делает | Ответ |
|---|---|---|---|
| `PUT /api/wishes/{wishId}/access/{friendId}` | владелец | открыть день другу | `204` |
| `DELETE /api/wishes/{wishId}/access/{friendId}` | владелец | закрыть день от друга | `204` |
| `POST /api/wishes/{wishId}/access-requests` | друг владельца | попросить доступ | `201` |
| `GET /api/access-requests/incoming` | любой | запросы к моим дням | список |
| `POST /api/access-requests/{id}/grant` | владелец дня | «Открыть» | `204` |
| `POST /api/access-requests/{id}/deny` | владелец дня | «Отказать» | `204` |

И два старых адреса отвечают по-новому:

- `GET /api/wishes` — у каждого моего желания появилось поле `access`: id друзей, которым открыт день;
- `GET /api/calendars/{userId}?month=...` — у друга открытые дни приходят **с названием**, а у закрытых есть поле `requested` («я уже просил доступ»).

### Правила, которые проверяет сервер

- открыть или закрыть день может **только владелец**. Для чужого желания ответ `404` (сервер даже не признаётся, что оно есть);
- открыть день можно **только другу**. Иначе `409`;
- у закрытого дня сервер **не отдаёт** название и комментарий: в ответе `null`;
- попросить доступ может только друг. Чужому `404`. Себе, повторно или к уже открытому дню — `409`;
- ответить на запрос может только владелец дня. Чужой запрос → `404`;
- удаление желания удаляет его доступы и запросы (это делает сама база, `ON DELETE CASCADE`);
- удаление из друзей удаляет все доступы и запросы между этими людьми **в обе стороны**.

## 🔹 Шаг 0. Хвосты этапа 7

### 0.1. `frontend/src/api/useAuth.ts`: вход после «Выйти» с первого раза

Это шаг 17.1 из этапа 7, он не попал в коммит. Без него первое «Войти» после «Выйти» даёт `403`.
Замени функцию `useLogout` целиком:

```ts
export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: logout,
        onSuccess: async () => {
            // 0. При выходе сервер стёр cookie XSRF-TOKEN. Спрашиваем «кто я» ещё раз:
            //    ответ будет 401, но вместе с ним сервер пришлёт новый токен для следующего входа
            await fetchMe();
            // 1. «Я — никто». RequireAuth это увидит и сам отправит на /login
            queryClient.setQueryData(ME, null);
            // 2. Забываем всё остальное о прошлом пользователе (его желания и т. д.)
            queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
        },
    });
}
```

Отличие от того, что у тебя сейчас, — две вещи: слово `async` перед `()` и строчка `await fetchMe();`.

### 0.2. Удали лишний файл `frontend/src/api/toFriendWishes.ts`

Это копия `toWishesByDate.ts`, её никто не использует. В IntelliJ: правой кнопкой по файлу → **Delete** → **OK**.

### 0.3. Сохрани хвосты отдельным коммитом

В корне `advent-list`:

```
git add .
git commit -m "Этап 7: исправлен вход после выхода, удалён лишний файл"
```

Отдельный коммит удобен: если на этапе 8 что-то пойдёт не так, исправления этапа 7 уже сохранены.

## 🔹 Шаг 1. Миграция `V4__access.sql`

Создай файл `backend/src/main/resources/db/migration/V4__access.sql`:

```sql
-- Кому открыт день: одна строка = «этому другу можно смотреть это желание»
CREATE TABLE wish_access (
    id         BIGSERIAL   PRIMARY KEY,
    wish_id    BIGINT      NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    viewer_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wish_access UNIQUE (wish_id, viewer_id)
);
CREATE INDEX idx_wish_access_viewer ON wish_access (viewer_id);

-- Запросы доступа, которые ждут ответа владельца.
-- Когда владелец ответил («Открыть» или «Отказать»), строку удаляем
CREATE TABLE access_requests (
    id           BIGSERIAL   PRIMARY KEY,
    wish_id      BIGINT      NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    from_user_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_access_requests UNIQUE (wish_id, from_user_id)
);
CREATE INDEX idx_access_requests_from ON access_requests (from_user_id);

-- Как в макете: Анна открыла Борису день 5 октября, Борис открыл Анне свой день 8 октября,
-- а ещё Борис просит доступ к дню Анны 12 октября.
-- Берём id желаний по владельцу и дате: если такого желания уже нет, строка просто не добавится
INSERT INTO wish_access (wish_id, viewer_id)
SELECT id, 2 FROM wishes WHERE owner_id = 1 AND wish_date = '2026-10-05';
INSERT INTO wish_access (wish_id, viewer_id)
SELECT id, 1 FROM wishes WHERE owner_id = 2 AND wish_date = '2026-10-08';
INSERT INTO access_requests (wish_id, from_user_id)
SELECT id, 2 FROM wishes WHERE owner_id = 1 AND wish_date = '2026-10-12';
```

Разберём:

- `REFERENCES wishes (id) ON DELETE CASCADE` — **каскадное удаление**. Удалили желание, и база сама удалит все его доступы и запросы.
  Правило «удаление желания удаляет его доступы» мы получаем бесплатно, без строчки Java-кода.
- `UNIQUE (wish_id, viewer_id)` — один и тот же день нельзя открыть одному человеку дважды.
- `UNIQUE (wish_id, from_user_id)` — один человек не может просить доступ к одному дню дважды.
- `INSERT ... SELECT id FROM wishes WHERE ...` — вставка «по поиску». Мы не пишем номер желания руками (`1`, `4`),
  а ищем его по владельцу и дате. Если ты на прошлых этапах удалил это желание, `SELECT` ничего не найдёт, и строка просто не добавится.
  Ошибки не будет.

## 🔹 Шаг 2. Пакет `access`: сущности

Создай пакет `com.adventcalendar.calendar.access`. Все файлы шагов 2–6 кладём в него.

### 2.1. `WishAccess.java` — «ключ» к дню

```java
package com.adventcalendar.calendar.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

// «Другу viewerId можно смотреть желание wishId»
@Entity
@Table(name = "wish_access")
public class WishAccess {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "wish_id", nullable = false)
    private Long wishId;

    @Column(name = "viewer_id", nullable = false)
    private Long viewerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected WishAccess() {
    }

    public WishAccess(Long wishId, Long viewerId) {
        this.wishId = wishId;
        this.viewerId = viewerId;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getWishId() {
        return wishId;
    }

    public Long getViewerId() {
        return viewerId;
    }
}
```

Это как `Friendship` из этапа 7: обычный `id` и два числа. Объекты `Wish` и `User` здесь не нужны:
чтобы проверить «есть ли ключ», достаточно номеров.

### 2.2. `AccessRequest.java` — запрос доступа

```java
package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.wish.Wish;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

// Запрос «откройте мне этот день». Живёт, пока владелец не ответил
@Entity
@Table(name = "access_requests")
public class AccessRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "wish_id", nullable = false)
    private Wish wish;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_user_id", nullable = false)
    private User fromUser;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AccessRequest() {
    }

    public AccessRequest(Wish wish, User fromUser) {
        this.wish = wish;
        this.fromUser = fromUser;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Wish getWish() {
        return wish;
    }

    public User getFromUser() {
        return fromUser;
    }
}
```

А здесь, как в `FriendRequest`, ссылки на целые объекты (`@ManyToOne`).
Когда владелец смотрит список запросов, ему нужны **дата и название** желания и **имя** просящего. С объектами их удобно достать.

## 🔹 Шаг 3. Репозитории

### 3.1. `WishAccessRepository.java`

```java
package com.adventcalendar.calendar.access;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface WishAccessRepository extends JpaRepository<WishAccess, Long> {

    boolean existsByWishIdAndViewerId(Long wishId, Long viewerId);

    long deleteByWishIdAndViewerId(Long wishId, Long viewerId);

    // Все доступы к нескольким желаниям сразу (одним запросом, а не по запросу на каждое желание)
    List<WishAccess> findAllByWishIdIn(Collection<Long> wishIds);

    // Какие из этих желаний открыты человеку viewerId
    @Query("select a.wishId from WishAccess a where a.viewerId = :viewerId and a.wishId in :wishIds")
    List<Long> findOpenWishIds(Long viewerId, Collection<Long> wishIds);

    // Удалить все доступы, которые владелец ownerId давал человеку viewerId
    @Modifying
    @Query("""
            delete from WishAccess a
            where a.viewerId = :viewerId
              and a.wishId in (select w.id from Wish w where w.owner.id = :ownerId)
            """)
    int deleteAllGivenBy(Long ownerId, Long viewerId);
}
```

Разберём новое:

- `findAllByWishIdIn(Collection<Long> wishIds)` — `In` в имени метода значит SQL `WHERE wish_id IN (1, 2, 3)`.
  Так доступы ко **всем** желаниям достаём одним запросом, а не отдельным запросом на каждое желание.
- `findOpenWishIds` — свой запрос (`@Query`). Возвращает не строки целиком, а только номера желаний, которые открыты человеку.
- `deleteAllGivenBy` — **массовое удаление**. Читается так: «удалить ключи, которые получил `viewerId`, к желаниям, у которых хозяин `ownerId`».
  `@Modifying` обязателен: он говорит Spring, что запрос **меняет** данные, а не читает.

### 3.2. `AccessRequestRepository.java`

```java
package com.adventcalendar.calendar.access;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AccessRequestRepository extends JpaRepository<AccessRequest, Long> {

    boolean existsByWishIdAndFromUserId(Long wishId, Long fromUserId);

    long deleteByWishIdAndFromUserId(Long wishId, Long fromUserId);

    // Ответить на запрос может только владелец желания. Чужой запрос не находим → 404
    Optional<AccessRequest> findByIdAndWishOwnerId(Long id, Long ownerId);

    // Запросы к моим желаниям. Сразу подгружаем желание и автора запроса: нужны дата, название и имя
    @EntityGraph(attributePaths = {"wish", "fromUser"})
    List<AccessRequest> findAllByWishOwnerIdOrderByCreatedAtAsc(Long ownerId);

    // К каким из этих желаний я уже отправил запрос
    @Query("select r.wish.id from AccessRequest r where r.fromUser.id = :fromUserId and r.wish.id in :wishIds")
    List<Long> findRequestedWishIds(Long fromUserId, Collection<Long> wishIds);

    // Удалить все запросы, которые fromUserId отправлял к желаниям ownerId
    @Modifying
    @Query("""
            delete from AccessRequest r
            where r.fromUser.id = :fromUserId
              and r.wish.id in (select w.id from Wish w where w.owner.id = :ownerId)
            """)
    int deleteAllSentTo(Long ownerId, Long fromUserId);
}
```

- `findByIdAndWishOwnerId` — Spring Data умеет ходить по ссылкам: `WishOwnerId` = «у запроса взять `wish`, у него `owner`, у него `id`».
  Получается «найди запрос с таким номером, но только если это запрос к **моему** желанию».
- `@EntityGraph(attributePaths = {"wish", "fromUser"})` — сразу подгрузить желание и автора вместе с запросом.
  Без этого Hibernate делал бы отдельный запрос к базе на каждую строку списка.

## 🔹 Шаг 4. Что уходит наружу (DTO) и ошибки

### 4.1. `AccessRequestResponse.java` — запрос доступа в списке владельца

```java
package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.friend.FriendResponse;
import java.time.LocalDate;

// Запрос доступа к моему дню: кто просит и к какому желанию
public record AccessRequestResponse(Long id, Long wishId, LocalDate date, String title, FriendResponse from) {

    public static AccessRequestResponse from(AccessRequest request) {
        return new AccessRequestResponse(
                request.getId(),
                request.getWish().getId(),
                request.getWish().getDate(),
                request.getWish().getTitle(), // это моё желание, его название мне показывать можно
                FriendResponse.from(request.getFromUser()));
    }
}
```

Название желания здесь отдаём спокойно: этот ответ получает только **владелец** желания.

### 4.2. `AccessException.java` — «так нельзя» (409)

```java
package com.adventcalendar.calendar.access;

// Действие с доступом противоречит текущему состоянию: уже открыт, уже просили и т. п. Сервер ответит 409
public class AccessException extends RuntimeException {

    public AccessException(String message) {
        super(message);
    }
}
```

### 4.3. `AccessRequestNotFoundException.java` — «запрос не найден» (404)

```java
package com.adventcalendar.calendar.access;

public class AccessRequestNotFoundException extends RuntimeException {

    public AccessRequestNotFoundException(Long id) {
        super("Запрос доступа с id " + id + " не найден");
    }
}
```

## 🔹 Шаг 5. `AccessService.java` — все правила доступа

```java
package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessService {

    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;
    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;

    public AccessService(WishAccessRepository accessRepository,
                         AccessRequestRepository requestRepository,
                         WishRepository wishRepository,
                         UserRepository userRepository,
                         FriendService friendService) {
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
    }

    // Владелец открывает свой день другу
    @Transactional
    public void grant(Long me, Long wishId, Long friendId) {
        findMyWish(me, wishId);
        if (!friendService.areFriends(me, friendId)) {
            throw new AccessException("Открыть день можно только другу");
        }
        if (!accessRepository.existsByWishIdAndViewerId(wishId, friendId)) {
            accessRepository.save(new WishAccess(wishId, friendId));
        }
        // Если друг просил доступ к этому дню, запрос выполнен — убираем его
        requestRepository.deleteByWishIdAndFromUserId(wishId, friendId);
    }

    // Владелец закрывает свой день от друга
    @Transactional
    public void revoke(Long me, Long wishId, Long friendId) {
        findMyWish(me, wishId);
        accessRepository.deleteByWishIdAndViewerId(wishId, friendId);
    }

    // Друг просит открыть ему день
    @Transactional
    public void request(Long me, Long wishId) {
        Wish wish = wishRepository.findById(wishId)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        Long ownerId = wish.getOwner().getId();
        if (ownerId.equals(me)) {
            throw new AccessException("Это ваш собственный день");
        }
        // Чужой человек (не друг) не должен даже узнать, что такое желание есть, поэтому 404
        if (!friendService.areFriends(me, ownerId)) {
            throw new WishNotFoundException(wishId);
        }
        if (accessRepository.existsByWishIdAndViewerId(wishId, me)) {
            throw new AccessException("Этот день вам уже открыт");
        }
        if (requestRepository.existsByWishIdAndFromUserId(wishId, me)) {
            throw new AccessException("Запрос уже отправлен");
        }
        requestRepository.save(new AccessRequest(wish, userRepository.getReferenceById(me)));
    }

    // Запросы к моим дням
    @Transactional(readOnly = true)
    public List<AccessRequestResponse> incoming(Long me) {
        return requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(me).stream()
                .map(AccessRequestResponse::from)
                .toList();
    }

    // «Открыть» на запросе = выдать доступ (запрос удалится внутри grant)
    @Transactional
    public void grantRequest(Long me, Long requestId) {
        AccessRequest request = findRequestToMe(me, requestId);
        grant(me, request.getWish().getId(), request.getFromUser().getId());
    }

    // «Отказать» = просто удалить запрос. День остаётся закрытым
    @Transactional
    public void denyRequest(Long me, Long requestId) {
        requestRepository.delete(findRequestToMe(me, requestId));
    }

    // Чужое желание (не моё) не находим: для него ответ 404
    private Wish findMyWish(Long me, Long wishId) {
        return wishRepository.findByIdAndOwnerId(wishId, me)
                .orElseThrow(() -> new WishNotFoundException(wishId));
    }

    private AccessRequest findRequestToMe(Long me, Long requestId) {
        return requestRepository.findByIdAndWishOwnerId(requestId, me)
                .orElseThrow(() -> new AccessRequestNotFoundException(requestId));
    }
}
```

Разберём главное:

- `findMyWish(me, wishId)` ищет желание **по номеру и владельцу сразу**. Борис передаёт номер желания Анны → не найдено → `404`.
  Так одной строкой проверяем «открывать может только владелец».
- `grant` сначала проверяет `areFriends`. Открыть день чужому человеку нельзя → `409`.
- `if (!accessRepository.exists...)` — если доступ уже есть, второй раз не добавляем. Повторный `PUT` не ломается (**идемпотентность**).
- В `grant` в конце удаляем запрос доступа: друг просил, мы открыли, запрос больше не нужен.
- `request`: для чужого человека бросаем `WishNotFoundException`, а не «вы не друзья». Чужой не должен узнать, что желание с таким номером вообще есть.
- `grantRequest` не повторяет логику, а вызывает `grant`. Все проверки (владелец, друг) срабатывают и здесь.

## 🔹 Шаг 6. `AccessController.java` — адреса

```java
package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AccessController {

    private final AccessService service;

    public AccessController(AccessService service) {
        this.service = service;
    }

    // PUT /api/wishes/7/access/2 — открыть желание 7 человеку 2
    @PutMapping("/wishes/{wishId}/access/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void grant(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId, @PathVariable Long friendId) {
        service.grant(me.id(), wishId, friendId);
    }

    // DELETE /api/wishes/7/access/2 — закрыть желание 7 от человека 2
    @DeleteMapping("/wishes/{wishId}/access/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId, @PathVariable Long friendId) {
        service.revoke(me.id(), wishId, friendId);
    }

    @PostMapping("/wishes/{wishId}/access-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public void request(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId) {
        service.request(me.id(), wishId);
    }

    @GetMapping("/access-requests/incoming")
    public List<AccessRequestResponse> incoming(@AuthenticationPrincipal CurrentUser me) {
        return service.incoming(me.id());
    }

    @PostMapping("/access-requests/{id}/grant")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void grantRequest(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.grantRequest(me.id(), id);
    }

    @PostMapping("/access-requests/{id}/deny")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void denyRequest(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.denyRequest(me.id(), id);
    }
}
```

Два `@PathVariable` в одном адресе: `/wishes/{wishId}/access/{friendId}`. Spring берёт каждое по имени из фигурных скобок.

Почему открыть — это `PUT`, а закрыть — `DELETE` по **одному и тому же** адресу? Адрес означает «ключ друга 2 к желанию 7».
`PUT` = «пусть этот ключ будет», `DELETE` = «пусть его не будет». Это обычный стиль REST.

## 🔹 Шаг 7. Желания: владелец видит «кому открыто», друг — открытые дни

### 7.1. `wish/WishResponse.java`

Добавь поле `access`:

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.List;

public record WishResponse(
        Long id,
        LocalDate date,
        String title,
        String comment,
        List<Long> access // id друзей, которым открыт этот день. Это видит только владелец
) {

    public static WishResponse from(Wish wish, List<Long> access) {
        return new WishResponse(wish.getId(), wish.getDate(), wish.getTitle(), wish.getComment(), access);
    }
}
```

### 7.2. `wish/CalendarDayResponse.java`

Добавь поле `requested`:

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название и комментарий не отдаём (null).
// requested = true: я уже попросил доступ к этому дню и жду ответа
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, false, wish.getTitle(), wish.getComment());
    }

    public static CalendarDayResponse closed(Wish wish, boolean requested) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, requested, null, null);
    }
}
```

⚠️ Порядок полей важен: `requested` стоит после `open`. В `open(...)` и `closed(...)` значения передаются в том же порядке.

### 7.3. `wish/WishService.java`

Замени файл целиком:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.access.AccessRequestRepository;
import com.adventcalendar.calendar.access.WishAccess;
import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;
    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService,
                       WishAccessRepository accessRepository, AccessRequestRepository requestRepository) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll(Long ownerId) {
        List<Wish> wishes = wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId);
        // Доступы ко всем моим желаниям одним запросом: { id желания → [id друзей] }
        Map<Long, List<Long>> access = accessRepository
                .findAllByWishIdIn(wishes.stream().map(Wish::getId).toList()).stream()
                .collect(Collectors.groupingBy(WishAccess::getWishId,
                        Collectors.mapping(WishAccess::getViewerId, Collectors.toList())));
        return wishes.stream()
                .map(wish -> WishResponse.from(wish, access.getOrDefault(wish.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long ownerId, Long id) {
        return wishRepository.findByIdAndOwnerId(id, ownerId)
                .map(this::withAccess)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(Long ownerId, LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(ownerId, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(ownerId), date));
        wish.update(request.title(), request.comment());
        return withAccess(wishRepository.save(wish));
    }

    // Доступы и запросы доступа к желанию удалит сама база: ON DELETE CASCADE в V4__access.sql
    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }

    @Transactional(readOnly = true)
    public List<CalendarDayResponse> calendar(Long viewerId, Long ownerId, YearMonth month) {
        boolean isOwner = viewerId.equals(ownerId);
        // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
        if (!isOwner && !friendService.areFriends(viewerId, ownerId)) {
            throw new NotFriendsException();
        }
        List<Wish> wishes = wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                ownerId, month.atDay(1), month.atEndOfMonth());
        if (isOwner) {
            return wishes.stream().map(CalendarDayResponse::open).toList();
        }

        // Какие из этих дней открыты смотрящему и к каким он уже просил доступ
        List<Long> ids = wishes.stream().map(Wish::getId).toList();
        Set<Long> openIds = new HashSet<>(accessRepository.findOpenWishIds(viewerId, ids));
        Set<Long> requestedIds = new HashSet<>(requestRepository.findRequestedWishIds(viewerId, ids));

        // Главное правило: у закрытого дня название и комментарий даже не попадают в ответ
        return wishes.stream()
                .map(wish -> openIds.contains(wish.getId())
                        ? CalendarDayResponse.open(wish)
                        : CalendarDayResponse.closed(wish, requestedIds.contains(wish.getId())))
                .toList();
    }

    private WishResponse withAccess(Wish wish) {
        List<Long> access = accessRepository.findAllByWishIdIn(List.of(wish.getId())).stream()
                .map(WishAccess::getViewerId)
                .toList();
        return WishResponse.from(wish, access);
    }
}
```

Разберём, что поменялось:

- В конструкторе два новых репозитория: `WishAccessRepository` и `AccessRequestRepository`.
- `findAll` собирает доступы ко всем желаниям одним запросом и раскладывает по желаниям.
  `Collectors.groupingBy(WishAccess::getWishId, ...)` превращает список строк в словарь `{ 1 → [2], 4 → [1] }`:
  «номер желания → номера друзей».
- `withAccess(wish)` — то же самое для одного желания (нужно в `findById` и `saveForDate`).
- `calendar` для друга теперь спрашивает базу «какие из этих дней открыты» (`openIds`) и «к каким он уже просил доступ» (`requestedIds`).
  `Set` (**множество**) выбран потому, что проверка `contains` в нём мгновенная.
- `delete` не поменялся: доступы и запросы удалит база. Комментарий напоминает об этом.

## 🔹 Шаг 8. `friend/FriendService.java`: удаление из друзей стирает доступы

1. Добавь импорты:

```java
import com.adventcalendar.calendar.access.AccessRequestRepository;
import com.adventcalendar.calendar.access.WishAccessRepository;
```

2. Поля и конструктор замени на:

```java
    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository accessRequestRepository;

    public FriendService(FriendshipRepository friendshipRepository,
                         FriendRequestRepository requestRepository,
                         UserRepository userRepository,
                         WishAccessRepository accessRepository,
                         AccessRequestRepository accessRequestRepository) {
        this.friendshipRepository = friendshipRepository;
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.accessRepository = accessRepository;
        this.accessRequestRepository = accessRequestRepository;
    }
```

3. Метод `removeFriend` замени на:

```java
    @Transactional
    public void removeFriend(Long me, Long friendId) {
        friendshipRepository.deleteByUserAIdAndUserBId(Math.min(me, friendId), Math.max(me, friendId));
        // Бывший друг больше не видит мои дни, а я — его. Запросы доступа в обе стороны тоже удаляем
        accessRepository.deleteAllGivenBy(me, friendId);
        accessRepository.deleteAllGivenBy(friendId, me);
        accessRequestRepository.deleteAllSentTo(me, friendId);
        accessRequestRepository.deleteAllSentTo(friendId, me);
    }
```

Почему 4 строки? Анна могла открыть дни Борису, а Борис — Анне. И просить доступ мог каждый у каждого. Чистим все 4 направления.

💡 Почему бы не сделать это через `ON DELETE CASCADE`, как с желанием? Доступ ссылается на желание и на человека, но **не на дружбу**.
База не знает, что ключ существует «благодаря дружбе». Это правило нашего приложения, поэтому пишем его в Java.

## 🔹 Шаг 9. `error/GlobalExceptionHandler.java` — новые ошибки

1. Добавь импорты:

```java
import com.adventcalendar.calendar.access.AccessException;
import com.adventcalendar.calendar.access.AccessRequestNotFoundException;
```

2. В обработчик «не найдено» добавь третий класс:

```java
    @ExceptionHandler({UserNotFoundException.class, FriendRequestNotFoundException.class,
            AccessRequestNotFoundException.class})
    public ProblemDetail handleFriendNotFound(RuntimeException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }
```

3. Обработчик `FriendRequestException` замени: теперь он ловит и `AccessException`, оба дают `409`:

```java
    @ExceptionHandler({FriendRequestException.class, AccessException.class})
    public ProblemDetail handleConflict(RuntimeException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }
```

## 🔹 Шаг 10. Автотесты на правила доступа 🧪

До сих пор мы проверяли сервер руками в Postman. Это долго, и легко забыть какой-нибудь случай.
**Автотест** — это код, который сам отправляет запросы серверу и проверяет ответы. Один запуск проверяет все правила за пару секунд.

Аналогия ✅: Postman — проверить замки, обходя дом с ключами. Автотест — чек-лист, который робот проходит по кнопке, каждый раз одинаково и полностью.

### 10.1. `backend/pom.xml`: инструменты для тестов с безопасностью

Найди зависимость `spring-boot-starter-webmvc-test` и **сразу под ней** добавь:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-security-test</artifactId>
			<scope>test</scope>
		</dependency>
```

- `<scope>test</scope>` значит: эта библиотека нужна только тестам и не попадёт в готовое приложение.
- Она даёт две вещи: `user(...)` («представь, что вошёл этот человек») и `csrf()` («приложи правильный CSRF-токен»).

После правки нажми в IntelliJ значок **Load Maven Changes** (маленькая буква «m» со стрелкой справа вверху).

### 10.2. Тест `AccessRulesTest.java`

Тесты лежат в **другой** папке, не в `main`. Создай пакет `com.adventcalendar.calendar.access` внутри `backend/src/test/java`
(правой кнопкой по `src/test/java` → **New → Package**) и в нём файл `AccessRulesTest.java`:

```java
package com.adventcalendar.calendar.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
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

import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Проверяем правила доступа через настоящие адреса (API), как это делал бы браузер.
// @Transactional: после каждого теста всё, что он записал в базу, откатывается
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AccessRulesTest {

    private static final String SECRET_TITLE = "Секретный подарок";
    private static final String SECRET_COMMENT = "Никому не говорить";
    private static final String MONTH = "2030-01";

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired WishRepository wishRepository;
    @Autowired WishAccessRepository accessRepository;
    @Autowired AccessRequestRepository requestRepository;
    @Autowired EntityManager entityManager;

    User owner;    // хозяин календаря
    User friend;   // его друг
    User stranger; // чужой человек
    Wish wish;     // желание хозяина на 10 января 2030

    @BeforeEach
    void setUp() {
        owner = userRepository.save(new User("Хозяин", "owner@test.local", "x"));
        friend = userRepository.save(new User("Друг", "friend@test.local", "x"));
        stranger = userRepository.save(new User("Чужой", "stranger@test.local", "x"));
        friendshipRepository.save(Friendship.between(owner.getId(), friend.getId()));

        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update(SECRET_TITLE, SECRET_COMMENT);
        wish = wishRepository.save(wish);
    }

    // «Войти» как этот человек для одного запроса
    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    private String calendarOf(User u) {
        return "/api/calendars/" + u.getId() + "?month=" + MONTH;
    }

    @Test
    void strangerCannotSeeCalendar() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(stranger)))
                .andExpect(status().isForbidden());
    }

    @Test
    void closedDayHasNoTitleAndComment() throws Exception {
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].title").doesNotExist())
                // Самая строгая проверка: секретных слов нет нигде в ответе
                .andExpect(content().string(not(containsString(SECRET_TITLE))))
                .andExpect(content().string(not(containsString(SECRET_COMMENT))));
    }

    @Test
    void grantedDayIsOpenAndRevokedDayIsClosedAgain() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true))
                .andExpect(jsonPath("$[0].title").value(SECRET_TITLE));

        mvc.perform(delete("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(content().string(not(containsString(SECRET_TITLE))));
    }

    @Test
    void ownerSeesWhoHasAccess() throws Exception {
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        mvc.perform(get("/api/wishes/{w}", wish.getId()).with(as(owner)))
                .andExpect(jsonPath("$.access[0]").value(friend.getId()));
    }

    @Test
    void onlyOwnerCanGrantAccess() throws Exception {
        // Друг пытается открыть чужое желание сам себе
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), friend.getId()).with(as(friend)).with(csrf()))
                .andExpect(status().isNotFound());
        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), friend.getId())).isFalse();
    }

    @Test
    void accessCanBeGrantedOnlyToFriend() throws Exception {
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), stranger.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isConflict());
        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), stranger.getId())).isFalse();
    }

    @Test
    void friendRequestsAccessOnceAndOwnerGrantsIt() throws Exception {
        String requestUrl = "/api/wishes/" + wish.getId() + "/access-requests";
        mvc.perform(post(requestUrl).with(as(friend)).with(csrf())).andExpect(status().isCreated());
        // Повторно отправить нельзя
        mvc.perform(post(requestUrl).with(as(friend)).with(csrf())).andExpect(status().isConflict());
        // В календаре друг видит, что уже просил
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].requested").value(true));

        // Хозяин видит запрос у себя
        mvc.perform(get("/api/access-requests/incoming").with(as(owner)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].from.id").value(friend.getId()));
        Long requestId = requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(owner.getId()).getFirst().getId();

        // Друг не может сам одобрить свой запрос
        mvc.perform(post("/api/access-requests/{id}/grant", requestId).with(as(friend)).with(csrf()))
                .andExpect(status().isNotFound());

        mvc.perform(post("/api/access-requests/{id}/grant", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(true));
        assertThat(requestRepository.count()).isEqualTo(countSeedRequests());
    }

    @Test
    void deniedRequestKeepsDayClosed() throws Exception {
        mvc.perform(post("/api/wishes/{w}/access-requests", wish.getId()).with(as(friend)).with(csrf()))
                .andExpect(status().isCreated());
        Long requestId = requestRepository.findAllByWishOwnerIdOrderByCreatedAtAsc(owner.getId()).getFirst().getId();

        mvc.perform(post("/api/access-requests/{id}/deny", requestId).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get(calendarOf(owner)).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].requested").value(false));
    }

    @Test
    void strangerCannotRequestAccess() throws Exception {
        mvc.perform(post("/api/wishes/{w}/access-requests", wish.getId()).with(as(stranger)).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletingWishDeletesItsAccessAndRequests() throws Exception {
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        requestRepository.save(new AccessRequest(wish, stranger));
        // Записать всё в базу и «забыть» загруженные объекты, как будто это новый запрос к серверу
        entityManager.flush();
        entityManager.clear();

        mvc.perform(delete("/api/wishes/{w}", wish.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());
        entityManager.flush(); // отправить DELETE в базу прямо сейчас, чтобы сработал ON DELETE CASCADE

        assertThat(accessRepository.findAllByWishIdIn(List.of(wish.getId()))).isEmpty();
        assertThat(requestRepository.existsByWishIdAndFromUserId(wish.getId(), stranger.getId())).isFalse();
    }

    @Test
    void unfriendingRemovesAccessBothWays() throws Exception {
        Wish friendsWish = new Wish(friend, LocalDate.of(2030, 1, 20));
        friendsWish.update("Желание друга", null);
        friendsWish = wishRepository.save(friendsWish);
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));
        accessRepository.save(new WishAccess(friendsWish.getId(), owner.getId()));

        mvc.perform(delete("/api/friends/{id}", friend.getId()).with(as(owner)).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(accessRepository.existsByWishIdAndViewerId(wish.getId(), friend.getId())).isFalse();
        assertThat(accessRepository.existsByWishIdAndViewerId(friendsWish.getId(), owner.getId())).isFalse();
    }

    // Запросы из тестовых данных (V4) тоже лежат в базе, их не трогаем
    private long countSeedRequests() {
        return requestRepository.findAll().stream()
                .filter(r -> !r.getWish().getId().equals(wish.getId()))
                .count();
    }
}
```

Разберём по частям.

**Аннотации над классом:**

- `@SpringBootTest` — поднять всё приложение целиком, как при обычном запуске (**интеграционный тест**).
- `@AutoConfigureMockMvc` — дать нам `MockMvc`, «ненастоящий браузер». Он отправляет запросы прямо в Spring, без сети.
- `@Transactional` — каждый тест работает внутри транзакции, а в конце она **откатывается** (rollback).
  Тест создаёт людей и желания, а после него в базе ничего не остаётся. Поэтому тесты можно запускать на той же базе, что и разработку.

**Подготовка:**

- `@BeforeEach void setUp()` — выполняется **перед каждым** тестом. Создаём трёх людей (хозяин, друг, чужой), дружбу и одно желание.
  Каждый тест получает чистую одинаковую картину.
- Желание на январь 2030 года: там нет тестовых данных Анны и Бориса, поэтому в календаре ровно один день — наш.
- `as(user)` — «этот запрос отправляет такой-то человек». Это замена настоящему входу с паролем.

**Один тест по шагам** — `closedDayHasNoTitleAndComment`:

```java
mvc.perform(get(calendarOf(owner)).with(as(friend)))   // 1. друг открывает календарь хозяина
        .andExpect(status().isOk())                     // 2. ответ 200
        .andExpect(jsonPath("$", hasSize(1)))           // 3. в ответе ровно один день
        .andExpect(jsonPath("$[0].open").value(false))  // 4. он закрыт
        .andExpect(jsonPath("$[0].title").doesNotExist())                  // 5. названия нет
        .andExpect(content().string(not(containsString(SECRET_TITLE))))    // 6. секретного текста нет нигде в ответе
```

- `jsonPath("$[0].open")` — «в JSON-ответе возьми первый элемент списка, поле `open`». `$` — это весь ответ.
- Шаг 6 — самая строгая проверка: ищем секретные слова **во всём тексте ответа**. Если они где-то просочатся, тест упадёт.

**Что ещё проверяем** (по одному тесту на правило):

| Тест | Правило |
|---|---|
| `strangerCannotSeeCalendar` | чужой не видит календарь → `403` |
| `closedDayHasNoTitleAndComment` | закрытый день не отдаёт название и комментарий |
| `grantedDayIsOpenAndRevokedDayIsClosedAgain` | открыли → видно; закрыли → снова не видно |
| `ownerSeesWhoHasAccess` | владелец видит, кому открыт день |
| `onlyOwnerCanGrantAccess` | друг не может сам открыть себе чужой день → `404` |
| `accessCanBeGrantedOnlyToFriend` | открыть день чужому нельзя → `409` |
| `friendRequestsAccessOnceAndOwnerGrantsIt` | запрос один раз, второй → `409`; одобрить может только владелец |
| `deniedRequestKeepsDayClosed` | после «Отказать» день закрыт, запроса нет |
| `strangerCannotRequestAccess` | чужой не может просить доступ → `404` |
| `deletingWishDeletesItsAccessAndRequests` | удалили желание → удалились его доступы и запросы |
| `unfriendingRemovesAccessBothWays` | удалили из друзей → доступы удалились в обе стороны |

💡 В `deletingWishDeletesItsAccessAndRequests` есть `entityManager.flush()` и `clear()`. Внутри одного теста Hibernate помнит загруженные объекты.
`flush()` = «запиши всё в базу сейчас», `clear()` = «забудь загруженное». Так тест ведёт себя как настоящий отдельный запрос к серверу.

### 10.3. Запусти тесты

1. База должна работать: `docker compose up -d`.
2. Сервер (`BackendApplication`) можно не останавливать: тест поднимает своё приложение на время проверки.
3. В IntelliJ открой `AccessRulesTest.java` и нажми зелёный треугольник ▶ рядом с `class AccessRulesTest` → **Run**.

Или в терминале, в папке `backend`:

```
.\mvnw test
```

Ожидаемый результат: **12 тестов зелёные** (11 наших и старый `contextLoads`). В терминале: `Tests run: 12, Failures: 0, Errors: 0`.

Предупреждения про `Mockito is currently self-attaching` и `A Java agent has been loaded dynamically` — это не ошибки, их можно не замечать.

🔎 Попробуй сломать специально: в `WishService.calendar` замени `CalendarDayResponse.closed(...)` на `CalendarDayResponse.open(wish)` и запусти тесты.
Упадут `closedDayHasNoTitleAndComment` и другие. Так видно, что тесты действительно ловят утечку. Потом верни как было.

## 🔹 Шаг 11. Проверь сервер в Postman 📮

Перезапусти `BackendApplication`. В логе: `Migrating schema "public" to version "4 - access"`.

Как раньше: `GET /api/me` за токеном, заголовок `X-XSRF-TOKEN` для `POST`, `PUT`, `DELETE`.
Номера желаний (`wishId`) смотри в ответах: у тебя они могут отличаться от примеров ниже, если ты удалял и создавал желания.

**Как Борис** (`boris@example.com` / `password123`):

1. `GET http://localhost:8080/api/calendars/1?month=2026-10` → день 5 октября с `"open": true` и названием;
   12 и 24 октября — `"open": false`, `"title": null`. У 12 октября `"requested": true` (из тестовых данных).
2. `POST /api/wishes/{id дня 24 октября}/access-requests` → `201`. Ещё раз → `409` «Запрос уже отправлен».
3. `PUT /api/wishes/{id дня 24 октября}/access/2` → `404`: открыть чужое желание нельзя.

**Как Анна:**

1. `GET /api/wishes` → у желания 5 октября `"access": [2]`.
2. `GET /api/access-requests/incoming` → два запроса от Бориса: на 12 и на 24 октября.
3. `POST /api/access-requests/{id запроса на 24}/grant` → `204`. Снова `GET /api/access-requests/incoming` → остался один.
4. `PUT /api/wishes/{id дня 24}/access/3` → `409` «Открыть день можно только другу» (если Вика у тебя сейчас не в друзьях).
5. `DELETE /api/wishes/{id дня 24}/access/2` → `204`. Борис снова видит этот день закрытым.

## 🔹 Шаг 12. Фронтенд: типы и данные

### 12.1. `src/types.ts`

В `Wish` добавь одно поле, а тип `AccessRequest` в конце файла **удали** (запросы теперь приходят с сервера в другом виде):

```ts
export type Wish = {
    id?: number;
    title: string;
    comment: string;
    img: WishImage;
    access: UserId[]; // друзья, которым открыт этот день
    requested?: boolean; // чужой день: я уже попросил доступ и жду ответа
};
```

`?` после имени значит «поле может отсутствовать». У своих дней его нет, у чужих оно приходит с сервера.

### 12.2. `src/data/fakeData.ts`

1. Первую строку импорта замени (убираем `AccessRequest`):

```ts
import type { User, UserId, Wish, WishesByDate } from '../types';
```

2. **Удали** строку `export const INITIAL_ACCESS_REQUESTS = ...` (фейковый запрос Бориса теперь лежит в базе).
3. В самый конец файла добавь функцию:

```ts
// Обратный перевод: id из базы → UserId в компонентах. Нужен для списка «кому открыт день»
export function idForServerId(serverId: number): UserId {
    return Object.values(USERS).find(u => u.serverId === serverId)?.id ?? 'user' + serverId;
}
```

Сервер говорит «день открыт человеку `2`», а компоненты знают людей как `'boris'`. Эта функция переводит `2` → `'boris'`.

### 12.3. `src/api/wishes.ts` и `src/api/friends.ts`

В `WishDto` (файл `wishes.ts`) добавь поле:

```ts
    access: number[];       // id друзей, которым открыт этот день
```

В `CalendarDayDto` (файл `friends.ts`) после `open` добавь:

```ts
    requested: boolean;     // я уже попросил доступ к этому дню
```

## 🔹 Шаг 13. Запросы про доступ: `src/api/access.ts`

Новый файл:

```ts
// Всё общение с сервером про доступ к дням.
import { request } from './http';
import type { FriendDto } from './friends';

// Запрос доступа к моему дню (AccessRequestResponse из Java)
export type AccessRequestDto = {
    id: number;
    wishId: number;
    date: string;   // '2026-10-12'
    title: string;  // название моего желания
    from: FriendDto;
};

// Открыть (open = true) или закрыть (open = false) мой день другу
export function setAccess(wishId: number, friendId: number, open: boolean) {
    return request<void>(`/api/wishes/${wishId}/access/${friendId}`, { method: open ? 'PUT' : 'DELETE' });
}

export function requestAccess(wishId: number) {
    return request<void>(`/api/wishes/${wishId}/access-requests`, { method: 'POST' });
}

export function fetchIncomingAccessRequests() {
    return request<AccessRequestDto[]>('/api/access-requests/incoming');
}

export function grantAccessRequest(id: number) {
    return request<void>(`/api/access-requests/${id}/grant`, { method: 'POST' });
}

export function denyAccessRequest(id: number) {
    return request<void>(`/api/access-requests/${id}/deny`, { method: 'POST' });
}
```

`method: open ? 'PUT' : 'DELETE'` — **тернарный оператор**: «если `open` — то `'PUT'`, иначе `'DELETE'`». Одна функция и открывает, и закрывает.

## 🔹 Шаг 14. Хуки: `src/api/useAccess.ts`

Новый файл:

```ts
// Хуки TanStack Query для доступа к дням.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    denyAccessRequest, fetchIncomingAccessRequests, grantAccessRequest, requestAccess, setAccess,
} from './access';

const INCOMING_ACCESS = ['access-requests', 'incoming'];

export function useIncomingAccessRequests() {
    return useQuery({ queryKey: INCOMING_ACCESS, queryFn: fetchIncomingAccessRequests });
}

// Доступ поменялся → устарели мои желания (там список «кому открыто») и входящие запросы
function useRefreshAccess() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['wishes', 'mine'] });
        queryClient.invalidateQueries({ queryKey: INCOMING_ACCESS });
    };
}

export function useSetAccess() {
    const refresh = useRefreshAccess();
    return useMutation({
        mutationFn: ({ wishId, friendId, open }: { wishId: number; friendId: number; open: boolean }) =>
            setAccess(wishId, friendId, open),
        onSuccess: refresh,
    });
}

export function useGrantAccessRequest() {
    const refresh = useRefreshAccess();
    return useMutation({ mutationFn: grantAccessRequest, onSuccess: refresh });
}

export function useDenyAccessRequest() {
    const refresh = useRefreshAccess();
    return useMutation({ mutationFn: denyAccessRequest, onSuccess: refresh });
}

// Я прошу доступ к дню друга → в его календаре у этого дня появится «Запрос отправлен»
export function useRequestAccess() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: requestAccess,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    });
}
```

- `useRefreshAccess` — после любого изменения доступа помечаем устаревшими «мои желания» (там список «кому открыто», от него зависит значок 👁) и входящие запросы.
- `useRequestAccess` обновляет `['calendar']` — это **все** загруженные календари друзей. После запроса у дня появится `requested: true`, и кнопка станет «Запрос отправлен».

### 14.1. `src/api/useFriends.ts`

Удаление из друзей теперь стирает доступы на сервере. Значит, после него устаревают и мои желания, и запросы доступа.
Замени `useRefreshFriends`:

```ts
// После любого действия с друзьями устаревают: список друзей, заявки и поиск (там статусы).
// При удалении из друзей сервер стирает доступы и запросы доступа между людьми — их тоже обновляем
function useRefreshFriends() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: FRIENDS });
        queryClient.invalidateQueries({ queryKey: INCOMING });
        queryClient.invalidateQueries({ queryKey: SEARCH });
        queryClient.invalidateQueries({ queryKey: ['wishes', 'mine'] });
        queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    };
}
```

## 🔹 Шаг 15. Доступ — с сервера: `src/api/toWishesByDate.ts`

Замени файл целиком:

```ts
// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';
import { idForServerId } from '../data/fakeData';

const DEFAULT_IMG: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Название, комментарий и доступ — с сервера.
// Картинку пока берём из памяти браузера (local), её на сервере ещё нет (этап 9).
export function toWishesByDate(list: WishDto[], local: WishesByDate): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: local[dto.date]?.img ?? DEFAULT_IMG,
            access: dto.access.map(idForServerId),
        };
    }
    return result;
}

// Календарь друга. access: [me] значит «мне этот день открыт».
// У закрытого дня сервер не присылает название и комментарий, поэтому там пустые строки.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: DEFAULT_IMG,
            access: day.open ? [me] : [],
            requested: day.requested,
        };
    }
    return result;
}
```

Что поменялось:

- `access: dto.access.map(idForServerId)` — доступ берём **с сервера**, а не из памяти браузера. `[2]` превращается в `['boris']`.
- из памяти браузера (`local`) осталась только картинка;
- в `toFriendWishes` добавилось `requested: day.requested`.

## 🔹 Шаг 16. Убираем фейковый доступ: `src/data/useFakeStore.ts`

Замени файл целиком. В нём остались только картинки:

```ts
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
```

## 🔹 Шаг 17. Панель друзей: `src/components/FriendsPanel.tsx`

Запросы доступа теперь приходят с сервера, и в каждом уже есть имя, дата и название. Три правки.

1. Импорты вверху:

```tsx
import { useState } from 'react';
import type { UserId } from '../types';
import type { FriendRequestDto, UserSearchDto } from '../api/friends';
import type { AccessRequestDto } from '../api/access';
import { useUserSearch } from '../api/useFriends';
import { USERS, fakeIdFor } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { Avatar } from './Avatar';
```

2. `Props` и начало функции:

```tsx
type Props = {
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
    onGrant: (request: AccessRequestDto) => void;
    onDeny: (request: AccessRequestDto) => void;
};

export function FriendsPanel(props: Props) {
    const { owner, myFriends, incoming, accessRequests } = props;
    const [query, setQuery] = useState('');
```

Строку `const incomingAccess = accessRequests.filter(...)` **удали**: сервер и так присылает только запросы к моим дням.

3. Блок «Запросы доступа к дням» замени на:

```tsx
            <div>
                <h3>Запросы доступа к дням<Count n={accessRequests.length} /></h3>
                {accessRequests.length === 0 && <p className="hint">Никто не просит доступ.</p>}
                <div className="list">
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
                </div>
            </div>
```

`key={r.id}` — у каждого запроса теперь есть номер из базы. Это лучший ключ для списка в React.

## 🔹 Шаг 18. `src/App.tsx`: доступ с сервера

Замени файл целиком:

```tsx
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
```

Разберём новое:

- Пять новых хуков из `useAccess.ts`. `accessRequests` — запросы к моим дням с сервера. Они же идут в красный кружок `badge`.
- `saveDay`. У **нового** желания нет `id`, пока сервер его не сохранил. Поэтому доступ, который ты включил до «Сохранить»,
  отправляем только после ответа сервера: `saved.id` — номер только что созданного желания.
  - `mutateAsync` — то же, что `mutate`, но возвращает **обещание** (Promise), которое можно подождать через `await`.
  - `Promise.all([...])` — запустить несколько запросов сразу и дождаться, когда закончатся все.
- `changeAccess` — переключатель у **уже сохранённого** желания. Сразу отправляем `PUT` или `DELETE` на сервер.
- `askAccess` — «Попросить доступ». `alreadyAsked` у окна теперь берётся из `requested`, который прислал сервер.
  Обнови страницу, и кнопка всё равно останется «Запрос отправлен»: это помнит база, а не браузер.
- `grantRequest` / `denyRequest` — кнопки «Открыть» и «Отказать» в панели друзей.

💡 Переключатель «кто видит» щёлкает с маленькой задержкой: он показывает то, что сказал сервер, а не то, куда ты нажал.
Это честнее: если сервер откажет, переключатель не будет врать.

## 🔹 Шаг 19. Проверь всё руками

Нужны два человека одновременно: обычное окно и окно **инкогнито** (Ctrl+Shift+N).

1. `docker compose up -d`, запусти `BackendApplication`, в папке `frontend` — `npm run dev`.
2. **Окно 1: Анна.** На кнопке «Друзья» кружок: заявка от Вики + запрос доступа от Бориса.
   В «Запросы доступа к дням»: «Борис просит доступ к 12 октября, Билеты в кино». У 5 октября значок 👁 1.
3. **Окно 2 (инкогнито): Борис.** «Календарь Анны»: 5 октября открыт (зелёная рамка, название), 12 и 24 — с замком.
   Нажми на 12 → кнопка уже «Запрос отправлен». Нажми на 24 → «Попросить доступ» → кнопка стала «Запрос отправлен».
4. Открой **F12 → Network** → запрос `calendars/1?month=...`. У 24 октября `"title": null`: названия **нет даже в ответе**.
5. **Окно 1 (Анна):** обнови страницу → два запроса от Бориса. У 24 октября нажми «Открыть» → «Борис теперь видит 24 октября», у дня 👁 1.
6. **Окно 2 (Борис):** обнови → 24 октября открыт, видно «Тёплый шарф».
7. **Анна:** открой 24 октября и выключи Бориса. **Борис:** обнови → снова замок.
8. **Анна:** создай желание на свободный день, включи Бориса **до** «Сохранить» → сохрани. **Борис:** обнови → день открыт.
9. **Анна:** «Выйти» → «Войти». Вход с первого раза, без `403` (это шаг 0.1).

## 🔹 Шаг 20. Проверка сборки и линтера

В папке `frontend`:

```
npm run build
npm run lint
```

## 🔹 Шаг 21. Сохрани в Git

В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 8: доступ к дням, запросы доступа, тесты правил доступа"
```

## 🔹 Частые проблемы

| Что видишь | Почему | Что сделать |
|---|---|---|
| Сервер не стартует: `missing table [wish_access]` | Flyway не увидел `V4` | имя файла ровно `V4__access.sql` (два подчёркивания), папка `db/migration` |
| `Could not resolve attribute ...` при старте | в `@Query` опечатка в имени поля | в JPQL пишем имена **полей Java** (`w.owner.id`, `a.wishId`), а не колонок базы |
| `Executing an update/delete query` (`TransactionRequiredException`) | у `deleteAllGivenBy` нет `@Modifying` или метод вызван не из `@Transactional` | проверь `@Modifying` в репозитории и `@Transactional` над `removeFriend` |
| Тест не компилируется: `cannot find symbol csrf` / `user` | не подтянулась зависимость `security-test` | проверь `pom.xml` (шаг 10.1) и нажми **Load Maven Changes** |
| Тесты падают: `Connection refused` | база не запущена | `docker compose up -d` |
| В тесте `TransientPropertyValueException` | нет `entityManager.flush()` и `clear()` | сверь тест `deletingWishDeletesItsAccessAndRequests` |
| Фронт: `Property 'access' is missing in type` | не добавил `access` в `WishDto` | шаг 12.3 |
| Фронт: `Module '"../types"' has no exported member 'AccessRequest'` | где-то остался старый импорт | убери `AccessRequest` из импортов в `fakeData.ts` и `FriendsPanel.tsx` |
| Друг видит день открытым, а у владельца 👁 нет | открыли доступ в другой вкладке, страница не обновилась | обнови страницу или переключись в другую вкладку и обратно |

## 🔹 Созданные и изменённые файлы

```
backend/
├── pom.xml                                   + spring-boot-starter-security-test
└── src/
    ├── main/
    │   ├── resources/db/migration/
    │   │   └── V4__access.sql                ← новый: wish_access, access_requests, тестовые данные
    │   └── java/com/adventcalendar/calendar/
    │       ├── access/                       ← новый пакет
    │       │   ├── WishAccess.java           «ключ»: кому открыт день
    │       │   ├── AccessRequest.java        запрос доступа
    │       │   ├── WishAccessRepository.java открытые дни, массовое удаление
    │       │   ├── AccessRequestRepository.java
    │       │   ├── AccessService.java        все правила доступа
    │       │   ├── AccessController.java     /api/wishes/{id}/access/..., /api/access-requests/...
    │       │   ├── AccessRequestResponse.java
    │       │   └── AccessException.java, AccessRequestNotFoundException.java
    │       ├── wish/WishResponse.java        + access
    │       ├── wish/CalendarDayResponse.java + requested
    │       ├── wish/WishService.java         доступ в моих желаниях, открытые дни у друга
    │       ├── friend/FriendService.java     удаление из друзей стирает доступы
    │       └── error/GlobalExceptionHandler.java + 404, 409 для доступа
    └── test/java/com/adventcalendar/calendar/
        └── access/AccessRulesTest.java       ← новый: 11 тестов на правила доступа

frontend/src/
├── types.ts                                  + requested, − AccessRequest
├── App.tsx                                   доступ и запросы доступа с сервера
├── api/access.ts                             ← новый: запросы
├── api/useAccess.ts                          ← новый: хуки
├── api/wishes.ts                             + access
├── api/friends.ts                            + requested
├── api/useFriends.ts                         после удаления друга обновляем доступы
├── api/toWishesByDate.ts                     доступ с сервера
├── api/useAuth.ts                            вход после выхода (хвост этапа 7)
├── api/toFriendWishes.ts                     ✕ удалён (хвост этапа 7)
├── components/FriendsPanel.tsx               запросы доступа с сервера
├── data/fakeData.ts                          + idForServerId, − INITIAL_ACCESS_REQUESTS
└── data/useFakeStore.ts                      остались только картинки
```

## Главное, что нужно запомнить

- Право доступа — это **строка в таблице**: «этому человеку можно это». Проверяет его **сервер** при каждом запросе.
- Закрытое содержимое сервер **не отправляет вовсе** (`null`). Замок в интерфейсе — только картинка, F12 покажет всё, что пришло.
- Связанные данные удаляем вместе: желание → база сама (`ON DELETE CASCADE`), дружба → наш код в `removeFriend`.
- **Автотест** доказывает правило один раз и потом проверяет его при каждом запуске. Особенно важно для безопасности: утечку легко не заметить глазами.
