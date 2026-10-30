// Что есть у нашего Worker «под рукой» (bindings): база, хранилище, настройки и секреты.
// Имена совпадают с wrangler.jsonc
export type Env = {
    DB: D1Database;        // база D1
    IMAGES: R2Bucket;      // хранилище картинок R2
    ASSETS: Fetcher;       // собранный фронтенд

    BOT_TOKEN: string;      // секрет: токен бота от @BotFather
    WEBHOOK_SECRET: string; // секрет: пароль, которым Telegram подписывает запросы к /api/telegram/webhook
    PRIVACY_VERSION: string;
    TERMS_VERSION: string;

    // Только для локального запуска (.dev.vars): «1» разрешает входить без Telegram.
    // На настоящем сервере эту переменную НЕ задаём
    DEV_AUTH?: string;
};

// Человек из Telegram (поле user внутри initData)
export type TelegramUser = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
};

// Вошедший человек, как его видит наш код. Строка из таблицы users
export type CurrentUser = {
    id: number;
    telegramId: number;
    name: string;
    username: string | null;
};

// Что middleware кладёт в контекст запроса (c.get('...'))
export type Variables = {
    telegramUser: TelegramUser; // кто пришёл (проверено по подписи)
    me: CurrentUser;            // он же в нашей базе (есть только после регистрации)
};

// Всё вместе — для Hono: new Hono<App>()
export type App = { Bindings: Env; Variables: Variables };
