# Этап 10. Тесты

## 🔹 Что делаем и зачем

Тест — это маленькая программа, которая запускает твой код и проверяет, что результат правильный.
Один раз написал — и дальше за секунды проверяешь всё приложение после каждого изменения.

Часть тестов у нас уже есть: на этапах 8 и 9 мы написали `AccessRulesTest` и `ImageRulesTest`.
Но у них две проблемы:

1. Они работают только когда запущен `docker compose up -d`, и пишут прямо в твою рабочую базу.
2. Они проверяют только сервер целиком. Нет ни быстрых тестов отдельных классов, ни тестов фронтенда, ни проверки «как человек в браузере».

На этом этапе добиваем все четыре вида тестов из задания:

| Вид | Что проверяет | Чем | Скорость |
|---|---|---|---|
| **Юнит-тесты** (unit tests) | один класс, без базы и без Spring | JUnit 5 + Mockito | миллисекунды |
| **Интеграционные** (integration tests) | весь сервер с настоящей базой и MinIO | `@SpringBootTest` + Testcontainers | секунды |
| **Тесты компонентов** (component tests) | одна React-компонента в ненастоящем браузере | Vitest + React Testing Library | миллисекунды |
| **Сквозные** (end-to-end, e2e) | всё приложение в настоящем браузере, как живой человек | Playwright | десятки секунд |

Аналогия 🚗: юнит-тест — проверить отдельно тормозной диск на стенде. Интеграционный — собрать тормоза целиком и нажать педаль.
Сквозной — сесть в машину и проехать круг по городу. Нужны все: стенд быстро находит, *какая* деталь сломалась, а поездка показывает, что машина *вообще едет*.

Такую картину называют **пирамидой тестов** (test pyramid): быстрых юнит-тестов много (основание), интеграционных меньше, сквозных — единицы (вершина).

После этапа будет:

- 57 тестов бэкенда, которые сами поднимают себе PostgreSQL и MinIO в Docker и не трогают твою базу;
- 29 тестов фронтенда;
- 1 сквозной тест: «сценарий показа» из макета, где Анна и Борис — два разных человека в двух разных браузерах.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Юнит-тест** (unit test) | проверка одного класса в одиночестве. Всё, с чем он общается, заменено заглушками |
| **Заглушка** (mock) | ненастоящий объект-«актёр». Мы сами говорим ему: «когда тебя спросят X, ответь Y». А потом можем спросить: «тебя вызывали? с чем?» |
| **Mockito** | библиотека для Java, которая делает заглушки |
| **Testcontainers** | библиотека, которая из теста запускает Docker-контейнер (например, PostgreSQL), а после тестов удаляет его |
| **Одноразовая база** (ephemeral database) | база, которая живёт только пока идут тесты. Каждый запуск начинается с чистого листа |
| **Vitest** | программа для запуска тестов JavaScript/TypeScript. Работает поверх Vite, поэтому понимает наш код без настроек |
| **jsdom** | «ненастоящий браузер» внутри Node.js: есть `document`, кнопки, поля ввода, но ничего не рисуется на экране |
| **React Testing Library** (RTL) | рисует компоненту в jsdom и ищет элементы так, как их видит человек: «кнопка с надписью Сохранить» |
| **Playwright** | управляет настоящим браузером (Chromium): открывает страницы, кликает, печатает, проверяет |
| **Проверка** (assertion) | строка вида `assertThat(x).isEqualTo(5)` или `expect(x).toBe(5)`. Если неправда — тест красный |
| **Шпион** (spy) | функция-заглушка `vi.fn()`, которая запоминает, как её вызывали |

## 🔹 Как устроен любой тест

Почти каждый тест состоит из трёх частей. Их называют **AAA** (Arrange, Act, Assert):

```java
@Test
void smallImageIsNotEnlarged() {
    // 1. Подготовка (Arrange): создаём всё, что нужно
    MockMultipartFile file = png(200, 100);

    // 2. Действие (Act): вызываем то, что проверяем
    ProcessedImage result = processor.process(file);

    // 3. Проверка (Assert): сравниваем результат с ожидаемым
    assertThat(read(result.full()).getWidth()).isEqualTo(200);
}
```

Если тест читается как три абзаца «дано — сделали — получили», это хороший тест.

---

# Часть 1. Бэкенд

## 🔹 Шаг 1. Testcontainers: своя база для тестов

### Что не так сейчас

Открой `AccessRulesTest`. Он запускает Spring с настройками из `application.properties`, то есть подключается к `localhost:5434` — к **твоей** базе из `docker-compose.yml`.
Если Docker-контейнер не запущен, все тесты падают с `Connection refused`. А если запущен, тесты пишут в ту же базу, где лежат твои желания (их спасает только `@Transactional`).

### Как будет

```
mvnw test
   │
   ├─▶ Testcontainers: «Docker, запусти postgres:17 и minio на свободных портах»
   │       ├─ postgres  → localhost:51234 (порт случайный)
   │       └─ minio     → localhost:51240
   │
   ├─▶ Spring стартует и подключается к ЭТИМ контейнерам, а не к 5434
   │       └─ Flyway создаёт таблицы и тестовых Анну, Бориса, Вику
   │
   ├─▶ идут все тесты
   │
   └─▶ Testcontainers удаляет оба контейнера
```

Нужен только запущенный **Docker Desktop**. `docker compose up` для тестов больше не нужен.

### 1.1. `backend/pom.xml`

Найди зависимость `spring-boot-starter-security-test` и **сразу после неё** (перед `</dependencies>`) добавь четыре новые:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-testcontainers</artifactId>
			<scope>test</scope>
		</dependency>
		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>testcontainers-junit-jupiter</artifactId>
			<scope>test</scope>
		</dependency>
		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>testcontainers-postgresql</artifactId>
			<scope>test</scope>
		</dependency>
		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>testcontainers-minio</artifactId>
			<scope>test</scope>
		</dependency>
```

Разберём:

- `spring-boot-testcontainers` — «мост» между Spring и Testcontainers. Spring сам узнаёт у контейнера адрес базы.
- `testcontainers-junit-jupiter` — связка Testcontainers с JUnit 5.
- `testcontainers-postgresql`, `testcontainers-minio` — готовые описания контейнеров PostgreSQL и MinIO.
- `<scope>test</scope>` — библиотека нужна **только для тестов**. В готовый сервер она не попадёт.
- Версию писать не нужно: её выбирает Spring Boot (родительский `spring-boot-starter-parent`).

Нажми в IntelliJ **Load Maven Changes**.

### 1.2. Настройка контейнеров

Создай файл `backend/src/test/java/com/adventcalendar/calendar/TestcontainersConfiguration.java`.
Обрати внимание: папка `test`, а не `main`.

```java
package com.adventcalendar.calendar;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

// Для тестов поднимаем свои, «одноразовые» PostgreSQL и MinIO в Docker.
// Они создаются перед первым тестом и удаляются после последнего.
// Твоя база из docker-compose при этом не трогается
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    // @ServiceConnection: Spring сам возьмёт у контейнера адрес, логин и пароль базы
    // и подставит их вместо spring.datasource.* из application.properties
    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
    }

    @Bean
    MinIOContainer minio() {
        // Тот же образ, что в docker-compose.yml. Говорим Testcontainers, что это «тот самый» MinIO
        DockerImageName image = DockerImageName.parse("pgsty/minio:RELEASE.2026-08-04T00-00-00Z")
                .asCompatibleSubstituteFor("minio/minio");
        return new MinIOContainer(image);
    }

    // Для MinIO готового @ServiceConnection нет, поэтому настройки storage.* подставляем сами
    @Bean
    DynamicPropertyRegistrar storageProperties(MinIOContainer minio) {
        return registry -> {
            registry.add("storage.endpoint", minio::getS3URL);
            registry.add("storage.access-key", minio::getUserName);
            registry.add("storage.secret-key", minio::getPassword);
        };
    }
}
```

Разберём по частям:

- `@TestConfiguration` — настройки, которые есть **только в тестах**. Обычный запуск сервера их не видит.
- `proxyBeanMethods = false` — мелкая оптимизация, Spring советует так писать для настроек. Можно не вникать.
- `@Bean PostgreSQLContainer postgres()` — контейнер становится обычным объектом Spring (**бином**, bean). Spring сам запустит его перед тестами и остановит после.
- `@ServiceConnection` — самое удобное место. Spring видит: «это PostgreSQL», спрашивает у контейнера адрес, логин, пароль и **подменяет** `spring.datasource.url`, `username`, `password`. В `application.properties` ничего менять не надо.
- `asCompatibleSubstituteFor("minio/minio")` — Testcontainers знает «официальный» образ `minio/minio`. Мы используем другой (`pgsty/minio`, как в `docker-compose.yml`, почему — смотри этап 9). Эта строка говорит: «не волнуйся, это тот же MinIO».
- `DynamicPropertyRegistrar` — для MinIO готового `@ServiceConnection` нет. Поэтому вручную говорим Spring: «`storage.endpoint` возьми у контейнера». `minio::getS3URL` — это **ссылка на метод** (method reference): Spring вызовет его, когда контейнер уже запустится и будет знать свой порт.

### 1.3. Подключаем настройку к тестам

В трёх существующих тестах (`BackendApplicationTests`, `access/AccessRulesTest`, `image/ImageRulesTest`) под строкой `@SpringBootTest` добавь:

```java
@Import(TestcontainersConfiguration.class)
```

И нужные импорты наверху файла:

```java
import org.springframework.context.annotation.Import;
import com.adventcalendar.calendar.TestcontainersConfiguration; // в BackendApplicationTests не нужен: он в том же пакете
```

Например, `BackendApplicationTests` станет таким:

```java
package com.adventcalendar.calendar;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
```

А начало `AccessRulesTest` — таким:

```java
// Проверяем правила доступа через настоящие адреса (API), как это делал бы браузер.
// @Transactional: после каждого теста всё, что он записал в базу, откатывается
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class AccessRulesTest {
```

В `ImageRulesTest` заодно удали устаревший комментарий `// Нужны запущенные PostgreSQL и MinIO: docker compose up -d`.

💡 Почему контейнеры не запускаются три раза? Spring **кэширует** (запоминает) запущенное приложение между тестовыми классами, если у них одинаковые настройки.
У всех трёх классов одна и та же `@Import(TestcontainersConfiguration.class)`, поэтому контейнеры поднимутся один раз на все тесты.

### 1.4. Проверка

1. Останови свои контейнеры, чтобы убедиться, что тесты в них не нуждаются: в корне `advent-list` выполни `docker compose stop`.
2. Docker Desktop при этом должен быть **запущен** (кит в трее).
3. В папке `backend`:

```
.\mvnw test
```

Первый раз Docker скачает образы, это может занять пару минут. В логе увидишь строки вроде:

```
Creating container for image: postgres:17
Container postgres:17 started in PT2.1S
Creating container for image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
```

В конце:

```
Tests run: 20, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Пока тесты идут, открой Docker Desktop: там на несколько секунд появятся контейнеры со странными именами. После тестов они исчезнут сами.

4. Снова запусти свои контейнеры: `docker compose start`.

## 🔹 Шаг 2. Юнит-тесты с Mockito

### Зачем, если уже есть интеграционные?

`AccessRulesTest` проверяет правило «чужой не видит календарь» через весь сервер: HTTP, Spring Security, сервис, база.
Если тест упал, непонятно, где именно сломалось. И каждый такой тест требует Docker.

Юнит-тест проверяет **только сервис**. Базу заменяем заглушкой и говорим ей, что отвечать.

Аналогия 🎭: актёр репетирует сцену с суфлёром, а не со всей труппой. Суфлёр (заглушка) говорит ровно ту реплику, которая нужна для сцены.

### Как работает Mockito

```java
@Mock FriendService friendService;           // 1. заглушка вместо настоящего сервиса друзей
@InjectMocks WishService service;            // 2. настоящий WishService, в конструктор переданы заглушки

when(friendService.areFriends(2L, 1L))       // 3. «когда спросят, друзья ли 2 и 1…»
        .thenReturn(false);                  //    «…ответь: нет»

service.calendar(2L, 1L, MONTH);             // 4. вызываем настоящий метод

verify(imageStorage).delete("abc");          // 5. проверяем: сервис действительно попросил удалить файл
verifyNoInteractions(wishRepository);        //    или: к базе вообще не обращались
```

- `@ExtendWith(MockitoExtension.class)` — включает Mockito в JUnit: он сам создаст все `@Mock` и `@InjectMocks` перед каждым тестом.
- Spring при этом **не запускается**. Поэтому такие тесты идут за миллисекунды.
- Заглушка, которой ничего не сказали, отвечает «пусто»: `false`, `null`, пустой список.

### Как поставить id без базы

`id` у `Wish` и `User` обычно ставит база, сеттера (`setId`) нет. В тестах пользуемся помощником Spring:

```java
ReflectionTestUtils.setField(wish, "id", 5L); // записать 5 в приватное поле id
```

Это допустимо **только в тестах**. В обычном коде так не делаем.

### 2.1. `WishServiceTest`

Создай `backend/src/test/java/com/adventcalendar/calendar/wish/WishServiceTest.java`:

```java
package com.adventcalendar.calendar.wish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.access.AccessRequestRepository;
import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.holiday.HolidayRepository;
import com.adventcalendar.calendar.image.ImageStorage;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

// Юнит-тест: проверяем только WishService. Базы нет, Spring не запускается.
// Все «соседи» сервиса — заглушки (@Mock), и мы сами говорим, что они отвечают
@ExtendWith(MockitoExtension.class)
class WishServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long VIEWER_ID = 2L;
    private static final YearMonth MONTH = YearMonth.of(2030, 1);

    @Mock WishRepository wishRepository;
    @Mock UserRepository userRepository;
    @Mock FriendService friendService;
    @Mock WishAccessRepository accessRepository;
    @Mock AccessRequestRepository requestRepository;
    @Mock ImageStorage imageStorage;
    @Mock HolidayRepository holidayRepository;

    @InjectMocks WishService service; // настоящий сервис, в который подставлены заглушки выше

    Wish wish;

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID); // id обычно ставит база, здесь — мы сами
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update("Секретный подарок", "Никому не говорить");
        wish.setImageKey("abc");
        ReflectionTestUtils.setField(wish, "id", 5L);
    }

    private void ownerHasOneWish() {
        when(wishRepository.findAllByOwnerIdAndDateBetweenOrderByDateAsc(
                OWNER_ID, MONTH.atDay(1), MONTH.atEndOfMonth())).thenReturn(List.of(wish));
    }

    @Test
    void strangerCannotSeeCalendar() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.calendar(VIEWER_ID, OWNER_ID, MONTH))
                .isInstanceOf(NotFriendsException.class);
        verifyNoInteractions(wishRepository); // до базы дело даже не дошло
    }

    @Test
    void closedDayHasNoTitleCommentAndImage() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of());
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of(5L));

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isFalse();
        assertThat(day.requested()).isTrue();
        assertThat(day.title()).isNull();
        assertThat(day.comment()).isNull();
        assertThat(day.imageUrl()).isNull();
        assertThat(day.thumbUrl()).isNull();
    }

    @Test
    void openDayShowsEverything() {
        when(friendService.areFriends(VIEWER_ID, OWNER_ID)).thenReturn(true);
        ownerHasOneWish();
        when(accessRepository.findOpenWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of(5L));
        when(requestRepository.findRequestedWishIds(VIEWER_ID, List.of(5L))).thenReturn(List.of());

        CalendarDayResponse day = service.calendar(VIEWER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isTrue();
        assertThat(day.title()).isEqualTo("Секретный подарок");
        assertThat(day.comment()).isEqualTo("Никому не говорить");
        assertThat(day.thumbUrl()).contains("size=thumb");
    }

    @Test
    void ownerSeesOwnCalendarWithoutFriendCheck() {
        ownerHasOneWish();

        CalendarDayResponse day = service.calendar(OWNER_ID, OWNER_ID, MONTH).getFirst();

        assertThat(day.open()).isTrue();
        verifyNoInteractions(friendService, accessRepository);
    }

    @Test
    void deletingWishAlsoDeletesItsImageFiles() {
        when(wishRepository.findByIdAndOwnerId(5L, OWNER_ID)).thenReturn(Optional.of(wish));

        service.delete(OWNER_ID, 5L);

        verify(wishRepository).delete(wish);
        verify(imageStorage).delete("abc");
    }

    @Test
    void cannotDeleteSomeoneElsesWish() {
        when(wishRepository.findByIdAndOwnerId(5L, VIEWER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(VIEWER_ID, 5L)).isInstanceOf(WishNotFoundException.class);
        verify(wishRepository, never()).delete(any());
        verifyNoInteractions(imageStorage);
    }
}
```

Что здесь важно:

- `closedDayHasNoTitleCommentAndImage` — **главное правило проекта**, проверенное на уровне сервиса: даже если в базе у желания есть название, комментарий и картинка, в ответ для закрытого дня попадают `null`.
- `@Mock HolidayRepository holidayRepository` — сервису нужны праздники хозяина (их видят друзья в открытых днях). Заглушка без настройки на любой вопрос отвечает пустым списком, поэтому в этих тестах праздников просто нет.
- `strangerCannotSeeCalendar` проверяет не только исключение, но и что `wishRepository` **ни разу** не вызывали: сервис отказал раньше, чем полез в базу.
- `assertThatThrownBy(() -> ...)` — «выполни это и проверь, что вылетело исключение такого-то типа». `() -> ...` — **лямбда** (lambda): кусочек кода, который передаём, чтобы его вызвали позже.
- `.getFirst()` — первый элемент списка (Java 21).

### 2.2. `AccessServiceTest`

Создай `backend/src/test/java/com/adventcalendar/calendar/access/AccessServiceTest.java`:

```java
package com.adventcalendar.calendar.access;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.friend.FriendService;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AccessServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long FRIEND_ID = 2L;
    private static final Long WISH_ID = 5L;

    @Mock WishAccessRepository accessRepository;
    @Mock AccessRequestRepository requestRepository;
    @Mock WishRepository wishRepository;
    @Mock UserRepository userRepository;
    @Mock FriendService friendService;

    @InjectMocks AccessService service;

    Wish wish;

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID);
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        ReflectionTestUtils.setField(wish, "id", WISH_ID);
    }

    @Test
    void cannotGrantAccessToNotFriend() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(OWNER_ID, FRIEND_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.grant(OWNER_ID, WISH_ID, FRIEND_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Открыть день можно только другу");
        verify(accessRepository, never()).save(any());
    }

    @Test
    void grantSavesAccessAndRemovesPendingRequest() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(OWNER_ID, FRIEND_ID)).thenReturn(true);
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);

        service.grant(OWNER_ID, WISH_ID, FRIEND_ID);

        verify(accessRepository).save(any(WishAccess.class));
        verify(requestRepository).deleteByWishIdAndFromUserId(WISH_ID, FRIEND_ID);
    }

    @Test
    void cannotGrantAccessToSomeoneElsesWish() {
        // Друг пытается открыть желание хозяина: среди «его» желаний такого нет
        when(wishRepository.findByIdAndOwnerId(WISH_ID, FRIEND_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.grant(FRIEND_ID, WISH_ID, FRIEND_ID))
                .isInstanceOf(WishNotFoundException.class);
        verify(accessRepository, never()).save(any());
    }

    @Test
    void cannotRequestAccessToOwnDay() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));

        assertThatThrownBy(() -> service.request(OWNER_ID, WISH_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Это ваш собственный день");
    }

    @Test
    void strangerRequestLooksLikeWishDoesNotExist() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(FRIEND_ID, OWNER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.request(FRIEND_ID, WISH_ID))
                .isInstanceOf(WishNotFoundException.class);
        verify(requestRepository, never()).save(any());
    }

    @Test
    void cannotRequestTwice() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(friendService.areFriends(FRIEND_ID, OWNER_ID)).thenReturn(true);
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);
        when(requestRepository.existsByWishIdAndFromUserId(WISH_ID, FRIEND_ID)).thenReturn(true);

        assertThatThrownBy(() -> service.request(FRIEND_ID, WISH_ID))
                .isInstanceOf(AccessException.class)
                .hasMessage("Запрос уже отправлен");
        verify(requestRepository, never()).save(any());
    }
}
```

- `verify(accessRepository, never()).save(any())` — «метод `save` не вызывали ни разу, ни с какими аргументами». Доказываем, что запрещённое действие не записалось.
- `any(WishAccess.class)` — «любой объект типа `WishAccess`». Точный объект мы не знаем: его создаёт сервис внутри себя.
- `.hasMessage("...")` — проверяем текст ошибки. Именно его увидит человек на экране.

### 2.3. `WishImageServiceTest`

Создай `backend/src/test/java/com/adventcalendar/calendar/image/WishImageServiceTest.java`:

```java
package com.adventcalendar.calendar.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class WishImageServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long FRIEND_ID = 2L;
    private static final Long WISH_ID = 5L;

    @Mock WishRepository wishRepository;
    @Mock WishAccessRepository accessRepository;
    @Mock ImageProcessor processor;
    @Mock ImageStorage storage;

    @InjectMocks WishImageService service;

    Wish wish;
    MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{1, 2, 3});

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID);
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.setImageKey("old");
        ReflectionTestUtils.setField(wish, "id", WISH_ID);
    }

    @Test
    void friendWithoutAccessGets404AndStorageIsNotTouched() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.download(FRIEND_ID, WISH_ID, true))
                .isInstanceOf(WishNotFoundException.class);
        verifyNoInteractions(storage); // файл из MinIO даже не читали
    }

    @Test
    void friendWithAccessGetsThumb() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(true);
        when(storage.load("old", true)).thenReturn(new byte[]{42});

        assertThat(service.download(FRIEND_ID, WISH_ID, true)).containsExactly(42);
    }

    @Test
    void newImageReplacesOldOne() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(processor.process(file)).thenReturn(new ProcessedImage(new byte[]{1}, new byte[]{2}));

        service.upload(OWNER_ID, WISH_ID, file);

        assertThat(wish.getImageKey()).isNotEqualTo("old"); // новое случайное имя
        verify(storage).save(anyString(), any(ProcessedImage.class));
        verify(storage).delete("old");                       // старые файлы удалены
    }

    @Test
    void cannotUploadToSomeoneElsesWish() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, FRIEND_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.upload(FRIEND_ID, WISH_ID, file))
                .isInstanceOf(WishNotFoundException.class);
        verifyNoInteractions(processor, storage);
    }
}
```

- `friendWithoutAccessGets404AndStorageIsNotTouched` — без доступа сервис даже не читает файл из MinIO. Это сильнее, чем «вернул 404»: картинка не покидала хранилище.
- `newImageReplacesOldOne` — после загрузки у желания **новое** имя файла, а старые файлы удалены. `anyString()` — «любая строка»: новое имя случайное, заранее его не знаем.

### 2.4. `ImageProcessorTest`

`ImageProcessor` ни от кого не зависит, поэтому заглушки не нужны: просто `new ImageProcessor()`.

Создай `backend/src/test/java/com/adventcalendar/calendar/image/ImageProcessorTest.java`:

```java
package com.adventcalendar.calendar.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

// Самый простой юнит-тест: ни заглушек, ни Spring. Создали объект, вызвали метод, проверили результат
class ImageProcessorTest {

    private final ImageProcessor processor = new ImageProcessor();

    private static MockMultipartFile png(int width, int height) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile("file", "photo.png", "image/png", out.toByteArray());
    }

    private static BufferedImage read(byte[] jpeg) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(jpeg));
    }

    @Test
    void bigImageIsShrunkAndKeepsProportions() throws IOException {
        ProcessedImage result = processor.process(png(3200, 1600));

        BufferedImage full = read(result.full());
        BufferedImage thumb = read(result.thumb());
        assertThat(full.getWidth()).isEqualTo(1600);
        assertThat(full.getHeight()).isEqualTo(800);
        assertThat(thumb.getWidth()).isEqualTo(300);
        assertThat(thumb.getHeight()).isEqualTo(150);
    }

    @Test
    void smallImageIsNotEnlarged() throws IOException {
        ProcessedImage result = processor.process(png(200, 100));

        assertThat(read(result.full()).getWidth()).isEqualTo(200);
        assertThat(read(result.thumb()).getWidth()).isEqualTo(200);
    }

    @Test
    void textFileIsRejected() {
        MockMultipartFile fake = new MockMultipartFile("file", "photo.png", "image/png", "привет".getBytes());

        assertThatThrownBy(() -> processor.process(fake))
                .isInstanceOf(BadImageException.class)
                .hasMessageContaining("не картинка");
    }

    @Test
    void emptyFileIsRejected() {
        MockMultipartFile empty = new MockMultipartFile("file", "photo.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> processor.process(empty)).hasMessage("Файл пустой");
    }

    @Test
    void tooWideImageIsRejected() {
        assertThatThrownBy(() -> processor.process(png(6000, 10)))
                .isInstanceOf(BadImageException.class)
                .hasMessageContaining("слишком большая");
    }
}
```

Сравни с `ImageRulesTest` из этапа 9: там те же проверки размеров идут через HTTP и MinIO. Здесь — напрямую, за доли секунды.

### 2.5. Проверка

IntelliJ: правой кнопкой по папке `src/test/java` → **Run 'All Tests'**. Или `.\mvnw test`.
Юнит-тесты можно запускать и без Docker: зелёный ▶ рядом с `class WishServiceTest`.

## 🔹 Шаг 3. Интеграционные тесты входа и защиты

Правила доступа к дням и картинкам у нас проверены. Не проверено другое: вход, регистрация и защита от чужих сайтов (CSRF).

Создай `backend/src/test/java/com/adventcalendar/calendar/security/SecurityRulesTest.java`:

```java
package com.adventcalendar.calendar.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

// Вход, выход и защита адресов: кто куда может попасть
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class SecurityRulesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired WishRepository wishRepository;

    private static final String NEW_USER = """
            {"name": "Гоша", "email": "Gosha@Test.local", "password": "password123"}
            """;

    @Test
    void healthIsOpenForEveryone() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }

    @Test
    void withoutLoginApiAnswers401() throws Exception {
        mvc.perform(get("/api/wishes")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/calendars/1?month=2030-01")).andExpect(status().isUnauthorized());
    }

    @Test
    void registerLogsInAndRemembersUser() throws Exception {
        MockHttpSession session = (MockHttpSession) mvc.perform(post("/api/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(NEW_USER))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("gosha@test.local")) // email привели к одному виду
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andReturn().getRequest().getSession(false);

        // Следующий запрос с той же сессией: сервер помнит, кто это
        mvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Гоша"));
    }

    @Test
    void wrongPasswordGives401() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NEW_USER));

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "gosha@test.local", "password": "wrong-password"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Неверный email или пароль"));
    }

    @Test
    void sameEmailCannotRegisterTwice() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(NEW_USER));

        mvc.perform(post("/api/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(NEW_USER))
                .andExpect(status().isConflict());
    }

    @Test
    void changesWithoutCsrfTokenAreForbidden() throws Exception {
        User me = userRepository.save(new User("Я", "me@test.local", "x"));

        // Тот же запрос, но без .with(csrf()) — как будто его отправил чужой сайт
        mvc.perform(put("/api/wishes/2030-01-01").with(user(CurrentUser.from(me)))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"title": "Подарок"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void someoneElsesWishIsNotFound() throws Exception {
        User owner = userRepository.save(new User("Хозяин", "owner@test.local", "x"));
        User other = userRepository.save(new User("Другой", "other@test.local", "x"));
        Wish wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update("Секрет", "Комментарий");
        wish = wishRepository.save(wish);

        mvc.perform(get("/api/wishes/{id}", wish.getId()).with(user(CurrentUser.from(other))))
                .andExpect(status().isNotFound());
    }
}
```

Разберём новое:

- `"""..."""` — **текстовый блок** (text block): многострочная строка в Java. Удобно для JSON.
- `registerLogsInAndRemembersUser`:
  1. Регистрируемся. Из ответа достаём **сессию** (`getSession(false)` — «дай сессию, если она есть, новую не создавай»).
  2. Следующий запрос делаем **с этой же сессией** (`.session(session)`). Так ведёт себя браузер: он отправляет cookie сессии с каждым запросом.
  3. Сервер узнаёт нас: `/api/me` отвечает «Гоша».
  4. Заодно проверяем, что в ответе **нет пароля и хеша** и что email приведён к маленьким буквам.
- `changesWithoutCsrfTokenAreForbidden` — тот же запрос, что делает фронтенд, но без `.with(csrf())`. Сервер отвечает `403`. Так мы доказываем, что защита из этапа 6 действительно работает.
- `someoneElsesWishIsNotFound` — по адресу `/api/wishes/{id}` можно получить полное желание с комментарием. Проверяем, что чужое желание так не достать.

### 3.2. Тесты своих праздников

Создай `backend/src/test/java/com/adventcalendar/calendar/holiday/HolidayRulesTest.java`:

```java
package com.adventcalendar.calendar.holiday;

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

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Свои праздники: добавить (можно несколько в день), переименовать, удалить. Чужие праздники не видны
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class HolidayRulesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired WishRepository wishRepository;

    User me;
    User other;

    @BeforeEach
    void setUp() {
        me = userRepository.save(new User("Я", "me@test.local", "x"));
        other = userRepository.save(new User("Другой", "other@test.local", "x"));
    }

    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    // Добавить праздник. Возвращает id нового праздника — по нему потом переименовываем и удаляем
    private ResultActions add(User u, String path, String title) throws Exception {
        return mvc.perform(post("/api/holidays/" + path).with(as(u)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"" + title + "\"}"));
    }

    private long addAndGetId(User u, String path, String title) throws Exception {
        String json = add(u, path, title).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private ResultActions rename(User u, long id, String title) throws Exception {
        return mvc.perform(put("/api/holidays/" + id).with(as(u)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\": \"" + title + "\"}"));
    }

    @Test
    void addedHolidayIsInMyList() throws Exception {
        add(me, "3/15", " День рождения мамы ").andExpect(status().isCreated());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].month").value(3))
                .andExpect(jsonPath("$[0].day").value(15))
                .andExpect(jsonPath("$[0].title").value("День рождения мамы")); // пробелы по краям убраны
    }

    @Test
    void oneDayCanHaveSeveralHolidays() throws Exception {
        add(me, "3/15", "День рождения мамы");
        add(me, "3/15", "Годовщина");

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].title").value("День рождения мамы")) // в порядке добавления
                .andExpect(jsonPath("$[1].title").value("Годовщина"));
    }

    @Test
    void renameChangesOnlyTitle() throws Exception {
        long id = addAndGetId(me, "3/15", "Старое");

        rename(me, id, "Новое").andExpect(status().isOk());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].day").value(15))
                .andExpect(jsonPath("$[0].title").value("Новое"));
    }

    @Test
    void otherPeopleDoNotSeeMyHolidays() throws Exception {
        add(me, "3/15", "День рождения мамы");

        mvc.perform(get("/api/holidays").with(as(other))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void otherPeopleCannotChangeMyHoliday() throws Exception {
        long id = addAndGetId(me, "3/15", "Мой");

        rename(other, id, "Взлом").andExpect(status().isNotFound());
        mvc.perform(delete("/api/holidays/" + id).with(as(other)).with(csrf())).andExpect(status().isNotFound());

        mvc.perform(get("/api/holidays").with(as(me))).andExpect(jsonPath("$[0].title").value("Мой"));
    }

    @Test
    void deleteRemovesOnlyThatHoliday() throws Exception {
        long id = addAndGetId(me, "3/15", "Первый");
        add(me, "3/15", "Второй");

        mvc.perform(delete("/api/holidays/" + id).with(as(me)).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/holidays").with(as(me)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Второй"));
    }

    @Test
    void impossibleDateIsRejected() throws Exception {
        add(me, "4/31", "Праздник").andExpect(status().isBadRequest());
        add(me, "13/1", "Праздник").andExpect(status().isBadRequest());
        add(me, "2/29", "Високосный").andExpect(status().isCreated()); // 29 февраля бывает
    }

    @Test
    void emptyTitleIsRejected() throws Exception {
        add(me, "3/15", "  ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").value("Введите название праздника"));
    }

    @Test
    void friendSeesHolidaysOnlyInOpenedDay() throws Exception {
        friendshipRepository.save(Friendship.between(me.getId(), other.getId()));
        Wish wish = new Wish(me, LocalDate.of(2030, 1, 10));
        wish.update("Шарф", "");
        wish = wishRepository.save(wish);
        add(me, "1/10", "День рождения мамы");
        String calendar = "/api/calendars/" + me.getId() + "?month=2030-01";

        // День закрыт: праздника в ответе нет вообще
        mvc.perform(get(calendar).with(as(other)))
                .andExpect(jsonPath("$[0].holidays", hasSize(0)))
                .andExpect(content().string(not(containsString("День рождения мамы"))));

        // Открыли день другу — праздник виден
        mvc.perform(put("/api/wishes/{w}/access/{f}", wish.getId(), other.getId()).with(as(me)).with(csrf()));
        mvc.perform(get(calendar).with(as(other)))
                .andExpect(jsonPath("$[0].holidays[0]").value("День рождения мамы"));
    }
}
```

- `add(...)` и `rename(...)` — свои помощники: одна строка вместо пяти в каждом тесте. Возвращают `ResultActions`, поэтому после них можно дописать `.andExpect(...)`.
- `addAndGetId(...)` добавляет праздник и достаёт из ответа его `id`. `JsonPath.read(json, "$.id")` — «возьми поле `id` из JSON». По этому `id` потом переименовываем и удаляем.
- `oneDayCanHaveSeveralHolidays` — в одном дне два праздника, и они идут в порядке добавления.
- `otherPeopleCannotChangeMyHoliday` — чужой человек знает `id` моего праздника, но переименовать или удалить его не может: сервер отвечает `404`, как будто праздника нет.
- `impossibleDateIsRejected` проверяет крайние случаи: 31 апреля и 13-й месяц — ошибка `400`, а 29 февраля — можно.
- `deleteRemovesOnlyThatHoliday` — в дне два праздника. Удаляю один, второй остаётся.
- `friendSeesHolidaysOnlyInOpenedDay` — друг видит мои праздники только в том дне, который я ему открыл. Пока день закрыт, названия праздника нет нигде в ответе.

### Проверка

```
.\mvnw test
```

В конце должно быть:

```
Tests run: 57, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Для интереса сломай правило: в `WishService.calendar` замени `CalendarDayResponse.closed(...)` на `CalendarDayResponse.open(wish)`.
Запусти тесты: покраснеют и юнит-тест, и интеграционные. Верни как было.
Это главная польза тестов: если через полгода кто-то случайно сломает правило, тесты сразу скажут.

---

# Часть 2. Фронтенд: тесты компонентов

## 🔹 Шаг 4. Ставим Vitest и Testing Library

В папке `frontend`:

```
npm install -D vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- `-D` — это библиотеки для разработки (**devDependencies**). В готовый сайт они не попадут.
- `vitest` — запускает тесты.
- `jsdom` — ненастоящий браузер для тестов.
- `@testing-library/react` — нарисовать компоненту и найти на ней элементы.
- `@testing-library/dom` — основа, на которой работает предыдущая.
- `@testing-library/jest-dom` — удобные проверки: `toBeInTheDocument()`, `toBeDisabled()`, `toBeChecked()`.
- `@testing-library/user-event` — действия как у человека: кликнуть, напечатать текст, выбрать файл.

### 4.1. `frontend/vite.config.ts`

Замени целиком:

```ts
/// <reference types="vitest/config" />
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
  // Настройки Vitest (тесты компонентов)
  test: {
    environment: 'jsdom',                  // ненастоящий браузер внутри Node: есть document, window, кнопки
    setupFiles: ['./src/test/setup.ts'],   // этот файл выполняется перед каждым файлом с тестами
    include: ['src/**/*.test.{ts,tsx}'],   // тесты лежат рядом с кодом; папку e2e не трогаем
  },
})
```

- `/// <reference types="vitest/config" />` — первая строка, особый комментарий для TypeScript: «в настройках Vite теперь может быть раздел `test`». Без неё TypeScript ругнётся на слово `test`.
- `environment: 'jsdom'` — тесты идут в ненастоящем браузере.
- `include` — где искать тесты. Указываем только `src`, потому что в папке `e2e` будут тесты Playwright, и Vitest не должен их трогать.

### 4.2. Файл подготовки

Создай `frontend/src/test/setup.ts`:

```ts
// Выполняется перед каждым файлом с тестами.
import '@testing-library/jest-dom/vitest'; // добавляет проверки вроде toBeInTheDocument(), toBeDisabled()
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// После каждого теста убираем нарисованные компоненты, чтобы тесты не мешали друг другу
afterEach(() => cleanup());

// В jsdom нет окна <dialog>: showModal() и close() не существуют. Делаем простые заменители
HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
};
HTMLDialogElement.prototype.close = function () {
    this.open = false;
};
```

- `cleanup()` — убрать со «страницы» всё, что нарисовал прошлый тест.
- Про `<dialog>`: наше окно дня (`DayModal`) вызывает `dialog.showModal()`. В jsdom такого метода нет, и без этих строк тест упадёт с ошибкой `showModal is not a function`.
  Мы подставляем простую замену: «открыть = поставить `open = true`». Это называется **полифил** (polyfill).

### 4.3. Команды в `package.json`

В раздел `"scripts"` добавь три строки (не забудь запятую после `"preview"`):

```json
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
```

- `npm test` — прогнать тесты один раз.
- `npm run test:watch` — режим наблюдения: Vitest ждёт и перезапускает тесты при каждом сохранении файла. Удобно, пока пишешь код.
- `npm run e2e` — сквозные тесты (шаг 7).

## 🔹 Шаг 5. Тесты чистых функций

Начнём с простого: функции без React. Тест лежит **рядом** с файлом и называется так же, но с `.test`.

### 5.1. `frontend/src/lib/dates.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { dateKey, daysInMonth, firstWeekday, formatDate } from './dates';

describe('dates', () => {
    it('собирает ключ даты с нулями впереди', () => {
        expect(dateKey(2026, 0, 5)).toBe('2026-01-05'); // месяц 0 — это январь
    });

    it('пишет дату по-русски', () => {
        expect(formatDate('2026-10-08')).toBe('8 октября');
        expect(formatDate('2026-03-01')).toBe('1 марта');
    });

    it('знает, сколько дней в месяце', () => {
        expect(daysInMonth(2026, 9)).toBe(31); // октябрь
        expect(daysInMonth(2028, 1)).toBe(29); // февраль високосного года
    });

    it('считает пустые клетки перед 1-м числом (неделя с понедельника)', () => {
        expect(firstWeekday(2026, 5)).toBe(0); // 1 июня 2026 — понедельник
        expect(firstWeekday(2026, 2)).toBe(6); // 1 марта 2026 — воскресенье
    });
});
```

- `describe('dates', ...)` — группа тестов. В отчёте они будут под заголовком `dates`.
- `it('...', () => {...})` — один тест. Название пишем как предложение: «it собирает ключ даты» — «оно собирает ключ даты».
- `expect(x).toBe(y)` — проверка «x равно y».

### 5.2. `frontend/src/api/toWishesByDate.test.ts`

Эта функция превращает ответ сервера в данные для компонентов. Проверим, что закрытый день так и остаётся закрытым.

```ts
import { describe, expect, it } from 'vitest';
import { toFriendWishes, toWishesByDate } from './toWishesByDate';

describe('toFriendWishes', () => {
    it('закрытый день остаётся закрытым и без текста', () => {
        const result = toFriendWishes([{
            wishId: 7, date: '2026-10-15', open: false, requested: true,
            title: null, comment: null, imageUrl: null, thumbUrl: null, holidays: [],
        }], 'boris');

        const day = result['2026-10-15'];
        expect(day.access).toEqual([]);   // Борису не открыт
        expect(day.requested).toBe(true);
        expect(day.title).toBe('');
        expect(day.thumb).toEqual({ emoji: '🎁', bg: '#FBE4EC' }); // вместо картинки — подарок
    });

    it('открытый день: access содержит меня, картинка с сервера', () => {
        const result = toFriendWishes([{
            wishId: 7, date: '2026-10-15', open: true, requested: false,
            title: 'Шарф', comment: 'Синий', imageUrl: '/api/wishes/7/image?size=full',
            thumbUrl: '/api/wishes/7/image?size=thumb', holidays: ['День рождения мамы'],
        }], 'boris');

        const day = result['2026-10-15'];
        expect(day.access).toEqual(['boris']);
        expect(day.title).toBe('Шарф');
        expect(day.thumb).toEqual({ src: '/api/wishes/7/image?size=thumb' });
        expect(day.holidays).toEqual(['День рождения мамы']); // праздники хозяина в открытом дне
    });
});

describe('toWishesByDate', () => {
    it('раскладывает мои желания по датам и переводит id друзей', () => {
        const result = toWishesByDate([{
            id: 1, date: '2026-10-05', title: 'Книга', comment: null,
            access: [2], imageUrl: null, thumbUrl: null,
        }]);

        expect(result['2026-10-05'].comment).toBe(''); // null → пустая строка
        expect(result['2026-10-05'].access).toEqual(['boris']); // id 2 в базе — это Борис
    });
});
```

- `toEqual` сравнивает **содержимое** объектов и массивов. `toBe` проверяет, что это один и тот же объект, поэтому для `[]` и `{...}` он не подходит.

### 5.3. `frontend/src/data/holidays.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { officialHoliday } from './holidays';

describe('officialHoliday', () => {
    it('находит праздник в любом году', () => {
        expect(officialHoliday('2026-12-16')).toBe('День Независимости');
        expect(officialHoliday('2031-03-22')).toBe('Наурыз');
    });

    it('в обычный день праздника нет', () => {
        expect(officialHoliday('2026-10-15')).toBeUndefined();
    });
});
```

## 🔹 Шаг 6. Тесты компонентов

### Как React Testing Library ищет элементы

Главная идея: ищем элементы так, как их видит **человек** или программа для незрячих (screen reader), а не по классам CSS.

| Запрос | Что ищет | Пример |
|---|---|---|
| `getByRole('button', { name: 'Сохранить' })` | кнопку с такой надписью (или `aria-label`) | кнопка «Сохранить» |
| `getByLabelText('Название желания')` | поле ввода с такой подписью `<label>` | поле названия |
| `getByText('🔒')` | любой элемент с таким текстом | значок замка |
| `queryByText(...)` | то же, но если не нашёл — вернёт `null`, а не ошибку | проверка «этого нет» |

`getBy...` падает, если элемента нет. Поэтому для проверки **отсутствия** используем `queryBy...` + `.not.toBeInTheDocument()`.

Бонус: если тест не может найти кнопку по надписи, значит и незрячий человек её не найдёт. Тесты заодно проверяют **доступность** (accessibility) интерфейса.
Мы ещё на этапе 4 дали клеткам `aria-label` вроде «15 октября: день закрыт» — сейчас они пригодились.

### 6.1. `frontend/src/components/DayCell.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Wish } from '../types';
import { DayCell } from './DayCell';

// Желание Анны на 15 октября. access — кому из друзей открыт день
function wish(access: string[]): Wish {
    return {
        id: 1, title: 'Тёплый шарф', comment: 'Синий',
        img: { emoji: '🎁', bg: '#fff' }, thumb: { emoji: '🎁', bg: '#fff' }, access,
    };
}

// Общие свойства клетки. В каждом тесте меняем только нужное
const base = { date: '2026-10-15', day: 15, isToday: false, myFriends: [], onOpen: () => {} };

describe('DayCell', () => {
    it('свой пустой день предлагает добавить желание', () => {
        render(<DayCell {...base} me="anna" isOwn />);

        expect(screen.getByRole('button', { name: '15 октября: добавить желание' })).toBeInTheDocument();
    });

    it('чужой закрытый день: замок и никакого названия', () => {
        render(<DayCell {...base} me="boris" isOwn={false} wish={wish([])} />);

        expect(screen.getByRole('button', { name: '15 октября: день закрыт' })).toBeInTheDocument();
        expect(screen.getByText('🔒')).toBeInTheDocument();
        expect(screen.queryByText('Тёплый шарф')).not.toBeInTheDocument();
    });

    it('чужой открытый день показывает название', () => {
        render(<DayCell {...base} me="boris" isOwn={false} wish={wish(['boris'])} />);

        expect(screen.getByText('Тёплый шарф')).toBeInTheDocument();
        expect(screen.queryByText('🔒')).not.toBeInTheDocument();
    });

    it('у своего дня видно, скольким друзьям он открыт', () => {
        render(<DayCell {...base} me="anna" isOwn myFriends={['boris', 'vika']} wish={wish(['boris'])} />);

        expect(screen.getByText(/👁 1/)).toBeInTheDocument();
    });

    it('праздник: синяя рамка и название в клетке', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики']} />);

        const cell = screen.getByRole('button', { name: '15 октября, День Республики: добавить желание' });
        expect(cell).toHaveClass('holiday');
        expect(screen.getByText('День Республики')).toBeInTheDocument();
    });

    it('официальный и свой праздник — каждый своей строкой', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики', 'День рождения мамы']} />);

        expect(screen.getByText('День Республики')).toBeInTheDocument();
        expect(screen.getByText('День рождения мамы')).toBeInTheDocument();
    });

    it('много праздников: два видно, остальные — «+N»', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики', 'ДР мамы', 'ДР Вики', 'Годовщина']} />);

        expect(screen.getByText('ДР мамы')).toBeInTheDocument();
        expect(screen.queryByText('ДР Вики')).not.toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('картинка с праздником: первый клик прячет подписи, второй открывает день', async () => {
        const onOpen = vi.fn();
        render(<DayCell {...base} me="anna" isOwn wish={wish([])} holidays={['День Республики']} onOpen={onOpen} />);
        const cell = screen.getByRole('button');

        await userEvent.click(cell);
        expect(cell).toHaveClass('peek');       // подписи спрятаны (класс peek делает их прозрачными)
        expect(onOpen).not.toHaveBeenCalled();

        await userEvent.click(cell);
        expect(onOpen).toHaveBeenCalledWith(base.date, cell);
    });

    it('клик по клетке сообщает дату наверх', async () => {
        const onOpen = vi.fn(); // «шпион»: запоминает, с чем его вызвали
        render(<DayCell {...base} me="anna" isOwn onOpen={onOpen} />);

        await userEvent.click(screen.getByRole('button'));

        expect(onOpen).toHaveBeenCalledWith('2026-10-15', expect.any(HTMLElement));
    });
});
```

По шагам:

- `render(<DayCell ... />)` — нарисовать компоненту в jsdom.
- `{...base}` — **разворачивание объекта** (spread): передать все поля `base` как свойства компоненты. Ниже можно добавить или переопределить отдельные.
- `vi.fn()` — **шпион**. Подставляем его вместо `onOpen`, а потом проверяем: `toHaveBeenCalledWith('2026-10-15', ...)` — «тебя вызвали с этой датой?».
- `expect.any(HTMLElement)` — «любой HTML-элемент». Сам элемент клетки нам не важен.
- `await userEvent.click(...)` — клик как у человека. `await`, потому что действие занимает время (события, перерисовка).

### 6.2. `frontend/src/components/DayModal.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Wish } from '../types';
import { DayModal } from './DayModal';

const wish: Wish = {
    id: 1, title: 'Тёплый шарф', comment: 'Синий, длинный',
    img: { emoji: '🎁', bg: '#fff' }, thumb: { emoji: '🎁', bg: '#fff' }, access: [],
};

// Все обработчики — «шпионы» vi.fn(). origin: null — без конфетти (в jsdom нет рисования)
function renderModal(overrides: Partial<Parameters<typeof DayModal>[0]> = {}) {
    const props = {
        date: '2026-10-15', me: 'anna', owner: 'anna', myFriends: ['boris'],
        alreadyAsked: false, origin: null,
        onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onSetAccess: vi.fn(),
        onRequestAccess: vi.fn(), onToast: vi.fn(),
        onAddHoliday: vi.fn(), onRenameHoliday: vi.fn(), onDeleteHoliday: vi.fn(),
        ...overrides,
    };
    render(<DayModal {...props} />);
    return props;
}

describe('DayModal: свой день', () => {
    it('без названия не сохраняет и показывает ошибку', async () => {
        const props = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(screen.getByText('Введите название желания.')).toBeInTheDocument();
        expect(props.onSave).not.toHaveBeenCalled();
    });

    it('сохраняет название, комментарий и выбранных друзей', async () => {
        const props = renderModal();

        await userEvent.type(screen.getByLabelText('Название желания'), '  Наушники ');
        await userEvent.type(screen.getByLabelText('Комментарий / описание'), 'Беспроводные');
        await userEvent.click(screen.getByLabelText('Борис'));
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(props.onSave).toHaveBeenCalledWith('2026-10-15',
            expect.objectContaining({ title: 'Наушники', comment: 'Беспроводные', access: ['boris'] }),
            null); // новую картинку не выбирали
    });

    it('удаляет только после второго нажатия', async () => {
        const props = renderModal({ wish });

        await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
        expect(props.onDelete).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Точно удалить?' }));
        expect(props.onDelete).toHaveBeenCalledWith('2026-10-15');
    });

    it('добавляет свой праздник отдельно от желания', async () => {
        const props = renderModal();

        await userEvent.click(screen.getByText('🎂 Свой праздник')); // блок свёрнут — раскрываем
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'День рождения мамы');
        await userEvent.click(screen.getByRole('button', { name: 'Добавить праздник' }));

        expect(props.onAddHoliday).toHaveBeenCalledWith('2026-10-15', 'День рождения мамы');
        expect(props.onSave).not.toHaveBeenCalled(); // желание при этом не сохраняется
    });

    it('свои праздники показаны списком, у каждого меню ⋮', async () => {
        const mom = { id: 1, month: 10, day: 15, title: 'День рождения мамы' };
        const props = renderModal({ myHolidays: [mom, { id: 2, month: 10, day: 15, title: 'Годовщина' }] });

        expect(screen.getByText('🎂 День рождения мамы')).toBeInTheDocument();
        expect(screen.getByText('🎂 Годовщина')).toBeInTheDocument();

        // ⋮ → «Удалить»: удаляется именно этот праздник
        await userEvent.click(screen.getByRole('button', { name: 'Действия: День рождения мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
        expect(props.onDeleteHoliday).toHaveBeenCalledWith(mom);
    });

    it('⋮ → «Редактировать» меняет название, «Добавить ещё» — новый праздник', async () => {
        const mom = { id: 1, month: 10, day: 15, title: 'ДР мамы' };
        const props = renderModal({ myHolidays: [mom] });

        await userEvent.click(screen.getByRole('button', { name: 'Действия: ДР мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Редактировать' }));
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'а'); // поле уже с названием
        await userEvent.click(screen.getByRole('button', { name: 'Переименовать' }));
        expect(props.onRenameHoliday).toHaveBeenCalledWith(mom, 'ДР мамыа');

        await userEvent.click(screen.getByRole('button', { name: 'Действия: ДР мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить ещё' }));
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'Годовщина{Enter}'); // Enter тоже работает
        expect(props.onAddHoliday).toHaveBeenCalledWith('2026-10-15', 'Годовщина');
    });

    it('показывает официальный праздник в заголовке', () => {
        renderModal({ date: '2026-10-25' });

        expect(screen.getByText('🎉 День Республики')).toBeInTheDocument();
    });

    it('не принимает файл, который не картинка', async () => {
        const props = renderModal();
        const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

        // input с файлом спрятан (hidden), поэтому ищем его напрямую
        const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
        await userEvent.upload(input, pdf, { applyAccept: false });

        expect(props.onToast).toHaveBeenCalledWith('Подойдут картинки JPG, PNG или GIF');
    });
});

describe('DayModal: чужой день', () => {
    it('закрытый день: нет названия, можно попросить доступ', async () => {
        const props = renderModal({ me: 'boris', owner: 'anna', myFriends: ['anna'], wish: { ...wish, title: '', comment: '' } });

        expect(screen.getByText(/Владелец пока не открыл вам этот день/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Название желания')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Попросить доступ' }));
        expect(props.onRequestAccess).toHaveBeenCalledWith('2026-10-15');
    });

    it('после запроса кнопка неактивна', () => {
        renderModal({ me: 'boris', owner: 'anna', wish, alreadyAsked: true });

        expect(screen.getByRole('button', { name: 'Запрос отправлен' })).toBeDisabled();
    });

    it('открытый день показывает текст только для чтения', () => {
        renderModal({ me: 'boris', owner: 'anna', wish: { ...wish, access: ['boris'] } });

        expect(screen.getByText('Тёплый шарф')).toBeInTheDocument();
        expect(screen.getByText('Синий, длинный')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    });
});
```

Что здесь нового:

- `renderModal(overrides)` — своя маленькая функция-помощник. Все свойства окна заданы по умолчанию, тест меняет только нужные: `renderModal({ wish })`.
- `Partial<Parameters<typeof DayModal>[0]>` — тип «любая часть свойств `DayModal`». Читается справа налево: `typeof DayModal` — тип функции, `Parameters<...>[0]` — тип её первого аргумента (props), `Partial` — все поля необязательные.
- `origin: null` — без конфетти. В jsdom нельзя рисовать на `<canvas>`.
- `userEvent.type(поле, '  Наушники ')` — напечатать текст по буквам. Проверяем, что `onSave` получил `'Наушники'` уже без пробелов по краям.
- `userEvent.upload(input, pdf, { applyAccept: false })` — выбрать файл. `applyAccept: false` — не фильтровать файл по `accept="image/..."`: мы как раз проверяем, что наш собственный код его отклонит.
- `expect.objectContaining({...})` — «объект, в котором есть **хотя бы** эти поля». Картинку по умолчанию не проверяем.
- `getByRole('menuitem', { name: 'Удалить' })` — пункт выпадающего меню ⋮. У пунктов меню роль `menuitem`, а не `button`.
- `'Годовщина{Enter}'` — в фигурных скобках `userEvent.type` пишет не буквы, а клавишу. Так проверяем, что праздник добавляется и по Enter.

### 6.3. Проверка

```
npm test
```

```
 ✓ src/lib/dates.test.ts (4 tests)
 ✓ src/data/holidays.test.ts (2 tests)
 ✓ src/api/toWishesByDate.test.ts (3 tests)
 ✓ src/components/DayCell.test.tsx (9 tests)
 ✓ src/components/DayModal.test.tsx (11 tests)

 Test Files  5 passed (5)
      Tests  29 passed (29)
```

И убедись, что сборка не сломалась (TypeScript проверяет и тесты):

```
npm run build
npm run lint
```

---

# Часть 3. Сквозной тест: сценарий показа

## 🔹 Шаг 7. Playwright

### Что будет делать тест

Ровно «сценарий показа» из макета, но по-честному: **два разных человека в двух разных браузерах**, всё через настоящий сервер.

```
Браузер Анны                          Браузер Бориса
────────────                          ──────────────
регистрация «Анна mgk3x1a»            регистрация «Борис mgk3x1a»
находит Бориса, «Добавить в друзья»
                                      «Принять»
15-е число: картинка, название,
комментарий, «Сохранить»
                                      календарь Анны: 15-е с замком,
                                      названия нигде нет, «Попросить доступ»
                                      + напрямую GET /api/calendars/... :
                                        в ответе нет названия, комментария, картинки
видит запрос, открывает 15-е,
включает «Борис»
                                      15-е открыто: видны картинка и комментарий
```

Почему новые пользователи, а не Анна и Борис из базы? Тест меняет данные: создаёт желание, дружбу, доступ.
С новыми людьми (`Date.now()` в имени) тест можно запускать сколько угодно раз, и он не испортит твоих Анну и Бориса.

### 7.1. Установка

В папке `frontend`:

```
npm install -D @playwright/test
npx playwright install chromium
```

Вторая команда скачивает браузер Chromium специально для тестов (около 150 МБ). Твой обычный браузер не трогается.

### 7.2. `frontend/playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

// Настройки Playwright (сквозные тесты в настоящем браузере)
export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,                    // один тест может идти до минуты: в нём два человека и много шагов
    use: {
        baseURL: 'http://localhost:5173', // page.goto('/login') откроет http://localhost:5173/login
        trace: 'retain-on-failure',      // если тест упал — сохранить «запись» всех шагов для разбора
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Перед тестами запустить фронтенд (или взять уже запущенный).
    // Бэкенд, PostgreSQL и MinIO запускаешь сам — см. docs/stage-10.md
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
    },
});
```

- `webServer` — Playwright сам запустит `npm run dev`. `reuseExistingServer: true` — если фронтенд уже запущен, используем его.
- `trace: 'retain-on-failure'` — если тест упал, сохраняется **трассировка** (trace): запись каждого шага со снимками страницы. Очень помогает понять, что пошло не так.

### 7.3. `frontend/e2e/scenario.spec.ts`

```ts
import { expect, test, type Browser, type Page } from '@playwright/test';

// «Сценарий показа» из макета, но с двумя настоящими людьми в двух разных браузерах.
// Каждый запуск создаёт новых пользователей, поэтому тест можно гонять сколько угодно раз.
const run = Date.now().toString(36);   // например 'mgk3x1a' — уникальная метка запуска
const ANNA = `Анна ${run}`;
const BORIS = `Борис ${run}`;
const TITLE = 'Тёплый шарф';
const COMMENT = 'Синий, подлиннее';

// Маленькая картинка 16×16 (розовый квадрат) прямо в коде, чтобы не хранить файл
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4bppHEmIY1TCqYfhqAADMhmoQBmZmNwAAAABJRU5ErkJggg==',
    'base64');

// Свой браузер (контекст) для каждого человека: свои cookie, своя сессия
async function register(browser: Browser, name: string, login: string): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/register');
    await page.getByLabel('Имя').fill(name);
    await page.getByLabel('Email').fill(`${login}-${run}@e2e.test`); // в email только латиница
    await page.getByLabel('Пароль').fill('password123');
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.getByRole('button', { name: 'Мой календарь' })).toBeVisible();
    return page;
}

// Выдвинуть панель «Друзья» кнопкой в шапке
async function openFriends(page: Page) {
    await page.getByRole('button', { name: /^Друзья/ }).click();
    await expect(page.getByRole('dialog', { name: 'Друзья' })).toBeVisible();
}

// Клетка 15-го числа текущего месяца. Её подпись (aria-label) начинается с «15 октября: ...»
function day15(page: Page, state: string | RegExp) {
    return page.getByRole('button', { name: new RegExp(`^15 [а-я]+: ${typeof state === 'string' ? state : state.source}$`) });
}

test('Анна открывает день Борису, и он видит картинку и комментарий', async ({ browser }) => {
    const anna = await register(browser, ANNA, 'anna');
    const boris = await register(browser, BORIS, 'boris');

    await test.step('Анна и Борис становятся друзьями', async () => {
        await openFriends(anna);
        await anna.getByLabel('Найти человека').fill(BORIS);
        await anna.getByRole('button', { name: 'Добавить в друзья' }).click();
        await expect(anna.getByRole('status')).toHaveText('Заявка отправлена');

        await boris.reload();
        await openFriends(boris);
        await expect(boris.getByText(`${ANNA} хочет добавить вас в друзья`)).toBeVisible();
        await boris.getByRole('button', { name: 'Принять' }).click();
        await expect(boris.getByRole('button', { name: new RegExp(`^${ANNA}`) })).toBeVisible(); // появилась в «Моих друзьях»
        await boris.keyboard.press('Escape'); // убрать панель
        await expect(boris.getByRole('button', { name: `Календарь ${ANNA}` })).toBeVisible();
    });

    await test.step('Анна создаёт желание с картинкой', async () => {
        await anna.reload();
        await day15(anna, 'добавить желание').click();
        await anna.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: PNG });
        await anna.getByLabel('Название желания').fill(TITLE);
        await anna.getByLabel('Комментарий / описание').fill(COMMENT);
        await anna.getByRole('button', { name: 'Сохранить' }).click();

        await expect(anna.getByRole('status')).toHaveText('Сохранено');
        await expect(day15(anna, TITLE)).toBeVisible();
    });

    await test.step('Борис видит в календаре Анны замок и просит доступ', async () => {
        await boris.reload();
        await boris.getByRole('button', { name: `Календарь ${ANNA}` }).click();
        await day15(boris, 'день закрыт').click();
        await expect(boris.getByText('Владелец пока не открыл вам этот день')).toBeVisible();
        await expect(boris.getByText(TITLE)).toHaveCount(0); // названия нет нигде на странице

        await boris.getByRole('button', { name: 'Попросить доступ' }).click();
        await expect(boris.getByRole('button', { name: 'Запрос отправлен' })).toBeDisabled();
        await boris.getByRole('button', { name: 'Закрыть' }).click();
    });

    await test.step('Сервер не отдаёт Борису закрытое даже напрямую через API', async () => {
        const annaId = (await (await anna.request.get('/api/me')).json()).id;
        const month = new Date().toISOString().slice(0, 7); // '2026-10'
        const response = await boris.request.get(`/api/calendars/${annaId}?month=${month}`);
        expect(response.ok()).toBe(true);
        const body = await response.text();
        expect(body).not.toContain(TITLE);
        expect(body).not.toContain(COMMENT);
        expect(body).not.toContain('/image');
    });

    await test.step('Анна видит запрос и в окне дня открывает доступ Борису', async () => {
        await anna.reload();
        await openFriends(anna);
        await expect(anna.getByText(`${BORIS} просит доступ к 15`)).toBeVisible();
        await anna.getByRole('button', { name: 'Закрыть' }).click(); // убрать панель
        await day15(anna, TITLE).click();
        // Галочка «живёт» на сервере: она встанет, когда сервер ответит. Поэтому click, а не check
        const toggle = anna.getByRole('checkbox', { name: BORIS });
        await toggle.click();
        await expect(anna.getByRole('status')).toHaveText(`${BORIS} теперь видит этот день`);
        await expect(toggle).toBeChecked();
    });

    await test.step('Борис видит открытый день: картинку и комментарий', async () => {
        await boris.reload();
        await boris.getByRole('button', { name: `Календарь ${ANNA}` }).click();
        await day15(boris, TITLE).click();

        await expect(boris.getByText(COMMENT)).toBeVisible();
        const image = boris.locator('dialog .preview img');
        await expect(image).toHaveAttribute('src', /\/image\?size=full/);
        // Картинка действительно скачалась: у неё есть ширина
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });
});
```

Разберём по частям:

- `browser.newContext()` — новый **контекст**: отдельный «браузер» со своими cookie. Анна и Борис вошли одновременно и не мешают друг другу, как два разных компьютера.
- `openFriends(page)` — нажать «Друзья» в шапке и дождаться, пока выедет панель. Пока панель закрыта, её кнопки и поля спрятаны, и тест бы их не нашёл. Убираем панель клавишей Esc или кнопкой ✕ («Закрыть»).
- `test.step('...', ...)` — шаг с названием. В отчёте видно, на каком именно шаге упало.
- `day15(page, 'день закрыт')` ищет кнопку, у которой подпись `aria-label` — «15 октября: день закрыт». `[а-я]+` в **регулярном выражении** (regular expression, шаблон для поиска текста) — «любое слово из русских букв»: так тест работает в любом месяце.
- `getByRole('status')` — наша всплывашка `Toast` (у неё `role="status"`).
- `boris.reload()` — Борис обновляет страницу, чтобы увидеть новые данные с сервера.
- `setInputFiles({ name, mimeType, buffer })` — выбрать файл, которого нет на диске: картинку мы собрали из строки base64 прямо в тесте.
- Шаг «Сервер не отдаёт Борису закрытое даже напрямую через API»: `boris.request` делает запрос **с cookie Бориса**, то есть от его имени, в обход интерфейса. Так мы доказываем, что закрытое прячет **сервер**, а не только интерфейс.
- Галочку «Борис» нажимаем через `click()`, а не `check()`. Состояние галочки приходит с сервера, и `check()` слишком быстро решает, что «не сработало».
- `expect.poll(...)` — проверять снова и снова, пока не станет правдой (по умолчанию до 5 секунд). `naturalWidth > 0` значит, что картинка действительно скачалась и браузер смог её показать.

### 7.4. `frontend/.gitignore`

Добавь в конец:

```
# Playwright: отчёты и записи упавших тестов
test-results
playwright-report
```

### 7.5. Запуск

Для сквозного теста нужно **всё приложение**:

1. В корне `advent-list`: `docker compose up -d` (PostgreSQL и MinIO).
2. Запусти сервер Spring Boot (в IntelliJ ▶ у `BackendApplication`, или `.\mvnw spring-boot:run` в `backend`).
3. В папке `frontend`:

```
npm run e2e
```

```
Running 1 test using 1 worker
  ✓  1 [chromium] › e2e\scenario.spec.ts:33:1 › Анна открывает день Борису, и он видит картинку и комментарий (10.0s)

  1 passed (12.3s)
```

Хочешь **посмотреть глазами**, как тест работает? Запусти его в окне Playwright:

```
npx playwright test --ui
```

Откроется окно Playwright: слева шаги, справа страница. Можно нажимать на шаги и смотреть, что было на экране в этот момент.

Если тест упал, открой отчёт:

```
npx playwright show-report
```

---

## 🔹 Шаг 8. Всё вместе

| Что | Где | Команда | Нужно запущенным |
|---|---|---|---|
| Бэкенд: юнит + интеграционные | `backend` | `.\mvnw test` | Docker Desktop |
| Фронтенд: компоненты | `frontend` | `npm test` | ничего |
| Сквозной | `frontend` | `npm run e2e` | `docker compose up -d` + сервер |

На этапе 13 эти же команды будет запускать **GitHub Actions** при каждом `git push`.

💡 Про Redis. В задании написано «Testcontainers с настоящими PostgreSQL и Redis». Redis появится только на этапе 11 (кэширование).
Тогда мы добавим в `TestcontainersConfiguration` третий контейнер, точно так же, как PostgreSQL.

## 🔹 Шаг 9. Коммит

В корне `advent-list`:

```
git status
git add .
git commit -m "Этап 10: Testcontainers, юнит-тесты, тесты компонентов, e2e-сценарий"
```

Проверь в `git status`, что в список **не попали** папки `test-results`, `playwright-report` и `node_modules`.

## 🔹 Если что-то не так

| Ошибка | Почему | Что делать |
|---|---|---|
| `Could not find a valid Docker environment` | Docker Desktop не запущен | запусти Docker Desktop, дождись зелёного статуса |
| `cannot find symbol PostgreSQLContainer` | Maven не скачал библиотеки | шаг 1.1, затем **Load Maven Changes** |
| `package org.testcontainers.postgresql does not exist` | старая версия Testcontainers | версию не указывай, пусть её выбирает Spring Boot |
| Тесты ждут минуты на первом запуске | Docker скачивает образы | дождись; второй запуск быстрый |
| `Failed to verify that image 'pgsty/minio...' is a compatible substitute` | забыл `asCompatibleSubstituteFor` | шаг 1.2 |
| Vitest: `showModal is not a function` | нет файла подготовки | шаг 4.2 и `setupFiles` в 4.1 |
| Vitest: `Invalid Chai property: toBeInTheDocument` | не подключён jest-dom | первая строка `setup.ts` |
| Vitest запускает `e2e/scenario.spec.ts` и падает | нет `include` | шаг 4.1 |
| `npm run build`: `Cannot find module 'vitest'` | библиотеки не установлены | шаг 4 |
| Playwright: `Executable doesn't exist` | не скачан браузер | `npx playwright install chromium` |
| Playwright: `Сервер недоступен` на странице | Spring Boot не запущен | шаг 7.5, пункт 2 |
| Playwright: падает на «Сохранено» | MinIO не запущен | `docker compose up -d` |

## 🔹 Созданные и изменённые файлы

```
backend/
├── pom.xml                                         + 4 библиотеки Testcontainers
└── src/test/java/com/adventcalendar/calendar/
    ├── TestcontainersConfiguration.java            ← новый: PostgreSQL и MinIO для тестов
    ├── BackendApplicationTests.java                + @Import(TestcontainersConfiguration.class)
    ├── access/AccessRulesTest.java                 + @Import(...)
    ├── access/AccessServiceTest.java               ← новый: 6 юнит-тестов
    ├── image/ImageRulesTest.java                   + @Import(...)
    ├── image/WishImageServiceTest.java             ← новый: 4 юнит-теста
    ├── image/ImageProcessorTest.java               ← новый: 5 юнит-тестов
    ├── security/SecurityRulesTest.java             ← новый: 7 тестов входа и защиты
    ├── holiday/HolidayRulesTest.java               ← новый: 9 тестов своих праздников
    └── wish/WishServiceTest.java                   ← новый: 6 юнит-тестов

frontend/
├── package.json                                    + test, test:watch, e2e; библиотеки для тестов
├── vite.config.ts                                  + раздел test
├── playwright.config.ts                            ← новый
├── .gitignore                                      + test-results, playwright-report
├── e2e/scenario.spec.ts                            ← новый: сценарий показа
└── src/
    ├── test/setup.ts                               ← новый
    ├── lib/dates.test.ts                           ← новый
    ├── data/holidays.test.ts                       ← новый
    ├── api/toWishesByDate.test.ts                  ← новый
    ├── components/DayCell.test.tsx                 ← новый
    └── components/DayModal.test.tsx                ← новый
```

## Главное, что нужно запомнить

- **Пирамида тестов:** много быстрых юнит-тестов, меньше интеграционных, совсем немного сквозных.
- **Заглушка** (mock) подменяет соседа класса. Мы говорим ей, что отвечать (`when ... thenReturn`), и проверяем, как её вызывали (`verify`).
- **Testcontainers** даёт тестам свою одноразовую базу в Docker. Тесты не зависят от твоих данных и не портят их.
- В тестах интерфейса ищем элементы **как человек**: по роли и надписи, а не по классам CSS.
- Главное правило проекта («закрытое не уходит с сервера») теперь доказано на трёх уровнях: сервис, API и настоящий браузер.
