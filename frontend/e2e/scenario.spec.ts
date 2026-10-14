import { expect, test, type Browser, type Page } from '@playwright/test';

// «Сценарий показа» из макета, но с двумя настоящими людьми в двух разных браузерах.
// Каждый запуск создаёт новых пользователей, поэтому тест можно гонять сколько угодно раз.
const run = Date.now().toString(36);   // например 'mgk3x1a' — уникальная метка запуска
const ANNA = `Анна ${run}`;
const BORIS = `Борис ${run}`;
const TITLE = 'Тёплый шарф';
const COMMENT = 'Синий, подлиннее';

// Маленькая картинка 16×16 (розовый квадрат) прямо в коде, чтобы не хранить файл
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4bppHEmIY1TCqYfhqAADMhmoQBmZmNwAAAABJRU5ErkJggg==',
    'base64');

// Свой браузер (контекст) для каждого человека: свои cookie, своя сессия
async function register(browser: Browser, name: string, login: string): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/register');
    await page.getByRole('button', { name: 'Отклонить' }).click();   // баннер cookie закрывает низ страницы
    await page.getByLabel('Имя').fill(name);
    await page.getByLabel('Email').fill(`${login}-${run}@e2e.test`); // в email только латиница
    await page.getByLabel('Пароль').fill('password123');
    await page.getByLabel(/обработку моих персональных данных/).check();
    await page.getByLabel(/принимаю Условия использования/).check();
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.getByRole('button', { name: 'Мой календарь' })).toBeVisible();
    return page;
}

// Выдвинуть панель «Друзья» кнопкой в шапке
async function openFriends(page: Page) {
    await page.getByRole('button', { name: /^Друзья/ }).click();
    await expect(page.getByRole('dialog', { name: 'Друзья' })).toBeVisible();
}

// Клетка 15-го числа текущего месяца. Её подпись (aria-label) начинается с «15 октября: ...»
function day15(page: Page, state: string | RegExp) {
    return page.getByRole('button', { name: new RegExp(`^15 [а-я]+: ${typeof state === 'string' ? state : state.source}$`) });
}

test('Анна открывает день Борису, и он видит картинку и комментарий', async ({ browser }) => {
    const anna = await register(browser, ANNA, 'anna');
    const boris = await register(browser, BORIS, 'boris');

    await test.step('Анна и Борис становятся друзьями', async () => {
        await openFriends(anna);
        await anna.getByLabel('Найти человека').fill(BORIS);
        await anna.getByRole('button', { name: 'Добавить в друзья' }).click();
        await expect(anna.getByRole('status')).toHaveText('Заявка отправлена');

        await boris.reload();
        await openFriends(boris);
        await expect(boris.getByText(`${ANNA} хочет добавить вас в друзья`)).toBeVisible();
        await boris.getByRole('button', { name: 'Принять' }).click();
        await expect(boris.getByRole('button', { name: new RegExp(`^${ANNA}`) })).toBeVisible(); // появилась в «Моих друзьях»
        await boris.keyboard.press('Escape'); // убрать панель
        await expect(boris.getByRole('button', { name: `Календарь ${ANNA}` })).toBeVisible();
    });

    await test.step('Анна создаёт желание с картинкой', async () => {
        await anna.reload();
        await day15(anna, 'добавить желание').click();
        await anna.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: PNG });
        await anna.getByLabel('Название желания').fill(TITLE);
        await anna.getByLabel('Комментарий / описание').fill(COMMENT);
        await anna.getByRole('button', { name: 'Сохранить' }).click();

        await expect(anna.getByRole('status')).toHaveText('Сохранено');
        await expect(day15(anna, TITLE)).toBeVisible();
    });

    await test.step('Борис видит в календаре Анны замок и просит доступ', async () => {
        await boris.reload();
        await boris.getByRole('button', { name: `Календарь ${ANNA}` }).click();
        await day15(boris, 'день закрыт').click();
        await expect(boris.getByText('Владелец пока не открыл вам этот день')).toBeVisible();
        await expect(boris.getByText(TITLE)).toHaveCount(0); // названия нет нигде на странице

        await boris.getByRole('button', { name: 'Попросить доступ' }).click();
        await expect(boris.getByRole('button', { name: 'Запрос отправлен' })).toBeDisabled();
        await boris.getByRole('button', { name: 'Закрыть' }).click();
    });

    await test.step('Сервер не отдаёт Борису закрытое даже напрямую через API', async () => {
        const annaId = (await (await anna.request.get('/api/me')).json()).id;
        const month = new Date().toISOString().slice(0, 7); // '2026-10'
        const response = await boris.request.get(`/api/calendars/${annaId}?month=${month}`);
        expect(response.ok()).toBe(true);
        const body = await response.text();
        expect(body).not.toContain(TITLE);
        expect(body).not.toContain(COMMENT);
        expect(body).not.toContain('/image');
    });

    await test.step('Анна видит запрос и в окне дня открывает доступ Борису', async () => {
        await anna.reload();
        await openFriends(anna);
        await expect(anna.getByText(`${BORIS} просит доступ к 15`)).toBeVisible();
        await anna.getByRole('button', { name: 'Закрыть' }).click(); // убрать панель
        await day15(anna, TITLE).click();
        // Галочка «живёт» на сервере: она встанет, когда сервер ответит. Поэтому click, а не check
        const toggle = anna.getByRole('checkbox', { name: BORIS });
        await toggle.click();
        await expect(anna.getByRole('status')).toHaveText(`${BORIS} теперь видит этот день`);
        await expect(toggle).toBeChecked();
    });

    await test.step('Борис видит открытый день: картинку и комментарий', async () => {
        await boris.reload();
        await boris.getByRole('button', { name: `Календарь ${ANNA}` }).click();
        await day15(boris, TITLE).click();

        await expect(boris.getByText(COMMENT)).toBeVisible();
        const image = boris.locator('dialog .preview img');
        await expect(image).toHaveAttribute('src', /\/image\?size=full/);
        // Картинка действительно скачалась: у неё есть ширина
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });
});
