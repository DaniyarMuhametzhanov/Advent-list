-- Свои праздники человека: дни рождения, годовщины и т. п.
-- Храним только месяц и день: такой праздник повторяется каждый год
CREATE TABLE holidays (
    id       BIGSERIAL   PRIMARY KEY,
    owner_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month    SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
    day      SMALLINT    NOT NULL CHECK (day BETWEEN 1 AND 31),
    title    VARCHAR(40) NOT NULL,
    CONSTRAINT uq_holidays_owner_day UNIQUE (owner_id, month, day)
);
