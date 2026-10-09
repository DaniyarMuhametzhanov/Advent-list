CREATE TABLE users (
                       id            BIGSERIAL    PRIMARY KEY,
                       name          VARCHAR(100) NOT NULL,
                       email         VARCHAR(255) NOT NULL UNIQUE,
                       password_hash VARCHAR(100) NOT NULL,
                       created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE wishes (
                        id         BIGSERIAL     PRIMARY KEY,
                        owner_id   BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                        wish_date  DATE          NOT NULL,
                        title      VARCHAR(100)  NOT NULL,
                        comment    VARCHAR(1000),
                        created_at TIMESTAMPTZ   NOT NULL,
                        updated_at TIMESTAMPTZ   NOT NULL,
                        CONSTRAINT uq_wishes_owner_date UNIQUE (owner_id, wish_date)
);