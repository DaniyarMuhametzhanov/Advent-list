import { Link } from 'react-router';

// Подвал на всех страницах: ссылки на юридические страницы
export function Footer() {
    return (
        <footer className="site-footer">
            <nav className="site-footer-in" aria-label="Юридическая информация">
                <Link to="/privacy">Политика конфиденциальности</Link>
                <Link to="/terms">Условия использования</Link>
            </nav>
        </footer>
    );
}
