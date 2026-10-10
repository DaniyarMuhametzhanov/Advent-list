// Всё общение с сервером про желания — в одном файле.
import { request } from './http';

// Так желание приходит с сервера (это WishResponse из Java)
export type WishDto = {
    id: number;
    date: string;           // '2026-10-05'
    title: string;
    comment: string | null; // комментария может не быть
    access: number[];       // id друзей, которым открыт этот день
};

// Так желание уходит на сервер (это WishRequest из Java)
export type WishInput = {
    title: string;
    comment: string;
};

export function fetchMyWishes() {
    return request<WishDto[]>('/api/wishes');
}

export function saveWish(date: string, input: WishInput) {
    return request<WishDto>(`/api/wishes/${date}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteWish(id: number) {
    return request<void>(`/api/wishes/${id}`, { method: 'DELETE' });
}