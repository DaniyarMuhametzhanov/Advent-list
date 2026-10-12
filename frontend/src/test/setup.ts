// Выполняется перед каждым файлом с тестами.
import '@testing-library/jest-dom/vitest'; // добавляет проверки вроде toBeInTheDocument(), toBeDisabled()
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// После каждого теста убираем нарисованные компоненты, чтобы тесты не мешали друг другу
afterEach(() => cleanup());

// В jsdom нет окна <dialog>: showModal() и close() не существуют. Делаем простые заменители
HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
};
HTMLDialogElement.prototype.close = function () {
    this.open = false;
};
