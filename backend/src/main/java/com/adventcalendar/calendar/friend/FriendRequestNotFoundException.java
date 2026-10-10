package com.adventcalendar.calendar.friend;

public class FriendRequestNotFoundException extends RuntimeException {

    public FriendRequestNotFoundException(Long id) {
        super("Заявка с id " + id + " не найдена");
    }
}