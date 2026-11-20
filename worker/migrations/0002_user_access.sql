-- Доступ по приглашению: зарегистрироваться может только тот, кому администратор разрешил.
-- Одна строка = один человек из Telegram и решение администратора о нём:
--   PENDING — человек открыл календарь, ждёт решения;
--   ALLOWED — администратор разрешил;
--   DENIED  — администратор отказал (или закрыл доступ позже).
-- Строка появляется ещё ДО регистрации, поэтому храним telegram_id, а не id из users
CREATE TABLE user_access (
    telegram_id  INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL, -- имя из Telegram: чтобы администратор понимал, кто просит
    username     TEXT,
    status       TEXT    NOT NULL CHECK (status IN ('PENDING', 'ALLOWED', 'DENIED')),
    requested_at TEXT    NOT NULL,
    decided_at   TEXT
);

-- Кто уже зарегистрировался до этого этапа, тот остаётся с доступом: никого не выгоняем
INSERT INTO user_access (telegram_id, name, username, status, requested_at, decided_at)
SELECT telegram_id, name, username, 'ALLOWED', created_at, created_at FROM users;
