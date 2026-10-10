// Хуки TanStack Query: загрузить мои желания, сохранить, удалить.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteWish, fetchMyWishes, saveWish, uploadWishImage, type WishInput } from './wishes';

// «Имя» этих данных в хранилище TanStack Query
const MY_WISHES = ['wishes', 'mine'];

export function useMyWishes() {
    return useQuery({
        queryKey: MY_WISHES,
        queryFn: fetchMyWishes,
    });
}

type SaveArgs = { date: string; input: WishInput; file: File | null };

export function useSaveWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ date, input, file }: SaveArgs) => {
            const saved = await saveWish(date, input);
            // Картинка — вторым запросом: ей нужен id желания, а он есть только после сохранения
            return file ? uploadWishImage(saved.id, file) : saved;
        },
        // onSettled — после ответа, удачного или нет. Даже если картинку не приняли,
        // название уже сохранилось, и список надо обновить
        onSettled: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}

export function useDeleteWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteWish(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}
