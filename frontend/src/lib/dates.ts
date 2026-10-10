export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const pad = (n: number) => String(n).padStart(2, '0');

// month здесь от 0 до 11, как в JavaScript Date
export function dateKey(year: number, month: number, day: number): string {
    return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function todayKey(): string {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// '2026-10-08' → '8 октября'
export function formatDate(key: string): string {
    const [, m, d] = key.split('-').map(Number);
    return `${d} ${MONTHS_GEN[m - 1]}`;
}

export function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

// Сколько пустых клеток поставить перед 1-м числом (неделя начинается с понедельника)
export function firstWeekday(year: number, month: number): number {
    return (new Date(year, month, 1).getDay() + 6) % 7;
}