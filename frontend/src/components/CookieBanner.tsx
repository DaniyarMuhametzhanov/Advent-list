import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import './CookieBanner.css';
import { COOKIE_CATEGORIES } from '../legal/cookies';
import {
    getConsent, onConsentChange, onOpenCookieSettings, saveConsent, type CookieChoice,
} from '../lib/cookieConsent';

const ALL: CookieChoice = { analytics: true, marketing: true };
const NONE: CookieChoice = { analytics: false, marketing: false };
// «Отклонить» выглядит так же заметно, как «Принять все»: отказаться должно быть не сложнее, чем согласиться

// Баннер cookie внизу экрана и окно «Настройки cookie».
// Баннер виден, пока человек не выбрал. Окно можно открыть снова из подвала («Настройки cookie»)
export function CookieBanner() {
    const [chosen, setChosen] = useState(() => getConsent() !== null);
    const [settingsOpen, setSettingsOpen] = useState(false);

    useEffect(() => onConsentChange(() => setChosen(getConsent() !== null)), []);
    useEffect(() => onOpenCookieSettings(() => setSettingsOpen(true)), []);

    // Пока баннер виден, добавляем странице отступ снизу на его высоту: иначе он закроет кнопки внизу формы
    const bannerRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const banner = bannerRef.current;
        if (!banner || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => { document.body.style.paddingBottom = `${banner.offsetHeight}px`; });
        observer.observe(banner);
        return () => { observer.disconnect(); document.body.style.paddingBottom = ''; };
    }, [chosen]);

    function choose(choice: CookieChoice) {
        saveConsent(choice);
        setSettingsOpen(false);
    }

    return (
        <>
            {!chosen && (
                <section ref={bannerRef} className="cookie-banner" role="dialog" aria-modal="false"
                         aria-labelledby="cookieBannerTitle" aria-describedby="cookieBannerText">
                    <div className="cookie-banner-in">
                        <div className="cookie-banner-text">
                            <h2 id="cookieBannerTitle">Мы используем cookie</h2>
                            <p id="cookieBannerText">
                                Необходимые cookie нужны, чтобы вы могли войти в аккаунт и сайт был защищён.
                                Другие (аналитика, маркетинг) включаются только с вашего согласия.
                                Подробнее — в <Link to="/cookies">списке cookie</Link> и <Link to="/privacy">Политике конфиденциальности</Link>.
                            </p>
                        </div>
                        <div className="cookie-banner-actions">
                            <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>Настроить</button>
                            <button type="button" className="btn" onClick={() => choose(NONE)}>Отклонить</button>
                            <button type="button" className="btn" onClick={() => choose(ALL)}>Принять все</button>
                        </div>
                    </div>
                </section>
            )}
            {settingsOpen && <CookieSettings onChoose={choose} onClose={() => setSettingsOpen(false)} />}
        </>
    );
}

// Окно с переключателями по категориям
function CookieSettings({ onChoose, onClose }: { onChoose: (c: CookieChoice) => void; onClose: () => void }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    // Начинаем с сохранённого выбора; если его нет — всё необязательное выключено
    const [choice, setChoice] = useState<CookieChoice>(() => {
        const saved = getConsent();
        return saved ? { analytics: saved.analytics, marketing: saved.marketing } : NONE;
    });

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    return (
        <dialog ref={dialogRef} className="cookie-settings" aria-labelledby="cookieSettingsTitle"
                onCancel={e => { e.preventDefault(); onClose(); }}>
            <div className="dlg">
                <div className="dlg-head">
                    <div>
                        <h2 id="cookieSettingsTitle">Настройки cookie</h2>
                        <p>Выберите, что можно включить. Выбор можно поменять в любой момент по ссылке «Настройки cookie» внизу страницы.</p>
                    </div>
                </div>

                {COOKIE_CATEGORIES.map(cat => {
                    const fixed = cat.id === 'necessary';
                    const checked = fixed || choice[cat.id as keyof CookieChoice];
                    return (
                        <label key={cat.id} className="cookie-cat">
                            <input type="checkbox" checked={checked} disabled={fixed}
                                   onChange={e => setChoice({ ...choice, [cat.id]: e.target.checked })} />
                            <span>
                                <b>{cat.title}{fixed && ' (всегда включены)'}</b>
                                <span className="cookie-cat-desc">{cat.description}</span>
                            </span>
                        </label>
                    );
                })}

                <p className="cookie-settings-more">
                    <Link to="/cookies" onClick={onClose}>Полный список cookie</Link>
                </p>

                <div className="cookie-settings-actions">
                    <button type="button" className="btn" onClick={() => onChoose(NONE)}>Отклонить все</button>
                    <button type="button" className="btn ghost" onClick={() => onChoose(choice)}>Сохранить выбор</button>
                    <button type="button" className="btn" onClick={() => onChoose(ALL)}>Принять все</button>
                </div>
            </div>
        </dialog>
    );
}
