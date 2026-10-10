// Общая функция для всех запросов к нашему серверу.

// Ошибка, которая помнит код ответа (401, 404...), чтобы его можно было проверить
export class HttpError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

// Достать значение cookie по имени. document.cookie выглядит так: "a=1; XSRF-TOKEN=abc"
function readCookie(name: string): string | undefined {
    const pair = document.cookie.split('; ').find(c => c.startsWith(name + '='));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

// Отправить запрос, проверить ответ, достать JSON.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
    // Файл (FormData) отправляем без своего Content-Type: браузер сам поставит
    // multipart/form-data и границу между частями формы. Всё остальное — JSON
    const isForm = init?.body instanceof FormData;
    const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };

    // Защита от CSRF: сервер положил токен в cookie XSRF-TOKEN,
    // а мы возвращаем его в заголовке. Чужой сайт этот cookie прочитать не может.
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;

    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
        // Наш GlobalExceptionHandler отвечает в формате ProblemDetail: { detail, errors? }
        const problem = await response.json().catch(() => null);
        const fieldError = problem?.errors && Object.values(problem.errors)[0];
        throw new HttpError(fieldError ?? problem?.detail ?? `Ошибка сервера: ${response.status}`, response.status);
    }

    // Тела может не быть: 204 No Content (удаление) или пустой ответ 200 (выход)
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
}