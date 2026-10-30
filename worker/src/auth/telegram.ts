// Проверка данных, которые Telegram передаёт в Mini App (initData).
//
// Простыми словами: Telegram присылает строку вида
//   query_id=...&user={"id":123,"first_name":"Анна"}&auth_date=1730000000&hash=ab12...
// hash — это подпись (HMAC). Посчитать её может только тот, кто знает токен бота: Telegram и наш сервер.
// Если кто-то поменяет хоть одну букву (например, подставит чужой id), подпись не сойдётся.
// Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import type { TelegramUser } from '../env';

// Сколько живут данные входа. Telegram выдаёт новые при каждом открытии Mini App
export const MAX_AGE_SECONDS = 24 * 60 * 60;

const encoder = new TextEncoder();
type Usage = 'sign' | 'verify';

// Ключ HMAC-SHA256 из байтов (Web Crypto API — встроенная в Workers «криптография»)
function hmacKey(raw: BufferSource, usages: Usage[]) {
    return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

// '0a1b...' → байты
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}

// Секретный ключ = HMAC_SHA256(ключ "WebAppData", данные = токен бота). Так написано в документации Telegram
async function secretKey(botToken: string, usages: Usage[]) {
    const webAppKey = await hmacKey(encoder.encode('WebAppData'), ['sign']);
    const secret = await crypto.subtle.sign('HMAC', webAppKey, encoder.encode(botToken));
    return hmacKey(secret, usages);
}

// Строка для проверки: все поля, кроме hash, по алфавиту, каждое «ключ=значение», через перевод строки
function dataCheckString(params: URLSearchParams) {
    return [...params.entries()]
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
}

// Проверить initData. Подпись верна и данные свежие → человек из Telegram. Иначе null
export async function verifyInitData(initData: string, botToken: string,
                                     now = Math.floor(Date.now() / 1000)): Promise<TelegramUser | null> {
    const params = new URLSearchParams(initData);
    const hash = hexToBytes(params.get('hash') ?? '');
    if (!hash) return null;

    // crypto.subtle.verify сравнивает подписи за одинаковое время, сколько бы букв ни совпало.
    // Обычное сравнение строк (===) могло бы подсказать злоумышленнику, сколько первых букв он угадал
    const key = await secretKey(botToken, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, hash, encoder.encode(dataCheckString(params)));
    if (!valid) return null;

    // Подпись верна, но данные могли украсть и использовать позже. Старые не принимаем
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || now - authDate > MAX_AGE_SECONDS) return null;

    try {
        const user = JSON.parse(params.get('user') ?? '') as TelegramUser;
        return typeof user?.id === 'number' && typeof user.first_name === 'string' ? user : null;
    } catch {
        return null;
    }
}

// Подписать данные так же, как Telegram. Нужно только тестам: чтобы сделать «настоящий» initData
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
    const params = new URLSearchParams(fields);
    const key = await secretKey(botToken, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString(params)));
    params.set('hash', [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join(''));
    return params.toString();
}
