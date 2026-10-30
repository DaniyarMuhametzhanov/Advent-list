-- Вся база календаря для D1 (это SQLite). Те же таблицы, что в Java-версии (V1–V8),
-- только вход теперь через Telegram: вместо email и пароля храним telegram_id.
-- В SQLite нет TIMESTAMPTZ и BOOLEAN: время храним текстом в формате ISO ('2026-10-30T12:00:00.000Z')

CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL UNIQUE, -- id человека в Telegram. Его присылает сам Telegram, подделать нельзя
    name        TEXT    NOT NULL,        -- имя и фамилия из Telegram
    name_lower  TEXT    NOT NULL,        -- то же имя маленькими буквами: для поиска (см. friends.ts)
    username    TEXT,                    -- @ник в Telegram. Может не быть
    created_at  TEXT    NOT NULL
);

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
