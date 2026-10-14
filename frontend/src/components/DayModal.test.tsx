import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Wish } from '../types';
import { DayModal } from './DayModal';

const wish: Wish = {
    id: 1, title: 'Тёплый шарф', comment: 'Синий, длинный',
    img: { emoji: '🎁', bg: '#fff' }, thumb: { emoji: '🎁', bg: '#fff' }, access: [],
};

// Все обработчики — «шпионы» vi.fn(). origin: null — без конфетти (в jsdom нет рисования)
function renderModal(overrides: Partial<Parameters<typeof DayModal>[0]> = {}) {
    const props = {
        date: '2026-10-15', me: 'anna', owner: 'anna', myFriends: ['boris'],
        alreadyAsked: false, origin: null,
        onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onSetAccess: vi.fn(),
        onRequestAccess: vi.fn(), onToast: vi.fn(),
        onAddHoliday: vi.fn(), onRenameHoliday: vi.fn(), onDeleteHoliday: vi.fn(),
        ...overrides,
    };
    render(<DayModal {...props} />);
    return props;
}

describe('DayModal: свой день', () => {
    it('без названия не сохраняет и показывает ошибку', async () => {
        const props = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(screen.getByText('Введите название подарка.')).toBeInTheDocument();
        expect(props.onSave).not.toHaveBeenCalled();
    });

    it('сохраняет название, комментарий и выбранных друзей', async () => {
        const props = renderModal();

        await userEvent.type(screen.getByLabelText('Название подарка'), '  Наушники ');
        await userEvent.type(screen.getByLabelText('Комментарий / описание'), 'Беспроводные');
        await userEvent.click(screen.getByLabelText('Борис'));
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(props.onSave).toHaveBeenCalledWith('2026-10-15',
            expect.objectContaining({ title: 'Наушники', comment: 'Беспроводные', access: ['boris'] }),
            null); // новую картинку не выбирали
    });

    it('удаляет только после второго нажатия', async () => {
        const props = renderModal({ wish });

        await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
        expect(props.onDelete).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Точно удалить?' }));
        expect(props.onDelete).toHaveBeenCalledWith('2026-10-15');
    });

    it('добавляет свой праздник отдельно от желания', async () => {
        const props = renderModal();

        await userEvent.click(screen.getByText('🎂 Свой праздник')); // блок свёрнут — раскрываем
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'День рождения мамы');
        await userEvent.click(screen.getByRole('button', { name: 'Добавить праздник' }));

        expect(props.onAddHoliday).toHaveBeenCalledWith('2026-10-15', 'День рождения мамы');
        expect(props.onSave).not.toHaveBeenCalled(); // желание при этом не сохраняется
    });

    it('свои праздники показаны списком, у каждого меню ⋮', async () => {
        const mom = { id: 1, month: 10, day: 15, title: 'День рождения мамы' };
        const props = renderModal({ myHolidays: [mom, { id: 2, month: 10, day: 15, title: 'Годовщина' }] });

        expect(screen.getByText('🎂 День рождения мамы')).toBeInTheDocument();
        expect(screen.getByText('🎂 Годовщина')).toBeInTheDocument();

        // ⋮ → «Удалить»: удаляется именно этот праздник
        await userEvent.click(screen.getByRole('button', { name: 'Действия: День рождения мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
        expect(props.onDeleteHoliday).toHaveBeenCalledWith(mom);
    });

    it('⋮ → «Редактировать» меняет название, «Добавить ещё» — новый праздник', async () => {
        const mom = { id: 1, month: 10, day: 15, title: 'ДР мамы' };
        const props = renderModal({ myHolidays: [mom] });

        await userEvent.click(screen.getByRole('button', { name: 'Действия: ДР мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Редактировать' }));
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'а'); // поле уже с названием
        await userEvent.click(screen.getByRole('button', { name: 'Переименовать' }));
        expect(props.onRenameHoliday).toHaveBeenCalledWith(mom, 'ДР мамыа');

        await userEvent.click(screen.getByRole('button', { name: 'Действия: ДР мамы' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить ещё' }));
        await userEvent.type(screen.getByLabelText(/Название \(каждый год/), 'Годовщина{Enter}'); // Enter тоже работает
        expect(props.onAddHoliday).toHaveBeenCalledWith('2026-10-15', 'Годовщина');
    });

    it('показывает официальный праздник в заголовке', () => {
        renderModal({ date: '2026-10-25' });

        expect(screen.getByText('🎉 День Республики')).toBeInTheDocument();
    });

    it('не принимает файл, который не картинка', async () => {
        const props = renderModal();
        const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

        // input с файлом спрятан (hidden), поэтому ищем его напрямую
        const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
        await userEvent.upload(input, pdf, { applyAccept: false });

        expect(props.onToast).toHaveBeenCalledWith('Подойдут картинки JPG, PNG или GIF');
    });
});

describe('DayModal: чужой день', () => {
    it('закрытый день: нет названия, можно попросить доступ', async () => {
        const props = renderModal({ me: 'boris', owner: 'anna', myFriends: ['anna'], wish: { ...wish, title: '', comment: '' } });

        expect(screen.getByText(/Владелец пока не открыл вам этот день/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Название подарка')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Попросить доступ' }));
        expect(props.onRequestAccess).toHaveBeenCalledWith('2026-10-15');
    });

    it('после запроса кнопка неактивна', () => {
        renderModal({ me: 'boris', owner: 'anna', wish, alreadyAsked: true });

        expect(screen.getByRole('button', { name: 'Запрос отправлен' })).toBeDisabled();
    });

    it('открытый день показывает текст только для чтения', () => {
        renderModal({ me: 'boris', owner: 'anna', wish: { ...wish, access: ['boris'] } });

        expect(screen.getByText('Тёплый шарф')).toBeInTheDocument();
        expect(screen.getByText('Синий, длинный')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    });
});
