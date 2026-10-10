-- Кому открыт день: одна строка = «этому другу можно смотреть это желание»
CREATE TABLE wish_access (
    id         BIGSERIAL   PRIMARY KEY,
    wish_id    BIGINT      NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    viewer_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wish_access UNIQUE (wish_id, viewer_id)
);
CREATE INDEX idx_wish_access_viewer ON wish_access (viewer_id);

-- Запросы доступа, которые ждут ответа владельца.
-- Когда владелец ответил («Открыть» или «Отказать»), строку удаляем
CREATE TABLE access_requests (
    id           BIGSERIAL   PRIMARY KEY,
    wish_id      BIGINT      NOT NULL REFERENCES wishes (id) ON DELETE CASCADE,
    from_user_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_access_requests UNIQUE (wish_id, from_user_id)
);
CREATE INDEX idx_access_requests_from ON access_requests (from_user_id);

-- Как в макете: Анна открыла Борису день 5 октября, Борис открыл Анне свой день 8 октября,
-- а ещё Борис просит доступ к дню Анны 12 октября.
-- Берём id желаний по владельцу и дате: если такого желания уже нет, строка просто не добавится
INSERT INTO wish_access (wish_id, viewer_id)
SELECT id, 2 FROM wishes WHERE owner_id = 1 AND wish_date = '2026-10-05';
INSERT INTO wish_access (wish_id, viewer_id)
SELECT id, 1 FROM wishes WHERE owner_id = 2 AND wish_date = '2026-10-08';
INSERT INTO access_requests (wish_id, from_user_id)
SELECT id, 2 FROM wishes WHERE owner_id = 1 AND wish_date = '2026-10-12';
