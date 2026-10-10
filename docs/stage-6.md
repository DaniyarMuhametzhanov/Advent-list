# Этап 6. Пользователи и вход

## 🔹 Что делаем и зачем

Сейчас сервер считает, что **любой** запрос пришёл от Анны: в `WishService` записано `CURRENT_USER_ID = 1L`.
А во фронтенде «кто я» выбирается переключателем «Смотреть как». Так нельзя выпускать сайт: кто угодно увидит и изменит чужие желания.

На этом этапе:

1. **Регистрация**: имя, email, пароль. Пароль храним только в виде хеша (**BCrypt**).
2. **Вход и выход**.
3. **Защита адресов** (эндпоинтов): без входа сервер отвечает `401`.
4. **Свои желания по-настоящему свои**: сервер берёт «кто я» из сессии, а не из константы.
5. **Страницы** «Вход» и «Регистрация» во фронтенде, кнопка «Выйти» вместо «Смотреть как».

Что **не** трогаем: друзья, Борис и Вика в правой панели, доступы и картинки пока остаются фейковыми (этапы 7–9).

После этапа можно будет войти как Анна (пароль `password123`), выйти, зарегистрировать нового человека,
и у каждого будет **свой** календарь.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Аутентификация** (authentication) | проверка «кто ты»: email + пароль |
| **Авторизация** (authorization) | проверка «что тебе можно» (например, только свои желания) |
| **Хеш** (hash) | «отпечаток» пароля. Из пароля отпечаток получить легко, а из отпечатка пароль — нет |
| **BCrypt** | алгоритм хеширования паролей. Он специально медленный и добавляет к паролю случайную «соль», чтобы перебор был очень дорогим |
| **Сессия** (session) | память сервера о том, кто ты. Хранится на сервере, а у браузера только её номер |
| **Cookie** | маленькая записка, которую сервер отдаёт браузеру, а браузер сам прикладывает к каждому следующему запросу |
| **Spring Security** | библиотека Spring, которая проверяет каждый запрос до того, как он дойдёт до контроллера |
| **CSRF** | атака «подделка запроса»: чужой сайт заставляет твой браузер отправить запрос нашему серверу с твоими cookie |

## 🔹 Выбор: сессия с cookie или JWT

В задании два варианта. Сравним.

| | Сессия + cookie | JWT (токен) |
|---|---|---|
| Где хранится «кто я» | на сервере, в памяти | внутри самого токена, у браузера |
| Что у браузера | только номер сессии в cookie `JSESSIONID` | весь токен, обычно в `localStorage` |
| Может ли вредный JavaScript украсть | **нет**: cookie помечена `HttpOnly`, JS её не видит | **да**: `localStorage` читается любым скриптом на странице |
| Выйти «по-настоящему» | легко: сервер удаляет сессию | сложно: токен живёт, пока не истечёт срок |
| Сколько кода | мало, многое делает Spring | больше: выдать, подписать, проверять, обновлять |

**Выбираем сессию с cookie.** Причины:

- фронт и бэк у нас на **одном адресе** (прокси Vite сейчас, Caddy на этапе 14), а для этого случая cookie — самый простой и безопасный вариант;
- JWT нужен, когда сервер должен «ничего не помнить» (много серверов, мобильное приложение). Нам это не нужно.

Аналогия 🎫: сессия — это гардероб. Ты отдаёшь пальто (данные о себе), тебе дают номерок (`JSESSIONID`).
Потерянный номерок ничего не говорит о тебе, а гардеробщик может в любой момент «закрыть» номерок.
JWT — это как носить пальто с собой и показывать его на входе: удобно, но его можно стащить, и «отменить» пальто нельзя.

### А CSRF?

Минус cookie: браузер прикладывает их **сам**, к любому запросу на наш сервер, даже если запрос сделал чужой сайт.
Защита: сервер кладёт в ещё одну cookie `XSRF-TOKEN` случайную строку, а наш фронт **копирует** её в заголовок `X-XSRF-TOKEN`.
Чужой сайт прочитать нашу cookie не может, значит и заголовок не подделает. В Spring Security это включается одной строкой `csrf.spa()`.

## 🔹 Как будет устроено

```
Браузер                         Spring Boot
   │ POST /api/auth/login   ──►  проверить email и пароль (BCrypt)
   │   {email, password}        создать сессию, запомнить «это Анна (id 1)»
   │ ◄── Set-Cookie: JSESSIONID=...   (HttpOnly)
   │
   │ GET /api/wishes        ──►  Spring Security: по JSESSIONID нашёл сессию → это Анна
   │   Cookie: JSESSIONID=...    контроллер получает CurrentUser(id = 1)
   │ ◄── желания Анны
   │
   │ GET /api/wishes (без cookie) ──► 401 Unauthorized
```

## 🔹 Шаг 1. Подключи Spring Security

`backend/pom.xml`, в `<dependencies>` после `spring-boot-starter-validation` добавь:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```

В IntelliJ нажми значок **Load Maven Changes** (слон со стрелкой справа вверху), чтобы библиотека скачалась.

### Эксперимент 🔬

Запусти базу (`docker compose up -d`) и `BackendApplication`. Открой `http://localhost:8080/api/wishes`.

Вместо списка появится **страница входа Spring** с полями Username и Password. А в логе сервера будет строка
`Using generated security password: ...`.

Что произошло: просто добавив библиотеку, ты закрыл **все** адреса. Spring Security по умолчанию подозрительный:
«всё запрещено, пока не разрешено». Дальше мы сами скажем, что открыто, а что нет, и уберём эту стандартную страницу.

Останови сервер.

## 🔹 Шаг 2. Пользователь: конструктор и поиск по email

### 2.1. `user/User.java` — добавь конструктор

Сейчас у `User` есть только пустой `protected User()` для JPA. Чтобы создавать новых людей при регистрации,
добавь под ним **конструктор** (способ создать объект с нужными полями):

```java
    public User(String name, String email, String passwordHash) {
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
    }
```

`id` и `createdAt` не передаём: `id` выдаст база, `createdAt` заполнит `@PrePersist`.

### 2.2. `user/UserRepository.java`

```java
package com.adventcalendar.calendar.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
```

- `findByEmail` — Spring Data сам поймёт по названию: «найти по полю email». `Optional` — «может найтись, а может нет».
- `existsByEmail` — «есть ли такой email?» Нужен, чтобы не зарегистрировать один email дважды.

## 🔹 Шаг 3. Пакет `security`: кто такой «вошедший пользователь»

Создай пакет `com.adventcalendar.calendar.security` (правый клик по `calendar` → New → Package).

### 3.1. `CurrentUser.java` — «пропуск» вошедшего

Spring Security не знает про нашу сущность `User`. Он понимает свой интерфейс (**interface**, набор обязательных методов) `UserDetails`.
Делаем свою запись (**record**), которая его реализует:

```java
package com.adventcalendar.calendar.security;

import com.adventcalendar.calendar.user.User;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

// «Пропуск» вошедшего человека: Spring Security хранит его в сессии
public record CurrentUser(Long id, String name, String email, String passwordHash) implements UserDetails {

    public static CurrentUser from(User user) {
        return new CurrentUser(user.getId(), user.getName(), user.getEmail(), user.getPasswordHash());
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(); // ролей (админ и т. п.) у нас нет
    }
}
```

- `implements UserDetails` — обещаем Spring, что у нас есть методы `getUsername`, `getPassword`, `getAuthorities`.
- `getUsername()` возвращает email, потому что входим по email.
- `getPassword()` возвращает **хеш**, а не пароль. Spring сам сравнит введённый пароль с хешем.
- `getAuthorities()` — роли (права). У нас их нет, поэтому пустой список.
- `from(User)` — удобный способ сделать пропуск из сущности (**фабричный метод**).

### 3.2. `DbUserDetailsService.java` — где искать людей

```java
package com.adventcalendar.calendar.security;

import com.adventcalendar.calendar.user.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

// Spring Security спрашивает: «найди человека по логину». Логин у нас — email.
@Service
public class DbUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public DbUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return userRepository.findByEmail(email)
                .map(CurrentUser::from)
                .orElseThrow(() -> new UsernameNotFoundException("Пользователь не найден"));
    }
}
```

При входе Spring Security вызовет `loadUserByUsername("anna@example.com")`. Мы ищем человека в базе и отдаём пропуск.
Не нашли — бросаем `UsernameNotFoundException`. Spring сам превратит её в «неверный email или пароль».

### 3.3. `SecurityConfig.java` — правила охраны

```java
package com.adventcalendar.calendar.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // 1. Кого пускать без входа
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/health", "/api/auth/register", "/api/auth/login", "/error").permitAll()
                        .anyRequest().authenticated())
                // 2. Защита от подделки запросов с чужих сайтов (CSRF) в варианте для React
                .csrf(csrf -> csrf.spa())
                // 3. Не вошёл → просто ответ 401, без перенаправления на страницу входа Spring
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                // 4. Выход: POST /api/auth/logout удаляет сессию и отвечает 200
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()));
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
```

Разберём по частям:

- `@Configuration` + `@Bean` — «Spring, создай эти объекты и держи у себя». Так мы отдаём ему свои настройки.
- `SecurityFilterChain` — **цепочка фильтров**: проверки, через которые проходит каждый запрос до контроллера. Как охрана на входе в здание.
- **1.** `permitAll()` — пускать всех: проверка здоровья, регистрация, вход и `/error` (страница ошибок Spring, иначе любая ошибка превратится в 401).
  `anyRequest().authenticated()` — всё остальное только после входа.
- **2.** `csrf.spa()` — включает защиту CSRF в варианте для одностраничных приложений (**SPA**, как наш React):
  сервер сам ставит cookie `XSRF-TOKEN` и ждёт её копию в заголовке `X-XSRF-TOKEN`.
- **3.** Без этой строки Spring при отсутствии входа **перенаправлял бы** на свою страницу входа. Нам нужен простой ответ `401`, а страницу входа нарисует React.
- **4.** `logout` — Spring сам сделает адрес выхода: удалит сессию и ответит `200`.
- `PasswordEncoder` → `BCryptPasswordEncoder` — чем хешировать и проверять пароли.
- `AuthenticationManager` — «проверяльщик»: получает email + пароль, через `DbUserDetailsService` и `PasswordEncoder` говорит «да, это Анна» или бросает ошибку.
  Мы берём его из настроек Spring, чтобы вызвать в своём контроллере.

## 🔹 Шаг 4. Пакет `auth`: регистрация и вход

Создай пакет `com.adventcalendar.calendar.auth`.

### 4.1. Что приходит и что уходит (DTO)

`RegisterRequest.java`:

```java
package com.adventcalendar.calendar.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Имя обязательно")
        @Size(max = 100, message = "Имя не длиннее 100 символов")
        String name,

        @NotBlank(message = "Email обязателен")
        @Email(message = "Это не похоже на email")
        @Size(max = 255, message = "Email слишком длинный")
        String email,

        @NotBlank(message = "Пароль обязателен")
        @Size(min = 8, max = 72, message = "Пароль от 8 до 72 символов")
        String password
) {
}
```

Почему пароль **не длиннее 72**: BCrypt учитывает только первые 72 байта, а Spring Security на более длинный пароль бросает ошибку.
Лучше честно сказать об этом в проверке.

`LoginRequest.java`:

```java
package com.adventcalendar.calendar.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Email обязателен")
        String email,

        @NotBlank(message = "Пароль обязателен")
        String password
) {
}
```

`MeResponse.java`:

```java
package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.security.CurrentUser;

// Что фронтенд узнаёт о вошедшем человеке. Пароля (и его хеша) здесь нет!
public record MeResponse(Long id, String name, String email) {

    public static MeResponse from(CurrentUser user) {
        return new MeResponse(user.id(), user.name(), user.email());
    }
}
```

⚠️ Никогда не отдавай наружу сущность `User` целиком: в ней `passwordHash`. Поэтому отдельный DTO.

`EmailTakenException.java`:

```java
package com.adventcalendar.calendar.auth;

public class EmailTakenException extends RuntimeException {

    public EmailTakenException() {
        super("Этот email уже зарегистрирован");
    }
}
```

### 4.2. `AuthService.java` — регистрация

```java
package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public void register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new EmailTakenException();
        }
        String hash = passwordEncoder.encode(request.password()); // сам пароль не храним, только хеш
        userRepository.save(new User(request.name().trim(), email, hash));
    }

    // «Anna@Example.com » и «anna@example.com» — один и тот же человек
    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }
}
```

- `normalizeEmail` — приводим email к одному виду (убираем пробелы, делаем маленькие буквы). Иначе `Anna@…` и `anna@…` стали бы двумя людьми.
- `passwordEncoder.encode(...)` — превращает `secret123` в строку вида `$2a$10$...`. В базе будет только она.

### 4.3. `AuthController.java` — адреса `/api/auth/...` и `/api/me`

```java
package com.adventcalendar.calendar.auth;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    // Умеет сохранить «кто вошёл» в сессию, чтобы следующие запросы это знали
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthService authService, AuthenticationManager authenticationManager) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public MeResponse register(@Valid @RequestBody RegisterRequest body,
                               HttpServletRequest request, HttpServletResponse response) {
        authService.register(body);
        return signIn(body.email(), body.password(), request, response); // после регистрации сразу входим
    }

    @PostMapping("/auth/login")
    public MeResponse login(@Valid @RequestBody LoginRequest body,
                            HttpServletRequest request, HttpServletResponse response) {
        return signIn(body.email(), body.password(), request, response);
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal CurrentUser me) {
        return MeResponse.from(me);
    }

    private MeResponse signIn(String email, String password,
                              HttpServletRequest request, HttpServletResponse response) {
        // 1. Проверить email и пароль. Если неверно — вылетит BadCredentialsException
        Authentication auth = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(AuthService.normalizeEmail(email), password));

        // 2. Выдать новый номер сессии (защита от «фиксации сессии»)
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }

        // 3. Запомнить в сессии, кто вошёл
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        return MeResponse.from((CurrentUser) auth.getPrincipal());
    }
}
```

Разберём `signIn` — это сердце входа:

1. `authenticationManager.authenticate(...)` — проверить email и пароль. `unauthenticated` значит «вот данные, проверь их».
   Если неверно, вылетит `BadCredentialsException`, и дальше код не пойдёт.
2. `changeSessionId()` — выдать **новый** номер сессии. Защита от атаки «фиксация сессии» (**session fixation**):
   злоумышленник не сможет заранее подсунуть тебе свой номер и потом войти по нему.
3. `SecurityContext` — «кто сейчас вошёл». Мы кладём его в сессию через `HttpSessionSecurityContextRepository`,
   и на следующих запросах Spring Security сам достанет его по cookie `JSESSIONID`.

`@AuthenticationPrincipal CurrentUser me` в методе `me()` — Spring сам подставит пропуск вошедшего человека.
Этим же приёмом сейчас воспользуемся в желаниях.

### 4.4. Ошибки входа и регистрации

В `error/GlobalExceptionHandler.java` добавь два обработчика (рядом с `handleNotFound`):

```java
    @ExceptionHandler(EmailTakenException.class)
    public ProblemDetail handleEmailTaken(EmailTakenException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(AuthenticationException.class)
    public ProblemDetail handleBadLogin(AuthenticationException ex) {
        // Не говорим, что именно не так (email или пароль), чтобы нельзя было подбирать email
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Неверный email или пароль");
    }
```

И импорты вверху файла:

```java
import com.adventcalendar.calendar.auth.EmailTakenException;
import org.springframework.security.core.AuthenticationException;
```

- `409 Conflict` — «конфликт с тем, что уже есть»: такой email занят.
- `401 Unauthorized` — «не получилось понять, кто ты».

## 🔹 Шаг 5. Желания берут «кто я» из сессии

### 5.1. `wish/WishService.java`

Убери константу `CURRENT_USER_ID` и комментарий над ней. Вместо неё каждый метод получает `ownerId` первым параметром:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    private final WishRepository wishRepository;
    private final UserRepository userRepository;

    public WishService(WishRepository wishRepository, UserRepository userRepository) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll(Long ownerId) {
        return wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId).stream()
                .map(WishResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long ownerId, Long id) {
        return wishRepository.findByIdAndOwnerId(id, ownerId)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(Long ownerId, LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(ownerId, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(ownerId), date));
        wish.update(request.title(), request.comment());
        return WishResponse.from(wishRepository.save(wish));
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }
}
```

### 5.2. `wish/WishController.java`

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    public List<WishResponse> findAll(@AuthenticationPrincipal CurrentUser me) {
        return service.findAll(me.id());
    }

    @GetMapping("/{id}")
    public WishResponse findById(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        return service.findById(me.id(), id);
    }

    @PutMapping("/{date}")
    public WishResponse save(@AuthenticationPrincipal CurrentUser me,
                             @PathVariable LocalDate date, @Valid @RequestBody WishRequest request) {
        return service.saveForDate(me.id(), date, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.delete(me.id(), id);
    }
}
```

Теперь контроллер говорит сервису: «работай с желаниями **вот этого** человека». А кто это — знает только сервер, по сессии.
Подделать это из браузера нельзя: в запросе нет поля «я — Анна».

## 🔹 Шаг 6. Проверь сервер руками

Запусти `BackendApplication`.

1. Открой `http://localhost:8080/api/wishes` → пустая страница, а во вкладке **F12 → Network** статус `401`. Стандартной страницы входа Spring больше нет.
2. Открой `http://localhost:8080/api/health` → `{"status":"ok"}`. Этот адрес открыт.

### Проверка в Postman 📮

Postman сам запоминает cookie (у него есть своя «банка с cookie», **cookie jar**) и прикладывает их к следующим запросам,
как браузер. Нам нужно только вручную копировать CSRF-токен в заголовок.

**1. Получить CSRF-токен.** `GET http://localhost:8080/api/me` → ответ `401`, это нормально (мы ещё не вошли).
Но сервер положил две cookie. Нажми **Cookies** (справа под кнопкой Send) → `localhost`:

- `JSESSIONID` — номер сессии;
- `XSRF-TOKEN` — скопируй его **значение** (строка вида `2050f730-3f5e-...`).

**2. Войти.** `POST http://localhost:8080/api/auth/login`

- вкладка **Headers**: ключ `X-XSRF-TOKEN`, значение — скопированный токен;
- вкладка **Body** → **raw** → **JSON**:

```json
{
  "email": "anna@example.com",
  "password": "password123"
}
```

Ответ `200` и `{"id":1,"name":"Анна","email":"anna@example.com"}`.

Попробуй тот же запрос **без** заголовка `X-XSRF-TOKEN` (сними галочку у него) → `403 Forbidden`. Это CSRF-защита.
И с неверным паролем → `401` и «Неверный email или пароль».

**3. Проверить, что сервер тебя помнит.** `GET http://localhost:8080/api/me` → `200`, Анна.
`GET http://localhost:8080/api/wishes` → желания Анны. Заголовок для `GET` не нужен: CSRF проверяется только у запросов,
которые что-то меняют (`POST`, `PUT`, `DELETE`).

**4. Изменить данные.** `PUT http://localhost:8080/api/wishes/2026-10-30` с заголовком `X-XSRF-TOKEN` и телом
`{"title": "Тест из Postman", "comment": ""}` → `200`.

**5. Выйти.** `POST http://localhost:8080/api/auth/logout` с заголовком `X-XSRF-TOKEN` → `200`.
Теперь `GET /api/wishes` → снова `401`.

⚠️ При выходе сервер выдаёт **новый** CSRF-токен. Поэтому перед следующим `POST` повтори пункт 1 и скопируй свежий токен.

**6. Регистрация.** `POST http://localhost:8080/api/auth/register` с заголовком и телом:

```json
{
  "name": "Даня",
  "email": "danya@example.com",
  "password": "secret123"
}
```

Ответ `201 Created`, и ты сразу вошёл как новый человек: `GET /api/wishes` → `[]`, пустой список.
Отправь ещё раз → `409` «Этот email уже зарегистрирован». Отправь `"password": "123"` → `400` с текстом про длину пароля.

💡 Если надоест копировать токен: в Postman у запроса есть вкладка **Scripts → Pre-request**. Вставь туда

```js
pm.request.headers.upsert({ key: 'X-XSRF-TOKEN', value: pm.cookies.get('XSRF-TOKEN') });
```

Скрипт перед каждой отправкой сам достанет токен из cookie и положит его в заголовок. Это необязательно, руками тоже нормально.

## 🔹 Шаг 7. Фронтенд: установи React Router

Сейчас у нас одна страница. Нужны три: `/` (календарь), `/login`, `/register`.
**React Router** — библиотека, которая показывает нужный компонент в зависимости от адреса в строке браузера (**маршрутизация**, routing).

В папке `frontend`:

```
npm install react-router
```

## 🔹 Шаг 8. Общий файл для запросов: `src/api/http.ts`

Раньше функция `request` жила внутри `wishes.ts`. Теперь она нужна и для входа, поэтому выносим её в отдельный файл
и учим двум новым вещам: класть CSRF-токен в заголовок и запоминать код ответа (чтобы отличить `401`).

Создай `frontend/src/api/http.ts`:

```ts
// Общая функция для всех запросов к нашему серверу.

// Ошибка, которая помнит код ответа (401, 404...), чтобы его можно было проверить
export class HttpError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

// Достать значение cookie по имени. document.cookie выглядит так: "a=1; XSRF-TOKEN=abc"
function readCookie(name: string): string | undefined {
    const pair = document.cookie.split('; ').find(c => c.startsWith(name + '='));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

// Отправить запрос, проверить ответ, достать JSON.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Защита от CSRF: сервер положил токен в cookie XSRF-TOKEN,
    // а мы возвращаем его в заголовке. Чужой сайт этот cookie прочитать не может.
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;

    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
        // Наш GlobalExceptionHandler отвечает в формате ProblemDetail: { detail, errors? }
        const problem = await response.json().catch(() => null);
        const fieldError = problem?.errors && Object.values(problem.errors)[0];
        throw new HttpError(fieldError ?? problem?.detail ?? `Ошибка сервера: ${response.status}`, response.status);
    }

    // Тела может не быть: 204 No Content (удаление) или пустой ответ 200 (выход)
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
}
```

- `class HttpError extends Error` — своя ошибка (**наследование**: «это обычная ошибка, плюс поле `status`»).
- `readCookie` — `document.cookie` отдаёт все cookie одной строкой, мы находим нужную.
  `JSESSIONID` мы здесь **не видим**, потому что она `HttpOnly`. Так и задумано.
- В конце читаем ответ как текст: выход отвечает пустым телом, и `response.json()` на нём упал бы.

Теперь `frontend/src/api/wishes.ts` становится короче:

```ts
// Всё общение с сервером про желания — в одном файле.
import { request } from './http';

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

## 🔹 Шаг 9. Запросы и хуки входа

`frontend/src/api/auth.ts`:

```ts
// Запросы про вход: кто я, войти, зарегистрироваться, выйти.
import { HttpError, request } from './http';

// Это MeResponse из Java
export type Me = {
    id: number;
    name: string;
    email: string;
};

export type LoginInput = { email: string; password: string };
export type RegisterInput = { name: string; email: string; password: string };

// Кто я? Если не вошёл, сервер ответит 401 — тогда возвращаем null («никто»)
export async function fetchMe(): Promise<Me | null> {
    try {
        return await request<Me>('/api/me');
    } catch (e) {
        if (e instanceof HttpError && e.status === 401) return null;
        throw e;
    }
}

export function login(input: LoginInput) {
    return request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function register(input: RegisterInput) {
    return request<Me>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function logout() {
    return request<void>('/api/auth/logout', { method: 'POST' });
}
```

`fetchMe` превращает `401` в `null`. Для нас «не вошёл» — это не ошибка, а нормальный ответ «никто».

`frontend/src/api/useAuth.ts`:

```ts
// Хуки TanStack Query для входа.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, login, logout, register, type Me } from './auth';

const ME = ['me'];

export function useMe() {
    return useQuery({
        queryKey: ME,
        queryFn: fetchMe,
        retry: false,        // 401 — это не сбой, повторять не нужно
        staleTime: Infinity, // «кто я» не меняется, пока сами не войдём или не выйдем
    });
}

export function useLogin() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: login,
        // Сервер вернул «кто я» — сразу кладём в хранилище, повторно спрашивать не нужно
        onSuccess: (me: Me) => queryClient.setQueryData(ME, me),
    });
}

export function useRegister() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: register,
        onSuccess: (me: Me) => queryClient.setQueryData(ME, me),
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            // 1. «Я — никто». RequireAuth это увидит и сам отправит на /login
            queryClient.setQueryData(ME, null);
            // 2. Забываем всё остальное о прошлом пользователе (его желания и т. д.)
            queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
        },
    });
}
```

- `useMe` — одна запись `['me']` в блокноте TanStack Query на всё приложение. Её читают охранник, шапка и `App`.
- `setQueryData` — записать в блокнот ответ **без** запроса к серверу. После входа сервер и так прислал «кто я».
- При выходе удаляем все остальные записи, иначе следующий человек на том же компьютере на секунду увидел бы чужие желания.

## 🔹 Шаг 10. Охранник `RequireAuth`

`frontend/src/components/RequireAuth.tsx`:

```tsx
// «Охранник» для страниц, куда можно только после входа.
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMe } from '../api/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
    const me = useMe();

    if (me.isPending) return <p className="page-msg">Проверяю вход…</p>;
    if (me.isError) return <p className="page-msg">Сервер недоступен: {me.error.message}</p>;
    if (!me.data) return <Navigate to="/login" replace />; // не вошёл → на страницу входа

    return children;
}
```

- `children` — то, что положили внутрь `<RequireAuth>...</RequireAuth>`.
- `<Navigate to="/login" replace />` — перейти на другой адрес. `replace` значит «не оставлять в истории», чтобы кнопка «Назад» не возвращала на закрытую страницу.

⚠️ Это охрана **только для удобства**. Настоящая защита — на сервере (шаг 3). Любой может обойти React, но не Spring Security.

## 🔹 Шаг 11. Страницы входа и регистрации

Создай папку `frontend/src/pages`.

`pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useLogin, useMe } from '../api/useAuth';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const me = useMe();
    const loginMutation = useLogin();
    const navigate = useNavigate();

    // Уже вошёл — здесь делать нечего
    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault(); // не перезагружать страницу, как делает обычная форма
        loginMutation.mutate({ email, password }, { onSuccess: () => navigate('/') });
    }

    return (
        <main className="auth card">
            <h1>Вход</h1>
            <form onSubmit={submit}>
                <label className="lbl">Email
                    <input className="field" type="email" autoComplete="email" required
                           value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                <label className="lbl">Пароль
                    <input className="field" type="password" autoComplete="current-password" required
                           value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                {loginMutation.isError && <p className="err">{loginMutation.error.message}</p>}
                <button className="btn" disabled={loginMutation.isPending}>Войти</button>
            </form>
            <p className="hint">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
        </main>
    );
}
```

- `<form onSubmit>` + `e.preventDefault()` — обычная HTML-форма перезагрузила бы страницу. Мы это отменяем и отправляем сами.
  Зато работает **Enter** и браузер может предложить сохранить пароль.
- `autoComplete="current-password"` — подсказка браузеру и менеджеру паролей, что это за поле.
- `<Link to="/register">` — ссылка, которая меняет адрес **без** перезагрузки страницы.

`pages/RegisterPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMe, useRegister } from '../api/useAuth';

export function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const me = useMe();
    const registerMutation = useRegister();
    const navigate = useNavigate();

    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault();
        registerMutation.mutate({ name, email, password }, { onSuccess: () => navigate('/') });
    }

    return (
        <main className="auth card">
            <h1>Регистрация</h1>
            <form onSubmit={submit}>
                <label className="lbl">Имя
                    <input className="field" autoComplete="name" required maxLength={100}
                           value={name} onChange={e => setName(e.target.value)} />
                </label>
                <label className="lbl">Email
                    <input className="field" type="email" autoComplete="email" required
                           value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                <label className="lbl">Пароль (от 8 символов)
                    <input className="field" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
                           value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                {registerMutation.isError && <p className="err">{registerMutation.error.message}</p>}
                <button className="btn" disabled={registerMutation.isPending}>Создать аккаунт</button>
            </form>
            <p className="hint">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </main>
    );
}
```

Проверки `required`, `minLength` в браузере — только подсказка. Сервер всё равно проверит сам (`@Valid` + `RegisterRequest`).

В конец `frontend/src/index.css` добавь стили:

```css
/* Страницы входа и регистрации (этап 6) */
.auth{max-width:400px;margin:64px auto;padding:28px;display:grid;gap:18px}
.auth h1{font-family:var(--display);font-size:24px}
.auth form{display:grid;gap:14px}
.auth a{color:var(--berry);font-weight:600}
.page-msg{text-align:center;margin-top:64px}
.me{display:flex;align-items:center;gap:8px;font-weight:600}
```

## 🔹 Шаг 12. Маршруты в `main.tsx`

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import App from './App.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { RequireAuth } from './components/RequireAuth.tsx'

// Хранилище ответов сервера для всего приложения
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/" element={<RequireAuth><App /></RequireAuth>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
)
```

- `BrowserRouter` — следит за адресной строкой.
- `Routes` / `Route` — таблица «адрес → что показать». `path="*"` — любой другой адрес, отправляем на главную.
- `/` обёрнут в `RequireAuth`: календарь только после входа.

## 🔹 Шаг 13. Шапка: имя и «Выйти» вместо «Смотреть как»

`frontend/src/components/Header.tsx`:

```tsx
import type { UserId } from '../types';
import { USERS } from '../data/fakeData';
import { Avatar } from './Avatar';

type Props = {
    me: UserId;
    badge: number;
    onFriendsClick: () => void;
    onLogout: () => void;
};

export function Header({ me, badge, onFriendsClick, onLogout }: Props) {
    return (
        <header className="top">
            <div className="top-in">
                <div className="logo"><i>🎁</i><span>Адвент-календарь</span></div>

                <span className="me"><Avatar user={USERS[me]} />{USERS[me].name}</span>
                <button className="btn sm ghost" onClick={onLogout}>Выйти</button>

                <button className="btn-friends" onClick={onFriendsClick}>
                    Друзья{badge > 0 && <span className="badge">{badge}</span>}
                </button>
            </div>
        </header>
    );
}
```

## 🔹 Шаг 14. `App.tsx`: «я» берём с сервера

Друзья пока фейковые и знают людей по строкам `'anna'`, `'boris'`, `'vika'`. А сервер знает числа `1, 2, 3`.
Нужен «переводчик». В конец `frontend/src/data/fakeData.ts` добавь:

```ts
// Этап 6: настоящий пользователь с сервера → его «двойник» в фейковых данных
// (друзья пока фейковые, до этапа 7). Анна, Борис и Вика — это id 1, 2, 3 в базе.
// Нового человека добавляем на лету: у него пока нет ни друзей, ни заявок.
const SEED_IDS: Record<number, UserId> = { 1: 'anna', 2: 'boris', 3: 'vika' };

export function fakeIdFor(user: { id: number; name: string }): UserId {
    const seeded = SEED_IDS[user.id];
    if (seeded) return seeded;
    const id = 'user' + user.id;
    USERS[id] ??= { id, name: user.name, gen: user.name, color: '#6B7280' };
    return id;
}
```

`??=` — «присвоить, только если там пусто» (оператор **логического присваивания**). Это временный код, на этапе 7 он уйдёт.

Теперь правки в `frontend/src/App.tsx`. Их немного, делай по одной.

**а) Импорты.** Замени строку импорта `USERS` и добавь импорт хуков входа:

```tsx
import { USERS, fakeIdFor } from './data/fakeData';
```

```tsx
import { useLogout, useMe } from './api/useAuth';
```

**б) Начало компонента.** Было:

```tsx
  const [me, setMe] = useState<UserId>('anna');        // кто «я» (пока через «Смотреть как»)
  const [owner, setOwner] = useState<UserId>('anna');  // чей календарь открыт
```

Стало:

```tsx
  // Кто «я» — теперь знает сервер. RequireAuth не пустит сюда без входа, поэтому data точно есть.
  const user = useMe().data!;
  const me = fakeIdFor(user);
  const [owner, setOwner] = useState<UserId>(me);  // чей календарь открыт
  const logoutMutation = useLogout();
```

`!` после `data` говорит TypeScript: «я уверен, здесь не пусто». Мы уверены, потому что `App` показывается только внутри `RequireAuth`.

**в) Желания.** Было:

```tsx
  // Настоящие данные с сервера. Вход появится на этапе 6, а пока сервер считает,
  // что «я» — это Анна (id = 1). Поэтому с сервера берём только календарь Анны.
```

```tsx
  const annaWishes = toWishesByDate(myWishesQuery.data ?? [], store.wishes.anna);
  const wishesOf = (id: UserId) => (id === 'anna' ? annaWishes : store.wishes[id]);

  const status = owner !== 'anna' ? undefined
```

Стало:

```tsx
  // Настоящие данные с сервера: желания того, кто вошёл
```

```tsx
  const myWishes = toWishesByDate(myWishesQuery.data ?? [], store.wishes[me] ?? {});
  const wishesOf = (id: UserId) => (id === me ? myWishes : store.wishes[id] ?? {});

  const status = owner !== me ? undefined
```

`?? {}` — у нового человека нет фейковых желаний, тогда берём пустой объект.

**г) Вместо `changeMe` — `logout`.** Удали всю функцию `changeMe` и на её место вставь:

```tsx
  function logout() {
    logoutMutation.mutate(); // на /login отправит RequireAuth, когда узнает, что мы вышли
  }
```

**д) `saveDay`.** Удали первый блок `if (me !== 'anna') { ... }` целиком: теперь любой вошедший сохраняет на сервер.

**е) `deleteDay`.** Было:

```tsx
    const id = annaWishes[date]?.id;
    if (me !== 'anna' || id === undefined) {
```

Стало:

```tsx
    const id = myWishes[date]?.id;
    if (id === undefined) {
```

**ж) Шапка.** В JSX замени `onChangeMe={changeMe}` на `onLogout={logout}`.

Проверь: в `App.tsx` не должно остаться слов `'anna'`, `annaWishes`, `setMe`, `changeMe`
(поиск по файлу: `Ctrl + F`).

## 🔹 Шаг 15. Проверь всё руками

1. `docker compose up -d`, запусти `BackendApplication`, в папке `frontend` — `npm run dev`.
2. Открой `http://localhost:5173` → тебя перебросит на `/login`.
3. Введи `anna@example.com` и неверный пароль → «Неверный email или пароль».
4. Пароль `password123` → календарь, в шапке «Анна» и «Выйти», желания Анны на месте.
5. Нажми **F5** → ты всё ещё Анна (сессия живёт на сервере, браузер помнит cookie).
6. **F12 → Application → Cookies → localhost:5173**: увидишь `JSESSIONID` с галочкой `HttpOnly` и `XSRF-TOKEN` без неё.
7. «Выйти» → страница входа. Набери в адресе `http://localhost:5173/` → снова `/login`.
8. «Зарегистрироваться» → создай себя. Попадёшь в **пустой** календарь: это твой, а не Анны.
9. Создай желание, нажми F5 → оно на месте. Выйди и войди как Анна → твоего желания у неё нет.
10. Попробуй зарегистрироваться ещё раз с тем же email → «Этот email уже зарегистрирован».

Посмотри в базу (вкладка Database в IntelliJ или `docker exec -it advent-postgres psql -U advent advent`):

```sql
select id, name, email, password_hash from users;
```

У нового человека в `password_hash` строка `$2a$10$...`, а не твой пароль. Это и есть хеш BCrypt.

## 🔹 Шаг 16. Проверка сборки и линтера

В папке `frontend`:

```
npm run build
npm run lint
```

## 🔹 Шаг 17. Сохрани в Git

В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 6: регистрация, вход по сессии, защита эндпоинтов, страницы входа"
```

## 🔹 Частые проблемы

| Что видишь | Почему | Что сделать |
|---|---|---|
| Страница входа Spring с полем Username | нет `SecurityConfig` или он не в пакете `calendar` | проверь пакет `com.adventcalendar.calendar.security` и аннотацию `@Configuration` |
| `403` при входе или сохранении | нет заголовка `X-XSRF-TOKEN` | проверь, что `wishes.ts` и `auth.ts` используют `request` из `http.ts` |
| Анна с `password123` не входит | email введён с ошибкой или база пересоздана без тестовых данных | проверь `select email from users` |
| `401` на все запросы сразу после входа | сессия не сохранилась | проверь шаг 3 в `signIn` (`contextRepository.saveContext`) |
| Ошибка про `CurrentUser` = `null` | адрес не закрыт и пустил без входа | в `SecurityConfig` должно быть `anyRequest().authenticated()` |
| `Cannot find module 'react-router'` | библиотека не установлена | `npm install react-router` в папке `frontend` |
| Белый экран после «Выйти» | осталась старая функция `changeMe` или `navigate` | сверь `App.tsx` с шагом 14 |

## 🔹 Созданные и изменённые файлы

```
backend/
├── pom.xml                                   + spring-boot-starter-security
└── src/main/java/com/adventcalendar/calendar/
    ├── security/                             ← новый пакет
    │   ├── SecurityConfig.java               правила охраны, BCrypt, CSRF, 401, выход
    │   ├── CurrentUser.java                  «пропуск» вошедшего (UserDetails)
    │   └── DbUserDetailsService.java         поиск человека по email
    ├── auth/                                 ← новый пакет
    │   ├── AuthController.java               /api/auth/register, /api/auth/login, /api/me
    │   ├── AuthService.java                  регистрация, хеш пароля
    │   ├── RegisterRequest.java, LoginRequest.java, MeResponse.java
    │   └── EmailTakenException.java
    ├── user/User.java                        + конструктор
    ├── user/UserRepository.java              + findByEmail, existsByEmail
    ├── wish/WishService.java                 ownerId вместо CURRENT_USER_ID
    ├── wish/WishController.java              @AuthenticationPrincipal
    └── error/GlobalExceptionHandler.java     + 409 и 401

frontend/
├── package.json, package-lock.json           + react-router
└── src/
    ├── main.tsx                              маршруты /, /login, /register
    ├── App.tsx                               «я» с сервера, logout
    ├── index.css                             + стили страниц входа
    ├── api/http.ts                           ← новый: request, HttpError, CSRF
    ├── api/auth.ts                           ← новый: запросы входа
    ├── api/useAuth.ts                        ← новый: useMe, useLogin, useRegister, useLogout
    ├── api/wishes.ts                         использует http.ts
    ├── pages/LoginPage.tsx                   ← новый
    ├── pages/RegisterPage.tsx                ← новый
    ├── components/RequireAuth.tsx            ← новый
    ├── components/Header.tsx                 имя и «Выйти»
    └── data/fakeData.ts                      + fakeIdFor
```

## Главное, что нужно запомнить

- **Аутентификация** = «кто ты», **авторизация** = «что тебе можно». Обе проверяются **на сервере**, охранник в React только для удобства.
- Пароль никогда не храним. Храним **хеш BCrypt**, а сравнивает его `PasswordEncoder`.
- **Сессия + HttpOnly cookie**: «кто я» живёт на сервере, у браузера только номер, и JavaScript его не видит.
- Cookie прикладываются сами, поэтому нужна защита **CSRF**: токен из cookie `XSRF-TOKEN` копируем в заголовок.
- Сервер берёт «кто я» из сессии (`@AuthenticationPrincipal`), а не из запроса. Поэтому чужие желания получить нельзя.
