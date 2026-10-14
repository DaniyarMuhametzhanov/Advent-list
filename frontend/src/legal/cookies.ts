// Список cookie и записей в хранилище браузера (localStorage), которые использует сайт.
// По нему рисуются страница /cookies и окно «Настройки cookie».
// Добавили новый cookie или скрипт — допиши его сюда, а если он необязательный, подними COOKIE_CONSENT_VERSION
// в lib/cookieConsent.ts, чтобы баннер снова спросил согласие.

export const COOKIES_DATE = '2026-10-14';

// Категории: необходимые работают всегда, остальные — только после согласия
export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

export type CookieInfo = {
    name: string;
    kind: 'cookie' | 'localStorage';
    owner: string;      // кто ставит
    purpose: string;    // зачем
    lifetime: string;   // сколько живёт
};

export type CategoryInfo = {
    id: CookieCategory;
    title: string;
    description: string;
    cookies: CookieInfo[];
};

export const COOKIE_CATEGORIES: CategoryInfo[] = [
    {
        id: 'necessary',
        title: 'Необходимые',
        description: 'Без них сайт не работает: вход в аккаунт, защита, ваш выбор cookie. Их нельзя отключить.',
        cookies: [
            { name: 'JSESSIONID', kind: 'cookie', owner: 'Наш сервер', purpose: 'Помнит, что вы вошли в аккаунт', lifetime: 'До выхода из аккаунта или закрытия браузера' },
            { name: 'XSRF-TOKEN', kind: 'cookie', owner: 'Наш сервер', purpose: 'Защита от подделки запросов с чужих сайтов (CSRF)', lifetime: 'До закрытия браузера' },
            { name: 'cookieConsent', kind: 'localStorage', owner: 'Наш сайт', purpose: 'Помнит ваш выбор в баннере cookie: дату, версию и включённые категории', lifetime: '12 месяцев, потом спросим снова' },
            { name: 'hiddenCalendars:<номер>', kind: 'localStorage', owner: 'Наш сайт', purpose: 'Помнит, какие вкладки друзей вы скрыли. Никуда не отправляется', lifetime: 'Пока вы не очистите данные сайта в браузере' },
        ],
    },
    {
        id: 'analytics',
        title: 'Аналитика',
        description: 'Помогают понять, как люди пользуются сайтом. Сейчас на сайте нет аналитики, эта категория ничего не включает.',
        cookies: [],
    },
    {
        id: 'marketing',
        title: 'Маркетинг',
        description: 'Нужны для рекламы. Сейчас на сайте нет рекламы, эта категория ничего не включает.',
        cookies: [],
    },
];
