-- Вся база календаря для D1 (это SQLite). Те же таблицы, что в Java-версии (V1–V8),
-- плюс роли, сессии и список email, которым администратор разрешил регистрацию.
-- В SQLite нет TIMESTAMPTZ и BOOLEAN: время храним текстом в формате ISO ('2026-10-30T12:00:00.000Z')

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    name_lower    TEXT    NOT NULL,        -- то же имя маленькими буквами: для поиска (см. friends.ts)
    email         TEXT    NOT NULL UNIQUE, -- всегда маленькими буквами
    password_hash TEXT    NOT NULL,        -- не сам пароль, а его хеш (см. auth/password.ts)
    role          TEXT    NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')), -- обычный или администратор
    created_at    TEXT    NOT NULL
);

-- Кому администратор разрешил регистрироваться. Убрал email из списка — человек больше не может
-- ни зарегистрироваться, ни пользоваться календарём (его желания при этом не удаляются)
CREATE TABLE allowed_emails (
    email    TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);

-- Сессии: «этот браузер вошёл как этот человек». В cookie лежит случайный токен,
-- а в базе только его хеш: если базу украдут, войти по ней не получится
CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT    NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- Неудачные попытки входа: защита от подбора пароля (как LoginRateLimiter с Redis в Java-версии)
CREATE TABLE login_failures (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT NOT NULL,
    failed_at TEXT NOT NULL
);
CREATE INDEX idx_login_failures_email ON login_failures (email, failed_at);

CREATE TABLE wishes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    wish_date  TEXT    NOT NULL,         -- '2026-10-05'
    title      TEXT    NOT NULL,
    comment    TEXT,
    image_key  TEXT,                     -- имя картинки в R2. NULL = картинки нет
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE (owner_id, wish_date)
);

-- Дружба. Пара хранится один раз: меньший id всегда в user_a_id
CREATE TABLE friendships (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    UNIQUE (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
);
CREATE INDEX idx_friendships_user_b ON friendships (user_b_id);

-- Заявки в друзья. status: PENDING (ждёт ответа), ACCEPTED (принята), DECLINED (отклонена)
CREATE TABLE friend_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    CHECK (from_user_id <> to_user_id)
);
-- Ждущая ответа заявка от одного человека другому может быть только одна
CREATE UNIQUE INDEX uq_friend_requests_pending
    ON friend_requests (from_user_id, to_user_id) WHERE status = 'PENDING';
CREATE INDEX idx_friend_requests_to ON friend_requests (to_user_id, status);

-- Кому открыт день: одна строка = «этому другу можно смотреть это желание»
CREATE TABLE wish_access (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wish_id    INTEGER NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    viewer_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    UNIQUE (wish_id, viewer_id)
);
CREATE INDEX idx_wish_access_viewer ON wish_access (viewer_id);

-- Запросы доступа, которые ждут ответа владельца. Ответил владелец — строку удаляем
CREATE TABLE access_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    wish_id      INTEGER NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TEXT    NOT NULL,
    UNIQUE (wish_id, from_user_id)
);
CREATE INDEX idx_access_requests_from ON access_requests (from_user_id);

-- Свои праздники человека (дни рождения и т. п.). Только месяц и день: повторяются каждый год.
-- В одном дне может быть несколько праздников
CREATE TABLE holidays (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month    INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    day      INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
    title    TEXT    NOT NULL
);
CREATE INDEX idx_holidays_owner ON holidays (owner_id);

-- Согласия: на что согласился, с какой версией документа и когда
CREATE TABLE consents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type             TEXT    NOT NULL, -- PRIVACY_POLICY или TERMS
    document_version TEXT    NOT NULL,
    accepted_at      TEXT    NOT NULL
);
CREATE INDEX idx_consents_user ON consents (user_id);
