import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMe, useRegister } from '../api/useAuth';

export function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const me = useMe();
    const registerMutation = useRegister();
    const navigate = useNavigate();

    if (me.data) return <Navigate to="/" replace />;

    function submit(e: FormEvent) {
        e.preventDefault();
        registerMutation.mutate({ name, email, password }, { onSuccess: () => navigate('/') });
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
    {registerMutation.isError && <p className="err">{registerMutation.error.message}</p>}
        <button className="btn" disabled={registerMutation.isPending}>Создать аккаунт</button>
    </form>
    <p className="hint">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </main>
    );
    }