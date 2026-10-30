// Картинки желаний в хранилище R2.
//   POST /api/wishes/:id/image  — загрузить картинку к своему желанию (форма с файлами full и thumb)
//   GET  /api/wishes/:id/image?size=thumb&v=...&exp=...&sig=... — сама картинка (по подписанному адресу)
//
// В Java-версии сервер сам уменьшал картинку. В бесплатных Workers нет библиотек для этого,
// поэтому уменьшает браузер (frontend/src/lib/resizeImage.ts) и присылает сразу две готовые JPEG:
// большую (до 1600 точек) и превью (до 300 точек). Сервер проверяет, что это правда JPEG и не слишком большой
import { Hono } from 'hono';
import type { App } from '../env';
import { deleteImageFiles, fileName } from '../lib/imageFiles';
import { ApiError, badRequest, notFound } from '../errors';
import { idParam } from '../lib/validate';
import { verifyImageUrl } from '../lib/imageUrls';
import { findMyWish, myWishResponse } from './wishes';

export const MAX_FULL_BYTES = 2 * 1024 * 1024; // 2 МБ — уменьшенной до 1600 точек картинке этого хватает
export const MAX_THUMB_BYTES = 300 * 1024;     // 300 КБ

// Загрузка — только для вошедших, а смотреть можно по подписанному адресу без входа.
// Поэтому два набора адресов: index.ts подключает их по-разному
export const imageRoutes = new Hono<App>();
export const imagePublicRoutes = new Hono<App>();

// Настоящий ли это JPEG? У любого JPEG первые три байта FF D8 FF («магические байты»).
// Расширению и типу из запроса не верим: их легко подписать как угодно
async function jpegBytes(part: unknown, max: number, what: string): Promise<ArrayBuffer> {
    if (!(part instanceof File) || part.size === 0) throw badRequest('Файл не выбран');
    if (part.size > max) throw new ApiError(413, `${what} слишком большая`);
    const bytes = await part.arrayBuffer();
    const head = new Uint8Array(bytes, 0, 3);
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
        throw badRequest('Это не картинка. Подойдут JPG, PNG или GIF');
    }
    return bytes;
}

imageRoutes.post('/wishes/:id{[0-9]+}/image', async c => {
    const me = c.get('me').id;
    const wish = await findMyWish(c.env.DB, me, idParam(c, 'id'));

    // Слишком большой запрос даже не читаем
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_FULL_BYTES + MAX_THUMB_BYTES + 64 * 1024) {
        throw new ApiError(413, 'Картинка слишком большая');
    }
    const form = await c.req.formData().catch(() => null);
    if (!form) throw badRequest('Файл не выбран');
    const full = await jpegBytes(form.get('full'), MAX_FULL_BYTES, 'Картинка');
    const thumb = await jpegBytes(form.get('thumb'), MAX_THUMB_BYTES, 'Превью');

    const newKey = crypto.randomUUID(); // случайное имя: его нельзя угадать
    const meta = { httpMetadata: { contentType: 'image/jpeg' } };
    await Promise.all([
        c.env.IMAGES.put(fileName(newKey, 'full'), full, meta),
        c.env.IMAGES.put(fileName(newKey, 'thumb'), thumb, meta),
    ]);
    await c.env.DB.prepare('UPDATE wishes SET image_key = ? WHERE id = ?').bind(newKey, wish.id).run();
    if (wish.imageKey) await deleteImageFiles(c.env, wish.imageKey); // старая картинка больше не нужна

    return c.json(await myWishResponse(c.env, me, wish.id)); // желание уже с адресами новой картинки
});

// Здесь нет telegramAuth: тег <img> не умеет присылать заголовок Authorization.
// Вместо этого проверяем подпись в адресе (см. lib/imageUrls.ts)
imagePublicRoutes.get('/wishes/:id{[0-9]+}/image', async c => {
    const id = idParam(c, 'id');
    const { size, v, u, exp, sig } = c.req.query();
    const viewer = Number(u);
    // Нет доступа — отвечаем 404, как будто картинки нет вовсе. Не подсказываем, что она существует
    if (!v || !sig || !Number.isInteger(viewer) || !await verifyImageUrl(c.env, id, v, viewer, Number(exp), sig)) {
        throw notFound(`Желание с id ${id} не найдено`);
    }
    // Подпись верна. Но с тех пор могло что-то измениться: картинку заменили или владелец закрыл день.
    // Главное правило: картинку видит только владелец или друг, которому открыт день
    const wish = await c.env.DB.prepare(
        `SELECT image_key AS imageKey, owner_id AS ownerId,
                EXISTS (SELECT 1 FROM wish_access a WHERE a.wish_id = w.id AND a.viewer_id = ?) AS isOpen
         FROM wishes w WHERE id = ?`).bind(viewer, id).first<{ imageKey: string | null; ownerId: number; isOpen: number }>();
    if (!wish || wish.imageKey !== v || (wish.ownerId !== viewer && wish.isOpen !== 1)) {
        throw notFound(`Желание с id ${id} не найдено`);
    }

    const file = await c.env.IMAGES.get(fileName(v, size === 'thumb' ? 'thumb' : 'full'));
    if (!file) throw notFound(`Желание с id ${id} не найдено`);
    return c.body(file.body, 200, {
        'Content-Type': 'image/jpeg',
        // Браузер может держать картинку у себя, но только для этого человека (private).
        // Адрес меняется вместе с картинкой (v=...), поэтому старую он не покажет
        'Cache-Control': 'private, max-age=86400',
    });
});
