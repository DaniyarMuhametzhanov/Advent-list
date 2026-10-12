// Запросы про вход: кто я, войти, зарегистрироваться, выйти.
import { HttpError, request } from './http';

// Это MeResponse из Java
export type Me = {
    id: number;
    name: string;
    email: string;
};

export type LoginInput = { email: string; password: string };
export type RegisterInput = {
    name: string;
    email: string;
    password: string;
    privacyAccepted: boolean; // согласие на обработку данных
    termsAccepted: boolean;   // Условия использования + 18 лет
};

// Кто я? Если не вошёл, сервер ответит 401 — тогда возвращаем null («никто»)
export async function fetchMe(): Promise<Me | null> {
    try {
        return await request<Me>('/api/me');
    } catch (e) {
        if (e instanceof HttpError && e.status === 401) return null;
        throw e;
    }
}

export function login(input: LoginInput) {
    return request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function register(input: RegisterInput) {
    return request<Me>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function logout() {
    return request<void>('/api/auth/logout', { method: 'POST' });
}