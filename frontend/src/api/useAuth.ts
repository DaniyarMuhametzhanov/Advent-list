// Хуки TanStack Query для входа.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, login, logout, register, type Me } from './auth';

const ME = ['me'];

export function useMe() {
    return useQuery({
        queryKey: ME,
        queryFn: fetchMe,
        retry: false,        // 401 — это не сбой, повторять не нужно
        staleTime: Infinity, // «кто я» не меняется, пока сами не войдём или не выйдем
    });
}

export function useLogin() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: login,
        // Сервер вернул «кто я» — сразу кладём в хранилище, повторно спрашивать не нужно
        onSuccess: (me: Me) => queryClient.setQueryData(ME, me),
    });
}

export function useRegister() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: register,
        onSuccess: (me: Me) => queryClient.setQueryData(ME, me),
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            // 1. «Я — никто». RequireAuth это увидит и сам отправит на /login
            queryClient.setQueryData(ME, null);
            // 2. Забываем всё остальное о прошлом пользователе (его желания и т. д.)
            queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
        },
    });
}