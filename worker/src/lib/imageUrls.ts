// Адреса картинок желаний.
//
// Картинку браузер грузит тегом <img src="...">. Такой запрос не может нести наш заголовок Authorization,
// поэтому права проверяем по-другому: сервер выдаёт адрес с подписью (signed URL) только тем,
// кому картинку видеть можно (владельцу и другу с открытым днём). Подпись нельзя подделать без секрета,
// а через срок exp адрес перестаёт работать. В адресе записано, кому он выдан (u): если владелец
// закроет день, сервер это увидит и картинку больше не отдаст.
//
//   /api/wishes/5/image?size=thumb&v=<имя файла>&u=<кому выдан>&exp=1730419200&sig=<подпись>
import type { Env } from '../env';

// Адрес живёт до конца завтрашнего дня (UTC). Пока адрес тот же, браузер берёт картинку из своего кэша
export function expiresAt(nowMs = Date.now()) {
    const day = 24 * 60 * 60;
    return (Math.floor(nowMs / 1000 / day) + 2) * day;
}

const encoder = new TextEncoder();

// Ключ для подписи делаем из токена бота: так не нужен ещё один секрет
async function signingKey(env: Env) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(env.BOT_TOKEN),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const raw = await crypto.subtle.sign('HMAC', base, encoder.encode('ImageUrl'));
    return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const payload = (wishId: number, imageKey: string, viewerId: number, exp: number) =>
    `${wishId}:${imageKey}:${viewerId}:${exp}`;

function toBase64Url(bytes: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(binary, ch => ch.charCodeAt(0));
    } catch {
        return null;
    }
}

export type ImageUrls = { imageUrl: string | null; thumbUrl: string | null };

// Адреса большой картинки и превью для человека viewerId. Картинки нет → null, null
export async function imageUrls(env: Env, wish: { id: number; imageKey: string | null },
                                viewerId: number): Promise<ImageUrls> {
    if (!wish.imageKey) return { imageUrl: null, thumbUrl: null };
    const exp = expiresAt();
    const sig = toBase64Url(await crypto.subtle.sign('HMAC', await signingKey(env),
        encoder.encode(payload(wish.id, wish.imageKey, viewerId, exp))));
    const url = (size: string) =>
        `/api/wishes/${wish.id}/image?size=${size}&v=${wish.imageKey}&u=${viewerId}&exp=${exp}&sig=${sig}`;
    return { imageUrl: url('full'), thumbUrl: url('thumb') };
}

// Проверить подпись и срок из адреса
export async function verifyImageUrl(env: Env, wishId: number, imageKey: string, viewerId: number,
                                     exp: number, sig: string) {
    const bytes = fromBase64Url(sig);
    if (!bytes || !Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    return crypto.subtle.verify('HMAC', await signingKey(env), bytes,
        encoder.encode(payload(wishId, imageKey, viewerId, exp)));
}
