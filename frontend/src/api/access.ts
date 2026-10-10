// Всё общение с сервером про доступ к дням.
import { request } from './http';
import type { FriendDto } from './friends';

// Запрос доступа к моему дню (AccessRequestResponse из Java)
export type AccessRequestDto = {
    id: number;
    wishId: number;
    date: string;   // '2026-10-12'
    title: string;  // название моего желания
    from: FriendDto;
};

// Открыть (open = true) или закрыть (open = false) мой день другу
export function setAccess(wishId: number, friendId: number, open: boolean) {
    return request<void>(`/api/wishes/${wishId}/access/${friendId}`, { method: open ? 'PUT' : 'DELETE' });
}

export function requestAccess(wishId: number) {
    return request<void>(`/api/wishes/${wishId}/access-requests`, { method: 'POST' });
}

export function fetchIncomingAccessRequests() {
    return request<AccessRequestDto[]>('/api/access-requests/incoming');
}

export function grantAccessRequest(id: number) {
    return request<void>(`/api/access-requests/${id}/grant`, { method: 'POST' });
}

export function denyAccessRequest(id: number) {
    return request<void>(`/api/access-requests/${id}/deny`, { method: 'POST' });
}
