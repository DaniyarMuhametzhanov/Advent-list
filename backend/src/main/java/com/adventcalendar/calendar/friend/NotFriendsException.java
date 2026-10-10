package com.adventcalendar.calendar.friend;

public class NotFriendsException extends RuntimeException {

    public NotFriendsException() {
        super("Календарь могут смотреть только друзья");
    }
}