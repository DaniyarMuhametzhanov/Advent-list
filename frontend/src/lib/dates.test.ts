import { describe, expect, it } from 'vitest';
import { dateKey, daysInMonth, firstWeekday, formatDate } from './dates';

describe('dates', () => {
    it('собирает ключ даты с нулями впереди', () => {
        expect(dateKey(2026, 0, 5)).toBe('2026-01-05'); // месяц 0 — это январь
    });

    it('пишет дату по-русски', () => {
        expect(formatDate('2026-10-08')).toBe('8 октября');
        expect(formatDate('2026-03-01')).toBe('1 марта');
    });

    it('знает, сколько дней в месяце', () => {
        expect(daysInMonth(2026, 9)).toBe(31); // октябрь
        expect(daysInMonth(2028, 1)).toBe(29); // февраль високосного года
    });

    it('считает пустые клетки перед 1-м числом (неделя с понедельника)', () => {
        expect(firstWeekday(2026, 5)).toBe(0); // 1 июня 2026 — понедельник
        expect(firstWeekday(2026, 2)).toBe(6); // 1 марта 2026 — воскресенье
    });
});
