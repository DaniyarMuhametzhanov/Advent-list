import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Wish } from '../types';
import { DayCell } from './DayCell';

// Желание Анны на 15 октября. access — кому из друзей открыт день
function wish(access: string[]): Wish {
    return {
        id: 1, title: 'Тёплый шарф', comment: 'Синий',
        img: { emoji: '🎁', bg: '#fff' }, thumb: { emoji: '🎁', bg: '#fff' }, access,
    };
}

// Общие свойства клетки. В каждом тесте меняем только нужное
const base = { date: '2026-10-15', day: 15, isToday: false, myFriends: [], onOpen: () => {} };

describe('DayCell', () => {
    it('свой пустой день предлагает добавить желание', () => {
        render(<DayCell {...base} me="anna" isOwn />);

        expect(screen.getByRole('button', { name: '15 октября: добавить желание' })).toBeInTheDocument();
    });

    it('чужой закрытый день: замок и никакого названия', () => {
        render(<DayCell {...base} me="boris" isOwn={false} wish={wish([])} />);

        expect(screen.getByRole('button', { name: '15 октября: день закрыт' })).toBeInTheDocument();
        expect(screen.getByText('🔒')).toBeInTheDocument();
        expect(screen.queryByText('Тёплый шарф')).not.toBeInTheDocument();
    });

    it('чужой открытый день показывает название', () => {
        render(<DayCell {...base} me="boris" isOwn={false} wish={wish(['boris'])} />);

        expect(screen.getByText('Тёплый шарф')).toBeInTheDocument();
        expect(screen.queryByText('🔒')).not.toBeInTheDocument();
    });

    it('у своего дня видно, скольким друзьям он открыт', () => {
        render(<DayCell {...base} me="anna" isOwn myFriends={['boris', 'vika']} wish={wish(['boris'])} />);

        expect(screen.getByText(/👁 1/)).toBeInTheDocument();
    });

    it('праздник: синяя рамка и название в клетке', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики']} />);

        const cell = screen.getByRole('button', { name: '15 октября, День Республики: добавить желание' });
        expect(cell).toHaveClass('holiday');
        expect(screen.getByText('День Республики')).toBeInTheDocument();
    });

    it('официальный и свой праздник — каждый своей строкой', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики', 'День рождения мамы']} />);

        expect(screen.getByText('День Республики')).toBeInTheDocument();
        expect(screen.getByText('День рождения мамы')).toBeInTheDocument();
    });

    it('много праздников: два видно, остальные — «+N»', () => {
        render(<DayCell {...base} me="anna" isOwn holidays={['День Республики', 'ДР мамы', 'ДР Вики', 'Годовщина']} />);

        expect(screen.getByText('ДР мамы')).toBeInTheDocument();
        expect(screen.queryByText('ДР Вики')).not.toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('картинка с праздником: первый клик прячет подписи, второй открывает день', async () => {
        const onOpen = vi.fn();
        render(<DayCell {...base} me="anna" isOwn wish={wish([])} holidays={['День Республики']} onOpen={onOpen} />);
        const cell = screen.getByRole('button');

        await userEvent.click(cell);
        expect(cell).toHaveClass('peek');       // подписи спрятаны (класс peek делает их прозрачными)
        expect(onOpen).not.toHaveBeenCalled();

        await userEvent.click(cell);
        expect(onOpen).toHaveBeenCalledWith(base.date, cell);
    });

    it('клик по клетке сообщает дату наверх', async () => {
        const onOpen = vi.fn(); // «шпион»: запоминает, с чем его вызвали
        render(<DayCell {...base} me="anna" isOwn onOpen={onOpen} />);

        await userEvent.click(screen.getByRole('button'));

        expect(onOpen).toHaveBeenCalledWith('2026-10-15', expect.any(HTMLElement));
    });
});
