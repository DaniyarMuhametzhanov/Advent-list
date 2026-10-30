// Первый вход из Telegram: человек принимает условия, и сервер создаёт аккаунт.
// Имя и id сервер берёт из Telegram, поэтому заполнять ничего не нужно, только две галочки
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useMe, useRegister } from '../api/useAuth';
import { authHeader } from '../lib/telegram';

export function RegisterPage() {
    // Обе галочки по умолчанию сняты: согласие должно быть активным действием
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const me = useMe();
    const registerMutation = useRegister();
    const navigate = useNavigate();

    if (authHeader() === null) return <Navigate to="/login" replace />;
    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault();
        registerMutation.mutate({ privacyAccepted, termsAccepted }, { onSuccess: () => navigate('/') });
    }

    return (
        <main className="auth card">
            <h1>Добро пожаловать!</h1>
            <p>Чтобы начать, примите условия. Ваше имя возьмём из Telegram.</p>
            <form onSubmit={submit}>
                {/* required: браузер не отправит форму без галочки. Сервер проверяет ещё раз */}
                <label className="consent">
                    <input type="checkbox" required
                           checked={privacyAccepted} onChange={e => setPrivacyAccepted(e.target.checked)} />
                    <span>Я согласен(на) на обработку моих персональных данных в соответствии
                        с <a href="/privacy" target="_blank" rel="noopener">Политикой конфиденциальности</a></span>
                </label>
                <label className="consent">
                    <input type="checkbox" required
                           checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                    <span>Мне исполнилось 18 лет, и я принимаю <a href="/terms" target="_blank" rel="noopener">Условия использования</a></span>
                </label>
                {registerMutation.isError && <p className="err">{registerMutation.error.message}</p>}
                <button className="btn" disabled={registerMutation.isPending}>Начать</button>
            </form>
        </main>
    );
}
