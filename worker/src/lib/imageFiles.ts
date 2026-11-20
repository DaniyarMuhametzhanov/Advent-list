// Файлы картинок в базе D1 (таблица images): <случайное имя>/full.jpg и <случайное имя>/thumb.jpg
import type { Env } from '../env';

export const fileName = (imageKey: string, size: 'full' | 'thumb') => `${imageKey}/${size}.jpg`;

// Сохранить большую картинку и превью одной транзакцией (batch): или обе, или ни одной
export async function saveImageFiles(env: Env, imageKey: string, full: ArrayBuffer, thumb: ArrayBuffer) {
    const insert = env.DB.prepare('INSERT INTO images (name, data) VALUES (?, ?)');
    await env.DB.batch([
        insert.bind(fileName(imageKey, 'full'), full),
        insert.bind(fileName(imageKey, 'thumb'), thumb),
    ]);
}

// Байты картинки или null, если такой нет
export async function readImageFile(env: Env, imageKey: string, size: 'full' | 'thumb'): Promise<Uint8Array<ArrayBuffer> | null> {
    const data = await env.DB.prepare('SELECT data FROM images WHERE name = ?')
        .bind(fileName(imageKey, size)).first<ArrayBuffer | number[]>('data');
    return data == null ? null : new Uint8Array(data as ArrayBuffer); // D1 отдаёт BLOB как ArrayBuffer или массив чисел — оба подходят
}

export async function deleteImageFiles(env: Env, imageKey: string) {
    await env.DB.prepare('DELETE FROM images WHERE name IN (?, ?)')
        .bind(fileName(imageKey, 'full'), fileName(imageKey, 'thumb')).run();
}
