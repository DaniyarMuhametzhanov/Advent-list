// Хуки TanStack Query для доступа к дням.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    denyAccessRequest, fetchIncomingAccessRequests, grantAccessRequest, requestAccess, setAccess,
} from './access';

const INCOMING_ACCESS = ['access-requests', 'incoming'];

export function useIncomingAccessRequests() {
    return useQuery({ queryKey: INCOMING_ACCESS, queryFn: fetchIncomingAccessRequests });
}

// Доступ поменялся → устарели мои желания (там список «кому открыто») и входящие запросы
function useRefreshAccess() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['wishes', 'mine'] });
        queryClient.invalidateQueries({ queryKey: INCOMING_ACCESS });
    };
}

export function useSetAccess() {
    const refresh = useRefreshAccess();
    return useMutation({
        mutationFn: ({ wishId, friendId, open }: { wishId: number; friendId: number; open: boolean }) =>
            setAccess(wishId, friendId, open),
        onSuccess: refresh,
    });
}

export function useGrantAccessRequest() {
    const refresh = useRefreshAccess();
    return useMutation({ mutationFn: grantAccessRequest, onSuccess: refresh });
}

export function useDenyAccessRequest() {
    const refresh = useRefreshAccess();
    return useMutation({ mutationFn: denyAccessRequest, onSuccess: refresh });
}

// Я прошу доступ к дню друга → в его календаре у этого дня появится «Запрос отправлен»
export function useRequestAccess() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: requestAccess,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    });
}
