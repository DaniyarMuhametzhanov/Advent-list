import type { CookieCategory } from '../legal/cookies';

// Согласие на cookie: что человек выбрал в баннере. Хранится в браузере (localStorage), на сервер не уходит.
//
// Как подключить необязательный скрипт (например, аналитику), чтобы он грузился только после согласия:
//     whenAllowed('analytics', () => loadScript('https://example.com/analytics.js'));
// Не вставляй такие скрипты прямо в index.html: там они загрузятся до согласия.

// Подними версию, когда появится новый необязательный cookie или скрипт: всех спросим заново
export const COOKIE_CONSENT_VERSION = 1;
const STORAGE_KEY = 'cookieConsent';
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;   // через 12 месяцев спрашиваем снова
const CHANGE_EVENT = 'cookie-consent-change';
const OPEN_EVENT = 'open-cookie-settings';

export type CookieConsent = {
    version: number;
    date: string;            // когда выбрали, ISO-строка в UTC
    analytics: boolean;
    marketing: boolean;
};

export type CookieChoice = Pick<CookieConsent, 'analytics' | 'marketing'>;

// Сохранённый выбор или null, если человек ещё не выбирал (или выбор устарел)
export function getConsent(): CookieConsent | null {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CookieConsent | null;
        if (!saved || saved.version !== COOKIE_CONSENT_VERSION) return null;
        if (!(Date.now() - Date.parse(saved.date) < MAX_AGE_MS)) return null;
        return saved;
    } catch {
        return null;   // браузер запретил хранилище или там мусор — считаем, что выбора нет
    }
}

export function saveConsent(choice: CookieChoice): CookieConsent {
    const before = getConsent();
    const consent: CookieConsent = {
        version: COOKIE_CONSENT_VERSION,
        date: new Date().toISOString(),
        analytics: choice.analytics,
        marketing: choice.marketing,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch { /* не запомним, баннер покажется снова */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));

    // Уже загруженный скрипт не выгрузить. Если согласие забрали — перезагружаем страницу, и он больше не загрузится
    const revoked = (before?.analytics && !consent.analytics) || (before?.marketing && !consent.marketing);
    if (revoked && loadedCategories.size > 0) window.location.reload();
    return consent;
}

export function isAllowed(category: CookieCategory): boolean {
    if (category === 'necessary') return true;
    return getConsent()?.[category] === true;
}

const loadedCategories = new Set<CookieCategory>();

// Выполнить load(), как только категория разрешена: сразу или после того, как человек согласится.
// Возвращает функцию отписки
export function whenAllowed(category: CookieCategory, load: () => void): () => void {
    let done = false;
    const check = () => {
        if (done || !isAllowed(category)) return;
        done = true;
        loadedCategories.add(category);
        load();
    };
    check();
    window.addEventListener(CHANGE_EVENT, check);
    return () => window.removeEventListener(CHANGE_EVENT, check);
}

// Подписка на изменение выбора (нужна баннеру)
export function onConsentChange(listener: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, listener);
    return () => window.removeEventListener(CHANGE_EVENT, listener);
}

// Открыть окно «Настройки cookie» из любого места (например, из подвала)
export function openCookieSettings() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookieSettings(listener: () => void): () => void {
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
}
