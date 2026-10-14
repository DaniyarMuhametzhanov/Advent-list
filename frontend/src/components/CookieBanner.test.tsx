import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CookieBanner } from './CookieBanner';
import { getConsent, isAllowed, openCookieSettings, whenAllowed } from '../lib/cookieConsent';
import { act } from 'react';

function show() {
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
}

describe('CookieBanner', () => {
    beforeEach(() => localStorage.clear());

    it('пока нет выбора, аналитика не загружается', async () => {
        let loaded = false;
        whenAllowed('analytics', () => { loaded = true; });
        show();
        expect(screen.getByRole('dialog', { name: 'Мы используем cookie' })).toBeInTheDocument();
        expect(loaded).toBe(false);

        await userEvent.click(screen.getByRole('button', { name: 'Принять все' }));
        expect(loaded).toBe(true);   // загрузилась только после согласия
        expect(screen.queryByRole('dialog', { name: 'Мы используем cookie' })).not.toBeInTheDocument();
    });

    it('«Отклонить» сохраняет отказ с датой и версией', async () => {
        show();
        await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
        const saved = getConsent();
        expect(saved).toMatchObject({ version: 1, analytics: false, marketing: false });
        expect(saved?.date).toMatch(/^\d{4}-\d\d-\d\dT/);
        expect(isAllowed('analytics')).toBe(false);
        expect(isAllowed('necessary')).toBe(true);
    });

    it('в настройках можно включить только одну категорию и потом передумать', async () => {
        show();
        await userEvent.click(screen.getByRole('button', { name: 'Настроить' }));
        expect(screen.getByRole('checkbox', { name: /Необходимые/ })).toBeDisabled();
        await userEvent.click(screen.getByRole('checkbox', { name: /Аналитика/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }));
        expect(getConsent()).toMatchObject({ analytics: true, marketing: false });

        // Ссылка «Настройки cookie» в подвале открывает окно снова, с прежним выбором
        act(() => openCookieSettings());
        expect(screen.getByRole('checkbox', { name: /Аналитика/ })).toBeChecked();
        await userEvent.click(screen.getByRole('button', { name: 'Отклонить все' }));
        expect(isAllowed('analytics')).toBe(false);
    });

    it('старый выбор (больше 12 месяцев) не считается', () => {
        localStorage.setItem('cookieConsent', JSON.stringify({ version: 1, date: '2020-01-01T00:00:00Z', analytics: true, marketing: true }));
        expect(getConsent()).toBeNull();
    });
});
