// Что есть у нашего Worker «под рукой» (bindings): база, хранилище, настройки.
// Имена совпадают с wrangler.jsonc
export type Env = {
    DB: D1Database;        // база D1
    IMAGES: R2Bucket;      // хранилище картинок R2
    ASSETS: Fetcher;       // собранный фронтенд

    ADMIN_EMAILS?: string;  // первые администраторы: email через запятую. Решают, кому можно регистрироваться
    PRIVACY_VERSION: string;
    TERMS_VERSION: string;
};

export type Role = 'USER' | 'ADMIN';

// Вошедший человек, как его видит наш код. Строка из таблицы users (без хеша пароля!)
export type CurrentUser = {
    id: number;
    name: string;
    email: string;
    role: Role; // обычный пользователь или администратор (супер-пользователь)
};

// Что middleware кладёт в контекст запроса (c.get('...'))
export type Variables = {
    me: CurrentUser;
};

// Всё вместе — для Hono: new Hono<App>()
export type App = { Bindings: Env; Variables: Variables };
