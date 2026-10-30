// Страница для тех, кто открыл сайт в обычном браузере, а не в Telegram.
// Входа по паролю больше нет: календарь открывается только через бота
import { Navigate } from 'react-router';
import { authHeader } from '../lib/telegram';

// Имя бота задаётся при сборке в frontend/.env.production.local: VITE_BOT_USERNAME=advent_wishes_bot (docs/stage-15.md)
const BOT = import.meta.env.VITE_BOT_USERNAME as string | undefined;

export function LoginPage() {
    // Уже в Telegram — здесь делать нечего
    if (authHeader() !== null) return <Navigate to="/" replace />;

    return (
        <main className="auth card">
            <h1>Вход через Telegram</h1>
            <p>Календарь открывается внутри Telegram: так не нужен пароль, а друзей легко найти.</p>
            {BOT
                ? <a className="btn" href={`https://t.me/${BOT}`}>Открыть бота @{BOT}</a>
                : <p className="hint">Найдите нашего бота в Telegram и нажмите «Открыть календарь».</p>}
        </main>
    );
}
