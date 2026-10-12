-- Выполняется после миграций при КАЖДОМ запуске, только в профиле prod.
-- Тестовые пользователи из V2 (пароль password123 знают все, кто видел код) на настоящем сервере не нужны.
-- Их желания, друзья, доступы и согласия удалятся сами: во всех таблицах стоит ON DELETE CASCADE
DELETE FROM users WHERE email IN ('anna@example.com', 'boris@example.com', 'vika@example.com');
