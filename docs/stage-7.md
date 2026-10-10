# Этап 7. Друзья

## 🔹 Что делаем и зачем

Сейчас друзья живут только в браузере (`useFakeStore`). Анна «дружит» с Борисом, потому что так записано в `fakeData.ts`.
Если Анна войдёт с другого компьютера, никаких друзей там не будет. А календарь друга вообще берётся из фейковых данных.

На этом этапе друзья переезжают на сервер:

1. **Поиск людей по имени**: `GET /api/users/search?q=ви`.
2. **Заявки в друзья**: отправить, принять, отклонить.
3. **Список друзей** и удаление из друзей.
4. **Календарь друга** с сервера: `GET /api/calendars/{userId}?month=2026-10`. Чужой человек (не друг) получает `403`.
5. Во фронтенде правая панель «Друзья», чипы «Календарь Бориса» и красный кружок в шапке работают на настоящих данных.

Что **не** трогаем: доступы к дням («кто видит этот день»), запросы доступа и картинки пока остаются в браузере (этапы 8 и 9).

⚠️ Важное решение этого этапа. Таблицы доступов (`wish_access`) ещё нет, значит сервер пока **не знает**, какие дни друг вам открыл.
Поэтому в календаре друга сервер присылает **все дни закрытыми**: только «день занят», без названия и комментария.
Это безопасный вариант: лучше временно показать замок там, где можно было открыть, чем случайно показать закрытое.
На этапе 8 сервер начнёт открывать дни, к которым есть доступ.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Связь многие-ко-многим** (many-to-many) | у человека много друзей, и каждый друг тоже дружит со многими. Такое хранят в отдельной таблице пар |
| **Перечисление** (enum) | тип, у которого есть только несколько заранее известных значений. Например, статус заявки: `PENDING`, `ACCEPTED`, `DECLINED` |
| **Статус** (status) | «состояние» записи: ждёт ответа, принята, отклонена |
| **Частичный уникальный индекс** (partial unique index) | правило базы «не больше одной такой строки», но только среди строк, подходящих под условие (у нас — только среди ждущих ответа заявок) |
| **Ограничение-проверка** (CHECK constraint) | правило, которое база проверяет сама при каждой записи. Например, «`user_a_id` меньше `user_b_id`» |
| **Автоматическое отслеживание изменений** (dirty checking) | Hibernate помнит, какой была сущность при загрузке. Если внутри транзакции ты поменял поле, он сам сделает `UPDATE`, без `save()` |
| **403 Forbidden** | «я знаю, кто ты, но тебе сюда нельзя». Отличие от `401`: там сервер не знает, кто ты |
| **409 Conflict** | «запрос понятен, но противоречит текущему состоянию» (например, «вы уже друзья») |
| **Инвалидация кэша** (invalidate) | пометить сохранённые ответы сервера устаревшими, чтобы TanStack Query загрузил их заново |

## 🔹 Как будет устроено

### Таблицы

```
friendships                         friend_requests
┌────┬───────────┬───────────┐      ┌────┬──────────────┬────────────┬──────────┐
│ id │ user_a_id │ user_b_id │      │ id │ from_user_id │ to_user_id │ status   │
├────┼───────────┼───────────┤      ├────┼──────────────┼────────────┼──────────┤
│ 1  │ 1 (Анна)  │ 2 (Борис) │      │ 1  │ 3 (Вика)     │ 1 (Анна)   │ PENDING  │
└────┴───────────┴───────────┘      └────┴──────────────┴────────────┴──────────┘
```

**Почему пара хранится один раз.** Дружба взаимная: если Анна дружит с Борисом, то и Борис с Анной.
Можно было бы хранить две строки (1→2 и 2→1), но тогда легко получить «полудружбу», если одна строка удалится, а другая нет.
Поэтому храним одну строку, и **меньший id всегда слева** (`user_a_id < user_b_id`). Это правило проверяет сама база (`CHECK`).

Аналогия 🤝: рукопожатие одно на двоих. Не бывает так, что Анна пожала руку Борису, а Борис Анне — нет.

**Улучшение по сравнению с черновиком в задании:** в `friendships` добавлен обычный `id`.
С ним проще писать сущность JPA (не нужен составной ключ), а уникальность пары всё равно гарантирует `UNIQUE (user_a_id, user_b_id)`.

### Жизнь заявки

```
Борис нажал «Добавить в друзья»
        │
        ▼
   PENDING  ──── Вика нажала «Принять» ────►  ACCEPTED  + строка в friendships
   (ждёт)   ──── Вика нажала «Отклонить» ──►  DECLINED
```

Отвеченные заявки не удаляем, а меняем им статус. Так видна история, и после отказа можно отправить новую заявку.

### Адреса (эндпоинты)

| Запрос | Что делает | Ответ |
|---|---|---|
| `GET /api/users/search?q=ви` | найти людей по части имени | список `{id, name, relation}` |
| `GET /api/friends` | мои друзья | список `{id, name}` |
| `DELETE /api/friends/{userId}` | удалить из друзей | `204` |
| `POST /api/friend-requests` + `{"toUserId": 3}` | отправить заявку | `201` |
| `GET /api/friend-requests/incoming` | заявки, которые пришли мне | список `{id, from: {id, name}}` |
| `POST /api/friend-requests/{id}/accept` | принять заявку | `204` |
| `POST /api/friend-requests/{id}/decline` | отклонить заявку | `204` |
| `GET /api/calendars/{userId}?month=2026-10` | занятые дни человека за месяц | список дней или `403` |

`relation` — «кем мне приходится найденный человек»: `FRIEND` (уже друг), `REQUEST_SENT` (я отправил заявку),
`REQUEST_RECEIVED` (он прислал заявку мне), `NONE` (никак не связаны). По нему фронт решает, что показать: кнопку или надпись.

### Правила, которые проверяет сервер

- нельзя отправить заявку самому себе, человеку, который уже друг, или второй раз, пока первая ждёт ответа → `409`;
- если человек уже прислал заявку тебе, вместо встречной заявки нужно принять его → `409`;
- принять или отклонить заявку может только тот, **кому** она пришла. Для чужой заявки ответ `404` (сервер даже не признаётся, что она есть);
- календарь человека может смотреть только он сам или его друг. Остальным `403`.

## 🔹 Шаг 1. Миграция `V3__friends.sql`

Создай файл `backend/src/main/resources/db/migration/V3__friends.sql`:

```sql
-- Дружба. Пара хранится один раз: меньший id всегда в user_a_id
CREATE TABLE friendships (
    id         BIGSERIAL   PRIMARY KEY,
    user_a_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_friendships_pair UNIQUE (user_a_id, user_b_id),
    CONSTRAINT ck_friendships_order CHECK (user_a_id < user_b_id)
);
CREATE INDEX idx_friendships_user_b ON friendships (user_b_id);

-- Заявки в друзья. status: PENDING (ждёт ответа), ACCEPTED (принята), DECLINED (отклонена)
CREATE TABLE friend_requests (
    id           BIGSERIAL   PRIMARY KEY,
    from_user_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_user_id   BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_friend_requests_not_self CHECK (from_user_id <> to_user_id)
);
-- Ждущая ответа заявка от одного человека другому может быть только одна
CREATE UNIQUE INDEX uq_friend_requests_pending
    ON friend_requests (from_user_id, to_user_id) WHERE status = 'PENDING';
CREATE INDEX idx_friend_requests_to ON friend_requests (to_user_id, status);

-- Как в макете: Анна и Борис уже друзья, Вика прислала Анне заявку
INSERT INTO friendships (user_a_id, user_b_id) VALUES (1, 2);
INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (3, 1, 'PENDING');
```

Разберём:

- `REFERENCES users (id) ON DELETE CASCADE` — ссылка на человека (**внешний ключ**, foreign key). Если человека удалят, его дружбы и заявки удалятся сами.
- `CHECK (user_a_id < user_b_id)` — база не даст записать пару «наоборот». Даже если в Java будет ошибка, неправильная строка не попадёт в таблицу.
- `CREATE UNIQUE INDEX ... WHERE status = 'PENDING'` — **частичный** уникальный индекс. Две ждущие заявки от Бориса к Вике быть не может,
  а вот старые `ACCEPTED` и `DECLINED` могут лежать сколько угодно.
- `CREATE INDEX` — **индекс**, «оглавление» для быстрого поиска. Без него, чтобы найти заявки Анны, база перебирала бы всю таблицу.
- последние две строки — тестовые данные, как в макете.

💡 Flyway запустит эту миграцию сам при следующем старте сервера. Старые `V1` и `V2` он уже выполнил и повторять не будет.
Никогда не меняй уже выполненные миграции: Flyway заметит это и откажется запускаться. Новое — только новым файлом `V4`, `V5`...

## 🔹 Шаг 2. Поиск людей и ошибка «не найден»

### 2.1. `user/UserRepository.java`

Добавь импорт `java.util.List` и один метод:

```java
package com.adventcalendar.calendar.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // Поиск по части имени без учёта регистра, кроме меня самого, не больше 20 человек
    List<User> findTop20ByNameContainingIgnoreCaseAndIdNotOrderByNameAsc(String name, Long excludeId);
}
```

Spring Data сам напишет SQL по имени метода. Читаем имя по кусочкам:

| Кусок | Что значит |
|---|---|
| `findTop20` | найти не больше 20 записей |
| `ByNameContainingIgnoreCase` | имя **содержит** текст, большие и маленькие буквы не важны (`ви` найдёт «Вика») |
| `AndIdNot` | и id **не равен** (себя в поиске не показываем) |
| `OrderByNameAsc` | отсортировать по имени от А до Я |

### 2.2. `user/UserNotFoundException.java`

```java
package com.adventcalendar.calendar.user;

public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(Long id) {
        super("Пользователь с id " + id + " не найден");
    }
}
```

## 🔹 Шаг 3. Пакет `friend`: сущности

Создай пакет `com.adventcalendar.calendar.friend`. Все файлы шагов 3–7 кладём в него.

### 3.1. `Friendship.java` — дружба

```java
package com.adventcalendar.calendar.friend;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "friendships")
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_a_id", nullable = false)
    private Long userAId;

    @Column(name = "user_b_id", nullable = false)
    private Long userBId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Friendship() {
    }

    // Дружба Анны (1) с Борисом (2) и Бориса с Анной — одна и та же запись (1, 2)
    public static Friendship between(Long x, Long y) {
        Friendship friendship = new Friendship();
        friendship.userAId = Math.min(x, y);
        friendship.userBId = Math.max(x, y);
        return friendship;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getUserAId() {
        return userAId;
    }

    public Long getUserBId() {
        return userBId;
    }
}
```

- Здесь `userAId` и `userBId` — просто числа (`Long`), а не `@ManyToOne User`, как в `Wish`. Так проще: из дружбы нам нужны только id,
  а людей целиком мы достанем отдельным запросом (шаг 4.1).
- Конструктора с параметрами нет. Вместо него **статический метод-фабрика** (factory method) `between`: он сам ставит меньший id влево.
  Так невозможно случайно создать дружбу «наоборот».

### 3.2. `FriendRequestStatus.java` — статус заявки

```java
package com.adventcalendar.calendar.friend;

public enum FriendRequestStatus {
    PENDING,  // ждёт ответа
    ACCEPTED, // принята
    DECLINED  // отклонена
}
```

`enum` (**перечисление**) — тип, у которого есть только эти три значения. Написать `"PENDNG"` с опечаткой не получится: Java не скомпилирует.

### 3.3. `FriendRequest.java` — заявка

```java
package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "friend_requests")
public class FriendRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_user_id", nullable = false)
    private User fromUser;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_user_id", nullable = false)
    private User toUser;

    @Enumerated(EnumType.STRING) // в базе хранится текст 'PENDING', а не число 0
    @Column(nullable = false, length = 20)
    private FriendRequestStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FriendRequest() {
    }

    public FriendRequest(User fromUser, User toUser) {
        this.fromUser = fromUser;
        this.toUser = toUser;
        this.status = FriendRequestStatus.PENDING;
    }

    public void accept() {
        status = FriendRequestStatus.ACCEPTED;
    }

    public void decline() {
        status = FriendRequestStatus.DECLINED;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getFromUser() {
        return fromUser;
    }

    public User getToUser() {
        return toUser;
    }

    public FriendRequestStatus getStatus() {
        return status;
    }
}
```

- `@ManyToOne(fetch = FetchType.LAZY)` — как у `Wish.owner`: человек подгрузится из базы, только когда к нему обратятся (**ленивая загрузка**).
- `@Enumerated(EnumType.STRING)` — в базе будет лежать текст `PENDING`. Без этой строчки JPA хранил бы номер (`0`, `1`, `2`),
  и если однажды поменять порядок значений в `enum`, все старые заявки «поменяют» статус.
- Новая заявка всегда `PENDING` — это задаёт конструктор. Поменять статус можно только методами `accept()` и `decline()`.

## 🔹 Шаг 4. Репозитории

### 4.1. `FriendshipRepository.java`

```java
package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    boolean existsByUserAIdAndUserBId(Long userAId, Long userBId);

    long deleteByUserAIdAndUserBId(Long userAId, Long userBId);

    // Мои друзья: я могу стоять и в user_a, и в user_b, поэтому смотрим обе стороны
    @Query("""
            select u from User u
            where u.id in (select f.userBId from Friendship f where f.userAId = :userId)
               or u.id in (select f.userAId from Friendship f where f.userBId = :userId)
            order by u.name
            """)
    List<User> findFriendsOf(Long userId);
}
```

- `existsByUserAIdAndUserBId` — «есть ли такая пара?». Вызывать его будем уже с упорядоченными id (меньший первым).
- `deleteByUserAIdAndUserBId` — удалить пару. Возвращает, сколько строк удалено.
- `@Query` — запрос, который мы пишем сами на **JPQL** (язык запросов JPA: похож на SQL, но вместо таблиц — классы, вместо колонок — поля).
  Я могу оказаться и в `userAId`, и в `userBId`, поэтому ищем по обеим сторонам и возвращаем «другую сторону».
  `:userId` — место, куда Spring подставит параметр метода с тем же именем.
- `"""` — **текстовый блок** (text block) Java: строка на несколько строк, удобно для запросов.

### 4.2. `FriendRequestRepository.java`

```java
package com.adventcalendar.calendar.friend;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {

    boolean existsByFromUserIdAndToUserIdAndStatus(Long fromUserId, Long toUserId, FriendRequestStatus status);

    // Заявку может принять или отклонить только тот, кому она пришла
    Optional<FriendRequest> findByIdAndToUserIdAndStatus(Long id, Long toUserId, FriendRequestStatus status);

    // Заявки, которые пришли мне. Сразу подгружаем отправителя, чтобы знать его имя
    @EntityGraph(attributePaths = "fromUser")
    List<FriendRequest> findAllByToUserIdAndStatusOrderByCreatedAtAsc(Long toUserId, FriendRequestStatus status);

    // Заявки, которые отправил я
    List<FriendRequest> findAllByFromUserIdAndStatus(Long fromUserId, FriendRequestStatus status);
}
```

- `ToUserId` — Spring Data понимает это как «поле `toUser`, а у него `id`», как `OwnerId` в `WishRepository`.
- `@EntityGraph(attributePaths = "fromUser")` — загрузить заявки **сразу вместе** с отправителями одним SQL-запросом.
  Без этого на каждую заявку был бы отдельный запрос «а как зовут отправителя?». Это известная проблема **N+1 запросов**.

## 🔹 Шаг 5. Что приходит и что уходит (DTO) и ошибки

### 5.1. `FriendResponse.java` — человек коротко

```java
package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;

// Человек коротко: id и имя. Email и пароль чужим не показываем!
public record FriendResponse(Long id, String name) {

    public static FriendResponse from(User user) {
        return new FriendResponse(user.getId(), user.getName());
    }
}
```

### 5.2. `FriendRelation.java` и `UserSearchResponse.java` — результат поиска

```java
package com.adventcalendar.calendar.friend;

// Кем мне приходится найденный человек
public enum FriendRelation {
    FRIEND,           // уже в друзьях
    REQUEST_SENT,     // я отправил ему заявку
    REQUEST_RECEIVED, // он прислал заявку мне
    NONE              // никак не связаны
}
```

```java
package com.adventcalendar.calendar.friend;

public record UserSearchResponse(Long id, String name, FriendRelation relation) {
}
```

### 5.3. `FriendRequestResponse.java` — входящая заявка

```java
package com.adventcalendar.calendar.friend;

public record FriendRequestResponse(Long id, FriendResponse from) {

    public static FriendRequestResponse from(FriendRequest request) {
        return new FriendRequestResponse(request.getId(), FriendResponse.from(request.getFromUser()));
    }
}
```

### 5.4. `NewFriendRequest.java` — тело запроса «отправить заявку»

```java
package com.adventcalendar.calendar.friend;

import jakarta.validation.constraints.NotNull;

public record NewFriendRequest(
        @NotNull(message = "Укажите, кому отправить заявку")
        Long toUserId
) {
}
```

### 5.5. Ошибки

`FriendRequestException.java`:

```java
package com.adventcalendar.calendar.friend;

// Заявку отправить нельзя: уже друзья, уже отправлена и т. п. Сервер ответит 409 Conflict
public class FriendRequestException extends RuntimeException {

    public FriendRequestException(String message) {
        super(message);
    }
}
```

`FriendRequestNotFoundException.java`:

```java
package com.adventcalendar.calendar.friend;

public class FriendRequestNotFoundException extends RuntimeException {

    public FriendRequestNotFoundException(Long id) {
        super("Заявка с id " + id + " не найдена");
    }
}
```

`NotFriendsException.java`:

```java
package com.adventcalendar.calendar.friend;

public class NotFriendsException extends RuntimeException {

    public NotFriendsException() {
        super("Календарь могут смотреть только друзья");
    }
}
```

## 🔹 Шаг 6. `FriendService.java` — все правила дружбы

```java
package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserNotFoundException;
import com.adventcalendar.calendar.user.UserRepository;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FriendService {

    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository requestRepository;
    private final UserRepository userRepository;

    public FriendService(FriendshipRepository friendshipRepository,
                         FriendRequestRepository requestRepository,
                         UserRepository userRepository) {
        this.friendshipRepository = friendshipRepository;
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public boolean areFriends(Long x, Long y) {
        return friendshipRepository.existsByUserAIdAndUserBId(Math.min(x, y), Math.max(x, y));
    }

    @Transactional(readOnly = true)
    public List<FriendResponse> friendsOf(Long me) {
        return friendshipRepository.findFriendsOf(me).stream()
                .map(FriendResponse::from)
                .toList();
    }

    @Transactional
    public void removeFriend(Long me, Long friendId) {
        friendshipRepository.deleteByUserAIdAndUserBId(Math.min(me, friendId), Math.max(me, friendId));
        // Этап 8: здесь же удалим доступы к дням между этими людьми
    }

    @Transactional(readOnly = true)
    public List<UserSearchResponse> search(Long me, String query) {
        String text = query.trim();
        if (text.isEmpty()) {
            return List.of();
        }

        // Заранее собираем, кто мне друг и с кем у меня заявки, чтобы у каждого найденного показать статус
        Set<Long> friends = friendshipRepository.findFriendsOf(me).stream()
                .map(User::getId)
                .collect(Collectors.toSet());
        Set<Long> sentTo = requestRepository.findAllByFromUserIdAndStatus(me, FriendRequestStatus.PENDING).stream()
                .map(request -> request.getToUser().getId())
                .collect(Collectors.toSet());
        Set<Long> receivedFrom = requestRepository
                .findAllByToUserIdAndStatusOrderByCreatedAtAsc(me, FriendRequestStatus.PENDING).stream()
                .map(request -> request.getFromUser().getId())
                .collect(Collectors.toSet());

        return userRepository.findTop20ByNameContainingIgnoreCaseAndIdNotOrderByNameAsc(text, me).stream()
                .map(user -> {
                    FriendRelation relation;
                    if (friends.contains(user.getId())) relation = FriendRelation.FRIEND;
                    else if (sentTo.contains(user.getId())) relation = FriendRelation.REQUEST_SENT;
                    else if (receivedFrom.contains(user.getId())) relation = FriendRelation.REQUEST_RECEIVED;
                    else relation = FriendRelation.NONE;
                    return new UserSearchResponse(user.getId(), user.getName(), relation);
                })
                .toList();
    }

    @Transactional
    public void sendRequest(Long me, Long toUserId) {
        if (me.equals(toUserId)) {
            throw new FriendRequestException("Нельзя добавить в друзья самого себя");
        }
        User to = userRepository.findById(toUserId)
                .orElseThrow(() -> new UserNotFoundException(toUserId));
        if (areFriends(me, toUserId)) {
            throw new FriendRequestException("Вы уже друзья");
        }
        if (requestRepository.existsByFromUserIdAndToUserIdAndStatus(me, toUserId, FriendRequestStatus.PENDING)) {
            throw new FriendRequestException("Заявка уже отправлена");
        }
        if (requestRepository.existsByFromUserIdAndToUserIdAndStatus(toUserId, me, FriendRequestStatus.PENDING)) {
            throw new FriendRequestException("Этот человек уже прислал вам заявку. Примите её");
        }
        requestRepository.save(new FriendRequest(userRepository.getReferenceById(me), to));
    }

    @Transactional(readOnly = true)
    public List<FriendRequestResponse> incoming(Long me) {
        return requestRepository.findAllByToUserIdAndStatusOrderByCreatedAtAsc(me, FriendRequestStatus.PENDING).stream()
                .map(FriendRequestResponse::from)
                .toList();
    }

    @Transactional
    public void accept(Long me, Long requestId) {
        FriendRequest request = findIncomingPending(me, requestId);
        request.accept(); // save() не нужен: Hibernate сам заметит изменение и обновит строку
        Long fromId = request.getFromUser().getId();
        if (!areFriends(me, fromId)) {
            friendshipRepository.save(Friendship.between(me, fromId));
        }
    }

    @Transactional
    public void decline(Long me, Long requestId) {
        findIncomingPending(me, requestId).decline();
    }

    // Чужую заявку (не мне) или уже отвеченную не находим: для них ответ 404
    private FriendRequest findIncomingPending(Long me, Long requestId) {
        return requestRepository.findByIdAndToUserIdAndStatus(requestId, me, FriendRequestStatus.PENDING)
                .orElseThrow(() -> new FriendRequestNotFoundException(requestId));
    }
}
```

Разберём по методам:

- `areFriends(x, y)` — упорядочиваем id (`Math.min`, `Math.max`) и спрашиваем базу, есть ли пара. Этот метод понадобится и календарю (шаг 8).
- `search` — сначала одним махом собираем три множества (**Set**, набор без повторов, где очень быстро проверить «есть ли там X»):
  мои друзья, кому я отправил заявки, кто прислал заявки мне. Потом для каждого найденного человека смотрим, в какое множество он попал.
- `sendRequest` — проверки идут по порядку, от простых к сложным. Каждая проверка, которая не прошла, выбрасывает исключение,
  и до `save` дело не доходит.
- `getReferenceById(me)` — «ссылка на человека без загрузки из базы». Нам нужен только его id для колонки `from_user_id`, читать имя и email незачем.
- `accept` — меняем статус заявки и создаём дружбу. `save()` для заявки не вызываем: метод помечен `@Transactional`,
  и в конце транзакции Hibernate сам увидит, что `status` поменялся, и сделает `UPDATE` (**dirty checking**).
- `findIncomingPending` — ищем заявку сразу по трём условиям: этот id, пришла **мне**, ещё ждёт ответа.
  Если Борис попробует принять заявку, адресованную Анне, такой строки «для Бориса» просто нет → `404`.

## 🔹 Шаг 7. `FriendController.java` — адреса

```java
package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class FriendController {

    private final FriendService service;

    public FriendController(FriendService service) {
        this.service = service;
    }

    @GetMapping("/users/search")
    public List<UserSearchResponse> search(@AuthenticationPrincipal CurrentUser me,
                                           @RequestParam(defaultValue = "") String q) {
        return service.search(me.id(), q);
    }

    @GetMapping("/friends")
    public List<FriendResponse> friends(@AuthenticationPrincipal CurrentUser me) {
        return service.friendsOf(me.id());
    }

    @DeleteMapping("/friends/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFriend(@AuthenticationPrincipal CurrentUser me, @PathVariable Long userId) {
        service.removeFriend(me.id(), userId);
    }

    @PostMapping("/friend-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public void sendRequest(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody NewFriendRequest body) {
        service.sendRequest(me.id(), body.toUserId());
    }

    @GetMapping("/friend-requests/incoming")
    public List<FriendRequestResponse> incoming(@AuthenticationPrincipal CurrentUser me) {
        return service.incoming(me.id());
    }

    @PostMapping("/friend-requests/{id}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.accept(me.id(), id);
    }

    @PostMapping("/friend-requests/{id}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.decline(me.id(), id);
    }
}
```

- `@RequestParam(defaultValue = "") String q` — параметр из адреса после `?`. Если его нет, будет пустая строка, а не ошибка.
- «Кто я» опять берём из сессии (`@AuthenticationPrincipal`), а не из запроса. Поэтому нельзя притвориться другим человеком
  и, например, принять чужую заявку.

## 🔹 Шаг 8. Календарь друга

Календарь — это про желания, поэтому кладём его в пакет `wish`.

### 8.1. `wish/WishRepository.java` — желания за месяц

Добавь метод:

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WishRepository extends JpaRepository<Wish, Long> {

    List<Wish> findAllByOwnerIdOrderByDateAsc(Long ownerId);

    Optional<Wish> findByIdAndOwnerId(Long id, Long ownerId);

    Optional<Wish> findByOwnerIdAndDate(Long ownerId, LocalDate date);

    // Желания человека с даты from по дату to включительно
    List<Wish> findAllByOwnerIdAndDateBetweenOrderByDateAsc(Long ownerId, LocalDate from, LocalDate to);
}
```

`DateBetween` — дата между `from` и `to`, **включая** обе границы.

### 8.2. `wish/CalendarDayResponse.java` — один день календаря

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название и комментарий не отдаём (null)
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, String title, String comment) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, wish.getTitle(), wish.getComment());
    }

    public static CalendarDayResponse closed(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, null, null);
    }
}
```

Два статических метода — два вида дня: открытый (всё видно) и закрытый (только «занято»). Закрытый день просто **не содержит**
названия и комментария. Спрятать их «потом, на фронте» нельзя: всё, что пришло в браузер, можно увидеть в **F12 → Network**.

### 8.3. `wish/WishService.java` — проверка «друг или нет»

Добавь импорты:

```java
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import java.time.YearMonth;
```

**Замени** старые поля и конструктор (не дописывай рядом, иначе будет ошибка «already defined in the scope»). Должно остаться ровно три поля и один конструктор:

```java
    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
    }
```

И новый метод в конец класса:

```java
    @Transactional(readOnly = true)
    public List<CalendarDayResponse> calendar(Long viewerId, Long ownerId, YearMonth month) {
        boolean isOwner = viewerId.equals(ownerId);
        // Чужой календарь можно смотреть только другу. Проверяем здесь, на сервере
        if (!isOwner && !friendService.areFriends(viewerId, ownerId)) {
            throw new NotFriendsException();
        }
        return wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                        ownerId, month.atDay(1), month.atEndOfMonth()).stream()
                // Пока (до этапа 8) у друзей все дни закрыты: видно только, что день занят
                .map(wish -> isOwner ? CalendarDayResponse.open(wish) : CalendarDayResponse.closed(wish))
                .toList();
    }
```

- `YearMonth` — «год и месяц» без числа: `2026-10`. `atDay(1)` — 1 октября, `atEndOfMonth()` — 31 октября (сам знает, сколько дней в месяце).
- `viewerId.equals(ownerId)` — сравниваем `Long` через `equals`, а не `==`. `==` у объектов сравнивает «тот же ли это объект в памяти»,
  и для чисел больше 127 даст `false`, даже если числа равны.

### 8.4. `wish/CalendarController.java`

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.security.CurrentUser;
import java.time.YearMonth;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/calendars")
public class CalendarController {

    private final WishService service;

    public CalendarController(WishService service) {
        this.service = service;
    }

    // GET /api/calendars/2?month=2026-10 — занятые дни человека с id 2 за октябрь 2026
    @GetMapping("/{userId}")
    public List<CalendarDayResponse> month(@AuthenticationPrincipal CurrentUser me,
                                           @PathVariable Long userId, @RequestParam YearMonth month) {
        return service.calendar(me.id(), userId, month);
    }
}
```

`@RequestParam YearMonth month` — Spring сам превратит текст `2026-10` в `YearMonth`. Если прислать `month=oct`,
сработает наш обработчик `MethodArgumentTypeMismatchException` из этапа 2 и ответит `400`.

## 🔹 Шаг 9. `GlobalExceptionHandler.java` — новые ошибки

Добавь импорты:

```java
import com.adventcalendar.calendar.friend.FriendRequestException;
import com.adventcalendar.calendar.friend.FriendRequestNotFoundException;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.user.UserNotFoundException;
```

И три метода (например, перед `handleEmailTaken`):

```java
    @ExceptionHandler({UserNotFoundException.class, FriendRequestNotFoundException.class})
    public ProblemDetail handleFriendNotFound(RuntimeException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(FriendRequestException.class)
    public ProblemDetail handleFriendRequest(FriendRequestException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(NotFriendsException.class)
    public ProblemDetail handleNotFriends(NotFriendsException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }
```

`@ExceptionHandler({A.class, B.class})` — один метод ловит сразу два вида ошибок. Параметр тогда пишем общим типом `RuntimeException`.

## 🔹 Шаг 10. Проверь сервер в Postman 📮

`docker compose up -d`, запусти `BackendApplication`. В логе должна быть строка про миграцию:
`Migrating schema "public" to version "3 - friends"`.

Как на этапе 6: сначала `GET http://localhost:8080/api/me`, чтобы получить cookie `XSRF-TOKEN`, и копируй её в заголовок `X-XSRF-TOKEN`
для всех `POST` и `DELETE`. Удобнее вставить скрипт из этапа 6 во вкладку **Scripts → Pre-request** у коллекции.

**Как Анна** (`POST /api/auth/login`, `anna@example.com` / `password123`):

1. `GET http://localhost:8080/api/friends` → `[{"id":2,"name":"Борис"}]`.
2. `GET http://localhost:8080/api/friend-requests/incoming` → `[{"id":1,"from":{"id":3,"name":"Вика"}}]`.
3. `GET http://localhost:8080/api/users/search?q=ви` → Вика с `"relation":"REQUEST_RECEIVED"`. Попробуй `q=б` → Борис, `FRIEND`.
4. `GET http://localhost:8080/api/calendars/2?month=2026-10` → дни Бориса, у всех `"open":false` и `"title":null`.
5. `GET http://localhost:8080/api/calendars/3?month=2026-10` → `403` «Календарь могут смотреть только друзья». Вика пока не друг.
6. `POST http://localhost:8080/api/friend-requests` с телом `{"toUserId": 3}` → `409` «Этот человек уже прислал вам заявку. Примите её».
7. `POST http://localhost:8080/api/friend-requests/1/accept` → `204`. Ещё раз → `404`: заявка уже не ждёт ответа.
8. Снова `GET /api/calendars/3?month=2026-10` → теперь `200`, день Вики 15 октября, закрытый.
9. `GET /api/calendars/1?month=2026-10` → свой календарь, у всех дней `"open":true` и есть названия.
10. `GET /api/calendars/1?month=oct` → `400`.

**Ошибки заявки**, тоже как Анна, `POST /api/friend-requests`:

- `{"toUserId": 1}` → `409` «Нельзя добавить в друзья самого себя»;
- `{"toUserId": 2}` → `409` «Вы уже друзья»;
- `{"toUserId": 99}` → `404` «Пользователь с id 99 не найден»;
- `{}` → `400` «Укажите, кому отправить заявку».

**Заявка от Бориса Вике.** Выйди (`POST /api/auth/logout`), обнови токен (`GET /api/me`), войди как Борис:

1. `POST /api/friend-requests` с `{"toUserId": 3}` → `201`. Ещё раз → `409` «Заявка уже отправлена».
2. `GET /api/users/search?q=ви` → Вика с `REQUEST_SENT`.
3. `POST /api/friend-requests/1/accept` → `404`: эта заявка была не Борису.

Потом войди как Вика: `GET /api/friend-requests/incoming` покажет заявку Бориса, `POST /api/friend-requests/{id}/decline` → `204`.

**Удаление.** Как Анна: `DELETE /api/friends/3` → `204`, потом `GET /api/calendars/3?month=2026-10` → снова `403`.

## 🔹 Шаг 11. Фронтенд: у человека появляется id из базы

Сейчас в компонентах люди называются строками (`'anna'`, `'boris'`), а сервер знает их по числам (`1`, `2`).
Чтобы не переписывать все компоненты, добавим каждому человеку поле `serverId` и будем переводить одно в другое.

### 11.1. `src/types.ts`

Добавь `serverId` в `User` и удали тип `FriendRequest` (заявки теперь приходят с сервера в другом виде):

```ts
// Типы данных: какие «формы» у наших объектов.

export type UserId = string;

export type User = {
    id: UserId;
    serverId: number; // id этого человека в базе
    name: string;     // «Анна»
    gen: string;      // родительный падеж: «календарь Анны»
    color: string;    // цвет кружка-аватарки
};

// Картинка желания: либо эмодзи на цветном фоне (фейк), либо загруженный файл.
export type WishImage = { emoji: string; bg: string } | { src: string };

export type Wish = {
    id?: number;
    title: string;
    comment: string;
    img: WishImage;
    access: UserId[]; // друзья, которым открыт этот день
};

// Желания одного человека: ключ — дата '2026-10-08', значение — желание.
export type WishesByDate = Record<string, Wish>;

export type AccessRequest = { from: UserId; owner: UserId; date: string };
```

### 11.2. `src/data/fakeData.ts`

1. В первой строке импорта убери `FriendRequest`:

```ts
import type { AccessRequest, User, UserId, Wish, WishesByDate } from '../types';
```

2. Добавь `serverId` Анне, Борису и Вике:

```ts
export const USERS: Record<UserId, User> = {
    anna:  { id: 'anna',  serverId: 1, name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
    boris: { id: 'boris', serverId: 2, name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
    vika:  { id: 'vika',  serverId: 3, name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};
```

3. **Удали** `INITIAL_FRIENDS`, `INITIAL_FRIEND_REQUESTS` и `SEED_IDS`. Сам `INITIAL_WISHES` **оставь** (его использует `useFakeStore`). Всё, что идёт **после** закрывающей `};` у `INITIAL_WISHES`, замени на:

```ts
export const INITIAL_ACCESS_REQUESTS: AccessRequest[] = [{ from: 'boris', owner: 'anna', date: day(12) }];

// Человек с сервера → его UserId в наших компонентах.
// Анна, Борис и Вика уже есть в USERS (там у них цвет и родительный падеж).
// Нового человека добавляем на лету.
export function fakeIdFor(user: { id: number; name: string }): UserId {
    const known = Object.values(USERS).find(u => u.serverId === user.id);
    if (known) return known.id;
    const id = 'user' + user.id;
    USERS[id] = { id, serverId: user.id, name: user.name, gen: user.name, color: '#6B7280' };
    return id;
}
```

Желания Бориса и Вики в `INITIAL_WISHES` больше не показываются (календари друзей теперь с сервера). Их можно оставить, они ничему не мешают.

## 🔹 Шаг 12. Запросы про друзей: `src/api/friends.ts`

Новый файл:

```ts
// Всё общение с сервером про друзей и календари друзей.
import { request } from './http';

// Человек коротко (FriendResponse из Java)
export type FriendDto = { id: number; name: string };

// Кем мне приходится найденный человек (FriendRelation из Java)
export type Relation = 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE';

// Результат поиска (UserSearchResponse из Java)
export type UserSearchDto = { id: number; name: string; relation: Relation };

// Заявка, которая пришла мне (FriendRequestResponse из Java)
export type FriendRequestDto = { id: number; from: FriendDto };

// Один занятый день в календаре (CalendarDayResponse из Java)
export type CalendarDayDto = {
    wishId: number;
    date: string;           // '2026-10-08'
    open: boolean;          // можно ли мне видеть, что внутри
    title: string | null;   // у закрытого дня сервер не присылает название
    comment: string | null;
};

export function searchUsers(q: string) {
    // encodeURIComponent: русские буквы и пробелы превращаем в безопасный для адреса вид
    return request<UserSearchDto[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
}

export function fetchFriends() {
    return request<FriendDto[]>('/api/friends');
}

export function removeFriend(userId: number) {
    return request<void>(`/api/friends/${userId}`, { method: 'DELETE' });
}

export function sendFriendRequest(toUserId: number) {
    return request<void>('/api/friend-requests', { method: 'POST', body: JSON.stringify({ toUserId }) });
}

export function fetchIncomingRequests() {
    return request<FriendRequestDto[]>('/api/friend-requests/incoming');
}

export function acceptFriendRequest(id: number) {
    return request<void>(`/api/friend-requests/${id}/accept`, { method: 'POST' });
}

export function declineFriendRequest(id: number) {
    return request<void>(`/api/friend-requests/${id}/decline`, { method: 'POST' });
}

// month: '2026-10'
export function fetchCalendar(userId: number, month: string) {
    return request<CalendarDayDto[]>(`/api/calendars/${userId}?month=${month}`);
}
```

Типы повторяют наши Java-классы `...Response`. Это **контракт** между фронтом и бэком: если поменять поле в Java, надо поменять и здесь.

## 🔹 Шаг 13. Хуки: `src/api/useFriends.ts`

Новый файл:

```ts
// Хуки TanStack Query для друзей.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    acceptFriendRequest, declineFriendRequest, fetchCalendar, fetchFriends,
    fetchIncomingRequests, removeFriend, searchUsers, sendFriendRequest,
} from './friends';

const FRIENDS = ['friends'];
const INCOMING = ['friend-requests', 'incoming'];
const SEARCH = ['users', 'search'];

export function useFriends() {
    return useQuery({ queryKey: FRIENDS, queryFn: fetchFriends });
}

export function useIncomingRequests() {
    return useQuery({ queryKey: INCOMING, queryFn: fetchIncomingRequests });
}

export function useUserSearch(q: string) {
    const text = q.trim();
    return useQuery({
        queryKey: [...SEARCH, text],          // у каждого текста поиска свой ответ
        queryFn: () => searchUsers(text),
        enabled: text.length > 0,             // пустую строку на сервер не отправляем
        placeholderData: keepPreviousData,    // пока ищем новое, показываем прошлый результат
    });
}

// Календарь друга за месяц. userId = null — это мой календарь, тогда запрос не нужен
export function useFriendCalendar(userId: number | null, month: string) {
    return useQuery({
        queryKey: ['calendar', userId, month],
        queryFn: () => fetchCalendar(userId!, month),
        enabled: userId !== null,
    });
}

// После любого действия с друзьями устаревают: список друзей, заявки и поиск (там статусы)
function useRefreshFriends() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: FRIENDS });
        queryClient.invalidateQueries({ queryKey: INCOMING });
        queryClient.invalidateQueries({ queryKey: SEARCH });
    };
}

export function useSendFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: sendFriendRequest, onSuccess: refresh });
}

export function useAcceptFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: acceptFriendRequest, onSuccess: refresh });
}

export function useDeclineFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: declineFriendRequest, onSuccess: refresh });
}

export function useRemoveFriend() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: removeFriend, onSuccess: refresh });
}
```

- `queryKey: [...SEARCH, text]` — у каждого текста поиска свой ключ: `['users', 'search', 'ви']`. Если снова набрать «ви», ответ возьмётся из памяти.
- `enabled: false` — запрос не отправляется. Так мы не ищем пустую строку и не грузим календарь, когда открыт свой.
- `placeholderData: keepPreviousData` — пока сервер ищет «вик», на экране остаётся результат для «ви». Без этого список мигал бы на каждой букве.
- `useRefreshFriends` — общая «уборка» после любого действия. `invalidateQueries({ queryKey: SEARCH })` помечает устаревшими
  **все** поиски сразу, потому что ключ `['users', 'search']` — начало каждого из них.

## 🔹 Шаг 14. Дни друга → вид для компонентов: `src/api/toWishesByDate.ts`

Добавь импорты и новую функцию `toFriendWishes`. Файл целиком:

```ts
// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';

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

// Календарь друга. access: [me] значит «мне этот день открыт».
// До этапа 8 сервер присылает все дни друзей закрытыми: без названия и комментария.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: DEFAULT_IMG,
            access: day.open ? [me] : [],
        };
    }
    return result;
}
```

`DayCell` уже умеет рисовать замок: он смотрит, есть ли я в `access`. У закрытого дня `access: []`, значит будет замок.

## 🔹 Шаг 15. Убираем фейковых друзей: `src/data/useFakeStore.ts`

Из «пульта» уходят друзья и заявки в друзья. Остаются только доступы и запросы доступа (до этапа 8). Файл целиком:

```ts
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
```

## 🔹 Шаг 16. Панель друзей: `src/components/FriendsPanel.tsx`

Что меняется:

- заявки в друзья приходят пропом `incoming` с сервера;
- поиск сам ходит на сервер через `useUserSearch`, а статус человека берёт из `relation`;
- у каждого друга появилась кнопка «✕» (удалить из друзей).

Файл целиком:

```tsx
import { useState } from 'react';
import type { AccessRequest, UserId, WishesByDate } from '../types';
import type { FriendRequestDto, UserSearchDto } from '../api/friends';
import { useUserSearch } from '../api/useFriends';
import { USERS, fakeIdFor } from '../data/fakeData';
import { formatDate } from '../lib/dates';
import { Avatar } from './Avatar';

type Props = {
    me: UserId;
    owner: UserId;
    myFriends: UserId[];
    myWishes: WishesByDate;
    incoming: FriendRequestDto[];           // заявки в друзья, которые пришли мне
    accessRequests: AccessRequest[];
    onOpenCalendar: (id: UserId) => void;
    onAddFriend: (serverId: number) => void;
    onAccept: (request: FriendRequestDto) => void;
    onDecline: (request: FriendRequestDto) => void;
    onRemoveFriend: (id: UserId) => void;
    onGrant: (from: UserId, date: string) => void;
    onDeny: (from: UserId, date: string) => void;
};

export function FriendsPanel(props: Props) {
    const { me, owner, myFriends, myWishes, incoming, accessRequests } = props;
    const [query, setQuery] = useState('');

    const incomingAccess = accessRequests.filter(r => r.owner === me);

    return (
        <aside className="card side" id="side" aria-label="Друзья">
            <h2>Друзья</h2>

            <div>
                <h3><label htmlFor="search">Найти человека</label></h3>
                <input className="field" id="search" type="search" placeholder="Имя" autoComplete="off"
                       value={query} onChange={e => setQuery(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                    <SearchResults query={query} onAddFriend={props.onAddFriend} />
                </div>
            </div>

            <div>
                <h3>Заявки в друзья<Count n={incoming.length} /></h3>
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
                        <div className="row" key={id}>
                            <button className="friend row" aria-current={owner === id}
                                    onClick={() => props.onOpenCalendar(id)}>
                                <Avatar user={USERS[id]} large />
                                <span className="grow">{USERS[id].name}<small>Открыть календарь</small></span>
                            </button>
                            <button className="btn sm ghost" title="Удалить из друзей"
                                    aria-label={`Удалить ${USERS[id].name} из друзей`}
                                    onClick={() => props.onRemoveFriend(id)}>✕</button>
                        </div>
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
```

- `useUserSearch(query)` стоит **первой строкой** в `SearchResults`, до всех `return`. Правило React: хуки вызываются всегда в одном порядке,
  нельзя вызвать хук после раннего `return` (**правила хуков**, rules of hooks).
- `switch (user.relation)` — выбор по значению: для каждого статуса своя надпись, а для `NONE` (`default`) — кнопка.
- Кнопку «✕» нельзя положить **внутрь** кнопки друга: в HTML кнопка внутри кнопки запрещена. Поэтому обе кнопки стоят рядом в `div.row`.

## 🔹 Шаг 17. `src/App.tsx`: друзья и календарь друга с сервера

Что меняется:

- `owner` теперь не состояние, а **вычисляется**: выбрали друга, но его удалили из друзей → показываем свой календарь.
  Само состояние переименовали в `selected` («кого выбрали»);
- друзья, заявки и календарь друга загружаются хуками из `useFriends.ts`;
- `wishesOf(id)` заменили на две переменные: `myWishes` и `ownerWishes`;
- надпись «Загружаю желания…» теперь показывается и для календаря друга.

Файл целиком:

```tsx
import { useEffect, useState } from 'react';
import type { UserId, Wish } from './types';
import type { FriendRequestDto } from './api/friends';
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

  const badge = incoming.length + store.accessRequests.filter(r => r.owner === me).length;

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
    saveMutation.mutate({ date, input: { title: wish.title, comment: wish.comment } }, {
      onSuccess: () => {
        store.saveWish(date, wish);  // картинку и доступ пока помнит браузер
        done('Сохранено');
      },
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
              me={me} owner={owner} myFriends={myFriends} myWishes={myWishes}
              incoming={incoming} accessRequests={store.accessRequests}
              onOpenCalendar={openCalendar}
              onAddFriend={addFriend}
              onAccept={acceptFriend}
              onDecline={declineFriend}
              onRemoveFriend={removeFriend}
              onGrant={(id, date) => { store.setAccess(date, id, true); toast.showToast(`${USERS[id].name} теперь видит ${formatDate(date)}`); }}
              onDeny={(id, date) => { store.denyAccess(id, date); toast.showToast('В доступе отказано'); }}
          />
        </main>

        {/* key: при открытии другого дня окно создаётся заново с чистой формой */}
        {openDay && (
            <DayModal
                key={owner + openDay.date}
                date={openDay.date} me={me} owner={owner}
                wish={ownerWishes[openDay.date]}
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
```

- `dateKey(month.year, month.month, 1).slice(0, 7)` — `'2026-10-01'` → `'2026-10'`. `slice(0, 7)` — первые 7 символов.
- `USERS[owner].serverId` — переводим `'boris'` → `2`, потому что сервер знает Бориса как `2`.
- `confirm(...)` — стандартное окно браузера «ОК / Отмена». Если нажать «Отмена», функция вернёт `false`, и мы ничего не удаляем.
- `loading.error` — `null`, если ошибки нет. Поэтому `loading.error ? ... : undefined` безопасно.

## 🔹 Шаг 17.1. Исправление из этапа 6: 403 при входе после «Выйти»

**Что было:** после «Выйти» первое нажатие «Войти» давало «Ошибка сервера: 403», а второе срабатывало.

**Почему:** при выходе сервер **стирает** cookie `XSRF-TOKEN`. Фронт после выхода больше ничего у сервера не спрашивает,
поэтому новый токен не появляется. Первый вход уходит без заголовка `X-XSRF-TOKEN`, CSRF-защита отвечает `403`
и только в этом ответе присылает новый токен. Поэтому второе нажатие уже работает.

**Исправление** в `src/api/useAuth.ts`, в `useLogout`: сразу после выхода спрашиваем «кто я» ещё раз.
Ответ будет `401`, но вместе с ним придёт свежий токен.

```ts
        onSuccess: async () => {
            // 0. При выходе сервер стёр cookie XSRF-TOKEN. Спрашиваем «кто я» ещё раз:
            //    ответ будет 401, но вместе с ним сервер пришлёт новый токен для следующего входа
            await fetchMe();
            // 1. «Я — никто». RequireAuth это увидит и сам отправит на /login
            queryClient.setQueryData(ME, null);
            // 2. Забываем всё остальное о прошлом пользователе (его желания и т. д.)
            queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
        },
```

`fetchMe` уже импортирован в этом файле из `./auth`. `async` и `await` нужны, чтобы дождаться нового токена и только потом показать страницу входа.

## 🔹 Шаг 18. Проверь всё руками

Чтобы быть одновременно двумя людьми, нужны два **разных** набора cookie: открой второе окно в режиме **инкогнито** (Ctrl+Shift+N)
или другой браузер.

1. `docker compose up -d`, запусти `BackendApplication`, в папке `frontend` — `npm run dev`.
2. **Окно 1: войди как Анна.** Справа: заявка от Вики, в «Мои друзья» Борис. На кнопке «Друзья» в шапке красный кружок.
3. Нажми «Календарь Бориса» → его день с замком. Названия нет. Открой **F12 → Network** → запрос `calendars/2?month=...` → в ответе `"title": null`.
4. Прими заявку Вики → вверху появился чип «Календарь Вики», кружок в шапке уменьшился.
5. **Окно 2 (инкогнито): войди как Борис.** Набери в поиске «ви» → Вика, «Добавить в друзья». Нажми → надпись «Заявка отправлена».
6. Выйди и войди как Вика (в том же окне 2). Заявка от Бориса видна. Нажми «Отклонить».
7. **Окно 1 (Анна):** нажми «✕» у Вики → «ОК». Чип «Календарь Вики» пропал. Если был открыт её календарь, вернулся твой.
8. Обнови окно 2 (Вика) → в «Мои друзья» пусто.
9. Набери в адресной строке `http://localhost:5173/api/calendars/3?month=2026-10`, будучи Анной → `403`.

💡 Новая заявка появится у получателя не мгновенно, а когда он обновит страницу или вернётся во вкладку
(TanStack Query сам перезапрашивает данные при возврате в окно, это называется **refetchOnWindowFocus**).

## 🔹 Шаг 19. Проверка сборки и линтера

В папке `frontend`:

```
npm run build
npm run lint
```

## 🔹 Шаг 20. Сохрани в Git

В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 7: друзья, заявки, поиск, календарь друга с сервера"
```

## 🔹 Частые проблемы

| Что видишь | Почему | Что сделать |
|---|---|---|
| Сервер не стартует: `Validate failed: Migrations have failed validation` | поменял уже выполненный `V1` или `V2` | верни старый файл как был. Новое — только в `V3` |
| `Schema-validation: missing table [friendships]` | Flyway не увидел `V3` | имя файла ровно `V3__friends.sql` (два подчёркивания), папка `db/migration` |
| `No property 'userAId' found` | опечатка в имени поля или метода | поле в `Friendship` должно называться `userAId`, метод — `existsByUserAIdAndUserBId` |
| `403` на `POST` и `DELETE` в Postman | нет заголовка `X-XSRF-TOKEN` или токен старый | после входа/выхода заново `GET /api/me` и скопируй свежий токен |
| `403` «Календарь могут смотреть только друзья» на своего друга | пара в базе записана наоборот или не записана | `select * from friendships;` — должно быть `user_a_id < user_b_id` |
| Поиск по-русски ничего не находит | текст ушёл без кодирования | в `searchUsers` должен быть `encodeURIComponent(q)` |
| Во фронте `Property 'serverId' is missing` | не добавил `serverId` в `USERS` или в `fakeIdFor` | сверь `fakeData.ts` с шагом 11.2 |
| `Cannot find name 'setOwner'` | осталось старое имя состояния | в `App.tsx` теперь `selected` / `setSelected`, сверь с шагом 17 |

## 🔹 Созданные и изменённые файлы

```
backend/
└── src/main/
    ├── resources/db/migration/
    │   └── V3__friends.sql                   ← новый: friendships, friend_requests, тестовые данные
    └── java/com/adventcalendar/calendar/
        ├── friend/                           ← новый пакет
        │   ├── Friendship.java               дружба (пара один раз, a < b)
        │   ├── FriendRequest.java            заявка
        │   ├── FriendRequestStatus.java      PENDING / ACCEPTED / DECLINED
        │   ├── FriendshipRepository.java     есть ли пара, удалить, мои друзья
        │   ├── FriendRequestRepository.java  входящие, исходящие, поиск заявки
        │   ├── FriendService.java            все правила дружбы
        │   ├── FriendController.java         /api/users/search, /api/friends, /api/friend-requests
        │   ├── FriendResponse.java, FriendRelation.java, UserSearchResponse.java
        │   ├── FriendRequestResponse.java, NewFriendRequest.java
        │   └── FriendRequestException.java, FriendRequestNotFoundException.java, NotFriendsException.java
        ├── user/UserRepository.java          + поиск по имени
        ├── user/UserNotFoundException.java   ← новый
        ├── wish/WishRepository.java          + желания за месяц
        ├── wish/WishService.java             + calendar (проверка «друг или нет»)
        ├── wish/CalendarController.java      ← новый: /api/calendars/{userId}
        ├── wish/CalendarDayResponse.java     ← новый: открытый / закрытый день
        └── error/GlobalExceptionHandler.java + 404, 409, 403

frontend/src/
├── types.ts                                  + serverId, − FriendRequest
├── App.tsx                                   друзья, заявки, календарь друга с сервера
├── api/friends.ts                            ← новый: запросы
├── api/useFriends.ts                         ← новый: хуки
├── api/toWishesByDate.ts                     + toFriendWishes
├── components/FriendsPanel.tsx               поиск и заявки с сервера, кнопка «✕»
├── data/fakeData.ts                          + serverId, новый fakeIdFor, − фейковые друзья
└── data/useFakeStore.ts                      − друзья и заявки
```

## Главное, что нужно запомнить

- Взаимную связь (дружбу) храним **одной строкой** с правилом `user_a_id < user_b_id`. Правило проверяет сама база (`CHECK`).
- Статус заявки — это `enum`, в базе храним его **текстом** (`@Enumerated(EnumType.STRING)`).
- «Можно ли» всегда решает **сервер**: чужую заявку не принять (`404`), чужой календарь не открыть (`403`).
- Скрытое содержимое сервер **не отправляет вовсе**. Спрятанное только во фронте видно в F12.
- После изменения данных делаем `invalidateQueries`, и TanStack Query сам загружает свежий список.
