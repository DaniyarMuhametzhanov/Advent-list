// Всё общение с сервером про желания — в одном файле.

// Так желание приходит с сервера (это WishResponse из Java)
export type WishDto = {
    id: number;
    date: string;           // '2026-10-05'
    title: string;
    comment: string | null; // комментария может не быть
};

// Так желание уходит на сервер (это WishRequest из Java)
export type WishInput = {
    title: string;
    comment: string;
};

// Общая функция: отправить запрос, проверить ответ, достать JSON.
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        // Наш GlobalExceptionHandler отвечает в формате ProblemDetail: { detail, errors? }
        const problem = await response.json().catch(() => null);
        const fieldError = problem?.errors && Object.values(problem.errors)[0];
        throw new Error(fieldError ?? problem?.detail ?? `Ошибка сервера: ${response.status}`);
    }

    // 204 No Content — тела нет (так отвечает удаление)
    if (response.status === 204) return undefined as T;
    return response.json();
}

export function fetchMyWishes() {
    return request<WishDto[]>('/api/wishes');
}

export function saveWish(date: string, input: WishInput) {
    return request<WishDto>(`/api/wishes/${date}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteWish(id: number) {
    return request<void>(`/api/wishes/${id}`, { method: 'DELETE' });
}