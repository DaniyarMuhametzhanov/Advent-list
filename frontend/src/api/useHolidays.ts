// Хуки TanStack Query для своих праздников
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createHoliday, deleteHoliday, fetchHolidays, renameHoliday, type HolidayDto } from './holidays';

const MY_HOLIDAYS = ['holidays', 'mine'];
const pad = (n: number) => String(n).padStart(2, '0');

// Сразу раскладываем список по дням: { '03-15': [праздник, праздник] } — так удобнее искать по дню
export function useMyHolidays() {
    return useQuery({
        queryKey: MY_HOLIDAYS,
        queryFn: fetchHolidays,
        select: list => {
            const byDay: Record<string, HolidayDto[]> = {};
            for (const h of list) {
                const key = `${pad(h.month)}-${pad(h.day)}`;
                (byDay[key] ??= []).push(h);
            }
            return byDay;
        },
    });
}

// После любого изменения просим список заново — календарь сразу обновится
function useHolidayMutation<T>(mutationFn: (args: T) => Promise<unknown>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_HOLIDAYS }),
    });
}

export function useCreateHoliday() {
    return useHolidayMutation(({ date, title }: { date: string; title: string }) => createHoliday(date, title));
}

export function useRenameHoliday() {
    return useHolidayMutation(({ id, title }: { id: number; title: string }) => renameHoliday(id, title));
}

export function useDeleteHoliday() {
    return useHolidayMutation((id: number) => deleteHoliday(id));
}
