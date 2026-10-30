// Файлы картинок в R2: <случайное имя>/full.jpg и <случайное имя>/thumb.jpg
import type { Env } from '../env';

export const fileName = (imageKey: string, size: 'full' | 'thumb') => `${imageKey}/${size}.jpg`;

export async function deleteImageFiles(env: Env, imageKey: string) {
    await env.IMAGES.delete([fileName(imageKey, 'full'), fileName(imageKey, 'thumb')]);
}
