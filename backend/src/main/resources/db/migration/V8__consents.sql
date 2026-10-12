-- Согласия пользователя: на что согласился, с какой версией документа и когда.
-- Нужны как доказательство: «этот человек принял политику версии X в такое-то время»
CREATE TABLE consents (
    id               BIGSERIAL   PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type             VARCHAR(30) NOT NULL,
    document_version VARCHAR(20) NOT NULL,
    accepted_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_consents_user ON consents (user_id);
