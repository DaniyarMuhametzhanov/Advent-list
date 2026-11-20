// Картинки желаний (хранятся в базе D1, таблица images).
//   POST /api/wishes/:id/image  — загрузить картинку к своему желанию (форма с файлами full и thumb)
//   GET  /api/wishes/:id/image?size=thumb&v=... — сама картинка (владельцу или другу с открытым днём)
//
// В Java-версии сервер сам уменьшал картинку. В бесплатных Workers нет библиотек для этого,
// поэтому уменьшает браузер (frontend/src/lib/resizeImage.ts) и присылает сразу две готовые JPEG:
// большую (до 1600 точек) и превью (до 300 точек). Сервер проверяет, что это правда JPEG и не слишком большой
import { Hono } from 'hono';
import type { App } from '../env';
import { deleteImageFiles, readImageFile, saveImageFiles } from '../lib/imageFiles';
import { ApiError, badRequest, notFound } from '../errors';
import { idParam } from '../lib/validate';
import { findMyWish, myWishResponse } from './wishes';

// 1,5 МБ — уменьшенной до 1600 точек картинке этого хватает. Больше нельзя: в D1 одно значение не больше 2 млн байт
export const MAX_FULL_BYTES = 1.5 * 1024 * 1024;
export const MAX_THUMB_BYTES = 300 * 1024;     // 300 КБ

export const imageRoutes = new Hono<App>();

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
    await saveImageFiles(c.env, newKey, full, thumb);
    await c.env.DB.prepare('UPDATE wishes SET image_key = ? WHERE id = ?').bind(newKey, wish.id).run();
    if (wish.imageKey) await deleteImageFiles(c.env, wish.imageKey); // старая картинка больше не нужна

    return c.json(await myWishResponse(c.env, me, wish.id)); // желание уже с адресами новой картинки
});

// Отдать картинку. Главное правило: только владельцу или другу, которому открыт день.
// Тег <img> сам отправляет cookie сессии, поэтому requireUser знает, кто смотрит
imageRoutes.get('/wishes/:id{[0-9]+}/image', async c => {
    const id = idParam(c, 'id');
    const viewer = c.get('me').id;
    const wish = await c.env.DB.prepare(
        `SELECT image_key AS imageKey, owner_id AS ownerId,
                EXISTS (SELECT 1 FROM wish_access a WHERE a.wish_id = w.id AND a.viewer_id = ?) AS isOpen
         FROM wishes w WHERE id = ?`).bind(viewer, id).first<{ imageKey: string | null; ownerId: number; isOpen: number }>();
    // Нет доступа — отвечаем 404, как будто картинки нет вовсе. Не подсказываем, что она существует
    if (!wish?.imageKey || (wish.ownerId !== viewer && wish.isOpen !== 1)) {
        throw notFound(`Желание с id ${id} не найдено`);
    }

    const file = await readImageFile(c.env, wish.imageKey, c.req.query('size') === 'thumb' ? 'thumb' : 'full');
    if (!file) throw notFound(`Желание с id ${id} не найдено`);
    return c.body(file, 200, {
        'Content-Type': 'image/jpeg',
        // Браузер может 10 минут держать картинку у себя, но только для этого человека (private).
        // Адрес меняется вместе с картинкой (v=...), поэтому старую он не покажет
        'Cache-Control': 'private, max-age=600',
    });
});
