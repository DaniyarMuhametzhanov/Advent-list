// Вход по email и паролю.
//   POST /api/auth/register — создать аккаунт. Только для email, которые администратор добавил в список
//   POST /api/auth/login    — войти
//   POST /api/auth/logout   — выйти
//   GET  /api/me            — кто я (подключается после requireUser, см. index.ts)
import { Hono } from 'hono';
import type { App, CurrentUser } from '../env';
import { ApiError, badRequest } from '../errors';
import { endSession, startSession } from '../auth/middleware';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password';
import { isAllowed, normalizeEmail, roleFor } from '../lib/roles';
import { checkText, jsonBody, now } from '../lib/validate';

export const authRoutes = new Hono<App>();
export const meRoutes = new Hono<App>();

// Что фронтенд узнаёт о себе (как MeResponse в Java, плюс роль). Хеша пароля здесь нет!
const meResponse = (me: CurrentUser) => ({ id: me.id, name: me.name, email: me.email, role: me.role });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Защита от подбора пароля: не больше 5 ошибок на один email за 15 минут (как в Java-версии)
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

authRoutes.post('/auth/register', async c => {
    const body = await jsonBody(c);
    // Поле-ловушка (honeypot) заполнено — это бот. Не объясняем почему
    if (typeof body.extraInfo === 'string' && body.extraInfo.trim() !== '') {
        throw badRequest('Не получилось создать аккаунт');
    }
    const { name, email: rawEmail, password } = checkText(body, {
        name: { required: 'Имя обязательно', max: 100, maxMessage: 'Имя не длиннее 100 символов' },
        email: { required: 'Email обязателен', max: 255, maxMessage: 'Email слишком длинный' },
        password: { required: 'Пароль обязателен', max: 72, maxMessage: 'Пароль от 8 до 72 символов' },
    });
    const errors: Record<string, string> = {};
    if (!EMAIL.test(rawEmail!.trim())) errors.email = 'Это не похоже на email';
    if (password!.length < 8) errors.password = 'Пароль от 8 до 72 символов';
    if (body.privacyAccepted !== true) errors.privacyAccepted = 'Нужно согласие на обработку персональных данных';
    if (body.termsAccepted !== true) errors.termsAccepted = 'Нужно принять Условия использования и подтвердить возраст 18+';
    if (Object.keys(errors).length > 0) throw badRequest('Данные заполнены неверно', errors);

    const email = normalizeEmail(rawEmail!);
    // Главное правило: регистрироваться можно, только если администратор разрешил этот email
    if (!await isAllowed(c.env, email)) {
        throw new ApiError(403, 'Регистрация по приглашению. Попросите администратора добавить ваш email');
    }
    const db = c.env.DB;
    if (await db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').bind(email).first('ok')) {
        throw new ApiError(409, 'Этот email уже зарегистрирован');
    }

    const time = now();
    const cleanName = name!.trim();
    // Одной транзакцией: человек и два согласия. Версии документов — из настроек сервера, их нельзя подменить
    const consent = (type: string, version: string) => db.prepare(
        `INSERT INTO consents (user_id, type, document_version, accepted_at) SELECT id, ?, ?, ? FROM users WHERE email = ?`)
        .bind(type, version, time, email);
    await db.batch([
        db.prepare('INSERT INTO users (name, name_lower, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(cleanName, cleanName.toLowerCase(), email, await hashPassword(password!), roleFor(c.env, email), time),
        consent('PRIVACY_POLICY', c.env.PRIVACY_VERSION),
        consent('TERMS', c.env.TERMS_VERSION),
    ]).catch(e => {
        // Два запроса пришли одновременно, и второй упёрся в UNIQUE (email)
        if (String(e).includes('UNIQUE')) throw new ApiError(409, 'Этот email уже зарегистрирован');
        throw e;
    });
    const me = (await db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').bind(email).first<CurrentUser>())!;
    await startSession(c, me.id); // после регистрации сразу входим
    return c.json(meResponse(me), 201);
});

authRoutes.post('/auth/login', async c => {
    const body = await jsonBody(c);
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
    const password = typeof body.password === 'string' ? body.password : '';
    const db = c.env.DB;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    // 1. Не слишком ли много ошибок? Тогда пароль даже не проверяем
    const fails = await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND failed_at > ?')
        .bind(email, since).first<number>('n');
    if ((fails ?? 0) >= MAX_FAILS) {
        return c.json({ status: 429, detail: 'Слишком много попыток входа. Попробуйте через 15 мин.' }, 429,
            { 'Retry-After': String(WINDOW_MS / 1000) });
    }

    // 2. Проверить пароль. Email не найден — всё равно считаем хеш, чтобы ответ шёл столько же времени
    const user = await db.prepare('SELECT id, name, email, role, password_hash AS passwordHash FROM users WHERE email = ?')
        .bind(email).first<CurrentUser & { passwordHash: string }>();
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
        await db.prepare('INSERT INTO login_failures (email, failed_at) VALUES (?, ?)').bind(email, now()).run();
        // Не говорим, что именно не так (email или пароль), чтобы нельзя было подбирать email
        throw new ApiError(401, 'Неверный email или пароль');
    }

    // 3. Вошёл — обнуляем ошибки. Доступ закрыт администратором — не пускаем
    await db.prepare('DELETE FROM login_failures WHERE email = ?').bind(email).run();
    if (!await isAllowed(c.env, user.email, user.role)) throw new ApiError(403, 'Администратор закрыл вам доступ к календарю');
    await startSession(c, user.id);
    // Роль из настроек (ADMIN_EMAILS) запишется в базу при следующем запросе, а ответ уже правильный
    const role = user.role === 'ADMIN' ? 'ADMIN' : roleFor(c.env, email);
    return c.json(meResponse({ id: user.id, name: user.name, email: user.email, role }));
});

authRoutes.post('/auth/logout', async c => {
    await endSession(c);
    return c.body(null, 204);
});

meRoutes.get('/me', c => c.json(meResponse(c.get('me'))));
