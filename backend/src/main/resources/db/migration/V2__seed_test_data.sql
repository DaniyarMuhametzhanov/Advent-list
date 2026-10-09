-- Тестовые пользователи. Пароль у всех: password123 (здесь лежит его BCrypt-хеш)
INSERT INTO users (name, email, password_hash) VALUES
     ('Анна',  'anna@example.com',  '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G'),
     ('Борис', 'boris@example.com', '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G'),
     ('Вика',  'vika@example.com',  '$2a$10$RrtTgd0HPZKNI8AXGzoxS.1gdkA1tGmIIAD8lCSRm1hN.M344UQ8G');

-- Желания Анны
INSERT INTO wishes (owner_id, wish_date, title, comment, created_at, updated_at) VALUES
    (1, '2026-10-05', 'Книга «Маленький принц»', 'Лучше в твёрдой обложке', now(), now()),
    (1, '2026-10-12', 'Билеты в кино',           'На вечерний сеанс',       now(), now()),
    (1, '2026-10-24', 'Тёплый шарф',             NULL,                      now(), now());

-- Желания Бориса и Вики
INSERT INTO wishes (owner_id, wish_date, title, comment, created_at, updated_at) VALUES
     (2, '2026-10-08', 'Настольная игра',         'Что-нибудь на компанию',  now(), now()),
     (3, '2026-10-15', 'Набор для рисования',     'Акварель',                now(), now());