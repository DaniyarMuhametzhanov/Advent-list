// Свои праздники (дни рождения и т. п.). Их видит только владелец
import { request } from './http';

// HolidayResponse из Java: id, месяц 1–12, число и название
export type HolidayDto = { id: number; month: number; day: number; title: string };

export function fetchHolidays() {
    return request<HolidayDto[]>('/api/holidays');
}

// Date — '2026-03-15'. Год серверу не нужен: праздник повторяется каждый год.
// В одном дне может быть несколько праздников, поэтому это всегда «добавить ещё один»
export function createHoliday(date: string, title: string) {
    const [, m, d] = date.split('-').map(Number);
    return request<HolidayDto>(`/api/holidays/${m}/${d}`, { method: 'POST', body: JSON.stringify({ title }) });
}

// Переименовать и удалить — по id: так понятно, какой именно праздник из нескольких
export function renameHoliday(id: number, title: string) {
    return request<HolidayDto>(`/api/holidays/${id}`, { method: 'PUT', body: JSON.stringify({ title }) });
}

export function deleteHoliday(id: number) {
    return request<void>(`/api/holidays/${id}`, { method: 'DELETE' });
}
