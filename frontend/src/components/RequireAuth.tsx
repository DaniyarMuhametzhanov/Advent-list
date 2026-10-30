// «Охранник» для страниц, куда можно только после входа.
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMe } from '../api/useAuth';
import { authHeader } from '../lib/telegram';

export function RequireAuth({ children }: { children: ReactNode }) {
    const me = useMe();

    if (authHeader() === null) return <Navigate to="/login" replace />; // открыто не в Telegram
    if (me.isPending) return <p className="page-msg">Проверяю вход…</p>;
    if (me.isError) return <p className="page-msg">Не получилось войти: {me.error.message}</p>;
    if (!me.data) return <Navigate to="/register" replace />; // в Telegram, но аккаунта ещё нет

    return children;
}
