package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.user.User;

// Человек коротко: id и имя. Email и пароль чужим не показываем!
public record FriendResponse(Long id, String name) {

    public static FriendResponse from(User user) {
        return new FriendResponse(user.getId(), user.getName());
    }
}