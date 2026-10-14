import { Link } from 'react-router';
import { openCookieSettings } from '../lib/cookieConsent';

// Подвал на всех страницах: ссылки на юридические страницы
export function Footer() {
    return (
        <footer className="site-footer">
            <nav className="site-footer-in" aria-label="Юридическая информация">
                <Link to="/privacy">Политика конфиденциальности</Link>
                <Link to="/terms">Условия использования</Link>
                <button type="button" onClick={openCookieSettings}>Настройки cookie</button>
            </nav>
        </footer>
    );
}
