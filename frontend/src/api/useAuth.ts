// Хуки TanStack Query для входа.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, register, type Me } from './auth';
import { authHeader } from '../lib/telegram';

const ME = ['me'];

export function useMe() {
    return useQuery({
        queryKey: ME,
        queryFn: fetchMe,
        enabled: authHeader() !== null, // не в Telegram — спрашивать сервер бессмысленно
        retry: false,        // 401 и 404 — это не сбой, повторять не нужно
        staleTime: Infinity, // «кто я» не меняется, пока открыто приложение
    });
}

export function useRegister() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: register,
        // Сервер вернул «кто я» — сразу кладём в хранилище, повторно спрашивать не нужно
        onSuccess: (me: Me) => queryClient.setQueryData(ME, me),
    });
}
