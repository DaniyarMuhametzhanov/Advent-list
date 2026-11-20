// Общая функция для всех запросов к нашему серверу.

// Ошибка, которая помнит код ответа (401, 404...), чтобы его можно было проверить
export class HttpError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

// Отправить запрос, проверить ответ, достать JSON.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
    // Файл (FormData) отправляем без своего Content-Type: браузер сам поставит
    // multipart/form-data и границу между частями формы. Всё остальное — JSON
    const isForm = init?.body instanceof FormData;
    const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };

    // Cookie сессии браузер отправляет сам. Защита от CSRF теперь на сервере: он проверяет заголовок Origin
    // (с какого сайта запрос), а его браузер ставит сам, и подделать его страница не может

    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
        // Сервер отвечает в формате ProblemDetail (как GlobalExceptionHandler в Java): { detail, errors? }
        const problem = await response.json().catch(() => null);
        const fieldError = problem?.errors && Object.values(problem.errors)[0];
        throw new HttpError(fieldError ?? problem?.detail ?? `Ошибка сервера: ${response.status}`, response.status);
    }

    // Тела может не быть: 204 No Content (удаление) или пустой ответ 200 (выход)
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
}