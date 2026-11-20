// Страница администратора «Доступ»: кому можно регистрироваться.
// Обычному пользователю сюда нельзя: и ссылки он не видит, и сервер ответит 403
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useMe } from '../api/useAuth';
import { useAddEmail, useAllowedEmails, useRemoveEmail } from '../api/admin';

export function AdminPage() {
    const me = useMe().data!; // RequireAuth уже проверил, что человек вошёл
    const [email, setEmail] = useState('');
    const list = useAllowedEmails();
    const addMutation = useAddEmail();
    const removeMutation = useRemoveEmail();

    if (me.role !== 'ADMIN') return <Navigate to="/" replace />;

    function add(e: FormEvent) {
        e.preventDefault();
        addMutation.mutate(email, { onSuccess: () => setEmail('') });
    }

    function remove(target: string) {
        if (confirm(`Закрыть доступ для ${target}? Человек больше не сможет войти.`)) removeMutation.mutate(target);
    }

    return (
        <main className="auth card admin">
            <p><Link to="/">← К календарю</Link></p>
            <h1>Доступ</h1>
            <p className="hint">Зарегистрироваться может только тот, чей email есть в этом списке.</p>

            <form onSubmit={add}>
                <label className="lbl">Разрешить email
                    <input className="field" type="email" required placeholder="friend@example.com"
                           value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                {addMutation.isError && <p className="err">{addMutation.error.message}</p>}
                <button className="btn" disabled={addMutation.isPending}>Разрешить</button>
            </form>

            {list.isPending && <p className="hint">Загружаю…</p>}
            {list.isError && <p className="err">{list.error.message}</p>}
            {removeMutation.isError && <p className="err">{removeMutation.error.message}</p>}
            {list.data && (
                <ul className="admin-list" aria-label="Разрешённые email">
                    {list.data.admins.map(admin => (
                        <li key={admin}>
                            <span className="grow">{admin}<small>Администратор</small></span>
                        </li>
                    ))}
                    {list.data.emails.map(item => (
                        <li key={item.email}>
                            <span className="grow">{item.email}
                                <small>{item.registered ? `Зарегистрирован(а): ${item.name}` : 'Ещё не зарегистрировался(ась)'}</small>
                            </span>
                            <button className="btn sm ghost" onClick={() => remove(item.email)}
                                    aria-label={`Закрыть доступ: ${item.email}`}>Закрыть</button>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
