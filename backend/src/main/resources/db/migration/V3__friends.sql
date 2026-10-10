-- Дружба. Пара хранится один раз: меньший id всегда в user_a_id
CREATE TABLE friendships (
    id         BIGSERIAL   PRIMARY KEY,
    user_a_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_friendships_pair UNIQUE (user_a_id, user_b_id),
    CONSTRAINT ck_friendships_order CHECK (user_a_id < user_b_id)
);
CREATE INDEX idx_friendships_user_b ON friendships (user_b_id);

-- Заявки в друзья. status: PENDING (ждёт ответа), ACCEPTED (принята), DECLINED (отклонена)
CREATE TABLE friend_requests (
     id           BIGSERIAL   PRIMARY KEY,
     from_user_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     to_user_id   BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     status       VARCHAR(20) NOT NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_friend_requests_not_self CHECK (from_user_id <> to_user_id)
);
-- Ждущая ответа заявка от одного человека другому может быть только одна
CREATE UNIQUE INDEX uq_friend_requests_pending
    ON friend_requests (from_user_id, to_user_id) WHERE status = 'PENDING';
CREATE INDEX idx_friend_requests_to ON friend_requests (to_user_id, status);

-- Как в макете: Анна и Борис уже друзья, Вика прислала Анне заявку
INSERT INTO friendships (user_a_id, user_b_id) VALUES (1, 2);
INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (3, 1, 'PENDING');