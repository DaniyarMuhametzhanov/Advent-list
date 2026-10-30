// Связь с Telegram. Когда календарь открыт внутри Telegram (Mini App), скрипт telegram-web-app.js
// (подключён в index.html) создаёт объект window.Telegram.WebApp. В нём:
//   initData — подписанные Telegram данные «кто открыл». Их мы отправляем серверу в каждом запросе
//   ready(), expand() — сказать Telegram «приложение загрузилось» и развернуть окно на весь экран

type WebApp = {
    initData: string;
    ready: () => void;
    expand: () => void;
};

declare global {
    interface Window {
        Telegram?: { WebApp?: WebApp };
    }
}

// Только для разработки на своём компьютере (npm run dev), без Telegram:
// откройте http://localhost:5173/?as=1001:Анна — и вы «Анна» с Telegram id 1001.
// Сервер принимает такой вход, только если у него включён DEV_AUTH (в .dev.vars). В Cloudflare — нет
const DEV_KEY = 'devTelegramUser';

function devUser(): string | null {
    try {
        const fromUrl = new URLSearchParams(window.location.search).get('as');
        if (fromUrl) sessionStorage.setItem(DEV_KEY, fromUrl);
        return sessionStorage.getItem(DEV_KEY);
    } catch {
        return null; // браузер запретил хранение
    }
}

// Заголовок Authorization для запросов к серверу. null — открыто не в Telegram
export function authHeader(): string | null {
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) return 'tma ' + initData;
    if (import.meta.env.DEV) {
        const dev = devUser();
        if (dev) return 'dev ' + encodeURI(dev);
    }
    return null;
}

// Сообщить Telegram, что приложение готово, и развернуть его на весь экран
export function initTelegram() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    webApp.ready();
    webApp.expand();
}
