// Проверка того, что пришло от клиента. Вместо @Valid, @NotBlank и @Size из Java
import type { Context } from 'hono';
import { badRequest } from '../errors';

// id из адреса: /api/wishes/7 → 7. Не число → 400
export function idParam(c: Context, name: string): number {
    const value = c.req.param(name) ?? '';
    if (!/^\d{1,15}$/.test(value)) throw badRequest(`Неверное значение '${value}' для параметра ${name}`);
    return Number(value);
}

// Настоящая ли дата: '2026-02-30' — нет
export function isRealDate(year: number, month: number, day: number) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// '2026-10-05' → та же строка, если это настоящая дата. Иначе 400
export function dateParam(value: string | undefined, name: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
    if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
        throw badRequest(`Неверное значение '${value ?? ''}' для параметра ${name}`);
    }
    return value!;
}

// '2026-10' → та же строка. Иначе 400
export function monthParam(value: string | undefined): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '')) {
        throw badRequest(`Неверное значение '${value ?? ''}' для параметра month`);
    }
    return value!;
}

// Тело запроса как JSON-объект. Не JSON → 400
export async function jsonBody(c: Context): Promise<Record<string, unknown>> {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw badRequest('Не получилось прочитать JSON в теле запроса');
    }
    return body as Record<string, unknown>;
}

// Правила для текстового поля: обязательно ли и сколько символов максимум
type TextRule = { required?: string; max: number; maxMessage: string };

// Проверить поля по правилам. Все ошибки сразу: { title: 'Название обязательно' }
export function checkText<K extends string>(body: Record<string, unknown>,
                                            rules: Record<K, TextRule>): Record<K, string | null> {
    const errors: Record<string, string> = {};
    const result = {} as Record<K, string | null>;
    for (const field of Object.keys(rules) as K[]) {
        const rule = rules[field];
        const raw = body[field];
        const text = typeof raw === 'string' ? raw : null;
        if (rule.required && (text === null || text.trim() === '')) {
            errors[field] = rule.required;
        } else if (text !== null && [...text].length > rule.max) {
            errors[field] = rule.maxMessage;
        }
        result[field] = text;
    }
    if (Object.keys(errors).length > 0) throw badRequest('Данные заполнены неверно', errors);
    return result;
}

// Текущее время в формате для базы
export const now = () => new Date().toISOString();
