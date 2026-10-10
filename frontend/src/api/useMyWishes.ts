// Хуки TanStack Query: загрузить мои желания, сохранить, удалить.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteWish, fetchMyWishes, saveWish, type WishInput } from './wishes';

// «Имя» этих данных в хранилище TanStack Query
const MY_WISHES = ['wishes', 'mine'];

export function useMyWishes() {
    return useQuery({
        queryKey: MY_WISHES,
        queryFn: fetchMyWishes,
    });
}

export function useSaveWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ date, input }: { date: string; input: WishInput }) => saveWish(date, input),
        // Данные на сервере поменялись → старый список устарел, загрузим заново
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}

export function useDeleteWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteWish(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}