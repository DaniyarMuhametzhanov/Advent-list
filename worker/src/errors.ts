// Ошибки API. Отвечаем в том же формате, что и Java-версия (ProblemDetail):
// { "status": 404, "detail": "Желание не найдено" } и иногда "errors": { поле: текст }.
// Фронтенд (frontend/src/api/http.ts) уже умеет его читать
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class ApiError extends Error {
    status: ContentfulStatusCode;
    errors?: Record<string, string>;

    constructor(status: ContentfulStatusCode, detail: string, errors?: Record<string, string>) {
        super(detail);
        this.status = status;
        this.errors = errors;
    }
}

// Готовые ошибки, которые встречаются часто
export const notFound = (what = 'Не найдено') => new ApiError(404, what);
export const conflict = (detail: string) => new ApiError(409, detail);
export const badRequest = (detail: string, errors?: Record<string, string>) => new ApiError(400, detail, errors);

// Превратить любую ошибку в ответ. Подключается в index.ts через app.onError
export function toProblem(err: Error, c: Context) {
    if (err instanceof ApiError) {
        return c.json({ status: err.status, detail: err.message, ...(err.errors && { errors: err.errors }) },
            err.status, { 'Content-Type': 'application/problem+json' });
    }
    // Непредвиденная ошибка. Клиенту — только общая фраза и короткий код,
    // а подробности — в журнал (его видно в панели Cloudflare и в `npx wrangler tail`)
    const errorId = crypto.randomUUID().slice(0, 8);
    console.error(`Непредвиденная ошибка, код ${errorId}`, err);
    return c.json({ status: 500, detail: `Что-то пошло не так. Код ошибки: ${errorId}` }, 500,
        { 'Content-Type': 'application/problem+json' });
}
