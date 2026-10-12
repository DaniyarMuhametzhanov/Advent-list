# Этап 13. Docker и CI

## 🔹 Что делаем и зачем

Сейчас, чтобы запустить календарь, ты делаешь три вещи: `docker compose up -d` (база, MinIO, Redis), запускаешь сервер в IntelliJ и фронтенд через `npm run dev`.
На твоём компьютере это работает, потому что там стоят Java 26, Node 24, Maven и всё настроено. На настоящем сервере (этап 14) ничего этого нет.

На этом этапе делаем две вещи:

1. **Упаковываем приложение в контейнеры.** Бэкенд и фронтенд станут такими же «коробками», как PostgreSQL и Redis. Всё приложение будет запускаться одной командой на любом компьютере, где есть Docker.
2. **Настраиваем CI.** Код уедет на GitHub, и при каждом `git push` GitHub сам соберёт проект и прогонит все тесты. Если что-то сломалось, ты узнаешь об этом сразу, а не на сервере.

Аналогия 📦: переезд. Можно перевозить вещи россыпью и на новом месте вспоминать, куда что ставить. А можно сложить всё в подписанные коробки. Коробку с надписью «кухня» любой грузчик поставит куда нужно, и внутри всё будет на своих местах.
Docker-образ — это такая коробка с программой и всем, что ей нужно для работы.

Аналогия 🧑‍🔬 для CI: контролёр на заводе. Каждую новую деталь (каждый `push`) он проверяет по одному и тому же списку. Бракованная деталь не уедет дальше.

Java-код и код фронтенда на этом этапе **не меняются**. Новые только файлы настроек.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Образ** (image) | «коробка» с программой: внутри операционная система, Java или nginx, наш код. Сам по себе ничего не делает, это заготовка |
| **Контейнер** (container) | запущенный образ. Из одного образа можно запустить много контейнеров |
| **Dockerfile** | рецепт сборки образа: «возьми вот это, положи сюда, выполни такую команду» |
| **Многоэтапная сборка** (multi-stage build) | в одном Dockerfile два образа: первый собирает программу, второй только запускает её. В итоговый образ инструменты сборки не попадают |
| **Слой** (layer) | каждая строка Dockerfile — это слой. Если слой не менялся, Docker берёт его из кэша и не выполняет строку заново |
| **.dockerignore** | список файлов, которые не нужно отправлять в Docker при сборке. Как `.gitignore`, только для Docker |
| **nginx** | веб-сервер: быстро отдаёт готовые файлы (HTML, JS, CSS) и умеет передавать запросы дальше другому серверу |
| **Обратный прокси** (reverse proxy) | программа, которая принимает запросы и передаёт их другой программе. У нас nginx передаёт `/api/...` бэкенду |
| **Docker-сеть** (network) | «локальная сеть» внутри Docker. В ней контейнеры находят друг друга по имени сервиса: `postgres`, `redis`, `backend` |
| **Проверка здоровья** (healthcheck) | команда, которой Docker проверяет «программа в контейнере уже готова работать?» |
| **CI** (continuous integration, непрерывная интеграция) | автоматическая сборка и тесты при каждом изменении кода |
| **GitHub Actions** | CI, встроенный в GitHub. Задания описываются в файлах `.github/workflows/*.yml` |
| **Workflow, job, step** | workflow — весь сценарий проверки; job — отдельная задача в нём (например, «тесты бэкенда»); step — один шаг задачи (одна команда) |
| **Раннер** (runner) | временный компьютер GitHub, на котором выполняется job. После работы его стирают |
| **Удалённый репозиторий** (remote) | копия твоего Git-репозитория на другом компьютере, у нас на GitHub. Обычно называется `origin` |

## 🔹 Как всё будет устроено

```
Браузер ──▶ localhost:8088
             │
             ▼
     ┌─────────────── Docker-сеть ────────────────────────┐
     │  frontend (nginx)                                   │
     │    /, /login, /assets/...  → отдаёт файлы React     │
     │    /api/...                → передаёт в backend:8080│
     │                                  │                  │
     │  backend (Spring Boot)  ◀────────┘                  │
     │     │         │          │                          │
     │  postgres   redis      minio                        │
     └─────────────────────────────────────────────────────┘
```

Это та же схема, что сейчас при `npm run dev`, только вместо Vite запросы `/api` передаёт nginx.
Для браузера всё по-прежнему приходит с **одного адреса**, поэтому CORS настраивать не нужно, как и раньше.

💡 Контейнеры с бэкендом и фронтендом подключаются к **тем же** PostgreSQL, Redis и MinIO, что и сервер из IntelliJ. Значит, в Docker будут те же Анна, Борис, Вика и все твои желания.

## 🔹 Перед началом

1. Сделай коммит этапа 12, если ещё не сделал. `git status` должен показать `nothing to commit`.
2. Docker Desktop должен быть запущен.
3. Нужен аккаунт на GitHub (он у тебя есть).

---

# Часть 1. Бэкенд в контейнере

## 🔹 Шаг 1. Что не отправлять в Docker

При сборке Docker сначала копирует папку (её называют **контекст сборки**, build context) к себе. Папка `target` с прошлыми сборками ему не нужна, она только замедлит сборку.

Создай файл `backend/.dockerignore`:

```
target/
.idea/
*.iml
```

## 🔹 Шаг 2. Рецепт образа бэкенда

Создай файл `backend/Dockerfile` (без расширения, с большой буквы D):

```dockerfile
# ===== Шаг 1: сборка. Здесь есть Maven и полный JDK =====
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# Тесты здесь не запускаем: им нужен Docker (Testcontainers), а внутри сборки его нет.
# Тесты запускает GitHub Actions отдельным шагом.
# --mount=type=cache: скачанные библиотеки Maven сохраняются между сборками
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

# ===== Шаг 2: запуск. Только JRE и готовый jar, без Maven и исходников =====
FROM eclipse-temurin:21-jre
WORKDIR /app
# Отдельный пользователь без прав администратора
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/target/*.jar app.jar
USER app
EXPOSE 8080
# MaxRAMPercentage=75: Java берёт до 75% памяти, которую дали контейнеру
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
```

Разбор по строкам:

| Строка | Что делает |
|---|---|
| `FROM maven:3.9-eclipse-temurin-21 AS build` | взять готовый образ, в котором уже есть Maven и Java 21. `AS build` — даём этому этапу имя, чтобы потом брать из него файлы |
| `WORKDIR /app` | «перейти в папку `/app`» внутри образа (и создать её, если нет). Как `cd` |
| `COPY pom.xml .` и `COPY src ./src` | скопировать с твоего компьютера в образ список библиотек и исходники |
| `RUN ... mvn -B -DskipTests package` | собрать jar. `-B` — «без лишних вопросов и цветов в логе» (batch mode). `-DskipTests` — не запускать тесты |
| `FROM eclipse-temurin:21-jre` | **второй** образ. В нём только **JRE**: то, что нужно, чтобы *запускать* Java. Компилятора и Maven нет |
| `RUN groupadd ... useradd ...` | создать пользователя `app` |
| `COPY --from=build /app/target/*.jar app.jar` | взять готовый jar из первого этапа. Всё остальное из первого этапа (Maven, исходники, библиотеки для сборки) в итоговый образ не попадает |
| `USER app` | дальше программа работает от имени `app`, а не администратора (`root`) |
| `EXPOSE 8080` | пометка «программа внутри слушает порт 8080». Это подсказка для людей, порт она сама не открывает |
| `ENTRYPOINT [...]` | команда, которая выполняется при запуске контейнера |

Почему так устроено:

* **Два этапа** (multi-stage). Образ для сборки с Maven, JDK и всеми библиотеками для сборки намного больше образа для запуска. На сервер уезжает только второй. Чем меньше в образе программ, тем меньше в нём мест, через которые можно взломать.
* **Почему без тестов.** Наши тесты сами запускают PostgreSQL, Redis и MinIO через Testcontainers (этап 10), то есть им нужен Docker. Внутри `docker build` Docker недоступен. Тесты прогонит CI в части 4, до сборки образа.
* **`--mount=type=cache`.** Maven при каждой сборке скачивает сотни библиотек. С этой строкой Docker хранит папку `/root/.m2` между сборками, и вторая сборка идёт намного быстрее.
* **Не `root`.** Если в программе найдут дыру, взломщик получит права пользователя `app`, а не администратора контейнера.
* **`MaxRAMPercentage=75`.** Java смотрит, сколько памяти дали контейнеру, и берёт себе до 75%. Остальное остаётся системе.

💡 Почему Java 21, а у тебя на компьютере 26? В `pom.xml` написано `<java.version>21</java.version>`: код собирается для Java 21. Java 21 — версия с долгой поддержкой (**LTS**, long-term support), для серверов берут именно такие.

## 🔹 Шаг 3. Собрать образ

В корне проекта:

```powershell
docker build -t advent-backend ./backend
```

* `docker build` — собрать образ по `Dockerfile`.
* `-t advent-backend` — дать образу имя (**тег**, tag).
* `./backend` — папка, где лежит `Dockerfile` (контекст сборки).

Первая сборка займёт несколько минут: Docker скачивает образы Maven и Java, а Maven скачивает библиотеки. В конце должно быть `naming to docker.io/library/advent-backend`.

Посмотри, что получилось:

```powershell
docker images advent-backend
```

Запустить его отдельно пока не получится: внутри контейнера `localhost` — это сам контейнер, а не твой компьютер, и базы там нет. Это исправит docker-compose в части 3.

---

# Часть 2. Фронтенд в контейнере

## 🔹 Как фронтенд работает «по-взрослому»

Сейчас фронтенд отдаёт **Vite** (`npm run dev`). Это сервер для разработки: он следит за файлами и пересобирает их на лету. Для настоящих пользователей он не подходит: медленный и не для этого сделан.

Для настоящего запуска делают так:

1. `npm run build` собирает из кода готовые файлы в папку `dist`: один `index.html`, несколько `.js` и `.css` в `dist/assets`.
2. Эти файлы отдаёт **nginx** — быстрый веб-сервер, который умеет только отдавать файлы и передавать запросы дальше.

Аналогия 🍰: Vite — это кухня, где торт готовят и пробуют. `npm run build` — торт готов и упакован. nginx — витрина магазина, где его просто выдают покупателям.

## 🔹 Шаг 4. Что не отправлять в Docker

Создай файл `frontend/.dockerignore`:

```
node_modules
dist
coverage
test-results
playwright-report
.idea
```

⚠️ Особенно важна строка `node_modules`. Твои `node_modules` собраны для Windows, а в контейнере Linux. Часть библиотек (например, сборщик Vite) содержит программы под конкретную систему, и с Windows-версией сборка в Linux сломается. Поэтому в контейнере библиотеки ставятся заново.

## 🔹 Шаг 5. Настройки nginx

Создай файл `frontend/nginx.conf`:

```nginx
# Если перед nginx стоит ещё один прокси (Caddy на этапе 14), он пишет в X-Forwarded-Proto, был ли HTTPS.
# Заголовка нет — значит, браузер пришёл прямо к nginx, и мы передаём свою схему (http)
map $http_x_forwarded_proto $forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    server_tokens off;          # не писать в ответах версию nginx
    client_max_body_size 10m;   # картинки до 5 МБ (по умолчанию nginx пускает только 1 МБ)

    gzip on;                    # сжимать JS и CSS перед отправкой
    gzip_types text/css application/javascript image/svg+xml;

    # Запросы к API передаём бэкенду. backend — имя сервиса из docker-compose.yml
    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # настоящий адрес пользователя
        proxy_set_header X-Forwarded-Proto $forwarded_proto;           # http или https
    }

    # Файлы сборки. В имени есть хеш (index-a1b2c3.js), поэтому их можно кэшировать надолго
    location /assets/ {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # Всё остальное — страницы приложения. /login, /privacy и т.п. — это не файлы,
    # их рисует React, поэтому для любого адреса отдаём index.html
    location / {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

Разбор по частям:

1. **`server { listen 80; ... }`** — «сайт», который слушает порт 80 внутри контейнера. `root` — папка с файлами, которые отдаём.
2. **`location /api/ { proxy_pass http://backend:8080; }`** — всё, что начинается с `/api/`, nginx передаёт бэкенду. Это то же, что делал `proxy` в `vite.config.ts`. `backend` — имя сервиса из docker-compose: внутри Docker-сети это работает как адрес.
3. **`X-Forwarded-For` и `X-Forwarded-Proto`** — те самые заголовки из этапа 12 (часть 5). nginx дописывает к запросу настоящий адрес пользователя и схему (`http`/`https`). Без них лимит попыток входа считал бы всех пользователей одним адресом — адресом nginx.
   `map` в начале файла нужен для этапа 14: там перед nginx встанет Caddy с HTTPS. Тогда nginx передаст дальше то, что сказал Caddy (`https`), а не своё `http`.
4. **`client_max_body_size 10m`** — по умолчанию nginx не пропускает запросы больше 1 МБ. Без этой строки загрузка картинки на 2 МБ ломалась бы с ошибкой 413 ещё до Spring. 10 МБ — как `max-swallow-size` в `application.properties`: тогда слишком большую картинку отклонит Spring с понятным сообщением.
5. **`try_files $uri $uri/ /index.html`** — «если такой файл есть, отдай его, а если нет — отдай `index.html`». Почему: адреса `/login` или `/privacy` — это не файлы, их рисует React Router. Без этой строки обновление страницы на `/login` давало бы 404.
6. **`Cache-Control`.** Файлы в `/assets/` называются с хешем: `index-BxH3k9.js`. Изменился код — изменилось имя. Поэтому браузеру можно хранить их год (`immutable` — «точно не изменится»). А `index.html` браузер должен каждый раз сверять с сервером (`no-cache`), иначе после обновления он показывал бы старую версию сайта.
7. **`server_tokens off`** — не сообщать в ответах версию nginx. Помнишь из этапа 12: каждая мелочь помогает взломщику.

## 🔹 Шаг 6. Защитные заголовки для страниц

На этапе 12 мы поставили защитные заголовки на ответы **бэкенда** и договорились, что CSP для страниц фронтенда настроим в веб-сервере. Это он и есть.

Создай файл `frontend/security-headers.conf`:

```nginx
# Защитные заголовки для страниц фронтенда (у ответов /api свои, их ставит Spring Security).
# CSP: скрипты и запросы — только с нашего адреса. Стили и шрифты — ещё с Google Fonts (index.html).
# Картинки — ещё из data: и blob: (так браузер показывает выбранный файл до загрузки). В рамку нас не вставить
add_header Content-Security-Policy "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

Разбор CSP по частям:

| Правило | Простыми словами |
|---|---|
| `default-src 'self'` | всё, для чего ниже нет отдельного правила (скрипты, запросы `fetch`), — только с нашего же адреса. Скрипт с чужого сайта браузер не запустит |
| `style-src 'self' https://fonts.googleapis.com` | стили — наши и с Google Fonts. Оттуда `index.html` берёт описание шрифтов Onest и Unbounded |
| `font-src 'self' https://fonts.gstatic.com` | сами файлы шрифтов Google хранит на другом адресе, `fonts.gstatic.com` |
| `img-src 'self' data: blob:` | картинки — с нашего адреса, плюс встроенные в страницу (`data:`) и созданные в браузере из файла (`blob:`) |
| `object-src 'none'` | никаких старых плагинов (Flash и т.п.) |
| `base-uri 'self'` | нельзя подменить «базовый адрес» страницы тегом `<base>` |
| `form-action 'self'` | формы отправляются только на наш адрес |
| `frame-ancestors 'none'` | нашу страницу нельзя вставить в рамку на чужом сайте (защита от кликджекинга, этап 12) |

Главная польза CSP: если в страницу как-то попадёт чужой скрипт (**XSS**), например в названии желания, браузер просто откажется его выполнять.

⚠️ CSP легко сделать слишком строгим. Сначала тут было просто `default-src 'self'`, и браузер заблокировал шрифты: в `index.html` подключён Google Fonts (`<link href="https://fonts.googleapis.com/...">`). Сайт работал, но шрифты были системные.
Как это заметить: открой сайт, нажми `F12` → вкладка **Console**. Если CSP что-то запретил, там будет красная строка `... violates the following Content Security Policy directive ...`. В ней написано, что именно заблокировано и каким правилом.

💡 Каждый раз, когда браузер загружает шрифт с Google, Google видит адрес (IP) пользователя. Для учебного проекта это нормально. Если захочешь этого избежать, файлы шрифтов можно скачать и положить в проект. Тогда два правила для Google из CSP можно убрать.

Почему заголовки вынесены в отдельный файл и подключаются `include` в двух местах? У nginx есть ловушка ⚠️: если внутри `location` есть хоть один свой `add_header`, то `add_header` из `server` в этом `location` **не действуют**. У нас в обоих `location` есть свой `Cache-Control`, поэтому защитные заголовки подключаем в каждый явно.

И почему их нет в `location /api/`? Там заголовки уже ставит Spring Security (этап 12, шаг 10). Если nginx добавит свои, в ответе будет два разных CSP.

## 🔹 Шаг 7. Рецепт образа фронтенда

Создай файл `frontend/Dockerfile`:

```dockerfile
# ===== Шаг 1: сборка. Node собирает из исходников готовые файлы в папку dist =====
FROM node:24-alpine AS build
WORKDIR /app
# Сначала только списки библиотек: пока они не менялись, Docker не ставит библиотеки заново
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ===== Шаг 2: запуск. nginx отдаёт файлы из dist и передаёт /api бэкенду =====
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

Разбор:

* **`node:24-alpine`** — образ с Node 24 на основе **Alpine Linux**: очень маленькой версии Linux (около 5 МБ). Поэтому образы `-alpine` легче.
* **`npm ci`** — как `npm install`, но ставит **ровно** те версии, что записаны в `package-lock.json`, и ничего в нём не меняет. Для сборки и CI берут именно `ci` (clean install).
* **Почему `package.json` копируем отдельно и раньше остального кода.** Это про **слои** и кэш. Docker выполняет строки сверху вниз и запоминает результат каждой. Если файлы, которые копирует строка, не изменились, Docker берёт готовый результат из кэша.
  Ты чаще меняешь код, чем список библиотек. Изменил `App.tsx` — Docker видит, что `package.json` прежний, и пропускает долгий `npm ci`. Заново выполнятся только `COPY . .` и `npm run build`.
* **Второй этап — `nginx`.** В итоговый образ не попадают ни Node, ни `node_modules` (сотни мегабайт), только папка `dist` и две наши настройки.
* **`/etc/nginx/conf.d/default.conf`** — стандартный файл настроек сайта в образе nginx. Мы заменяем его своим.

Собери, чтобы проверить:

```powershell
docker build -t advent-frontend ./frontend
```

---

# Часть 3. Всё вместе: docker-compose

## 🔹 Шаг 8. Новый `docker-compose.yml`

Замени `docker-compose.yml` в корне проекта целиком:

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
      - "5434:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    # Проверка «база готова принимать запросы». Бэкенд ждёт её, а не просто запуска контейнера
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U advent -d advent"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
    container_name: advent-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: advent
      MINIO_ROOT_PASSWORD: advent-secret
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

  redis:
    image: redis:8
    container_name: advent-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  # ===== Само приложение. Запускается, только если указать --profile app =====

  backend:
    profiles: ["app"]
    build: ./backend
    container_name: advent-backend
    environment:
      # Внутри Docker-сети сервисы находят друг друга по имени: postgres, redis, minio.
      # Порт базы здесь 5432: 5434 — это «дверь» только для твоего компьютера
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/advent
      SPRING_DATA_REDIS_HOST: redis
      STORAGE_ENDPOINT: http://minio:9000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_started
    restart: unless-stopped

  frontend:
    profiles: ["app"]
    build: ./frontend
    container_name: advent-frontend
    ports:
      - "8088:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres-data:
  minio-data:
```

Что изменилось:

**1. `healthcheck` у PostgreSQL и Redis.** «Контейнер запущен» и «программа готова» — разные вещи. PostgreSQL после запуска ещё несколько секунд готовит базу. Если бэкенд постучится раньше, он упадёт с ошибкой подключения.
`pg_isready` и `redis-cli ping` — маленькие программы, которые отвечают «да, готов». Docker запускает их каждые 5 секунд (`interval`).

**2. Сервис `backend`.**

* `build: ./backend` — образа нет на Docker Hub, его нужно собрать из `backend/Dockerfile`.
* `environment` — переменные окружения. Как ты помнишь из этапа 12, ими можно поменять любую настройку Spring, не трогая код. Spring сам переводит имя: `SPRING_DATASOURCE_URL` → `spring.datasource.url`, `STORAGE_ENDPOINT` → `storage.endpoint` (большие буквы → маленькие, `_` → `.`). Это называется **relaxed binding** («нестрогое связывание»).
* **Почему не `localhost`.** Внутри контейнера `localhost` — это сам контейнер. Базы там нет. Зато в Docker-сети у каждого сервиса есть адрес-имя: `postgres`, `redis`, `minio`.
* **Почему порт 5432, а не 5434.** `"5434:5432"` значит «порт 5434 на твоём компьютере ведёт к порту 5432 в контейнере». Бэкенд в Docker-сети стучится к контейнеру напрямую, поэтому ему нужен внутренний порт 5432.
* `depends_on` с `condition: service_healthy` — «запусти бэкенд только после того, как база и Redis прошли проверку здоровья». У MinIO проверки нет, поэтому для него просто «после запуска».
* `restart: unless-stopped` — если бэкенд упал, Docker перезапустит его сам. Не перезапустит, только если ты остановил его сам.
* У бэкенда **нет** `ports`. Снаружи к нему не попасть, только через nginx. Так и задумано.

**3. Сервис `frontend`.** `"8088:80"` — nginx внутри слушает порт 80, а у тебя на компьютере он будет на `localhost:8088`.

**4. `profiles: ["app"]`.** Это переключатель. Обычная команда `docker compose up -d` запускает только сервисы **без** профиля: базу, MinIO, Redis, как раньше. Так ты продолжаешь работать в IntelliJ и `npm run dev`, и Docker не собирает лишнего.
Чтобы запустить всё приложение, добавляешь `--profile app`.

## 🔹 Шаг 9. Запустить всё приложение

```powershell
docker compose --profile app up -d --build
```

* `--profile app` — включить и сервисы с профилем `app`.
* `--build` — собрать образы `backend` и `frontend` перед запуском (если код поменялся — пересобрать).

Посмотри, что запущено:

```powershell
docker compose --profile app ps
```

Должно быть пять контейнеров: `advent-postgres` и `advent-redis` (с пометкой `healthy`), `advent-minio`, `advent-backend`, `advent-frontend`.

Подожди 10–20 секунд, пока запустится Spring, и открой **http://localhost:8088**. Войди как Анна (`anna@example.com` / `password123`). Это полноценное приложение, но уже без IntelliJ и без Vite. 🎉

Проверь защитные заголовки страниц:

```powershell
curl.exe -I http://localhost:8088/login
```

В ответе должны быть `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` и `Cache-Control: no-cache`.

💡 Сервер из IntelliJ (`localhost:8080`) и `npm run dev` (`localhost:5173`) можно держать запущенными одновременно с Docker: порты разные, а база общая.

## 🔹 Шаг 10. Полезные команды

| Команда | Что делает |
|---|---|
| `docker compose --profile app logs -f backend` | смотреть лог бэкенда в реальном времени (`-f` — follow, «следить»). Выход: `Ctrl+C` |
| `docker compose --profile app up -d --build` | поменял код — пересобрать и перезапустить то, что изменилось |
| `docker compose --profile app stop backend frontend` | остановить приложение, а база, MinIO и Redis пусть работают |
| `docker compose --profile app down` | остановить и удалить все контейнеры. Данные в базе и MinIO **сохранятся**: они лежат в томах (`volumes`) |

⚠️ **Никогда** не добавляй к `down` флаг `-v`, если не хочешь потерять данные. `-v` удаляет тома, а с ними все желания и картинки.

---

# Часть 4. GitHub и CI

## 🔹 Шаг 11. Рецепт проверки для GitHub Actions

Создай папки `.github\workflows` в корне проекта и в них файл `ci.yml`. Точка в начале имени `.github` обязательна:

```powershell
mkdir .github\workflows
```

`.github/workflows/ci.yml`:

```yaml
# GitHub Actions: при каждом push и pull request собираем проект и запускаем тесты
name: CI

on:
  push:
  pull_request:

jobs:
  backend:
    name: Бэкенд — тесты
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      # Testcontainers сам запустит PostgreSQL, Redis и MinIO: Docker на GitHub уже есть
      - run: sh ./mvnw -B test

  frontend:
    name: Фронтенд — проверка, тесты, сборка
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  docker:
    name: Docker — сборка и запуск
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: docker compose --profile app up -d --build
      # Ждём, пока сервер ответит через nginx (до минуты)
      - run: curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:8088/api/health
      - run: curl -fsS http://localhost:8088/ | grep -q 'id="root"'
      - name: Логи контейнеров, если что-то упало
        if: failure()
        run: docker compose --profile app logs
```

⚠️ В YAML важны **отступы**: только пробелы, по два. Табуляция сломает файл.

Разбор по частям:

1. **`on: push` и `pull_request`** — когда запускать: при каждом `git push` в любую ветку и при каждом pull request.
2. **`jobs`** — три задачи: `backend`, `frontend`, `docker`. Первые две GitHub запускает **одновременно** на двух разных раннерах, так быстрее.
3. **`runs-on: ubuntu-latest`** — на каком компьютере работать: свежий Linux (Ubuntu). На нём уже есть Docker, Git, curl.
4. **`working-directory: backend`** — все команды этой задачи выполнять в папке `backend`, как будто сделали `cd backend`.
5. **`uses:`** — взять готовый шаг (**action**), который написали другие:
   * `actions/checkout` — скачать твой код на раннер. Без него на раннере пусто;
   * `actions/setup-java` — поставить Java 21. `cache: maven` — сохранять скачанные библиотеки между запусками, чтобы второй раз не качать;
   * `actions/setup-node` — поставить Node 24, тоже с кэшем библиотек.
   `@v5` — версия action. Если её не указать, однажды автор выпустит новую версию, и твоя проверка может внезапно сломаться.
6. **`run:`** — просто выполнить команду, как ты в PowerShell.
   * `sh ./mvnw -B test` — те же 77 тестов, что ты запускаешь `.\mvnw test`. На Linux вместо `mvnw.cmd` работает файл `mvnw`, а `sh` в начале запускает его, даже если у файла нет пометки «можно выполнять».
   * `npm run lint`, `npm test`, `npm run build` — проверка кода (oxlint), 29 тестов Vitest и сборка.
7. **`needs: [backend, frontend]`** — задача `docker` начнётся, только если обе первые прошли. Нет смысла собирать образы из кода, который не прошёл тесты.
8. **Задача `docker`** делает то же, что ты в шаге 9: собирает образы и запускает всё приложение. Потом `curl` проверяет, что через nginx отвечает бэкенд (`/api/health`) и что отдаётся страница React.
   * `-f` — считать ответ 4xx/5xx ошибкой (тогда шаг упадёт). `-sS` — не печатать полоску загрузки, но печатать ошибки.
   * `--retry 30 --retry-delay 2 --retry-all-errors` — попробовать до 30 раз с паузой 2 секунды: Spring запускается не мгновенно.
   * `grep -q 'id="root"'` — в ответе есть `<div id="root">`, значит nginx отдал наш `index.html`.
9. **`if: failure()`** — этот шаг выполняется, **только если** что-то выше упало. Он печатает логи контейнеров, чтобы было видно, почему.

💡 Сквозной тест Playwright (`npm run e2e`) в CI пока не запускаем: ему нужен запущенный фронтенд с бэкендом и браузер. Его можно добавить позже, когда будешь уверенно чувствовать себя с CI.

## 🔹 Шаг 12. Коммит

```powershell
git add .
git status
```

В списке должны быть только новые и изменённые файлы этапа (см. список в конце). Если видишь там `.env` или папку `node_modules`, остановись и проверь `.gitignore`.

```powershell
git commit -m "Этап 13: Dockerfile для бэкенда и фронтенда, приложение в docker-compose, GitHub Actions"
```

## 🔹 Шаг 13. Репозиторий на GitHub

Сейчас твой репозиторий живёт только на компьютере (`git remote -v` ничего не показывает). Чтобы работал CI, код нужно отправить на GitHub.

**13.1. Проверь, что не отправляешь секретов.** Весь код, который ты отправишь, будет храниться на GitHub. На этапе 12 мы как раз убрали пароли из кода. Оставшиеся `advent` / `advent-secret` — пароли только для твоего локального Docker, это не секрет. Тестовые пользователи с `password123` на настоящем сервере удаляются (этап 12, шаг 16).

**13.2. Создай пустой репозиторий.** На github.com: кнопка **New repository** (плюс в правом верхнем углу → New repository).

* Repository name: `advent-list`
* Видимость: **Private** (закрытый: видишь только ты). Потом можно сделать публичным, например для портфолио.
* **Не** ставь галочки «Add a README», «.gitignore», «license»: репозиторий должен быть пустым, всё это у тебя уже есть.

Нажми **Create repository**.

**13.3. Свяжи свой репозиторий с GitHub и отправь код.** В корне проекта:

```powershell
git remote add origin https://github.com/DaniyarMuhametzhanov/advent-list.git
git push -u origin master
```

* `git remote add origin <адрес>` — запомнить: «удалённый репозиторий с именем `origin` живёт вот по этому адресу».
* `git push -u origin master` — отправить ветку `master` в `origin`. `-u` — запомнить эту связь: дальше достаточно писать просто `git push`.

При первом `push` Windows откроет окно входа в GitHub (это **Git Credential Manager**). Войди через браузер, и Git запомнит вход.

## 🔹 Шаг 14. Смотрим, как работает CI

Открой репозиторий на GitHub → вкладка **Actions**. Там появится запуск **CI** с названием твоего коммита.

Нажми на него. Ты увидишь три задачи: сначала одновременно идут «Бэкенд — тесты» и «Фронтенд — проверка, тесты, сборка», потом «Docker — сборка и запуск». Нажми на любую, чтобы смотреть шаги и их вывод в реальном времени.

Первый запуск идёт дольше (5–10 минут): GitHub скачивает образы Docker и библиотеки. Следующие быстрее, кэш уже есть.

Когда всё пройдёт, рядом с коммитом появится зелёная галочка ✅. Красный крестик ❌ значит, что что-то упало: открой упавшую задачу, найди шаг с крестиком и прочитай вывод.

💡 **Эксперимент** (по желанию): в любом тесте фронтенда поменяй ожидаемое значение, сделай коммит и `git push`. Увидишь красный крестик и письмо от GitHub о том, что проверка не прошла. Потом верни как было и снова `push`.

---

## 🔹 Если что-то не так

| Что видишь | Почему | Что делать |
|---|---|---|
| `docker build` пишет `failed to connect to the docker API` | не запущен Docker Desktop | запусти Docker Desktop и подожди, пока он загрузится |
| Сборка фронтенда в Docker падает на `npm ci` | `package-lock.json` не совпадает с `package.json` | в папке `frontend` выполни `npm install`, сделай коммит обновлённого `package-lock.json` |
| `http://localhost:8088` открывается, но вход отвечает 502 Bad Gateway | бэкенд ещё запускается или упал | подожди 20 секунд; не помогло — `docker compose --profile app logs backend` |
| В логе бэкенда `Connection to postgres:5432 refused` | в `SPRING_DATASOURCE_URL` опечатка или порт 5434 вместо 5432 | сверь с шагом 8 |
| `Bind for 0.0.0.0:8088 failed: port is already allocated` | порт 8088 занят другой программой | поменяй `"8088:80"` на свободный, например `"8089:80"` |
| Обновление страницы на `/login` даёт 404 | в `nginx.conf` нет `try_files ... /index.html` | сверь с шагом 5 |
| Загрузка картинки отвечает `413 Request Entity Too Large` (страница nginx) | нет `client_max_body_size` | сверь с шагом 5 |
| Изменил код, а в Docker старая версия | образ не пересобран | `docker compose --profile app up -d --build` |
| На GitHub задача «Бэкенд» падает с `Permission denied` на `mvnw` | запустили `./mvnw` без `sh` | в `ci.yml` должно быть `sh ./mvnw -B test` |
| `git push` пишет `Repository not found` | опечатка в адресе или репозиторий не создан | `git remote -v`, исправить: `git remote set-url origin <правильный адрес>` |
| `git push` пишет `rejected ... fetch first` | при создании репозитория поставили галочку README | проще всего удалить репозиторий на GitHub (Settings → Delete) и создать заново пустым |
| На GitHub `Invalid workflow file` | ошибка в отступах `ci.yml` | GitHub пишет номер строки; проверь, что там пробелы, а не табуляция |

## 🔹 Созданные и изменённые файлы

Новые:

* `backend/Dockerfile`
* `backend/.dockerignore`
* `frontend/Dockerfile`
* `frontend/.dockerignore`
* `frontend/nginx.conf`
* `frontend/security-headers.conf`
* `.github/workflows/ci.yml`

Изменённые:

* `docker-compose.yml` — проверки здоровья у PostgreSQL и Redis, сервисы `backend` и `frontend` с профилем `app`

## Главное, что нужно запомнить

* **Образ** — заготовка-«коробка», **контейнер** — запущенный образ. **Dockerfile** — рецепт образа.
* **Многоэтапная сборка**: в одном этапе собираем (Maven, Node), в итоговый образ кладём только результат (jar, папка `dist`). Образ меньше и безопаснее.
* **Внутри Docker `localhost` — это сам контейнер.** Другие сервисы ищем по имени (`postgres`, `backend`) и по внутреннему порту.
* **nginx** отдаёт готовый фронтенд и передаёт `/api` бэкенду. Так браузер видит один адрес, как раньше с Vite.
* **CI** (GitHub Actions) при каждом `push` повторяет то, что ты делаешь руками: тесты, сборку, запуск. Зелёная галочка — код рабочий.
