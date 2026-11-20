// Запросы страницы администратора «Доступ» (worker/src/routes/admin.ts)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export type AllowedEmail = {
    email: string;
    addedAt: string;
    name: string | null; // имя, если человек уже зарегистрировался
    registered: boolean;
};

export type AccessList = {
    admins: string[];       // администраторы из настроек: им можно всегда
    emails: AllowedEmail[]; // кому администратор разрешил регистрацию
};

const EMAILS = ['admin', 'emails'];

export function useAllowedEmails() {
    return useQuery({ queryKey: EMAILS, queryFn: () => request<AccessList>('/api/admin/emails') });
}

export function useAddEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (email: string) =>
            request<void>('/api/admin/emails', { method: 'POST', body: JSON.stringify({ email }) }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: EMAILS }),
    });
}

export function useRemoveEmail() {
    const queryClient = useQueryClient();
    return useMutation({
        // encodeURIComponent: @ и точки превращаем в безопасный для адреса вид
        mutationFn: (email: string) =>
            request<void>(`/api/admin/emails/${encodeURIComponent(email)}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: EMAILS }),
    });
}
