// «Охранник» для страниц, куда можно только после входа.
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMe } from '../api/useAuth';
import { HttpError } from '../api/http';
import { authHeader } from '../lib/telegram';

export function RequireAuth({ children }: { children: ReactNode }) {
    const me = useMe();

    if (authHeader() === null) return <Navigate to="/login" replace />; // открыто не в Telegram
    if (me.isPending) return <p className="page-msg">Проверяю вход…</p>;
    // 403 — администратор ещё не открыл доступ. Текст (что ждать дальше) присылает сервер
    if (me.error instanceof HttpError && me.error.status === 403) {
        return (
            <main className="auth card">
                <h1>🔐 Календарь по приглашению</h1>
                <p>{me.error.message}</p>
            </main>
        );
    }
    if (me.isError) return <p className="page-msg">Не получилось войти: {me.error.message}</p>;
    if (!me.data) return <Navigate to="/register" replace />; // доступ есть, но аккаунта ещё нет

    return children;
}
