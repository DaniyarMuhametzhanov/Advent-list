import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMe, useRegister } from '../api/useAuth';

export function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Обе галочки по умолчанию сняты: согласие должно быть активным действием
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    // Поле-ловушка для ботов: человек его не видит, поэтому оставит пустым
    const [extraInfo, setExtraInfo] = useState('');
    const me = useMe();
    const registerMutation = useRegister();
    const navigate = useNavigate();

    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault();
        registerMutation.mutate({ name, email, password, privacyAccepted, termsAccepted, extraInfo }, { onSuccess: () => navigate('/') });
    }

    return (
        <main className="auth card">
            <h1>Регистрация</h1>
            <form onSubmit={submit}>
    <label className="lbl">Имя
        <input className="field" autoComplete="name" required maxLength={100}
    value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="lbl">Email
        <input className="field" type="email" autoComplete="email" required
    value={email} onChange={e => setEmail(e.target.value)} />
    </label>
    <label className="lbl">Пароль (от 8 символов)
    <input className="field" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
    value={password} onChange={e => setPassword(e.target.value)} />
    </label>
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
    {/* Ловушка для ботов (honeypot). Спрятана за краем экрана; Tab и экранная читалка её пропускают */}
    <label className="trap" aria-hidden="true">Не заполняйте это поле
        <input tabIndex={-1} autoComplete="off"
    value={extraInfo} onChange={e => setExtraInfo(e.target.value)} />
    </label>
    {registerMutation.isError && <p className="err">{registerMutation.error.message}</p>}
        <button className="btn" disabled={registerMutation.isPending}>Создать аккаунт</button>
    </form>
    <p className="hint">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </main>
    );
    }