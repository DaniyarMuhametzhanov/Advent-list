// «Охранник» для страниц, куда можно только после входа.
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMe } from '../api/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
    const me = useMe();

    if (me.isPending) return <p className="page-msg">Проверяю вход…</p>;
    if (me.isError) return <p className="page-msg">Сервер недоступен: {me.error.message}</p>;
    if (!me.data) return <Navigate to="/login" replace />; // не вошёл → на страницу входа

    return children;
}