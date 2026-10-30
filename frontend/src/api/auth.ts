// Запросы про вход: кто я и регистрация. Входит человек через Telegram, без пароля
import { HttpError, request } from './http';

// Что сервер рассказывает о вошедшем (worker/src/routes/auth.ts)
export type Me = {
    id: number;
    name: string;            // имя из Telegram
    username: string | null; // @ник в Telegram, если есть
};

export type RegisterInput = {
    privacyAccepted: boolean; // согласие на обработку данных
    termsAccepted: boolean;   // Условия использования + 18 лет
};

// Кто я? Если человек из Telegram ещё не создал аккаунт, сервер ответит 404 — тогда null
export async function fetchMe(): Promise<Me | null> {
    try {
        return await request<Me>('/api/me');
    } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null;
        throw e;
    }
}

// Имя и id сервер берёт из данных Telegram, а не из запроса. Мы присылаем только галочки
export function register(input: RegisterInput) {
    return request<Me>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
}
