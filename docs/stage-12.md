# Этап 12. Безопасность перед публикацией

## 🔹 Что делаем и зачем

Пока сервер работает только у тебя на компьютере, к нему никто чужой не подключится.
На этапе 14 мы выложим его в интернет, и туда сразу придут **боты**: программы, которые обходят все сайты подряд и пробуют их взломать.
Им не важно, что наш календарь маленький.

Аналогия 🏠: пока ты живёшь один в лесу, можно не запирать дверь. Переезжаешь в город — нужны замок, глазок и шторы.
Этот этап — тот самый замок и шторы.

План:

1. **Лимит попыток входа.** Бот не сможет перебирать пароли тысячами.
2. **Ловушка для ботов при регистрации.** Простые боты не смогут наделать фальшивых аккаунтов.
3. **Защитные заголовки.** Браузер получит от сервера правила: что с нашими ответами делать нельзя.
4. **Ошибки без подробностей.** Если сервер сломается, пользователь увидит «Что-то пошло не так», а не внутренности сервера.
5. **Подготовка к HTTPS.** Сам HTTPS включим на этапе 14, но сервер уже сейчас научим с ним правильно работать.
6. **Секреты и тестовые пользователи.** Пароли убираем из кода, а Анну, Бориса и Вику не пускаем на настоящий сервер.

Во фронтенде меняется только форма регистрации (поле-ловушка). Сообщение «Слишком много попыток» появится само: фронтенд уже показывает текст ошибки из поля `detail`.

После этапа будет **77 тестов** бэкенда (было 68): 9 новых.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Перебор пароля** (brute force) | бот пробует пароли один за другим: `123456`, `password`, `qwerty`… пока не угадает |
| **Ограничение частоты** (rate limit) | правило «не больше N попыток за M минут». Остальные попытки сервер отклоняет |
| **429 Too Many Requests** | код ответа «слишком много запросов, подожди» |
| **Retry-After** | заголовок ответа: через сколько секунд можно попробовать снова |
| **Заголовок ответа** (response header) | служебная строка в ответе сервера, которую читает браузер, а не человек. Например `Content-Type: application/json` |
| **Защитные заголовки** (security headers) | заголовки, которые запрещают браузеру опасные вещи: вставлять наш сайт в чужую страницу, запускать чужие скрипты и т.п. |
| **HTTPS** | HTTP с шифрованием. Данные по дороге между браузером и сервером никто не прочитает и не подменит |
| **Прокси** (reverse proxy) | программа, которая стоит перед нашим сервером и принимает запросы из интернета. У нас это будет Caddy (этап 14). HTTPS делает именно она |
| **Профиль Spring** (profile) | набор настроек для определённого места запуска. `prod` — для настоящего сервера (production) |
| **Переменная окружения** (environment variable) | значение, которое передают программе при запуске снаружи, а не пишут в коде. Так передают пароли |
| **Поле-ловушка** (honeypot) | поле формы, которое человек не видит и не заполняет, а бот заполняет. Заполнено — значит, бот |
| **Стек вызовов** (stack trace) | длинный список «какой метод какой вызвал» в момент ошибки. Полезен программисту, опасен в руках взломщика |

## 🔹 Что уже было сделано раньше

Хорошая новость: многое мы уже сделали на прошлых этапах, иногда даже не замечая этого.

| Защита | Где | Этап |
|---|---|---|
| Пароли хранятся только как хеш BCrypt | `AuthService.register` | 6 |
| При входе выдаётся новый номер сессии | `AuthController.signIn` | 6 |
| Защита от подделки запросов с чужих сайтов (CSRF) | `SecurityConfig`, `csrf.spa()` | 6 |
| «Неверный email или пароль» вместо «такого email нет» | `GlobalExceptionHandler.handleBadLogin` | 6 |
| Чужое желание отвечает 404, а не 403 | `WishService` | 6–8 |
| Картинки проверяются по содержимому, не по расширению | `ImageProcessor` | 9 |
| Закрытый день уходит из сервера пустым | `WishService.calendar` | 8, 11 |

Сейчас закрываем то, что осталось.

## 🔹 Перед началом

1. Сделай коммит этапов 10 и 11, если ещё не сделал. Так перед этапом 12 у тебя будет чистая точка, к которой можно вернуться.
2. Запусти Docker-контейнеры: `docker compose up -d` в корне проекта. Redis нам понадобится и здесь.

---

# Часть 1. Лимит попыток входа

## 🔹 Как это работает

Сейчас бот может отправить на `/api/auth/login` хоть миллион запросов подряд, и сервер честно проверит каждый пароль.
Список из миллиона самых популярных паролей лежит в интернете в открытом доступе.

Ставим **два счётчика**:

| Счётчик | Ключ в Redis | Лимит | От чего защищает |
|---|---|---|---|
| Ошибки пароля для одного email | `login:fails:anna@example.com` | 5 ошибок за 15 минут | бот перебирает пароли **одного** человека |
| Все попытки с одного адреса | `login:ip:203.0.113.7` | 50 попыток за 15 минут | бот с одного компьютера перебирает **много** email |

Аналогия 🏧: банкомат. Три раза ввёл неверный PIN — карта блокируется. Это счётчик «на email».
А если кто-то подходит к банкомату с сотней чужих карт подряд — охрана выгоняет его самого. Это счётчик «на адрес».

Почему храним в Redis, а не в обычной переменной `Map` в Java:

* Redis сам удаляет ключ, когда кончается время (**TTL**, мы это видели на этапе 11). Не нужно писать код «почистить старые счётчики».
* Если перезапустить сервер, счётчики не обнулятся. Иначе бот мог бы просто дождаться перезапуска.
* Если серверов станет два, у них будет общий счётчик.

Путь одного запроса на вход:

```
POST /api/auth/login  {"email": "anna@example.com", "password": "..."}
   │
   ├─ 1. login:ip:<адрес>  +1.   Больше 50?          → 429, пароль даже не проверяем
   ├─ 2. login:fails:anna  уже 5 или больше?         → 429
   │
   ├─ 3. Проверяем пароль
   │      ├─ верный   → удаляем login:fails:anna, отвечаем 200
   │      └─ неверный → login:fails:anna +1, отвечаем 401
```

💡 Обрати внимание на шаг 2: когда email заблокирован, мы отказываем **даже с верным паролем**.
Иначе бот на 6-й, 7-й, 100-й попытке всё равно узнал бы, угадал он или нет.

⚠️ Минус такой защиты: злой человек может специально 5 раз ввести неверный пароль от **твоего** email и заблокировать тебе вход на 15 минут.
Это плата за защиту. 15 минут — терпимо, а пароль за это время подобрать нельзя.

## 🔹 Шаг 1. Исключение «слишком много попыток»

Создай файл `backend/src/main/java/com/adventcalendar/calendar/security/TooManyAttemptsException.java`:

```java
package com.adventcalendar.calendar.security;

import java.time.Duration;

// Слишком много попыток входа. retryAfter — через сколько можно пробовать снова
public class TooManyAttemptsException extends RuntimeException {

    private final Duration retryAfter;

    public TooManyAttemptsException(Duration retryAfter) {
        super("Слишком много попыток входа");
        this.retryAfter = retryAfter;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
```

Разбор:

* `extends RuntimeException` — как и наши прошлые исключения (`WishNotFoundException` и другие). Его можно бросить откуда угодно, а поймает его `GlobalExceptionHandler`.
* `Duration` — «отрезок времени» в Java: 15 минут, 30 секунд. Храним его, чтобы потом сказать пользователю, сколько ждать.

## 🔹 Шаг 2. Счётчики попыток

Создай файл `backend/src/main/java/com/adventcalendar/calendar/security/LoginRateLimiter.java`:

```java
package com.adventcalendar.calendar.security;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

// Ограничение попыток входа (rate limit). Счётчики лежат в Redis:
//   login:ip:<адрес>      — сколько попыток входа и регистрации было с этого адреса
//   login:fails:<email>   — сколько раз подряд ошиблись паролем от этого email
// У каждого счётчика есть «таймер» (TTL): когда окно закончится, Redis сам его сотрёт
@Service
public class LoginRateLimiter {

    private final StringRedisTemplate redis;
    private final int maxAttemptsPerIp;
    private final int maxFailsPerEmail;
    private final Duration window;

    public LoginRateLimiter(StringRedisTemplate redis,
                            @Value("${security.login.max-attempts-per-ip}") int maxAttemptsPerIp,
                            @Value("${security.login.max-fails-per-email}") int maxFailsPerEmail,
                            @Value("${security.login.window}") Duration window) {
        this.redis = redis;
        this.maxAttemptsPerIp = maxAttemptsPerIp;
        this.maxFailsPerEmail = maxFailsPerEmail;
        this.window = window;
    }

    // Вызываем ДО проверки пароля. email == null — это регистрация, там считаем только адрес
    public void checkAllowed(String ip, String email) {
        String ipKey = "login:ip:" + ip;
        if (increment(ipKey) > maxAttemptsPerIp) {
            throw new TooManyAttemptsException(timeLeft(ipKey));
        }
        if (email != null) {
            String failsKey = "login:fails:" + email;
            String fails = redis.opsForValue().get(failsKey);
            if (fails != null && Long.parseLong(fails) >= maxFailsPerEmail) {
                throw new TooManyAttemptsException(timeLeft(failsKey));
            }
        }
    }

    public void loginFailed(String email) {
        increment("login:fails:" + email);
    }

    // Вошёл правильно — прошлые ошибки забываем
    public void loginSucceeded(String email) {
        redis.delete("login:fails:" + email);
    }

    // +1 к счётчику. Первая попытка в окне заводит таймер
    private long increment(String key) {
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, window);
        }
        return count == null ? 0 : count;
    }

    private Duration timeLeft(String key) {
        Long seconds = redis.getExpire(key, TimeUnit.SECONDS);
        return seconds == null || seconds < 0 ? window : Duration.ofSeconds(seconds);
    }
}
```

Разбор по частям:

1. **`StringRedisTemplate`** — готовый «пульт управления» Redis от Spring. Его создаёт Spring Boot сам, потому что библиотека Redis уже подключена на этапе 11. Здесь ключи и значения — обычные строки.
2. **`@Value("${security.login.window}")`** — взять значение из `application.properties` (добавим в шаге 4). Числа не зашиты в код: в тестах или на сервере их можно поменять, не трогая Java.
3. **`redis.opsForValue().increment(key)`** — команда Redis `INCR`: «прибавь 1 к числу по этому ключу и верни, что получилось». Если ключа не было, Redis считает, что там 0, и вернёт 1.
   Важно, что это **одна** команда. Если два запроса придут в одну и ту же миллисекунду, Redis всё равно посчитает оба. Обычное «прочитать, прибавить, записать» тут могло бы потерять одну попытку.
4. **`redis.expire(key, window)`** — завести таймер на 15 минут. Делаем это только на первой попытке (`count == 1`). Иначе каждая новая попытка отодвигала бы конец блокировки.
5. **`redis.getExpire(key, TimeUnit.SECONDS)`** — сколько секунд осталось жить ключу. Это и есть «через сколько можно снова».
6. **`checkAllowed`** сначала считает попытку по адресу, потом смотрит ошибки по email. Сама проверка email ничего не прибавляет: +1 к ошибкам ставит `loginFailed`, и только когда пароль действительно неверный.

## 🔹 Шаг 3. Подключаем счётчики к входу и регистрации

Открой `backend/src/main/java/com/adventcalendar/calendar/auth/AuthController.java`.

**3.1.** Добавь два импорта к остальным:

```java
import com.adventcalendar.calendar.security.LoginRateLimiter;
import org.springframework.security.core.AuthenticationException;
```

**3.2.** Добавь новое поле и параметр конструктора:

```java
    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final LoginRateLimiter rateLimiter;
    // Умеет сохранить «кто вошёл» в сессию, чтобы следующие запросы это знали
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AuthService authService, AuthenticationManager authenticationManager,
                          LoginRateLimiter rateLimiter) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
        this.rateLimiter = rateLimiter;
    }
```

**3.3.** В `register` добавь одну строку в начало (регистрацию тоже ограничиваем по адресу, иначе бот создаст тысячи аккаунтов):

```java
    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public MeResponse register(@Valid @RequestBody RegisterRequest body,
                               HttpServletRequest request, HttpServletResponse response) {
        rateLimiter.checkAllowed(request.getRemoteAddr(), null);
        authService.register(body);
        return signIn(body.email(), body.password(), request, response); // после регистрации сразу входим
    }
```

**3.4.** Замени метод `login` целиком:

```java
    @PostMapping("/auth/login")
    public MeResponse login(@Valid @RequestBody LoginRequest body,
                            HttpServletRequest request, HttpServletResponse response) {
        String email = AuthService.normalizeEmail(body.email());
        // 1. Не слишком ли много попыток? Если да — вылетит TooManyAttemptsException, пароль даже не проверяем
        rateLimiter.checkAllowed(request.getRemoteAddr(), email);
        try {
            MeResponse me = signIn(email, body.password(), request, response);
            rateLimiter.loginSucceeded(email); // 2а. Вошёл — обнуляем ошибки
            return me;
        } catch (AuthenticationException e) {
            rateLimiter.loginFailed(email);    // 2б. Не вошёл — +1 ошибка для этого email
            throw e;                           // дальше ошибку обработает GlobalExceptionHandler, как раньше
        }
    }
```

Разбор:

* `request.getRemoteAddr()` — адрес (IP), с которого пришёл запрос.
* `AuthService.normalizeEmail(...)` — приводим email к одному виду **до** счётчика. Иначе бот писал бы `Anna@Example.com`, `ANNA@example.com`… и у каждого варианта был бы свой счётчик.
* `try { ... } catch (AuthenticationException e)` — «поймать» ошибку неверного пароля, посчитать её и **бросить дальше** (`throw e`). Ответ пользователю остаётся прежним: 401 «Неверный email или пароль».

## 🔹 Шаг 4. Настройки лимитов

В конец `backend/src/main/resources/application.properties` добавь:

```properties
# Защита входа от подбора пароля (rate limit). Счётчики хранятся в Redis
security.login.max-attempts-per-ip=50
security.login.max-fails-per-email=5
security.login.window=15m
```

`15m` — это 15 минут. Spring сам превратит такую строку в `Duration`. Так же можно писать `30s`, `1h`.

## 🔹 Шаг 5. Ответ 429

Открой `backend/src/main/java/com/adventcalendar/calendar/error/GlobalExceptionHandler.java`.

Добавь импорты:

```java
import com.adventcalendar.calendar.security.TooManyAttemptsException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
```

И новый метод (например, в самый конец класса, перед последней `}`):

```java
    // 429: слишком много попыток входа. Заголовок Retry-After говорит, через сколько секунд можно снова
    @ExceptionHandler(TooManyAttemptsException.class)
    public ResponseEntity<ProblemDetail> handleTooManyAttempts(TooManyAttemptsException ex) {
        long seconds = ex.getRetryAfter().toSeconds();
        long minutes = Math.max(1, (seconds + 59) / 60); // округляем вверх: 61 секунда → 2 минуты
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS,
                "Слишком много попыток входа. Попробуйте через " + minutes + " мин.");
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(seconds))
                .body(problem);
    }
```

Разбор:

* Раньше наши обработчики возвращали просто `ProblemDetail`. Здесь нам нужен ещё и **заголовок** `Retry-After`, поэтому возвращаем `ResponseEntity`: это «ответ целиком», в котором есть статус, заголовки и тело.
* `(seconds + 59) / 60` — деление с округлением вверх. Если осталось 30 секунд, напишем «через 1 мин.», а не «через 0 мин.».

## 🔹 Шаг 6. Проверить руками

Перезапусти сервер. Открой фронтенд, выйди из аккаунта и 6 раз войди как `anna@example.com` с неверным паролем.

* Попытки 1–5: «Неверный email или пароль».
* Попытка 6: «Слишком много попыток входа. Попробуйте через 15 мин.». Даже если на этот раз пароль верный.

Посмотреть счётчик в Redis:

```powershell
docker exec -it advent-redis redis-cli
```

```
KEYS login:*
GET login:fails:anna@example.com
TTL login:fails:anna@example.com
```

* `KEYS login:*` — все наши счётчики.
* `GET` — сколько ошибок (должно быть `5`).
* `TTL` — сколько секунд осталось до разблокировки.

Чтобы не ждать 15 минут, разблокируй Анну вручную: `DEL login:fails:anna@example.com`. Выход из `redis-cli`: `exit`.

---

# Часть 2. Ловушка для ботов при регистрации

## 🔹 Зачем, если уже есть лимит

Лимит из части 1 разрешает 50 регистраций за 15 минут с **одного** адреса. Но у ботов часто тысячи адресов, и на каждый лимит свой.
К тому же email у нас не подтверждается: бот может зарегистрироваться с любой выдуманной почтой.

Настоящая защита — **подтверждение почты** (письмо со ссылкой). Для неё нужны свой домен и почтовый сервис, поэтому сделаем её после этапа 14.
А сейчас поставим простую и бесплатную **ловушку** (honeypot).

Аналогия 🍯: в форму добавляем поле, которое человек **не видит**. Человек оставит его пустым, а простой бот заполняет все поля подряд, и тут же себя выдаёт.

```
Человек:  name=Анна, email=..., extraInfo=""                  → регистрируем
Бот:      name=xxx,  email=..., extraInfo="http://spam.com"   → 400 «Не получилось создать аккаунт»
```

⚠️ Умного бота, который «смотрит» на страницу как браузер, ловушка не остановит. Это первая, самая дешёвая линия защиты. Следующие (подтверждение почты, капча) добавим позже.

## 🔹 Шаг 7. Поле в запросе регистрации

Открой `backend/src/main/java/com/adventcalendar/calendar/auth/RegisterRequest.java` и добавь в конец новое поле.
Не забудь запятую после `termsAccepted`:

```java
        // Галочка «принимаю Условия использования и мне есть 18 лет»
        @AssertTrue(message = "Нужно принять Условия использования и подтвердить возраст 18+")
        boolean termsAccepted,

        // Поле-ловушка (honeypot). Человек его не видит и оставляет пустым, а бот заполняет
        String extraInfo
) {
}
```

У `extraInfo` нет проверок вроде `@NotBlank`: поле может не прийти вовсе (тогда будет `null`), и это нормально.

## 🔹 Шаг 8. Проверка в `AuthController`

Добавь импорт:

```java
import org.springframework.web.server.ResponseStatusException;
```

И в `register` после строки с `rateLimiter` добавь проверку:

```java
    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public MeResponse register(@Valid @RequestBody RegisterRequest body,
                               HttpServletRequest request, HttpServletResponse response) {
        rateLimiter.checkAllowed(request.getRemoteAddr(), null);
        // Ловушка заполнена — это бот. Не объясняем почему, чтобы его автор не догадался
        if (body.extraInfo() != null && !body.extraInfo().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не получилось создать аккаунт");
        }
        authService.register(body);
        return signIn(body.email(), body.password(), request, response); // после регистрации сразу входим
    }
```

Разбор:

* Проверка стоит **после** `rateLimiter`: попытки бота тоже считаются в лимит адреса.
* **`ResponseStatusException`** — готовое исключение Spring «ответь вот таким статусом и текстом». Отдельный класс исключения не нужен.
  Его поймает наш обработчик «всего остального» из части 4 (шаг 11): `ResponseStatusException` — это `ErrorResponse`, поэтому ответ уйдёт как есть, 400 с нашим текстом.
* Текст специально ничего не объясняет. Если написать «вы заполнили скрытое поле», автор бота сразу поймёт, что исправить.

## 🔹 Шаг 9. Скрытое поле в форме

**9.1.** В `frontend/src/api/auth.ts` добавь поле в тип `RegisterInput`:

```ts
export type RegisterInput = {
    name: string;
    email: string;
    password: string;
    privacyAccepted: boolean; // согласие на обработку данных
    termsAccepted: boolean;   // Условия использования + 18 лет
    extraInfo: string;        // поле-ловушка для ботов, у людей всегда пустое
};
```

**9.2.** В `frontend/src/pages/RegisterPage.tsx` добавь состояние рядом с остальными `useState`:

```tsx
    // Поле-ловушка для ботов: человек его не видит, поэтому оставит пустым
    const [extraInfo, setExtraInfo] = useState('');
```

Передай его в запрос:

```tsx
        registerMutation.mutate({ name, email, password, privacyAccepted, termsAccepted, extraInfo }, { onSuccess: () => navigate('/') });
```

И добавь само поле перед строкой с `registerMutation.isError`:

```tsx
    {/* Ловушка для ботов (honeypot). Спрятана за краем экрана; Tab и экранная читалка её пропускают */}
    <label className="trap" aria-hidden="true">Не заполняйте это поле
        <input tabIndex={-1} autoComplete="off"
    value={extraInfo} onChange={e => setExtraInfo(e.target.value)} />
    </label>
```

**9.3.** В `frontend/src/index.css` после строк `label.consent ...` добавь:

```css
/* Поле-ловушка для ботов: не display:none (такие поля боты часто пропускают), а просто за краем экрана */
.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
```

Разбор атрибутов:

| Что | Зачем |
|---|---|
| `className="trap"` + CSS | поле есть на странице, но уехало далеко влево за край экрана. Человек его не видит |
| почему не `display:none` | боты часто проверяют `display:none` и такие поля не трогают. Поле «за краем» для них выглядит как обычное |
| `tabIndex={-1}` | клавиша Tab перескакивает через поле, человек не попадёт в него случайно |
| `aria-hidden="true"` | экранная читалка (программа для незрячих, **screen reader**) не озвучит поле |
| `autoComplete="off"` | браузер не станет заполнять поле сам из сохранённых данных |
| текст «Не заполняйте это поле» | если человек всё-таки как-то увидит поле (например, с отключёнными стилями), он поймёт, что делать |

Проверь: открой страницу регистрации. Внешне ничего не изменилось, и регистрация работает как раньше.

---

# Часть 3. Защитные заголовки

## 🔹 Что это и какие уже есть

Каждый ответ сервера кроме тела (JSON, картинки) несёт **заголовки**. Некоторые из них говорят браузеру: «вот это с моим ответом делать нельзя».

Spring Security уже ставит несколько таких заголовков сам, с этапа 6. Проверь:

```powershell
curl.exe -i http://localhost:8080/api/health
```

Ты увидишь среди прочего:

| Заголовок | Значение | Что запрещает |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | браузеру «угадывать» тип файла. Если сервер сказал «это картинка», браузер не станет выполнять её как скрипт |
| `X-Frame-Options` | `DENY` | вставлять наш сайт в рамку (`<iframe>`) на чужой странице. Защита от **кликджекинга** (clickjacking): чужой сайт кладёт наш невидимым слоем поверх своей кнопки, и ты нажимаешь «удалить» у нас, думая, что жмёшь «смотреть котиков» |
| `Cache-Control` | `no-cache, no-store…` | сохранять ответы с личными данными в кэше браузера |
| `Strict-Transport-Security` | (только по HTTPS) | см. часть 4 |

Добавим ещё три:

| Заголовок | Наше значение | Простыми словами |
|---|---|---|
| `Content-Security-Policy` (**CSP**) | `default-src 'none'; frame-ancestors 'none'` | «В моих ответах нет скриптов, стилей и шрифтов, не загружай ничего. И в рамку меня не вставлять» |
| `Referrer-Policy` | `no-referrer` | когда пользователь уходит по ссылке на другой сайт, не сообщать тому сайту, с какой нашей страницы он пришёл |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | этой странице нельзя просить камеру, микрофон и геолокацию |

💡 Важно понимать про CSP: этот заголовок мы ставим на ответы **бэкенда**: JSON и картинки. Там действительно нет скриптов, поэтому можно запретить всё.
Страницу фронтенда (HTML и JavaScript) отдаёт не Spring, а Vite (сейчас) и веб-сервер (на этапе 13). Её CSP будет мягче, и настроим мы её там.

## 🔹 Шаг 10. Заголовки в `SecurityConfig`

Открой `backend/src/main/java/com/adventcalendar/calendar/security/SecurityConfig.java`.

Добавь импорт:

```java
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
```

В `securityFilterChain` после блока `.logout(...)` добавь пункт 5. Обрати внимание: у `.logout(...)` в конце теперь **нет** точки с запятой, цепочка продолжается:

```java
                // 4. Выход: POST /api/auth/logout удаляет сессию и отвечает 200
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()))
                // 5. Защитные заголовки. Часть Spring Security ставит сам (nosniff, X-Frame-Options, HSTS),
                //    здесь добавляем ещё три
                .headers(headers -> headers
                        // Наш сервер отдаёт только JSON и картинки: никаких скриптов и стилей, и в рамку нас не вставить
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        // Не рассказывать другим сайтам, с какой нашей страницы перешли
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        // Камера, микрофон и геолокация нам не нужны — запрещаем
                        .permissionsPolicyHeader(permissions -> permissions.policy("camera=(), microphone=(), geolocation=()")));
        return http.build();
```

Разбор:

* `.headers(headers -> headers ...)` — тот же стиль, что у `.csrf(...)` и `.logout(...)`: настраиваем одну часть Spring Security через лямбду.
* Мы **добавляем** заголовки. Те, что Spring ставил раньше, остаются.
* Есть похожий метод `permissionsPolicy(...)` без `Header` в конце. Он устаревший (**deprecated**), поэтому берём `permissionsPolicyHeader`.

Перезапусти сервер и снова выполни `curl.exe -i http://localhost:8080/api/health`. Новые три заголовка должны появиться в ответе.

---

# Часть 4. Ошибки без лишних подробностей

## 🔹 Чем опасна «честная» ошибка

Представь, что база данных упала. Без защиты пользователь мог бы увидеть что-то такое:

```
org.postgresql.util.PSQLException: Connection to localhost:5434 refused
    at org.postgresql.core.v3.ConnectionFactoryImpl.openConnectionImpl(...)
    at com.adventcalendar.calendar.wish.WishService.calendar(WishService.java:87)
    ...
```

Из этого взломщик узнаёт: база — PostgreSQL, порт 5434, язык — Java, есть класс `WishService`… Каждая такая мелочь сужает поиск уязвимостей.

Правило: **пользователю — коротко и без деталей, программисту — всё подробно в лог.** Чтобы связать одно с другим, даём ошибке короткий код.

```
Пользователь видит:   «Что-то пошло не так. Код ошибки: 3f9a1c2e»
В логе сервера:       ERROR Непредвиденная ошибка, код 3f9a1c2e
                      org.postgresql.util.PSQLException: Connection refused ...
                          at ...
```

Пользователь пишет тебе «у меня ошибка 3f9a1c2e», ты ищешь этот код в логе и видишь всё.

## 🔹 Шаг 11. Обработчик «всего остального»

В `GlobalExceptionHandler` добавь импорты:

```java
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.ErrorResponse;
```

Сразу после строки `public class GlobalExceptionHandler {` добавь поле для лога:

```java
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
```

И в конец класса ещё один метод:

```java
    // Всё, что мы НЕ предусмотрели выше. Клиенту — только общая фраза и короткий код,
    // а подробности (текст ошибки, стек вызовов) — только в лог сервера
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception ex) {
        // Обычные ошибки Spring (404 «нет такого адреса», 405 «не тот метод» и т.п.) уже знают
        // свой статус и ничего лишнего не рассказывают. Отдаём их как есть, а не превращаем в 500
        if (ex instanceof ErrorResponse known) {
            return ResponseEntity.status(known.getStatusCode()).headers(known.getHeaders()).body(known.getBody());
        }
        String errorId = UUID.randomUUID().toString().substring(0, 8);
        log.error("Непредвиденная ошибка, код {}", errorId, ex); // ex последним: в лог попадёт весь стек
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Что-то пошло не так. Код ошибки: " + errorId);
        return ResponseEntity.internalServerError().body(problem);
    }
```

Разбор:

1. **`@ExceptionHandler(Exception.class)`** — «ловить любое исключение». Spring всегда выбирает **самый точный** обработчик. Для `WishNotFoundException` по-прежнему сработает `handleNotFound`, а сюда попадёт только то, что больше никто не поймал.
2. **Ловушка ⚠️.** `Exception` — это вообще всё, включая обычные ошибки самого Spring: «нет такого адреса» (404), «не тот HTTP-метод» (405). Если превратить их в 500, фронтенд и тесты сломаются.
   Такие ошибки Spring реализуют интерфейс **`ErrorResponse`**: они сами знают свой статус и текст. Поэтому строка `if (ex instanceof ErrorResponse known)` пропускает их как есть.
   `instanceof ErrorResponse known` — проверка типа и сразу новая переменная `known` нужного типа (**pattern matching**, сопоставление с образцом).
3. **`UUID.randomUUID().toString().substring(0, 8)`** — случайная строка вроде `3f9a1c2e`. Полный UUID длинный, первых 8 символов для поиска в логе хватает.
4. **`log.error("... {}", errorId, ex)`** — `{}` заменится на `errorId`. А исключение, переданное **последним** аргументом, логгер (**SLF4J**) напечатает целиком, со стеком вызовов.

## 🔹 Шаг 12. Страховка в настройках

Есть ещё ошибки, которые случаются **до** наших контроллеров, например внутри фильтров Spring Security. Их отвечает стандартная страница ошибок Spring Boot (`/error`).
По умолчанию она уже не показывает ни текст ошибки, ни стек. Запишем это явно, чтобы никто случайно не включил.

В конец `application.properties`:

```properties
# Ошибки: не показывать клиенту текст исключения и стек вызовов.
# Это и так по умолчанию, пишем явно, чтобы никто случайно не включил
server.error.include-message=never
server.error.include-stacktrace=never
server.error.include-binding-errors=never
server.error.include-exception=false
```

---

# Часть 5. Подготовка к HTTPS

## 🔹 Кто будет делать HTTPS

Чтобы был HTTPS, нужен **сертификат**: «паспорт» сайта, который подтверждает, что `my-calendar.ru` — это действительно мы. Сертификат выдают на **домен**, а домена у нас пока нет. Он появится на этапе 14.

Там же появится **Caddy**: программа-прокси, которая сама бесплатно получает сертификат (у Let's Encrypt) и сама его продлевает. Схема будет такая:

```
Браузер ──HTTPS (зашифровано)──▶ Caddy ──HTTP (внутри сервера)──▶ Spring Boot
```

От интернета до Caddy всё зашифровано. От Caddy до Spring — обычный HTTP, но это внутри одного сервера, туда никто посторонний не попадёт.

## 🔹 Проблема: Spring не знает, что был HTTPS

Spring видит только последний отрезок пути: HTTP от Caddy. Поэтому он думает:

* «запрос пришёл по HTTP» — и не ставит защитный заголовок HSTS, не помечает cookie как «только для HTTPS»;
* «запрос пришёл с адреса Caddy» — и **все** пользователи для нашего лимита входа выглядят как один адрес. Пятьдесят попыток на всех — и вход сломан у всех.

Решение: Caddy дописывает к запросу заголовки `X-Forwarded-Proto: https` и `X-Forwarded-For: <настоящий адрес>`, а Spring мы научим им верить.

⚠️ Верить им можно **только** если запрос пришёл от нашего прокси. Иначе бот просто напишет в запросе `X-Forwarded-For: 1.2.3.4`, потом `1.2.3.5`… и обойдёт лимит. Встроенный в Tomcat механизм, который мы включим, по умолчанию верит этим заголовкам только от «внутренних» адресов (`127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`). Docker-сеть, в которой будут жить Caddy и Spring, как раз из этого списка.

## 🔹 Что такое HSTS

**HSTS** (HTTP Strict Transport Security) — заголовок `Strict-Transport-Security: max-age=31536000 ; includeSubDomains`.
Он говорит браузеру: «Год вообще не ходи на этот сайт по HTTP, даже если пользователь сам напишет `http://`».
Так никто не сможет «перехватить» первый незашифрованный запрос.

Spring Security ставит этот заголовок сам, но **только на HTTPS-запросы**. Поэтому сейчас, на `http://localhost`, ты его не видишь, и это правильно.

## 🔹 Что такое профиль

У нас будет два места запуска с разными настройками:

| | Твой компьютер | Настоящий сервер |
|---|---|---|
| HTTPS | нет | да, через Caddy |
| Пароли | `advent`, можно прямо в файле | секретные, только снаружи |
| Анна, Борис, Вика | нужны для проверки | не нужны |

Spring умеет хранить такие различия в **профилях**. Файл `application.properties` читается всегда. Файл `application-prod.properties` читается **дополнительно**, только если включён профиль `prod`, и его строки перекрывают общие.
Включают профиль переменной окружения `SPRING_PROFILES_ACTIVE=prod`. Это сделаем в Docker на этапе 13.

## 🔹 Шаг 13. Cookie сессии

В общий `application.properties` добавь:

```properties
# Cookie сессии: JavaScript её не видит, на чужие сайты она не уходит
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.same-site=lax
```

* **`http-only`** — JavaScript на странице не может прочитать cookie сессии. Если в странице когда-нибудь окажется чужой скрипт (**XSS**), украсть сессию он не сможет. Spring и так ставит это по умолчанию, пишем явно.
* **`same-site=lax`** — браузер не отправит нашу cookie, если запрос (кроме обычного перехода по ссылке) делает чужой сайт. Это вторая линия защиты от подделки запросов (CSRF), вдобавок к CSRF-токену.

## 🔹 Шаг 14. Профиль `prod`

Создай файл `backend/src/main/resources/application-prod.properties`:

```properties
# Настройки для настоящего сервера. Включаются переменной окружения SPRING_PROFILES_ACTIVE=prod
# Всё, чего здесь нет, берётся из application.properties

# Пароли — только из переменных окружения. Нет переменной — сервер не запустится (и это хорошо)
spring.datasource.password=${DB_PASSWORD}
storage.secret-key=${STORAGE_SECRET_KEY}

# HTTPS снаружи делает прокси (Caddy, этап 14). Он сообщает серверу в заголовках X-Forwarded-*,
# что запрос пришёл по HTTPS и с какого адреса. Без этой строки сервер думает, что всё по HTTP
server.forward-headers-strategy=native

# Cookie сессии — только по HTTPS
server.servlet.session.cookie.secure=true

# Кроме обычных миграций, выполнить db/prod: там удаляются тестовые Анна, Борис и Вика
spring.flyway.locations=classpath:db/migration,classpath:db/prod
```

Разбор строк:

* **`${DB_PASSWORD}`** — подставить значение переменной окружения `DB_PASSWORD`. Если такой переменной нет, Spring не запустится и напишет, чего не хватает. Это хорошо: лучше сервер, который не стартовал, чем сервер с паролем `advent`.
* **`server.forward-headers-strategy=native`** — включает тот самый механизм Tomcat: верить `X-Forwarded-*` от внутренних адресов. После этого `request.getRemoteAddr()` в нашем `AuthController` вернёт настоящий адрес пользователя, а `request.isSecure()` — `true`. Тогда Spring Security сам добавит HSTS, а CSRF-cookie получит пометку `Secure`.
* **`cookie.secure=true`** — браузер будет отправлять cookie сессии только по HTTPS. Локально это включать нельзя: на `http://localhost` вход перестал бы работать.
* **`spring.flyway.locations`** — о ней в следующей части.

---

# Часть 6. Секреты и тестовые пользователи

## 🔹 Шаг 15. Пароли из переменных окружения

Сейчас в `application.properties` пароли записаны прямо в коде, а код скоро будет на GitHub. В общем файле оставим их как **значения по умолчанию** для твоего компьютера:

```properties
spring.datasource.password=${DB_PASSWORD:advent}
```

```properties
storage.secret-key=${STORAGE_SECRET_KEY:advent-secret}
```

`${DB_PASSWORD:advent}` значит «возьми переменную `DB_PASSWORD`, а если её нет — `advent`». У тебя ничего не изменится. А в `application-prod.properties` (шаг 14) значения по умолчанию нет, там пароль обязан прийти снаружи.

💡 Пароль `advent` для локальной базы — не секрет: эта база живёт только у тебя в Docker. Секретными будут пароли настоящего сервера, и их в Git не будет никогда.

## 🔹 Шаг 16. Анна, Борис и Вика не должны попасть на сервер

Миграция `V2__seed_test_data.sql` создаёт трёх пользователей с паролем `password123`. И в комментарии прямо написано, какой у них пароль.
Если выложить это как есть, любой, кто откроет наш код на GitHub, войдёт на настоящий сервер как Анна. 😬

Просто удалить `V2` нельзя:

* у тебя V2 уже выполнена, и Flyway будет ругаться, что миграция пропала;
* миграции `V3` и `V4` тоже вставляют данные (дружбу Анны и Бориса, доступы), и без пользователей из V2 они упадут.

Поэтому на настоящем сервере дадим всем миграциям выполниться, а **после** них удалим тестовых пользователей. Для этого у Flyway есть **колбэки** (callback): SQL-файлы со специальными именами, которые он выполняет в определённый момент. Файл `afterMigrate.sql` выполняется после миграций при **каждом** запуске.

Создай папку `backend/src/main/resources/db/prod` и в ней файл `afterMigrate.sql`:

```sql
-- Выполняется после миграций при КАЖДОМ запуске, только в профиле prod.
-- Тестовые пользователи из V2 (пароль password123 знают все, кто видел код) на настоящем сервере не нужны.
-- Их желания, друзья, доступы и согласия удалятся сами: во всех таблицах стоит ON DELETE CASCADE
DELETE FROM users WHERE email IN ('anna@example.com', 'boris@example.com', 'vika@example.com');
```

Разбор:

* Папку `db/prod` Flyway читает **только** в профиле `prod`, потому что так написано в `spring.flyway.locations` из шага 14. У тебя локально Анна, Борис и Вика останутся.
* `ON DELETE CASCADE` мы писали во всех миграциях: удаляешь пользователя — база сама удаляет всё, что на него ссылается.
* Файл выполняется при каждом запуске. При втором запуске удалять уже некого, `DELETE` просто ничего не сделает. Ошибки не будет.
* Почему не жалко: домен `example.com` специально зарезервирован для примеров, настоящий человек с таким email зарегистрироваться не может.

---

# Часть 7. Тесты

## 🔹 Шаг 17. Тесты защиты

Счётчики попыток живут в Redis, а Redis не откатывается после теста, как база (`@Transactional` действует только на базу).
Поэтому каждому тесту даём **свой адрес** (`10.0.0.1`, `10.0.0.2`…) и **свой email**. Тогда тесты не мешают друг другу, в каком бы порядке ни шли.

Создай `backend/src/test/java/com/adventcalendar/calendar/security/HardeningRulesTest.java`:

```java
package com.adventcalendar.calendar.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// Защита перед публикацией: лимит попыток входа, защитные заголовки, ошибки без подробностей.
// Счётчики попыток живут в Redis и НЕ откатываются после теста, поэтому у каждого теста
// свой адрес (IP) и свой email — тесты друг другу не мешают
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class HardeningRulesTest {

    @Autowired MockMvc mvc;

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf())
                .with(request -> { request.setRemoteAddr(ip); return request; }) // «запрос пришёл с этого адреса»
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\": \"" + email + "\", \"password\": \"" + password + "\"}"));
    }

    private void register(String ip, String email) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                        .with(request -> { request.setRemoteAddr(ip); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Тест", "email": "%s", "password": "password123",
                                 "privacyAccepted": true, "termsAccepted": true}
                                """.formatted(email)))
                .andExpect(status().isCreated());
    }

    @Test
    void fiveWrongPasswordsBlockThisEmail() throws Exception {
        register("10.0.0.1", "lock@test.local");

        for (int i = 0; i < 5; i++) {
            login("10.0.0.1", "lock@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        // Шестая попытка — даже с ВЕРНЫМ паролем — отказ: email заблокирован на время
        login("10.0.0.1", "lock@test.local", "password123")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("Слишком много попыток")));
    }

    @Test
    void successfulLoginResetsMistakes() throws Exception {
        register("10.0.0.2", "reset@test.local");

        for (int i = 0; i < 4; i++) {
            login("10.0.0.2", "reset@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        login("10.0.0.2", "reset@test.local", "password123").andExpect(status().isOk());

        // Счётчик обнулился: снова можно ошибиться 4 раза, и это всё ещё 401, а не 429
        for (int i = 0; i < 4; i++) {
            login("10.0.0.2", "reset@test.local", "wrong").andExpect(status().isUnauthorized());
        }
    }

    @Test
    void tooManyAttemptsFromOneAddressAreBlocked() throws Exception {
        // С одного адреса перебирают разные email: лимит на email не сработает, а лимит на адрес — да
        for (int i = 0; i < 50; i++) {
            login("10.0.0.3", "user" + i + "@test.local", "wrong").andExpect(status().isUnauthorized());
        }
        login("10.0.0.3", "one-more@test.local", "wrong").andExpect(status().isTooManyRequests());

        // С другого адреса вход работает как обычно
        login("10.0.0.4", "one-more@test.local", "wrong").andExpect(status().isUnauthorized());
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"));
    }

    @Test
    void unknownAddressIs404Not500(@Autowired UserRepository userRepository) throws Exception {
        User me = userRepository.save(new User("Я", "me404@test.local", "x"));

        // Новый обработчик «всех остальных ошибок» не должен превращать обычный 404 в 500
        mvc.perform(get("/api/no-such-address").with(user(CurrentUser.from(me))))
                .andExpect(status().isNotFound());
    }

    @Test
    void botThatFillsHoneypotIsNotRegistered(@Autowired UserRepository userRepository) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf())
                        .with(request -> { request.setRemoteAddr("10.0.0.5"); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Бот", "email": "bot@test.local", "password": "password123",
                                 "privacyAccepted": true, "termsAccepted": true,
                                 "extraInfo": "http://spam.example"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Не получилось создать аккаунт"));

        org.assertj.core.api.Assertions.assertThat(userRepository.findByEmail("bot@test.local")).isEmpty();
    }
}
```

Что нового:

* **`.with(request -> { request.setRemoteAddr(ip); return request; })`** — подменяем адрес, с которого «пришёл» запрос. По умолчанию MockMvc всегда пишет `127.0.0.1`.
* **`"""...""".formatted(email)`** — текстовый блок с подстановкой: `%s` заменится на `email`.
* **`header().string(имя, значение)`** — проверка, что в ответе есть заголовок с точно таким значением.
* **`@Autowired UserRepository userRepository`** в параметрах теста — JUnit может передать бин Spring прямо в метод, если он нужен только одному тесту.

## 🔹 Шаг 18. Юнит-тест обработчика ошибок

Чтобы проверить «непредвиденную ошибку», не нужно ломать базу. Достаточно вызвать метод обработчика напрямую, как обычный метод Java. Это **юнит-тест**: без Spring, без Docker, выполняется за миллисекунды.

Создай `backend/src/test/java/com/adventcalendar/calendar/error/GlobalExceptionHandlerTest.java`:

```java
package com.adventcalendar.calendar.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

// Юнит-тест: без Spring и без базы, просто вызываем метод обработчика
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void unexpectedErrorHidesDetails() {
        // Представим, что база упала с сообщением, в котором видно устройство сервера
        Exception ex = new IllegalStateException("could not execute SQL: SELECT password_hash FROM users");

        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        String detail = response.getBody().getDetail();
        assertThat(detail).startsWith("Что-то пошло не так. Код ошибки: ");
        assertThat(detail).doesNotContain("SQL", "password_hash", "IllegalStateException");
    }

    @Test
    void knownSpringErrorKeepsItsStatus() {
        ResponseEntity<ProblemDetail> response = handler.handleUnexpected(new ResponseStatusException(HttpStatus.NOT_FOUND));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
```

💡 При запуске этого теста в консоли появится красная строка `ERROR ... Непредвиденная ошибка, код ...`. Это не провал теста: это наш `log.error` честно записал «упавшую базу» из первого теста.

## 🔹 Шаг 19. Тест профиля `prod`

Проверим, что на настоящем сервере тестовых пользователей не будет. Для этого запустим сервер в тесте **с профилем `prod`**.

Создай `backend/src/test/java/com/adventcalendar/calendar/security/ProdProfileTest.java`:

```java
package com.adventcalendar.calendar.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

// Запускаем сервер так, как он будет работать на настоящем сервере: с профилем prod.
// Пароли в prod берутся из переменных окружения, здесь подставляем тестовые
@SpringBootTest(properties = {"DB_PASSWORD=test", "STORAGE_SECRET_KEY=test"})
@ActiveProfiles("prod")
@Import(TestcontainersConfiguration.class)
class ProdProfileTest {

    @Autowired UserRepository userRepository;

    @Test
    void demoUsersAreRemovedInProd() {
        // Миграция V2 создала Анну, Бориса и Вику, а db/prod/afterMigrate.sql их удалил
        assertThat(userRepository.findByEmail("anna@example.com")).isEmpty();
        assertThat(userRepository.findByEmail("boris@example.com")).isEmpty();
        assertThat(userRepository.findByEmail("vika@example.com")).isEmpty();
    }
}
```

Разбор:

* **`@ActiveProfiles("prod")`** — включить профиль `prod` для этого теста. Прочитается `application-prod.properties`, Flyway выполнит и `db/prod/afterMigrate.sql`.
* **`properties = {"DB_PASSWORD=test", ...}`** — в `prod` пароли обязательны (шаг 14). Без них тест упал бы ещё при запуске. Сами базы всё равно подставит Testcontainers.
* Этот тест запускает **свой** набор контейнеров (PostgreSQL, Redis, MinIO), потому что настройки у него другие. Поэтому `.\mvnw test` станет секунд на 10–20 дольше.

## 🔹 Шаг 20. Запуск

```powershell
cd backend
.\mvnw test
```

Ожидаем:

```
Tests run: 77, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

---

## 🔹 Шаг 21. Всё вместе: проверка руками

1. Перезапусти сервер в IntelliJ.
2. `curl.exe -i http://localhost:8080/api/health` — в ответе есть `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`.
3. Во фронтенде 6 раз войди как Анна с неверным паролем: на шестой раз «Слишком много попыток входа…».
4. В `redis-cli` выполни `DEL login:fails:anna@example.com` и войди как Анна с паролем `password123`: вход работает.

## 🔹 Шаг 22. Коммит

```powershell
git add .
git commit -m "Этап 12: лимит попыток входа, защитные заголовки, ошибки без подробностей, профиль prod"
```

## 🔹 Если что-то не так

| Что видишь | Почему | Что делать |
|---|---|---|
| При старте `Could not resolve placeholder 'security.login.window'` | забыл шаг 4 | добавь три строки `security.login.*` в `application.properties` |
| При старте `Could not resolve placeholder 'DB_PASSWORD'` | случайно включён профиль `prod` или пароль записан без `:advent` | проверь шаг 15: `${DB_PASSWORD:advent}` с двоеточием и значением |
| Вход всегда отвечает 429 | ты много раз пробовал войти, счётчик ещё живёт | `redis-cli` → `KEYS login:*` → `DEL` нужный ключ. Или подожди 15 минут |
| Вход отвечает 500, в логе `RedisConnectionFailureException` | Redis не запущен | `docker compose up -d` |
| Тест `unknownAddressIs404Not500` получает 500 | в `handleUnexpected` нет проверки `instanceof ErrorResponse` | сверь с шагом 11 |
| Тест `ProdProfileTest` падает с `Could not resolve placeholder` | нет `properties = {...}` в `@SpringBootTest` | сверь с шагом 19 |
| Регистрация через сайт отвечает «Не получилось создать аккаунт» | браузер сам заполнил поле-ловушку или поле видно на странице | проверь `autoComplete="off"` и класс `trap` из шага 9 |
| В IntelliJ метод `permissionsPolicy` зачёркнут | это устаревший метод | используй `permissionsPolicyHeader` |

## 🔹 Созданные и изменённые файлы

Новые:

* `backend/src/main/java/com/adventcalendar/calendar/security/TooManyAttemptsException.java`
* `backend/src/main/java/com/adventcalendar/calendar/security/LoginRateLimiter.java`
* `backend/src/main/resources/application-prod.properties`
* `backend/src/main/resources/db/prod/afterMigrate.sql`
* `backend/src/test/java/com/adventcalendar/calendar/security/HardeningRulesTest.java`
* `backend/src/test/java/com/adventcalendar/calendar/security/ProdProfileTest.java`
* `backend/src/test/java/com/adventcalendar/calendar/error/GlobalExceptionHandlerTest.java`

Изменённые:

* `backend/src/main/java/com/adventcalendar/calendar/auth/AuthController.java` — счётчики в `login` и `register`, проверка ловушки
* `backend/src/main/java/com/adventcalendar/calendar/auth/RegisterRequest.java` — поле-ловушка `extraInfo`
* `frontend/src/api/auth.ts`, `frontend/src/pages/RegisterPage.tsx`, `frontend/src/index.css` — скрытое поле в форме регистрации
* `backend/src/main/java/com/adventcalendar/calendar/error/GlobalExceptionHandler.java` — ответ 429 и обработчик «всего остального»
* `backend/src/main/java/com/adventcalendar/calendar/security/SecurityConfig.java` — три защитных заголовка
* `backend/src/main/resources/application.properties` — пароли через переменные, лимиты, cookie, ошибки

## Главное, что нужно запомнить

* **Лимит попыток** (rate limit) — два счётчика: ошибки на один email и все попытки с одного адреса. Заблокированному email отказываем даже с верным паролем.
* **Поле-ловушка** отсекает простых ботов при регистрации. Настоящая защита — подтверждение почты, оно будет после этапа 14.
* **Защитные заголовки** говорят браузеру, что с нашими ответами делать нельзя. Spring Security ставит часть сам, остальные добавляются в `.headers(...)`.
* **Ошибки:** пользователю — общая фраза и код, программисту — всё в лог. Ловя `Exception`, не превращай обычные 404 и 405 в 500.
* **HTTPS** делает прокси, а Spring нужно научить верить его заголовкам `X-Forwarded-*`. Верить можно только своему прокси.
* **Профиль `prod`**: пароли только из переменных окружения, без значений по умолчанию; тестовых пользователей на настоящем сервере нет.
