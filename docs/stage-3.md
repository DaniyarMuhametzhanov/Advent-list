# Этап 3. База данных

## 🔹 Что делаем и зачем

На этапе 2 желания жили в памяти программы и **пропадали после перезапуска**.
Теперь положим их в настоящую базу данных (**PostgreSQL**). Данные будут храниться на диске
и переживут любой перезапуск.

Что появится:

1. **PostgreSQL в Docker.** Docker — это как готовая коробка с программой внутри (**контейнер**).
   Не нужно ставить PostgreSQL на компьютер: одна команда, и база запущена.
2. **Таблицы через миграции.** Таблицы создаём не руками, а пронумерованными SQL-файлами (**миграции**),
   которые запускает библиотека **Flyway**.
3. **Java-классы, связанные с таблицами** (**JPA-сущности**). Класс `Wish` ↔ таблица `wishes`.
4. **Тестовые данные** (**seed**): пользователи Анна, Борис и Вика и несколько их желаний.

Хорошая новость: благодаря слоям из этапа 2 **контроллер и DTO не меняются**.
Меняются модель, репозиторий и немного сервис.

> У тебя Spring Boot 4.1 и пакет `com.adventcalendar.calendar`. Весь код ниже собран и проверен
> на настоящем PostgreSQL именно под это.

## 🔹 Как это устроено

```
WishController   (не меняется)
   │
   ▼
WishService      (чуть меняется: транзакции, «чьё» желание)
   │
   ▼
WishRepository   (было: Map в памяти → стало: интерфейс Spring Data JPA)
   │
   ▼
Hibernate        переводит Java-объекты в SQL-запросы (ORM)
   │
   ▼
PostgreSQL       в Docker-контейнере, данные на диске
```

Аналогия 📚: база данных — это библиотека, таблица — это шкаф, строка — это одна книга.
**Миграции** — это журнал перестановок в библиотеке: «шаг 1 — поставили шкаф users, шаг 2 — поставили книги».
Flyway читает журнал и делает только те шаги, которых ещё не было.

## 🔹 Шаг 1. Запусти PostgreSQL в Docker

Открой **Docker Desktop** и подожди, пока внизу слева станет зелёным «Engine running».

В **корне проекта** (папка `advent-list`, рядом с `README.md`) создай файл `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    container_name: advent-postgres
    environment:
      POSTGRES_DB: advent
      POSTGRES_USER: advent
      POSTGRES_PASSWORD: advent
    ports:
      - "5433:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

Разбор:
- `image: postgres:17` — какую «коробку» взять: официальный PostgreSQL версии 17 (**образ**).
- `container_name` — имя запущенной коробки, чтобы легко её находить.
- `environment` — настройки при первом запуске: создать базу `advent`, пользователя `advent` с паролем `advent`.
  Это пароль **только для твоего компьютера**. Для настоящего сервера будут другие, секретные (этап 14).
- `ports: "5433:5432"` — дверь наружу: порт **5433** на твоём компьютере ведёт в порт 5432 внутри контейнера.
  Почему 5433, а не стандартный 5432: на твоём Windows уже установлен свой PostgreSQL (с паролем `123`),
  и он занимает 5432. Так два PostgreSQL не мешают друг другу. Наш проект работает **только** с Docker-базой.
- `volumes` — папка на диске, где Docker хранит файлы базы (**том**, volume). Без неё данные пропадали бы
  при удалении контейнера.

Запусти. В терминале IntelliJ в папке `advent-list`:

```
docker compose up -d
```

`-d` значит «работай в фоне» (**detached**), чтобы терминал не был занят.

Проверь, что база работает:

```
docker compose ps
```

В строке `advent-postgres` должно быть `Up`. ✅

## 🔹 Шаг 2. Добавь библиотеки

Открой `backend/pom.xml`. В блок `<dependencies>`, **перед** `spring-boot-starter-webmvc-test`, добавь:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-jpa</artifactId>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-flyway</artifactId>
		</dependency>
		<dependency>
			<groupId>org.flywaydb</groupId>
			<artifactId>flyway-database-postgresql</artifactId>
		</dependency>
		<dependency>
			<groupId>org.postgresql</groupId>
			<artifactId>postgresql</artifactId>
			<scope>runtime</scope>
		</dependency>
```

Что это:
- `spring-boot-starter-data-jpa` — работа с базой через Java-объекты (**JPA**, внутри **Hibernate**)
  и готовые репозитории (**Spring Data JPA**).
- `spring-boot-starter-flyway` — запуск миграций при старте сервера.
- `flyway-database-postgresql` — «переводчик» Flyway именно для PostgreSQL. Без него Flyway скажет,
  что такую базу не поддерживает.
- `postgresql` — драйвер: программа, через которую Java разговаривает с PostgreSQL (**JDBC-драйвер**).
  `runtime` — нужен только при запуске, в коде мы его напрямую не используем.

Версии писать не нужно: их подбирает Spring Boot (родитель в начале `pom.xml`).

Нажми 🔄 **Load Maven Changes** справа вверху.

## 🔹 Шаг 3. Скажи серверу, где база

Открой `backend/src/main/resources/application.properties` и сделай его таким:

```properties
spring.application.name=backend

spring.datasource.url=jdbc:postgresql://localhost:5433/advent
spring.datasource.username=advent
spring.datasource.password=advent

spring.jpa.hibernate.ddl-auto=validate
spring.jpa.open-in-view=false
```

Разбор:
- `spring.datasource.url` — адрес базы: PostgreSQL в Docker на твоём компьютере (`localhost`), порт `5433`, база `advent`.
- `username` / `password` — те же, что в `docker-compose.yml`.
- `ddl-auto=validate` — важная строка. Hibernate умеет сам создавать таблицы, но мы ему **запрещаем**.
  Таблицы создаёт только Flyway. Hibernate лишь **проверяет** при старте, что Java-классы совпадают с таблицами.
  Если не совпадают — сервер не запустится и сразу скажет, где ошибка. Лучше упасть при старте, чем потом.
- `open-in-view=false` — не держать связь с базой открытой, пока формируется ответ.
  Все запросы к базе делаем в сервисе, а не «случайно» в контроллере.

## 🔹 Шаг 4. Миграция 1: создаём таблицы

Создай папки `backend/src/main/resources/db/migration/`.
В ней создай файл **`V1__create_users_and_wishes.sql`**.

⚠️ Имя важно: `V1` + **два** подчёркивания `__` + описание. По номеру Flyway понимает порядок.

```sql
CREATE TABLE users (
    id            BIGSERIAL    PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE wishes (
    id         BIGSERIAL     PRIMARY KEY,
    owner_id   BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    wish_date  DATE          NOT NULL,
    title      VARCHAR(100)  NOT NULL,
    comment    VARCHAR(1000),
    created_at TIMESTAMPTZ   NOT NULL,
    updated_at TIMESTAMPTZ   NOT NULL,
    CONSTRAINT uq_wishes_owner_date UNIQUE (owner_id, wish_date)
);
```

Разбор по словам:
- `BIGSERIAL PRIMARY KEY` — номер строки, база сама даёт 1, 2, 3… (**первичный ключ**, **автоинкремент**).
- `NOT NULL` — поле обязательно, пустым быть не может.
- `UNIQUE` на `email` — два пользователя с одной почтой невозможны. Это проверяет сама база.
- `REFERENCES users (id)` — `owner_id` обязан указывать на существующего пользователя (**внешний ключ**).
- `ON DELETE CASCADE` — удалили пользователя → его желания удалятся автоматически.
- `TIMESTAMPTZ` — дата и время с учётом часового пояса.
- `UNIQUE (owner_id, wish_date)` — **одно желание на один день у одного пользователя**.
  Это правило из задания, и теперь его охраняет база, даже если в коде будет ошибка.

Почему колонка называется `wish_date`, а не `date`: `DATE` — это ещё и название типа в SQL.
Так можно, но легко запутаться. В Java поле всё равно будет называться `date`.

Почему нет картинки (`image_key`) и друзей: добавим их **новыми миграциями** на этапах 7–9.
Так ты увидишь, как база меняется со временем.

## 🔹 Шаг 5. Миграция 2: тестовые данные

Рядом создай **`V2__seed_test_data.sql`**:

```sql
-- Тестовые пользователи. Пароль у всех: password123 (здесь лежит его BCrypt-хеш)
INSERT INTO users (name, email, password_hash) VALUES
    ('Анна',  'anna@example.com',  '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G'),
    ('Борис', 'boris@example.com', '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G'),
    ('Вика',  'vika@example.com',  '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G');

-- Желания Анны
INSERT INTO wishes (owner_id, wish_date, title, comment, created_at, updated_at) VALUES
    (1, '2026-10-05', 'Книга «Маленький принц»', 'Лучше в твёрдой обложке', now(), now()),
    (1, '2026-10-12', 'Билеты в кино',           'На вечерний сеанс',       now(), now()),
    (1, '2026-10-24', 'Тёплый шарф',             NULL,                      now(), now());

-- Желания Бориса и Вики
INSERT INTO wishes (owner_id, wish_date, title, comment, created_at, updated_at) VALUES
    (2, '2026-10-08', 'Настольная игра',         'Что-нибудь на компанию',  now(), now()),
    (3, '2026-10-15', 'Набор для рисования',     'Акварель',                now(), now());
```

Разбор:
- Пароль хранится не как текст, а как **хеш**: необратимая «мешанина» из пароля (**BCrypt**).
  Из хеша нельзя получить пароль обратно. Вход по паролю `password123` заработает на этапе 6.
- Анна получит `id = 1`, Борис `2`, Вика `3`, потому что база раздаёт номера по порядку.

> Тестовые данные лежат в обычной миграции, чтобы было проще. Перед публикацией (этап 14)
> уберём их из «боевой» базы, чтобы на настоящем сайте не было Анны с паролем `password123`.

## 🔹 Шаг 6. Сущность «пользователь»

Создай пакет `user` (рядом с `wish`) и в нём `User.java`:

```java
package com.adventcalendar.calendar.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected User() {
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
```

Разбор:
- `@Entity` — «этот класс связан с таблицей» (**сущность**).
- `@Table(name = "users")` — с какой именно таблицей.
- `@Id` + `@GeneratedValue(IDENTITY)` — это первичный ключ, номер даёт сама база (наш `BIGSERIAL`).
- `@Column(name = "password_hash")` — в Java поле `passwordHash`, а в таблице `password_hash`.
  Если имя совпадает по смыслу, `name` можно не писать: Hibernate сам переводит `createdAt` → `created_at`,
  но мы пишем явно, чтобы было видно.
- `protected User()` — пустой **конструктор**. Он нужен Hibernate: он сначала создаёт пустой объект,
  потом заполняет поля из строки таблицы. `protected` — чтобы мы сами случайно не создали «пустого» пользователя.
- `@PrePersist` — метод, который Hibernate вызывает **перед первой записью** в базу (**колбэк жизненного цикла**).
- Сеттеров нет специально: менять поля можно только через понятные методы. Это **инкапсуляция**.

⚠️ Почему это **класс**, а не `record`, как на этапе 2: Hibernate должен создавать объект пустым и
менять поля. `record` неизменяемый, поэтому сущностью быть не может. А вот DTO (`WishResponse`)
остаются `record`.

Там же создай `UserRepository.java`:

```java
package com.adventcalendar.calendar.user;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
}
```

Это **интерфейс без кода**, и он уже умеет `findById`, `findAll`, `save`, `delete`.
Spring сам пишет реализацию при запуске. `<User, Long>` — «работаем с `User`, ключ у него типа `Long`».

## 🔹 Шаг 7. Сущность «желание»

Открой `wish/Wish.java` и **замени всё** содержимое:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "wishes")
public class Wish {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "wish_date", nullable = false)
    private LocalDate date;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(length = 1000)
    private String comment;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Wish() {
    }

    public Wish(User owner, LocalDate date) {
        this.owner = owner;
        this.date = date;
    }

    public void update(String title, String comment) {
        this.title = title;
        this.comment = comment;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getOwner() {
        return owner;
    }

    public LocalDate getDate() {
        return date;
    }

    public String getTitle() {
        return title;
    }

    public String getComment() {
        return comment;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
```

Разбор нового:
- `@ManyToOne` — «много желаний принадлежат одному пользователю». Это связь между объектами (**ассоциация**).
  В Java у желания есть поле `owner` типа `User`, а в таблице — просто число `owner_id`.
- `@JoinColumn(name = "owner_id")` — через какую колонку идёт связь.
- `fetch = FetchType.LAZY` — «ленивая загрузка»: не доставать пользователя из базы, пока он реально не понадобился.
  Экономит запросы.
- `public Wish(User owner, LocalDate date)` — создать желание можно только сразу с владельцем и датой.
  Без них желание не имеет смысла.
- `update(title, comment)` — единственный способ поменять название и комментарий.
- `@PreUpdate` — вызывается **перед каждым изменением** строки. Так `updatedAt` всегда свежий,
  и не нужно помнить об этом в сервисе.

## 🔹 Шаг 8. Репозиторий: вместо Map — интерфейс

Открой `wish/WishRepository.java` и **замени всё**:

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
}
```

Было 40 строк с `Map` и счётчиком, стало 3 строчки. Магия здесь в **именах методов**
(**derived queries**, запросы по имени метода). Spring читает имя и сам пишет SQL:

| Имя метода | Что Spring понимает |
|---|---|
| `findAllByOwnerIdOrderByDateAsc` | найти все, где `owner.id = ?`, отсортировать по дате по возрастанию |
| `findByIdAndOwnerId` | найти одно, где `id = ?` **и** `owner.id = ?` |
| `findByOwnerIdAndDate` | найти одно, где `owner.id = ?` **и** `date = ?` |

`OwnerId` Spring читает как «поле `owner`, а у него поле `id`».
Если ошибёшься в имени (например, `findByOwnerID`), сервер **не запустится** и скажет, какое слово не понял.

## 🔹 Шаг 9. DTO ответа: геттеры вместо полей

Открой `wish/WishResponse.java` и **замени всё** содержимое (внутри меняется только строка в методе `from`):

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;

public record WishResponse(
        Long id,
        LocalDate date,
        String title,
        String comment
) {

    public static WishResponse from(Wish wish) {
        return new WishResponse(wish.getId(), wish.getDate(), wish.getTitle(), wish.getComment());
    }
}
```

Раньше `Wish` был `record`, и мы писали `wish.id()`. Теперь это обычный класс с геттерами: `wish.getId()`.

⚠️ Если в файле останется только метод `from` без `public record WishResponse(...) { }` вокруг, Java решит,
что это безымянный класс-скрипт (**компактный исходный файл**), и в сервисе появится
`Cannot resolve symbol 'WishResponse'`.

## 🔹 Шаг 10. Сервис: транзакции и «чьё» желание

Открой `wish/WishService.java` и **замени всё**:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    // Входа пока нет (он будет на этапе 6), поэтому «я» — это Анна с id = 1
    private static final Long CURRENT_USER_ID = 1L;

    private final WishRepository wishRepository;
    private final UserRepository userRepository;

    public WishService(WishRepository wishRepository, UserRepository userRepository) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll() {
        return wishRepository.findAllByOwnerIdOrderByDateAsc(CURRENT_USER_ID).stream()
                .map(WishResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long id) {
        return wishRepository.findByIdAndOwnerId(id, CURRENT_USER_ID)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(CURRENT_USER_ID, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(CURRENT_USER_ID), date));
        wish.update(request.title(), request.comment());
        return WishResponse.from(wishRepository.save(wish));
    }

    @Transactional
    public void delete(Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, CURRENT_USER_ID)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }
}
```

Разбор:
- `CURRENT_USER_ID = 1L` — **временная заглушка**. Пока нет входа, все запросы делает «Анна».
  На этапе 6 здесь будет настоящий вошедший пользователь.
- `@Transactional` — всё внутри метода выполняется **как одно целое** (**транзакция**).
  Аналогия 🏦: перевод денег. Списать с одного счёта и зачислить на другой — либо оба шага, либо ни одного.
  Если посреди метода случится ошибка, база откатит всё, что метод успел сделать.
- `readOnly = true` — «здесь только читаем». Подсказка базе и Hibernate, что можно не следить за изменениями.
- `findByIdAndOwnerId(id, CURRENT_USER_ID)` — ищем желание **с этим номером И моё**.
  Желание Бориса (id = 4) для Анны «не найдено», хотя в базе оно есть.
  Это первый кирпичик правил доступа: сервер не отдаёт чужое.
- `getReferenceById(1)` — получить «ссылку» на пользователя без лишнего запроса к базе (**прокси**).
  Нам нужен только его `id`, чтобы записать в `owner_id`.
- `saveForDate`: нашли желание на эту дату — обновляем; не нашли — создаём новое. Потом `update(...)`
  в обоих случаях, поэтому код не повторяется.

`WishController`, `WishRequest`, `WishNotFoundException` и `GlobalExceptionHandler` **не трогаем**. ✅

## 🔹 Шаг 11. Запусти и проверь

1. Проверь, что база в Docker работает: `docker compose ps` → `Up`.
2. Запусти `BackendApplication` (▶ в IntelliJ).

В логе (окно Run) найди строки Flyway:

```
Migrating schema "public" to version "1 - create users and wishes"
Migrating schema "public" to version "2 - seed test data"
Successfully applied 2 migrations to schema "public", now at version v2
```

Значит, таблицы созданы и данные залиты. ✅

### Проверка в Postman

**1. Все мои желания**
- `GET` `http://localhost:8080/api/wishes`
- Ожидаем `200` и три желания **Анны**: «Маленький принц» (id 1), «Билеты в кино» (id 2), «Тёплый шарф» (id 3).
  Желаний Бориса и Вики здесь нет.

**2. Чужое желание**
- `GET` `http://localhost:8080/api/wishes/4`
- Ожидаем `404` и `"detail": "Желание с id 4 не найдено"`. Это желание Бориса, Анне его не видно.

**3. Новое желание**
- `PUT` `http://localhost:8080/api/wishes/2026-10-30`
- Вкладка **Body** → **raw** → справа **JSON**:

```json
{
  "title": "Наушники",
  "comment": "беспроводные"
}
```

- Ожидаем `200` и `"id": 6`.

**4. Замена в тот же день**
- Тот же `PUT` на `2026-10-30`, тело: `{ "title": "Наушники с шумодавом" }`
- Ожидаем `200`, **тот же** `"id": 6`, новое название, `"comment": null`.

**5. Удаление**
- `DELETE` `http://localhost:8080/api/wishes/2`
- Ожидаем `204` и пустой ответ.

**6. Главная проверка: данные не пропадают** 🎯
- Останови сервер (■) и запусти снова.
- В логе теперь: `Schema "public" is up to date. No migration necessary.` (Flyway помнит, что уже всё сделал.)
- `GET` `http://localhost:8080/api/wishes` → желания 1, 3 и 6 на месте, а 2 нет. На этапе 2 здесь был бы `[]`.

**7. Ошибки работают как раньше**
- `PUT` с телом `{ "title": "" }` → `400` и `"Название обязательно"`.

### Посмотреть на саму базу (по желанию)

```
docker exec -it advent-postgres psql -U advent -d advent
```

Внутри можно писать SQL:

```sql
SELECT id, owner_id, wish_date, title FROM wishes ORDER BY id;
SELECT version, description FROM flyway_schema_history;
```

Вторая таблица — это **журнал Flyway**: какие миграции уже выполнены. Выход: `\q`.

### Частые ошибки

- `Connection to localhost:5433 refused` — база не запущена. Открой Docker Desktop и `docker compose up -d`.
- `password authentication failed for user "advent"` — сервер постучался в домашний PostgreSQL вместо Docker-базы.
  Проверь, что в `application.properties` порт `5433`, как в `docker-compose.yml`.
- `port is already allocated` при `docker compose up` — порт 5433 тоже занят. Возьми другой, например `"5434:5432"`,
  и такой же порт в `application.properties`.
- `Schema-validation: missing column [...]` или `missing table [...]` — Java-класс не совпадает с таблицей.
  Проверь имена в `@Column(name = ...)` и в SQL. Это сработал `ddl-auto=validate`.
- `No database found to handle jdbc:postgresql` — забыл `flyway-database-postgresql` в `pom.xml`.
- `Validate failed: Migration checksum mismatch for migration version 1` — ты **изменил** уже выполненную миграцию.
  Правило: выполненные миграции **не меняют**, а пишут новую `V3__...`. Сейчас, пока данные тестовые,
  можно просто стереть базу: `docker compose down -v` (флаг `-v` удаляет том с данными) и `docker compose up -d`.
- `No property 'ownerID' found` — опечатка в имени метода репозитория. Регистр букв важен.
- Тест `BackendApplicationTests` падает при `mvnw test` — для него теперь тоже нужна запущенная база.
  На этапе 10 тесты будут сами поднимать базу (**Testcontainers**).

## 🔹 Шаг 12. Сохрани в Git

Останови сервер (■). В терминале в папке `advent-list`:

```
git add .
git status
git commit -m "Этап 3: PostgreSQL в Docker, JPA-сущности, миграции Flyway, тестовые данные"
```

В `git status` должен быть виден `docker-compose.yml`. Файлов самой базы там быть не должно:
они живут в томе Docker, а не в папке проекта.

## 🔹 Созданные и изменённые файлы

```
docker-compose.yml                                (новый: PostgreSQL)
backend/pom.xml                                   (изменён: + JPA, Flyway, драйвер PostgreSQL)
backend/src/main/resources/
├── application.properties                        (изменён: адрес базы, validate)
└── db/migration/
    ├── V1__create_users_and_wishes.sql           таблицы
    └── V2__seed_test_data.sql                    Анна, Борис, Вика и их желания
backend/src/main/java/com/adventcalendar/calendar/
├── user/
│   ├── User.java                  сущность пользователя (новый)
│   └── UserRepository.java        репозиторий пользователей (новый)
└── wish/
    ├── Wish.java                  record → JPA-сущность
    ├── WishRepository.java        Map в памяти → интерфейс Spring Data
    ├── WishResponse.java          wish.id() → wish.getId()
    └── WishService.java           транзакции, «моё» желание
```

## Главное, что нужно запомнить

- Таблицы создают **миграции Flyway**, а не Hibernate. Выполненную миграцию не меняют, а пишут следующую `V3__...`.
- `ddl-auto=validate`: Hibernate только проверяет, что классы совпадают с таблицами, и не даёт серверу запуститься при расхождении.
- Сущность (`@Entity`) — это класс, связанный с таблицей. Репозиторий Spring Data — интерфейс, а SQL Spring строит по имени метода.
- `@Transactional` — «всё или ничего»: при ошибке база откатывает изменения метода.
- Важные правила (одно желание в день, почта уникальна) защищаем **в самой базе** (`UNIQUE`), а не только в коде.
