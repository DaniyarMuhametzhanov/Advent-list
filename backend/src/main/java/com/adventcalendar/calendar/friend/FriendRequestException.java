package com.adventcalendar.calendar.friend;

// Заявку отправить нельзя: уже друзья, уже отправлена и т. п. Сервер ответит 409 Conflict
public class FriendRequestException extends RuntimeException {

    public FriendRequestException(String message) {
        super(message);
    }
}