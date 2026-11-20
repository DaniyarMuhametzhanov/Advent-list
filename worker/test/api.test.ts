// Правила API на настоящем движке Cloudflare (Miniflare): вход, роли, друзья, закрытые дни, картинки.
// Как Java-тесты SecurityRulesTest, AccessRulesTest, ImageRulesTest и HolidayRulesTest
import type { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, startWorker } from './helpers';

let mf: Miniflare;
let counter = 0;

beforeAll(async () => { mf = await startWorker(); });
afterAll(async () => { await mf.dispose(); });

const ORIGIN = 'http://advent.test';
type Res = { status: number; body: any; text: string; cookie: string | null };

// Отправить запрос в Worker. auth — cookie сессии («session=...») или null (не вошёл).
// Origin — как у настоящего браузера на нашем сайте (без него изменять данные нельзя, см. sameOrigin)
async function call(auth: string | null, method: string, path: string, body?: unknown,
                    extra: Record<string, string> = {}): Promise<Res> {
    const headers: Record<string, string> = { Origin: ORIGIN, ...extra };
    if (auth) headers.Cookie = auth;
    let payload: any;
    if (body instanceof FormData) {
        // Превращаем форму в байты multipart/form-data сами: так заголовок с границей частей точно дойдёт
        const encoded = new Response(body);
        payload = await encoded.arrayBuffer();
        headers['Content-Type'] = encoded.headers.get('Content-Type')!;
    } else if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }
    const response = await mf.dispatchFetch(ORIGIN + path, { method, headers, body: payload });
    const text = await response.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* не JSON — например, картинка */ }
    // Из Set-Cookie достаём только «session=...»: это и есть то, что браузер будет присылать дальше
    const cookie = /session=[0-9a-f]+/.exec(response.headers.get('Set-Cookie') ?? '')?.[0] ?? null;
    return { status: response.status, body: json, text, cookie };
}

// Администратор разрешил email (прямо в базе: так короче)
async function allow(email: string) {
    const db = await mf.getD1Database('DB');
    await db.prepare('INSERT OR IGNORE INTO allowed_emails (email, added_at) VALUES (?, ?)').bind(email, '').run();
}

const registration = (name: string, email: string) =>
    ({ name, email, password: 'password123', privacyAccepted: true, termsAccepted: true, extraInfo: '' });

// Новый человек: администратор разрешил его email, он зарегистрировался и сразу вошёл
async function newUser(name: string) {
    const email = `user${++counter}@test.ru`;
    await allow(email);
    const res = await call(null, 'POST', '/api/auth/register', registration(name, email));
    expect(res.status).toBe(201);
    return { auth: res.cookie!, id: res.body.id as number, email };
}

type User = Awaited<ReturnType<typeof newUser>>;

async function makeFriends(a: User, b: User) {
    await call(a.auth, 'POST', '/api/friend-requests', { toUserId: b.id });
    const incoming = await call(b.auth, 'GET', '/api/friend-requests/incoming');
    const request = incoming.body.find((r: any) => r.from.id === a.id);
    expect((await call(b.auth, 'POST', `/api/friend-requests/${request.id}/accept`)).status).toBe(204);
}

// Администратор из настроек (ADMIN_EMAILS): регистрируется сам, без приглашения
async function admin() {
    const login = await call(null, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: 'password123' });
    if (login.status === 200) return login.cookie!;
    const res = await call(null, 'POST', '/api/auth/register', registration('Админ', ADMIN_EMAIL));
    expect(res.status).toBe(201);
    return res.cookie!;
}

const MONTH = '2026-10';

describe('Вход по email и паролю', () => {
    it('не вошёл — 401', async () => {
        expect((await call(null, 'GET', '/api/me')).status).toBe(401);
        expect((await call('session=' + '0'.repeat(64), 'GET', '/api/wishes')).status).toBe(401);
    });

    it('регистрация: проверка полей, согласия, ловушка для ботов; потом вход и выход', async () => {
        const email = 'new@test.ru';
        await allow(email);
        const refused = await call(null, 'POST', '/api/auth/register',
            { ...registration('Новичок', email), password: 'short', termsAccepted: false });
        expect(refused.status).toBe(400);
        expect(refused.body.errors).toMatchObject({ password: 'Пароль от 8 до 72 символов', termsAccepted: expect.any(String) });
        expect((await call(null, 'POST', '/api/auth/register', { ...registration('Бот', email), extraInfo: 'spam' })).status)
            .toBe(400);

        const created = await call(null, 'POST', '/api/auth/register', registration('Новичок', ' New@Test.RU '));
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Новичок', email, role: 'USER' });
        expect(created.text).not.toContain('password');
        expect(created.cookie).toMatch(/^session=/);
        expect((await call(null, 'POST', '/api/auth/register', registration('Ещё раз', email))).status).toBe(409);

        // Согласия записаны с версиями документов с сервера
        const db = await mf.getD1Database('DB');
        const { results } = await db.prepare('SELECT type, document_version FROM consents WHERE user_id = ? ORDER BY type')
            .bind(created.body.id).all();
        expect(results).toEqual([{ type: 'PRIVACY_POLICY', document_version: 'p-1' }, { type: 'TERMS', document_version: 't-1' }]);
        // Пароль в базе — только хеш
        const hash = await db.prepare('SELECT password_hash FROM users WHERE email = ?').bind(email).first<string>('password_hash');
        expect(hash).toMatch(/^pbkdf2\$100000\$/);

        expect((await call(null, 'POST', '/api/auth/login', { email, password: 'wrong-pass' })).status).toBe(401);
        const login = await call(null, 'POST', '/api/auth/login', { email: 'NEW@test.ru', password: 'password123' });
        expect(login.status).toBe(200);
        expect((await call(login.cookie, 'GET', '/api/me')).body.email).toBe(email);

        expect((await call(login.cookie, 'POST', '/api/auth/logout')).status).toBe(204);
        expect((await call(login.cookie, 'GET', '/api/me')).status).toBe(401);
    });

    it('неизвестный email и неверный пароль — одинаковый ответ', async () => {
        const a = await call(null, 'POST', '/api/auth/login', { email: 'nobody@test.ru', password: 'password123' });
        expect(a.status).toBe(401);
        expect(a.body.detail).toBe('Неверный email или пароль');
    });

    it('после 5 ошибок подряд вход по этому email закрыт на 15 минут', async () => {
        const user = await newUser('Забывчивый');
        for (let i = 0; i < 5; i++) {
            expect((await call(null, 'POST', '/api/auth/login', { email: user.email, password: 'wrong-pass' })).status).toBe(401);
        }
        const blocked = await call(null, 'POST', '/api/auth/login', { email: user.email, password: 'password123' });
        expect(blocked.status).toBe(429);
    });

    it('изменять данные с чужого сайта нельзя (защита от CSRF)', async () => {
        const user = await newUser('Осторожный');
        const evil = await call(user.auth, 'PUT', `/api/wishes/${MONTH}-03`, { title: 'Взлом' }, { Origin: 'https://evil.example' });
        expect(evil.status).toBe(403);
        expect((await call(user.auth, 'GET', '/api/wishes')).body).toEqual([]);
    });
});

describe('Желания', () => {
    it('сохраняет, проверяет поля и не даёт трогать чужое', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');

        const empty = await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-05`, { title: ' ', comment: null });
        expect(empty.status).toBe(400);
        expect(empty.body.errors.title).toBe('Название обязательно');
        expect((await call(anna.auth, 'PUT', '/api/wishes/2026-02-30', { title: 'X' })).status).toBe(400);

        const saved = await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-05`, { title: 'Книга', comment: null });
        expect(saved.status).toBe(200);
        // Та же дата ещё раз — это изменение, а не второе желание
        const updated = await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-05`, { title: 'Книга 2', comment: 'Твёрдая' });
        expect(updated.body.id).toBe(saved.body.id);
        expect((await call(anna.auth, 'GET', '/api/wishes')).body).toHaveLength(1);

        expect((await call(boris.auth, 'GET', `/api/wishes/${saved.body.id}`)).status).toBe(404);
        expect((await call(boris.auth, 'DELETE', `/api/wishes/${saved.body.id}`)).status).toBe(404);
        expect((await call(anna.auth, 'DELETE', `/api/wishes/${saved.body.id}`)).status).toBe(204);
    });
});

describe('Друзья и закрытые дни', () => {
    it('календарь не друга — 403', async () => {
        const anna = await newUser('Анна');
        const stranger = await newUser('Чужой');
        expect((await call(stranger.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).status).toBe(403);
    });

    it('закрытый день: ни названия, ни праздников. Запрос и открытие', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');
        await makeFriends(anna, boris);
        const wish = (await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-15`, { title: 'Секрет', comment: 'Тсс' })).body;
        await call(anna.auth, 'POST', '/api/holidays/10/15', { title: 'День рождения' });

        const closed = await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`);
        expect(closed.body).toEqual([{ wishId: wish.id, date: `${MONTH}-15`, open: false, requested: false,
            title: null, comment: null, imageUrl: null, thumbUrl: null, holidays: [] }]);
        expect(closed.text).not.toContain('Секрет');

        expect((await call(boris.auth, 'POST', `/api/wishes/${wish.id}/access-requests`)).status).toBe(201);
        expect((await call(boris.auth, 'POST', `/api/wishes/${wish.id}/access-requests`)).status).toBe(409);

        const requests = (await call(anna.auth, 'GET', '/api/access-requests/incoming')).body;
        expect(requests).toMatchObject([{ wishId: wish.id, title: 'Секрет', from: { id: boris.id, name: 'Борис' } }]);
        expect((await call(boris.auth, 'POST', `/api/access-requests/${requests[0].id}/grant`)).status).toBe(404);
        expect((await call(anna.auth, 'POST', `/api/access-requests/${requests[0].id}/grant`)).status).toBe(204);

        const open = await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`);
        expect(open.body[0]).toMatchObject({ open: true, title: 'Секрет', comment: 'Тсс', holidays: ['День рождения'] });
        expect((await call(anna.auth, 'GET', '/api/wishes')).body[0].access).toEqual([boris.id]);

        // Удалили из друзей — доступ пропал, календарь снова закрыт
        expect((await call(anna.auth, 'DELETE', `/api/friends/${boris.id}`)).status).toBe(204);
        expect((await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).status).toBe(403);
        expect((await call(anna.auth, 'GET', '/api/wishes')).body[0].access).toEqual([]);
    });

    it('открыть день можно только другу', async () => {
        const anna = await newUser('Анна');
        const stranger = await newUser('Чужой');
        const wish = (await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-01`, { title: 'X' })).body;
        expect((await call(anna.auth, 'PUT', `/api/wishes/${wish.id}/access/${stranger.id}`)).status).toBe(409);
        // А чужому человеку даже не говорим, что такое желание есть
        expect((await call(stranger.auth, 'POST', `/api/wishes/${wish.id}/access-requests`)).status).toBe(404);
    });

    it('поиск: русские буквы без учёта регистра, знак % не находит всех', async () => {
        const me = await newUser('Ищущий');
        await newUser('Злата Ёлкина');
        expect((await call(me.auth, 'GET', '/api/users/search?q=ЗЛАТА')).body).toMatchObject([{ name: 'Злата Ёлкина', relation: 'NONE' }]);
        expect((await call(me.auth, 'GET', '/api/users/search?q=%25')).body).toEqual([]);
    });

    it('заявки: нельзя себе, нельзя дважды, встречную надо принять', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');
        expect((await call(anna.auth, 'POST', '/api/friend-requests', { toUserId: anna.id })).status).toBe(409);
        expect((await call(anna.auth, 'POST', '/api/friend-requests', { toUserId: 999999 })).status).toBe(404);
        expect((await call(anna.auth, 'POST', '/api/friend-requests', { toUserId: boris.id })).status).toBe(201);
        expect((await call(anna.auth, 'POST', '/api/friend-requests', { toUserId: boris.id })).status).toBe(409);
        expect((await call(boris.auth, 'POST', '/api/friend-requests', { toUserId: anna.id })).body.detail)
            .toBe('Этот человек уже прислал вам заявку. Примите её');
    });
});

describe('Картинки', () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

    function form(full: Uint8Array, thumb = JPEG) {
        const data = new FormData();
        data.append('full', new File([full], 'full.jpg', { type: 'image/jpeg' }));
        data.append('thumb', new File([thumb], 'thumb.jpg', { type: 'image/jpeg' }));
        return data;
    }

    it('видит только владелец и друг с открытым днём', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');
        await makeFriends(anna, boris);
        const wish = (await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-20`, { title: 'Шарф' })).body;

        // Не JPEG (PNG) не принимаем: браузер должен был сам перевести картинку в JPEG
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
        expect((await call(anna.auth, 'POST', `/api/wishes/${wish.id}/image`, form(png))).status).toBe(400);
        expect((await call(boris.auth, 'POST', `/api/wishes/${wish.id}/image`, form(JPEG))).status).toBe(404);

        const uploaded = await call(anna.auth, 'POST', `/api/wishes/${wish.id}/image`, form(JPEG));
        expect(uploaded.status).toBe(200);
        const annaUrl: string = uploaded.body.imageUrl;
        expect(annaUrl).toMatch(/^\/api\/wishes\/\d+\/image\?size=full&v=/);
        expect((await call(anna.auth, 'GET', annaUrl)).status).toBe(200);
        // Не вошёл — 401. Борис знает адрес, но день ему закрыт — 404
        expect((await call(null, 'GET', annaUrl)).status).toBe(401);
        expect((await call(boris.auth, 'GET', annaUrl)).status).toBe(404);

        // Закрытый день: адреса картинки Борис не получает
        expect((await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).body[0].imageUrl).toBeNull();

        // Открыли — получил адрес и картинка грузится. Закрыли — тот же адрес больше не работает
        await call(anna.auth, 'PUT', `/api/wishes/${wish.id}/access/${boris.id}`);
        const borisUrl = (await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).body[0].thumbUrl;
        expect((await call(boris.auth, 'GET', borisUrl)).status).toBe(200);
        await call(anna.auth, 'DELETE', `/api/wishes/${wish.id}/access/${boris.id}`);
        expect((await call(boris.auth, 'GET', borisUrl)).status).toBe(404);

        // Новая картинка — новый адрес. Удалили желание — файлы из базы тоже удалены
        const replaced = await call(anna.auth, 'POST', `/api/wishes/${wish.id}/image`, form(JPEG));
        expect(replaced.body.imageUrl).not.toBe(annaUrl);
        await call(anna.auth, 'DELETE', `/api/wishes/${wish.id}`);
        expect((await call(anna.auth, 'GET', replaced.body.imageUrl)).status).toBe(404);
        const db = await mf.getD1Database('DB');
        expect(await db.prepare('SELECT COUNT(*) AS n FROM images').first('n')).toBe(0);
    });
});

describe('Праздники', () => {
    it('29 февраля можно, 31 апреля нельзя, чужой праздник не найти', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');
        expect((await call(anna.auth, 'POST', '/api/holidays/2/29', { title: 'Високосный' })).status).toBe(201);
        expect((await call(anna.auth, 'POST', '/api/holidays/4/31', { title: 'Нет' })).status).toBe(400);
        expect((await call(anna.auth, 'POST', '/api/holidays/5/1', { title: 'x'.repeat(41) })).status).toBe(400);
        const holiday = (await call(anna.auth, 'POST', '/api/holidays/5/1', { title: '  Весна  ' })).body;
        expect(holiday).toMatchObject({ month: 5, day: 1, title: 'Весна' });
        expect((await call(boris.auth, 'PUT', `/api/holidays/${holiday.id}`, { title: 'Моё' })).status).toBe(404);
        expect((await call(boris.auth, 'DELETE', `/api/holidays/${holiday.id}`)).status).toBe(404);
        expect((await call(anna.auth, 'GET', '/api/holidays')).body).toHaveLength(2);
    });
});

describe('Роли и регистрация по приглашению', () => {
    it('администратор из настроек регистрируется без приглашения и получает роль ADMIN, остальные — USER', async () => {
        expect((await call(await admin(), 'GET', '/api/me')).body.role).toBe('ADMIN');
        const user = await newUser('Обычный');
        expect((await call(user.auth, 'GET', '/api/me')).body.role).toBe('USER');
    });

    it('без разрешения не зарегистрироваться; администратор добавляет email — можно', async () => {
        const email = 'guest@test.ru';
        const refused = await call(null, 'POST', '/api/auth/register', registration('Гость', email));
        expect(refused.status).toBe(403);
        expect(refused.body.detail).toContain('администратора');

        const adminAuth = await admin();
        expect((await call(adminAuth, 'POST', '/api/admin/emails', { email: ' Guest@Test.ru ' })).status).toBe(201);
        expect((await call(adminAuth, 'POST', '/api/admin/emails', { email })).status).toBe(409);
        expect((await call(adminAuth, 'POST', '/api/admin/emails', { email: 'не email' })).status).toBe(400);
        const list = (await call(adminAuth, 'GET', '/api/admin/emails')).body;
        expect(list.admins).toEqual([ADMIN_EMAIL]);
        expect(list.emails.find((e: any) => e.email === email)).toMatchObject({ registered: false, name: null });

        const guest = await call(null, 'POST', '/api/auth/register', registration('Гость', email));
        expect(guest.status).toBe(201);
        expect((await call(adminAuth, 'GET', '/api/admin/emails')).body.emails.find((e: any) => e.email === email))
            .toMatchObject({ registered: true, name: 'Гость' });

        // Убрал из списка — сессия удалена, войти нельзя, в поиске человека нет
        const friend = await newUser('Ищет Гостя');
        expect((await call(friend.auth, 'GET', '/api/users/search?q=гость')).body).toHaveLength(1);
        expect((await call(adminAuth, 'DELETE', `/api/admin/emails/${encodeURIComponent(email)}`)).status).toBe(204);
        expect((await call(guest.cookie, 'GET', '/api/wishes')).status).toBe(401);
        expect((await call(null, 'POST', '/api/auth/login', { email, password: 'password123' })).status).toBe(403);
        expect((await call(friend.auth, 'GET', '/api/users/search?q=гость')).body).toEqual([]);
    });

    it('администратора закрыть нельзя', async () => {
        const adminAuth = await admin();
        expect((await call(adminAuth, 'DELETE', `/api/admin/emails/${encodeURIComponent(ADMIN_EMAIL)}`)).status).toBe(409);
    });

    it('обычному пользователю страница администратора закрыта', async () => {
        const user = await newUser('Хитрый');
        expect((await call(user.auth, 'GET', '/api/admin/emails')).status).toBe(403);
        expect((await call(user.auth, 'POST', '/api/admin/emails', { email: 'friend@test.ru' })).status).toBe(403);
    });
});

it('/api/health отвечает без входа', async () => {
    expect((await call(null, 'GET', '/api/health')).body).toEqual({ status: 'ok' });
});
