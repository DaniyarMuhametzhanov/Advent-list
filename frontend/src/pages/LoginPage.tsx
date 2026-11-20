import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useLogin, useMe } from '../api/useAuth';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const me = useMe();
    const loginMutation = useLogin();
    const navigate = useNavigate();

    // Уже вошёл — здесь делать нечего
    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault(); // не перезагружать страницу, как делает обычная форма
        loginMutation.mutate({ email, password }, { onSuccess: () => navigate('/') });
    }

    return (
        <main className="auth card">
            <h1>Вход</h1>
            <form onSubmit={submit}>
                <label className="lbl">Email
                    <input className="field" type="email" autoComplete="email" required
                           value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                <label className="lbl">Пароль
                    <input className="field" type="password" autoComplete="current-password" required
                           value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                {loginMutation.isError && <p className="err">{loginMutation.error.message}</p>}
                <button className="btn" disabled={loginMutation.isPending}>Войти</button>
            </form>
            <p className="hint">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
        </main>
    );
}