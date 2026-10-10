// Хуки TanStack Query для друзей.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    acceptFriendRequest, declineFriendRequest, fetchCalendar, fetchFriends,
    fetchIncomingRequests, removeFriend, searchUsers, sendFriendRequest,
} from './friends';

const FRIENDS = ['friends'];
const INCOMING = ['friend-requests', 'incoming'];
const SEARCH = ['users', 'search'];

export function useFriends() {
    return useQuery({ queryKey: FRIENDS, queryFn: fetchFriends });
}

export function useIncomingRequests() {
    return useQuery({ queryKey: INCOMING, queryFn: fetchIncomingRequests });
}

export function useUserSearch(q: string) {
    const text = q.trim();
    return useQuery({
        queryKey: [...SEARCH, text],          // у каждого текста поиска свой ответ
        queryFn: () => searchUsers(text),
        enabled: text.length > 0,             // пустую строку на сервер не отправляем
        placeholderData: keepPreviousData,    // пока ищем новое, показываем прошлый результат
    });
}

// Календарь друга за месяц. userId = null — это мой календарь, тогда запрос не нужен
export function useFriendCalendar(userId: number | null, month: string) {
    return useQuery({
        queryKey: ['calendar', userId, month],
        queryFn: () => fetchCalendar(userId!, month),
        enabled: userId !== null,
    });
}

// После любого действия с друзьями устаревают: список друзей, заявки и поиск (там статусы).
// При удалении из друзей сервер стирает доступы и запросы доступа между людьми — их тоже обновляем
function useRefreshFriends() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: FRIENDS });
        queryClient.invalidateQueries({ queryKey: INCOMING });
        queryClient.invalidateQueries({ queryKey: SEARCH });
        queryClient.invalidateQueries({ queryKey: ['wishes', 'mine'] });
        queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    };
}

export function useSendFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: sendFriendRequest, onSuccess: refresh });
}

export function useAcceptFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: acceptFriendRequest, onSuccess: refresh });
}

export function useDeclineFriendRequest() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: declineFriendRequest, onSuccess: refresh });
}

export function useRemoveFriend() {
    const refresh = useRefreshFriends();
    return useMutation({ mutationFn: removeFriend, onSuccess: refresh });
}