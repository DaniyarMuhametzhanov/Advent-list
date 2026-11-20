// Хеш пароля. Сам пароль не храним никогда, только «отпечаток» (хеш), из которого пароль не восстановить.
//
// В Java был BCrypt. В Workers его нет, зато есть встроенный PBKDF2 (Web Crypto API):
// он много раз подряд перемешивает пароль с «солью» (salt, случайные байты). Соль своя у каждого человека,
// поэтому одинаковые пароли дают разные хеши, а подбор занимает очень много времени.
// Формат в базе: pbkdf2$100000$<соль>$<хеш>
const ITERATIONS = 100_000; // больше Workers не разрешает
const encoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
    [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [kind, iterations, salt, hash] = stored.split('$');
    if (kind !== 'pbkdf2') return false;
    const actual = new Uint8Array(await derive(password, fromHex(salt), Number(iterations)));
    const expected = fromHex(hash);
    // Сравниваем все байты, даже если первый уже не совпал: так по времени ответа ничего не узнать
    let diff = actual.length ^ expected.length;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0);
    return diff === 0;
}

// Хеш, который не подходит ни к какому паролю. Проверяем по нему, когда email не найден:
// тогда ответ «неверный email или пароль» идёт столько же времени, и нельзя узнать, есть ли такой email
export const DUMMY_HASH = `pbkdf2$${ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`;

// SHA-256 от текста: для токена сессии (сам токен в базе не храним)
export async function sha256(text: string) {
    return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

// Случайный токен сессии: 32 байта = 64 шестнадцатеричных символа
export const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
