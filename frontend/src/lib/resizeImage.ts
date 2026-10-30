// Уменьшить картинку прямо в браузере, перед отправкой на сервер.
//
// Раньше это делал Java-сервер (ImageProcessor). В бесплатных Cloudflare Workers нет библиотек
// для работы с картинками, зато в браузере есть <canvas>: рисуем картинку в нужном размере
// и сохраняем как JPEG. Заодно в интернет уходит 200 КБ вместо 5 МБ с телефона

export const FULL_SIDE = 1600;  // большая картинка для окна дня
export const THUMB_SIDE = 300;  // превью для клетки календаря

// Нарисовать картинку так, чтобы длинная сторона была не больше maxSide, и получить JPEG
async function toJpeg(image: ImageBitmap, maxSide: number): Promise<Blob> {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height)); // маленькие не увеличиваем
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height); // прозрачные места PNG станут белыми
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Не получилось обработать картинку'))),
            'image/jpeg', 0.85));
}

// Файл → две JPEG: большая и превью
export async function resizeImage(file: File): Promise<{ full: Blob; thumb: Blob }> {
    let image: ImageBitmap;
    try {
        image = await createImageBitmap(file); // браузер читает картинку. Не картинка → ошибка
    } catch {
        throw new Error('Не получилось прочитать картинку');
    }
    try {
        return { full: await toJpeg(image, FULL_SIDE), thumb: await toJpeg(image, THUMB_SIDE) };
    } finally {
        image.close();
    }
}
