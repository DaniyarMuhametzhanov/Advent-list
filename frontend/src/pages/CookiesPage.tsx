import { Link } from 'react-router';
import '../components/CookieBanner.css';
import { COOKIE_CATEGORIES, COOKIES_DATE } from '../legal/cookies';
import { openCookieSettings } from '../lib/cookieConsent';

// Список cookie. ЧЕРНОВИК: перед публикацией сайта текст должен проверить юрист
export function CookiesPage() {
    return (
        <main className="legal card">
            <p className="legal-draft">
                Черновик. Документ ещё не проверен юристом и может измениться.
            </p>

            <h1>Cookie на сайте</h1>
            <p className="legal-meta">Обновлено {COOKIES_DATE}</p>

            <p>
                Cookie — это маленькие файлы, которые сайт сохраняет в вашем браузере. Похожим образом работает
                хранилище браузера (localStorage). Ниже всё, что сайт сохраняет у вас, по категориям.
                Необязательные категории включаются только после вашего согласия.
            </p>
            <p>
                <button type="button" className="btn ghost sm" onClick={openCookieSettings}>Изменить настройки cookie</button>
            </p>

            {COOKIE_CATEGORIES.map(cat => (
                <section key={cat.id} className="legal-section">
                    <h2>{cat.title}</h2>
                    <p>{cat.description}</p>
                    {cat.cookies.length > 0 ? (
                        <table className="legal-table">
                            <thead>
                            <tr><th>Название</th><th>Тип</th><th>Кто ставит</th><th>Зачем</th><th>Сколько хранится</th></tr>
                            </thead>
                            <tbody>
                            {cat.cookies.map(c => (
                                <tr key={c.name}>
                                    <td><code>{c.name}</code></td>
                                    {/* Подписи <i> видны только на телефоне, где у таблицы скрыта шапка */}
                                    <td><i className="cookie-td-label">Тип: </i>{c.kind === 'cookie' ? 'Cookie' : 'Хранилище браузера'}</td>
                                    <td><i className="cookie-td-label">Кто ставит: </i>{c.owner}</td>
                                    <td><i className="cookie-td-label">Зачем: </i>{c.purpose}</td>
                                    <td><i className="cookie-td-label">Сколько хранится: </i>{c.lifetime}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="legal-meta">Сейчас таких cookie нет.</p>
                    )}
                </section>
            ))}

            <p>
                Сторонние сервисы (аналитика, реклама, чаты) cookie на сайте не ставят.
                Подробнее о данных — в <Link to="/privacy">Политике конфиденциальности</Link>.
            </p>

            <p className="legal-back"><Link to="/">← На главную</Link></p>
        </main>
    );
}
