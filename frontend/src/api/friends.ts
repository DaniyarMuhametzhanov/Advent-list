// Всё общение с сервером про друзей и календари друзей.
import { request } from './http';

// Человек коротко (FriendResponse из Java)
export type FriendDto = { id: number; name: string };

// Кем мне приходится найденный человек (FriendRelation из Java)
export type Relation = 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE';

// Результат поиска (UserSearchResponse из Java)
export type UserSearchDto = { id: number; name: string; relation: Relation };

// Заявка, которая пришла мне (FriendRequestResponse из Java)
export type FriendRequestDto = { id: number; from: FriendDto };

// Один занятый день в календаре (CalendarDayResponse из Java)
export type CalendarDayDto = {
    wishId: number;
    date: string;           // '2026-10-08'
    open: boolean;          // можно ли мне видеть, что внутри
    title: string | null;   // у закрытого дня сервер не присылает название
    comment: string | null;
};

export function searchUsers(q: string) {
    // encodeURIComponent: русские буквы и пробелы превращаем в безопасный для адреса вид
    return request<UserSearchDto[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
}

export function fetchFriends() {
    return request<FriendDto[]>('/api/friends');
}

export function removeFriend(userId: number) {
    return request<void>(`/api/friends/${userId}`, { method: 'DELETE' });
}

export function sendFriendRequest(toUserId: number) {
    return request<void>('/api/friend-requests', { method: 'POST', body: JSON.stringify({ toUserId }) });
}

export function fetchIncomingRequests() {
    return request<FriendRequestDto[]>('/api/friend-requests/incoming');
}

export function acceptFriendRequest(id: number) {
    return request<void>(`/api/friend-requests/${id}/accept`, { method: 'POST' });
}

export function declineFriendRequest(id: number) {
    return request<void>(`/api/friend-requests/${id}/decline`, { method: 'POST' });
}

// month: '2026-10'
export function fetchCalendar(userId: number, month: string) {
    return request<CalendarDayDto[]>(`/api/calendars/${userId}?month=${month}`);
}