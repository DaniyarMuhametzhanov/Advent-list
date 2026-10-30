// Правила API на настоящем движке Cloudflare (Miniflare): вход, друзья, закрытые дни, картинки, бот.
// Как Java-тесты SecurityRulesTest, AccessRulesTest, ImageRulesTest и HolidayRulesTest
import type { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEBHOOK_SECRET, sentMessages, startWorker, tg } from './helpers';

let mf: Miniflare;
let telegramId = 1000;

beforeAll(async () => { mf = await startWorker(); });
afterAll(async () => { await mf.dispose(); });

type Res = { status: number; body: any; text: string };

// Отправить запрос в Worker от имени человека (auth — заголовок Authorization или null)
async function call(auth: string | null, method: string, path: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = {};
    if (auth) headers.Authorization = auth;
    let payload: any;
    if (body instanceof FormData) {
        // Превращаем форму в байты multipart/form-data сами: так заголовок с границей частей точно дойдёт
        const encoded = new Response(body);
        payload = await encoded.arrayBuffer();
        headers['Content-Type'] = encoded.headers.get('Content-Type')!;
    }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    const response = await mf.dispatchFetch('http://advent.test' + path, { method, headers, body: payload });
    const text = await response.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* не JSON — например, картинка */ }
    return { status: response.status, body: json, text };
}

// Новый человек: пришёл из Telegram и принял условия
async function newUser(name: string, username?: string) {
    const tid = ++telegramId;
    const auth = await tg(tid, name, username);
    const res = await call(auth, 'POST', '/api/auth/register', { privacyAccepted: true, termsAccepted: true });
    expect(res.status).toBe(201);
    return { auth, id: res.body.id as number, telegramId: tid };
}

type User = Awaited<ReturnType<typeof newUser>>;

async function makeFriends(a: User, b: User) {
    await call(a.auth, 'POST', '/api/friend-requests', { toUserId: b.id });
    const incoming = await call(b.auth, 'GET', '/api/friend-requests/incoming');
    const request = incoming.body.find((r: any) => r.from.id === a.id);
    expect((await call(b.auth, 'POST', `/api/friend-requests/${request.id}/accept`)).status).toBe(204);
}

const MONTH = '2026-10';

describe('Вход через Telegram', () => {
    it('без подписи Telegram — 401', async () => {
        expect((await call(null, 'GET', '/api/me')).status).toBe(401);
        expect((await call('tma user=%7B%22id%22%3A1%7D&hash=00', 'GET', '/api/wishes')).status).toBe(401);
    });

    it('вход для разработки (dev) на сервере без DEV_AUTH не работает', async () => {
        expect((await call('dev 1:Hacker', 'GET', '/api/me')).status).toBe(401);
    });

    it('новый человек: 404 на /me, без галочек не регистрируется, с галочками — да', async () => {
        const auth = await tg(++telegramId, 'Новичок', 'newbie');
        expect((await call(auth, 'GET', '/api/me')).status).toBe(404);
        expect((await call(auth, 'GET', '/api/wishes')).status).toBe(403);

        const refused = await call(auth, 'POST', '/api/auth/register', { privacyAccepted: true, termsAccepted: false });
        expect(refused.status).toBe(400);
        expect(refused.body.errors.termsAccepted).toBeDefined();

        const created = await call(auth, 'POST', '/api/auth/register', { privacyAccepted: true, termsAccepted: true });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Новичок', username: 'newbie' });
        expect((await call(auth, 'GET', '/api/me')).body.id).toBe(created.body.id);
        expect((await call(auth, 'POST', '/api/auth/register', { privacyAccepted: true, termsAccepted: true })).status)
            .toBe(409);

        // Согласия записаны с версиями документов с сервера
        const db = await mf.getD1Database('DB');
        const { results } = await db.prepare('SELECT type, document_version FROM consents WHERE user_id = ? ORDER BY type')
            .bind(created.body.id).all();
        expect(results).toEqual([{ type: 'PRIVACY_POLICY', document_version: 'p-1' }, { type: 'TERMS', document_version: 't-1' }]);
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

    it('закрытый день: ни названия, ни праздников. Запрос, открытие, уведомления', async () => {
        const anna = await newUser('Анна');
        const boris = await newUser('Борис');
        await makeFriends(anna, boris);
        const wish = (await call(anna.auth, 'PUT', `/api/wishes/${MONTH}-15`, { title: 'Секрет', comment: 'Тсс' })).body;
        await call(anna.auth, 'POST', '/api/holidays/10/15', { title: 'День рождения' });

        const closed = await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`);
        expect(closed.body).toEqual([{ wishId: wish.id, date: `${MONTH}-15`, open: false, requested: false,
            title: null, comment: null, imageUrl: null, thumbUrl: null, holidays: [] }]);
        expect(closed.text).not.toContain('Секрет');

        sentMessages.length = 0;
        expect((await call(boris.auth, 'POST', `/api/wishes/${wish.id}/access-requests`)).status).toBe(201);
        expect((await call(boris.auth, 'POST', `/api/wishes/${wish.id}/access-requests`)).status).toBe(409);
        // Бот написал Анне в Telegram
        await expect.poll(() => sentMessages.find(m => m.chat_id === anna.telegramId)?.text)
            .toBe('🔐 Борис просит открыть ваш день 15 октября');

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

    it('поиск: русские буквы без учёта регистра, по @нику, знак % не находит всех', async () => {
        const me = await newUser('Ищущий');
        await newUser('Злата Ёлкина', 'zlata_e');
        expect((await call(me.auth, 'GET', '/api/users/search?q=ЗЛАТА')).body).toMatchObject([{ name: 'Злата Ёлкина', relation: 'NONE' }]);
        expect((await call(me.auth, 'GET', '/api/users/search?q=@Zlata_E')).body).toHaveLength(1);
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

    it('видит только владелец и друг с открытым днём, и только по подписанному адресу', async () => {
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
        const image = await call(null, 'GET', annaUrl);
        expect(image.status).toBe(200);

        // Подделали подпись — 404
        expect((await call(null, 'GET', annaUrl.replace(/sig=./, 'sig=A'))).status).toBe(404);
        // Чужой адрес «под Бориса»: подпись выдана Анне, u= поменять нельзя
        expect((await call(null, 'GET', annaUrl.replace(`u=${anna.id}`, `u=${boris.id}`))).status).toBe(404);

        // Закрытый день: адреса картинки Борис не получает
        expect((await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).body[0].imageUrl).toBeNull();

        // Открыли — получил и картинка грузится. Закрыли — тот же адрес больше не работает
        await call(anna.auth, 'PUT', `/api/wishes/${wish.id}/access/${boris.id}`);
        const borisUrl = (await call(boris.auth, 'GET', `/api/calendars/${anna.id}?month=${MONTH}`)).body[0].thumbUrl;
        expect((await call(null, 'GET', borisUrl)).status).toBe(200);
        await call(anna.auth, 'DELETE', `/api/wishes/${wish.id}/access/${boris.id}`);
        expect((await call(null, 'GET', borisUrl)).status).toBe(404);

        // Новая картинка — старый адрес не работает. Удалили желание — файлы из R2 тоже удалены
        const replaced = await call(anna.auth, 'POST', `/api/wishes/${wish.id}/image`, form(JPEG));
        expect((await call(null, 'GET', annaUrl)).status).toBe(404);
        await call(anna.auth, 'DELETE', `/api/wishes/${wish.id}`);
        expect((await call(null, 'GET', replaced.body.imageUrl)).status).toBe(404);
        const bucket = await mf.getR2Bucket('IMAGES');
        const key = new URL('http://x' + replaced.body.imageUrl).searchParams.get('v');
        expect(await bucket.head(`${key}/full.jpg`)).toBeNull();
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

describe('Бот', () => {
    it('без секрета webhook не принимает, с секретом отвечает кнопкой', async () => {
        const update = { message: { chat: { id: 777 }, text: '/start' } };
        const res = await mf.dispatchFetch('https://advent.test/api/telegram/webhook',
            { method: 'POST', body: JSON.stringify(update) });
        expect(res.status).toBe(401);

        sentMessages.length = 0;
        const ok = await mf.dispatchFetch('https://advent.test/api/telegram/webhook', {
            method: 'POST', body: JSON.stringify(update),
            headers: { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET },
        });
        expect(ok.status).toBe(200);
        await expect.poll(() => sentMessages.find(m => m.chat_id === 777)?.reply_markup).toEqual({
            inline_keyboard: [[{ text: '🎁 Открыть календарь', web_app: { url: 'https://advent.test' } }]],
        });
    });
});

it('/api/health отвечает без входа', async () => {
    expect((await call(null, 'GET', '/api/health')).body).toEqual({ status: 'ok' });
});
