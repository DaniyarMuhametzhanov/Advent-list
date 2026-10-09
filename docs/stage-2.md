# Этап 2. Желания без БД

## 🔹 Что делаем и зачем

Учим сервер работать с желаниями: создавать, читать, менять и удалять.
Эти четыре действия вместе называют **CRUD** (Create, Read, Update, Delete).

Базы данных пока нет. Желания лежат в памяти программы и **пропадают после перезапуска**.
Так специально: сначала разберёмся, как устроен код, а базу подключим на этапе 3.
Благодаря слоям (ниже) на этапе 3 поменяется только одно место, хранилище.

Пользователей тоже пока нет. Считаем, что все желания принадлежат «мне».

## 🔹 Слои: кто за что отвечает

Аналогия с рестораном 🍽️:

- **Официант** принимает заказ и приносит блюдо. Он не готовит. Это **контроллер** (`controller`).
- **Повар** знает рецепт: что и в каком порядке делать. Это **сервис** (`service`), здесь живёт логика (**бизнес-логика**).
- **Холодильник** просто хранит продукты. Это **репозиторий** (`repository`), он только сохраняет и достаёт данные.

```
Запрос из сети
   │
   ▼
WishController   — принял запрос, проверил данные, вернул ответ
   │
   ▼
WishService      — решил, что делать (создать новое или обновить старое)
   │
   ▼
WishRepository   — сохранил / нашёл / удалил
```

Каждый слой разговаривает только с соседним. Контроллер не лезет в хранилище напрямую.

## 🔹 Какие адреса будут

| Метод | Адрес | Что делает |
|-------|-------|-----------|
| GET | `/api/wishes` | все мои желания |
| GET | `/api/wishes/{id}` | одно желание по номеру |
| PUT | `/api/wishes/{date}` | положить желание в день (или заменить, если там уже есть) |
| DELETE | `/api/wishes/{id}` | удалить желание |

Почему PUT по дате: в один день может быть только одно желание. Повторный PUT в тот же день
не создаёт второе, а заменяет первое. Такой запрос можно повторять сколько угодно, результат один и тот же
(**идемпотентность**).

Пакет для кода: рядом с `health` создай пакеты `wish` и `error`:

```
backend/src/main/java/com/adventcalendar/calendar/
├── BackendApplication.java
├── health/HealthController.java
├── wish/          ← всё про желания
└── error/         ← обработчик ошибок
```

> У тебя Spring Boot 4.1 и пакет `com.adventcalendar.calendar`. Весь код ниже написан и проверен именно под это.

## 🔹 Шаг 1. Добавь библиотеку для проверки данных

Открой `backend/pom.xml`. В блок `<dependencies>`, сразу после `spring-boot-starter-webmvc`, добавь:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-validation</artifactId>
		</dependency>
```

Это библиотека проверки входящих данных (**Bean Validation**). Она даст пометки вроде `@NotBlank` («не пусто»).

После сохранения в IntelliJ справа вверху появится значок Maven 🔄 (**Load Maven Changes**). Нажми его,
чтобы библиотека скачалась.

## 🔹 Шаг 2. Модель: само желание

В пакете `wish` создай `Wish.java`:

```java
package com.adventcalendar.calendar.wish;

import java.time.Instant;
import java.time.LocalDate;

public record Wish(
        Long id,
        LocalDate date,
        String title,
        String comment,
        Instant createdAt,
        Instant updatedAt
) {

    public Wish withId(Long newId) {
        return new Wish(newId, date, title, comment, createdAt, updatedAt);
    }
}
```

По шагам:
1. `record` — короткий способ описать класс, который просто хранит данные (**record**, «запись»).
   Java сама создаёт конструктор и методы чтения: `wish.title()`, `wish.date()`.
2. Поля record нельзя поменять после создания (**неизменяемый объект**). Чтобы «изменить», создаём новый объект.
3. `LocalDate` — дата без времени (`2026-12-01`). `Instant` — точный момент времени (когда создали и изменили).
4. `withId(...)` — делает копию желания с новым номером. Пригодится в хранилище.

Это **модель** (**сущность**): так желание выглядит внутри сервера.

## 🔹 Шаг 3. DTO: что приходит и что уходит

Наружу не отдаём модель целиком. Для обмена данными делаем отдельные классы (**DTO**, Data Transfer Object, «объект для передачи»).

Аналогия: в ресторане гость видит меню, а не складскую накладную. Меню и накладная про одни и те же блюда, но поля разные.

Зачем:
- клиент не может прислать то, что ему нельзя менять (например, `id` или `createdAt`);
- мы не отдаём наружу лишнее (служебные даты, потом пароли, ключи картинок).

`WishRequest.java` — что **приходит** от клиента:

```java
package com.adventcalendar.calendar.wish;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WishRequest(
        @NotBlank(message = "Название обязательно")
        @Size(max = 100, message = "Название не длиннее 100 символов")
        String title,

        @Size(max = 1000, message = "Комментарий не длиннее 1000 символов")
        String comment
) {
}
```

По шагам:
1. Здесь только то, что пользователь может задать сам: название и комментарий. Дату возьмём из адреса.
2. `@NotBlank` — строка не `null`, не пустая и не из одних пробелов.
3. `@Size(max = 100)` — не длиннее 100 символов.
4. `message = "..."` — текст ошибки, который увидит клиент.
5. Комментарий можно не присылать, но если прислали, то не длиннее 1000 символов.

`WishResponse.java` — что **уходит** клиенту:

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
        return new WishResponse(wish.id(), wish.date(), wish.title(), wish.comment());
    }
}
```

По шагам:
1. Отдаём `id`, дату, название, комментарий. Служебные `createdAt`/`updatedAt` не отдаём.
2. `from(wish)` — переводит модель в DTO (**маппинг**). `static` значит: вызываем через имя класса, `WishResponse.from(...)`, без создания объекта.

## 🔹 Шаг 4. Репозиторий: хранилище в памяти

`WishRepository.java`:

```java
package com.adventcalendar.calendar.wish;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

@Repository
public class WishRepository {

    private final Map<Long, Wish> wishes = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);

    public List<Wish> findAll() {
        return wishes.values().stream()
                .sorted(Comparator.comparing(Wish::date))
                .toList();
    }

    public Optional<Wish> findById(Long id) {
        return Optional.ofNullable(wishes.get(id));
    }

    public Optional<Wish> findByDate(LocalDate date) {
        return wishes.values().stream()
                .filter(wish -> wish.date().equals(date))
                .findFirst();
    }

    public Wish save(Wish wish) {
        Wish toSave = wish.id() == null ? wish.withId(nextId.getAndIncrement()) : wish;
        wishes.put(toSave.id(), toSave);
        return toSave;
    }

    public boolean deleteById(Long id) {
        return wishes.remove(id) != null;
    }
}
```

По шагам:
1. `@Repository` — Spring сам создаст один объект этого класса и будет отдавать его тем, кому он нужен (**бин**).
2. `Map<Long, Wish>` — «словарь»: по номеру (`id`) лежит желание.
   `ConcurrentHashMap` — версия словаря, которая не ломается, если два запроса пришли одновременно (**потокобезопасность**).
   Сервер обрабатывает запросы параллельно, поэтому это важно.
3. `AtomicLong nextId` — счётчик номеров: 1, 2, 3… Тоже безопасен при одновременных запросах.
4. `findAll()` — все желания, отсортированные по дате. `.stream()` — цепочка операций над коллекцией (**Stream API**).
5. `Optional<Wish>` — «коробка», в которой желание может быть, а может и не быть. Так мы явно говорим: «может не найтись», вместо того чтобы вернуть `null`.
6. `save()` — если `id` ещё нет, это новое желание: выдаём номер. Если есть, просто заменяем старое.
7. `deleteById()` — удаляет и говорит, было ли что удалять (`true`/`false`).

Методы названы так же, как в Spring Data JPA. На этапе 3 этот класс заменится на работу с базой, а сервис и контроллер почти не изменятся.

## 🔹 Шаг 5. Своя ошибка «не найдено»

`WishNotFoundException.java`:

```java
package com.adventcalendar.calendar.wish;

public class WishNotFoundException extends RuntimeException {

    public WishNotFoundException(Long id) {
        super("Желание с id " + id + " не найдено");
    }
}
```

Это наш тип ошибки (**исключение**, exception). Когда желания нет, сервис «бросает» его (`throw`),
а обработчик ошибок (шаг 8) превратит его в ответ 404.

`extends RuntimeException` — наш класс наследует обычное исключение Java (**наследование**).
`super(...)` — передаём текст ошибки в родительский класс.

## 🔹 Шаг 6. Сервис: логика

`WishService.java`:

```java
package com.adventcalendar.calendar.wish;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class WishService {

    private final WishRepository repository;

    public WishService(WishRepository repository) {
        this.repository = repository;
    }

    public List<WishResponse> findAll() {
        return repository.findAll().stream()
                .map(WishResponse::from)
                .toList();
    }

    public WishResponse findById(Long id) {
        return repository.findById(id)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    public WishResponse saveForDate(LocalDate date, WishRequest request) {
        Instant now = Instant.now();
        Wish wish = repository.findByDate(date)
                .map(old -> new Wish(old.id(), date, request.title(), request.comment(), old.createdAt(), now))
                .orElseGet(() -> new Wish(null, date, request.title(), request.comment(), now, now));
        return WishResponse.from(repository.save(wish));
    }

    public void delete(Long id) {
        if (!repository.deleteById(id)) {
            throw new WishNotFoundException(id);
        }
    }
}
```

По шагам:
1. `@Service` — тоже бин, как репозиторий, просто с другой пометкой для ясности.
2. Конструктор принимает `WishRepository`. Мы не пишем `new WishRepository()`: Spring сам подставит готовый объект
   (**внедрение зависимостей**, Dependency Injection).
   Аналогия: повар не строит себе холодильник, ему его ставят на кухню.
3. `findById` — `.map(WishResponse::from)` переводит в DTO, а `.orElseThrow(...)` бросает нашу ошибку, если коробка пустая.
4. `saveForDate` — главная логика:
   - ищем, есть ли уже желание в этот день;
   - если есть, создаём новую версию с тем же `id` и `createdAt`, но новым названием и `updatedAt`;
   - если нет, создаём новое без `id` (номер выдаст репозиторий);
   - сохраняем и возвращаем DTO.
5. `delete` — если удалять нечего, бросаем 404.

## 🔹 Шаг 7. Контроллер: адреса

`WishController.java`:

```java
package com.adventcalendar.calendar.wish;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wishes")
public class WishController {

    private final WishService service;

    public WishController(WishService service) {
        this.service = service;
    }

    @GetMapping
    public List<WishResponse> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public WishResponse findById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PutMapping("/{date}")
    public WishResponse save(@PathVariable LocalDate date, @Valid @RequestBody WishRequest request) {
        return service.saveForDate(date, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
```

По шагам:
1. `@RequestMapping("/api/wishes")` — все адреса класса начинаются с `/api/wishes`.
2. `@GetMapping`, `@PutMapping`, `@DeleteMapping` — какой HTTP-метод обрабатывает метод Java.
   GET — «дай», PUT — «положи сюда», DELETE — «удали».
3. `@PathVariable` — берёт кусок из адреса (**переменная пути**). В `/api/wishes/7` это `id = 7`,
   в `/api/wishes/2026-12-01` это `date`. Spring сам превращает текст в `Long` или `LocalDate`.
4. `@RequestBody` — берёт JSON из тела запроса и превращает его в `WishRequest` (**десериализация**).
5. `@Valid` — перед вызовом метода проверить пометки из шага 3. Если проверка не прошла, метод даже не вызовется.
6. `@ResponseStatus(HttpStatus.NO_CONTENT)` — после удаления ответить кодом 204 «готово, тела нет».

Контроллер получился тонким: он ничего не решает, а только передаёт в сервис. Так и должно быть.

## 🔹 Шаг 8. Единый обработчик ошибок

Без него на ошибки Spring отвечает по-разному, а иногда кодом 500 («сервер сломался»), хотя ошибся клиент.
Делаем одно место, которое ловит ошибки из **всех** контроллеров и отвечает понятно и одинаково.

В пакете `error` создай `GlobalExceptionHandler.java`:

```java
package com.adventcalendar.calendar.error;

import com.adventcalendar.calendar.wish.WishNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(WishNotFoundException.class)
    public ProblemDetail handleNotFound(WishNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(error -> errors.put(error.getField(), error.getDefaultMessage()));

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Данные заполнены неверно");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Неверное значение '" + ex.getValue() + "' для параметра " + ex.getName());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadable(HttpMessageNotReadableException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Не получилось прочитать JSON в теле запроса");
    }
}
```

По шагам:
1. `@RestControllerAdvice` — «советник» для всех контроллеров: если где-то вылетела ошибка, Spring ищет обработчик здесь.
2. `@ExceptionHandler(X.class)` — этот метод отвечает за ошибки типа `X`.
3. `ProblemDetail` — стандартный формат ответа об ошибке (**RFC 9457**, Problem Details). Поля: `status`, `title`, `detail`, `instance`.
   Фронтенд потом сможет одинаково показывать любые ошибки.
4. Какие ошибки ловим:
   - `WishNotFoundException` → **404** «не найдено»;
   - `MethodArgumentNotValidException` → **400**, данные не прошли `@Valid`. Собираем ошибки по полям в `errors`;
   - `MethodArgumentTypeMismatchException` → **400**, в адресе ерунда: `/api/wishes/abc` или дата `2026-13-40`;
   - `HttpMessageNotReadableException` → **400**, сломанный JSON в теле.

Коды ответа (**HTTP-статусы**): 2xx — всё хорошо, 4xx — ошибся клиент, 5xx — ошибся сервер.

## 🔹 Шаг 9. Запусти и проверь

Запусти `BackendApplication` (зелёный ▶). Подожди `Tomcat started on port 8080`.

GET-запросы можно открыть прямо в браузере: http://localhost:8080/api/wishes (сейчас там `[]`, пустой список).

Для PUT и DELETE нужен терминал. Используй **PowerShell 7** (`pwsh`).
Если его нет: `winget install Microsoft.PowerShell`, потом открой «PowerShell 7».
В старом Windows PowerShell 5 русские буквы в ответах показываются кракозябрами, это не ошибка сервера.

Выполняй по очереди:

```powershell
$json = "application/json; charset=utf-8"

# 1. Создать желание на 1 декабря
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-12-01 -ContentType $json -Body '{"title":"Лего","comment":"Набор с замком"}'

# 2. Создать желание на 5 декабря
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-12-05 -ContentType $json -Body '{"title":"Книга"}'

# 3. Заменить желание 1 декабря (id останется 1)
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-12-01 -ContentType $json -Body '{"title":"Лего Техник"}'

# 4. Все желания
Invoke-RestMethod http://localhost:8080/api/wishes

# 5. Одно желание
Invoke-RestMethod http://localhost:8080/api/wishes/2
```

Ожидаемо: у 1 декабря `id = 1`, у 5 декабря `id = 2`. После шага 3 в списке по-прежнему два желания, а не три.

Теперь проверим ошибки. Флаг `-SkipHttpErrorCheck` просит не падать на кодах 4xx, а показать ответ сервера:

```powershell
# 404: такого желания нет
Invoke-RestMethod http://localhost:8080/api/wishes/99 -SkipHttpErrorCheck

# 400: пустое название
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-12-02 -ContentType $json -Body '{"title":"   "}' -SkipHttpErrorCheck

# 400: несуществующая дата
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-13-40 -ContentType $json -Body '{"title":"x"}' -SkipHttpErrorCheck

# 400: сломанный JSON
Invoke-RestMethod -Method Put -Uri http://localhost:8080/api/wishes/2026-12-02 -ContentType $json -Body '{"title":' -SkipHttpErrorCheck

# Удалить желание 2 (ответ пустой, код 204)
Invoke-RestMethod -Method Delete -Uri http://localhost:8080/api/wishes/2 -StatusCodeVariable code; $code

# Удалить ещё раз: теперь 404
Invoke-RestMethod -Method Delete -Uri http://localhost:8080/api/wishes/2 -SkipHttpErrorCheck
```

Что должно получиться (сокращённо):

```
detail : Желание с id 99 не найдено
status : 404

detail : Данные заполнены неверно
status : 400
errors : @{title=Название обязательно}

detail : Неверное значение '2026-13-40' для параметра date
status : 400

detail : Не получилось прочитать JSON в теле запроса
status : 400

204

detail : Желание с id 2 не найдено
status : 404
```

Последняя проверка: перезапусти сервер и открой http://localhost:8080/api/wishes. Снова `[]`.
Данные пропали, потому что жили только в памяти. Это и решит база данных на этапе 3.

Частые ошибки:
- `cannot find symbol NotBlank` / `jakarta.validation` не найден — не добавил зависимость из шага 1 или не нажал 🔄 Load Maven Changes.
- Ошибки валидации не срабатывают, сохраняется пустое название — забыл `@Valid` перед `@RequestBody`.
- Пришёл 500 вместо 404, или ответ без твоих русских текстов — обработчик лежит не в подпакете `com.adventcalendar.calendar`, и Spring его не видит.
  Все пакеты должны быть **внутри** пакета, где лежит `BackendApplication`.

## 🔹 Шаг 10. Сохрани в Git

Останови сервер (■). В терминале в папке `advent-list`:

```
git add .
git status
git commit -m "Этап 2: CRUD желаний в памяти, DTO, валидация, обработчик ошибок"
```

## 🔹 Созданные и изменённые файлы

```
backend/pom.xml                                   (изменён: + validation)
backend/src/main/java/com/adventcalendar/calendar/
├── wish/
│   ├── Wish.java                  модель
│   ├── WishRequest.java           DTO входа + валидация
│   ├── WishResponse.java          DTO выхода
│   ├── WishRepository.java        хранилище в памяти
│   ├── WishNotFoundException.java ошибка «не найдено»
│   ├── WishService.java           логика
│   └── WishController.java        адреса /api/wishes
└── error/
    └── GlobalExceptionHandler.java единый обработчик ошибок
```

## Главное, что нужно запомнить

- Слои: контроллер принимает запрос, сервис решает, репозиторий хранит. Каждый говорит только с соседом.
- DTO отделяют то, что видит клиент, от того, как данные устроены внутри.
- `@Valid` + пометки (`@NotBlank`, `@Size`) проверяют данные до того, как они попадут в логику.
- `@RestControllerAdvice` — одно место для всех ошибок: клиент всегда получает понятный ответ с правильным кодом (4xx — ошибся клиент).
