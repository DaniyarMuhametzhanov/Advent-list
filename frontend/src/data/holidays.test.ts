import { describe, expect, it } from 'vitest';
import { officialHoliday } from './holidays';

describe('officialHoliday', () => {
    it('находит праздник в любом году', () => {
        expect(officialHoliday('2026-12-16')).toBe('День Независимости');
        expect(officialHoliday('2031-03-22')).toBe('Наурыз');
    });

    it('в обычный день праздника нет', () => {
        expect(officialHoliday('2026-10-15')).toBeUndefined();
    });
});
